"""
AIS Live Tracking Router — Real-time vessel monitoring, alert engine, WebSocket pub/sub.
"""
from __future__ import annotations

import asyncio
import math
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

router = APIRouter()

# ── War-risk zone polygons (named zones matching MARITIME_ZONES in frontend) ──
WAR_ZONES = [
    {"name": "Red Sea / Bab el-Mandeb", "lat": 15.0, "lon": 42.5, "radius_km": 450},
    {"name": "Strait of Hormuz",        "lat": 26.6, "lon": 56.3, "radius_km": 250},
    {"name": "Gulf of Aden",            "lat": 11.5, "lon": 48.5, "radius_km": 380},
    {"name": "Black Sea",               "lat": 43.5, "lon": 34.0, "radius_km": 300},
    {"name": "Gulf of Guinea",          "lat":  2.0, "lon":  5.0, "radius_km": 500},
    {"name": "Strait of Malacca",       "lat":  3.0, "lon": 100.0, "radius_km": 300},
    {"name": "South China Sea",         "lat": 12.0, "lon": 114.0, "radius_km": 700},
]

# ── Known ports (for emergency rule — avoid false positives near port) ────────
KNOWN_PORTS = [
    (18.94, 72.84),   # Mumbai
    (51.92, 4.48),    # Rotterdam
    (31.23, 121.47),  # Shanghai
    (33.74, -118.27), # LA
    (25.20, 55.27),   # Dubai
    (1.26, 103.82),   # Singapore
    (40.67, -74.00),  # New York
    (53.54, 9.99),    # Hamburg
    (22.31, 113.91),  # Hong Kong
    (35.44, 139.64),  # Yokohama
    (29.9, 32.55),    # Suez
    (13.08, 80.27),   # Chennai
    (22.56, 120.31),  # Kaohsiung
]

# ══════════════════════════════════════════════════════════════════════════════
# ── Pydantic Models ──────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

class AISPing(BaseModel):
    mmsi: str
    vessel_name: str = ""
    imo: str = ""
    type: str = "cargo"
    voyage_id: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    lat: float
    lon: float
    speed_kn: float = 0.0
    course: float = 0.0
    heading: float = 0.0
    status: str = "underway"  # underway|anchored|moored|sos
    destination: str = ""
    eta: str = ""
    extra: dict = Field(default_factory=dict)


class VoyageRegistration(BaseModel):
    voyage_id: str
    mmsi: str
    vessel_name: str = ""
    origin: str = ""
    destination: str = ""
    cargo_value_usd: float = 0.0
    policy_id: str = ""
    declared_route: list[list[float]] = Field(default_factory=list)  # [[lat, lon], ...]


class AISAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: f"alert_{uuid.uuid4().hex[:12]}")
    type: str  # war_risk|deviation|emergency|spoofing|next_policy|reinsurance
    mmsi: str = ""
    voyage_id: str = ""
    severity: str = "MEDIUM"  # CRITICAL|HIGH|MEDIUM|LOW
    msg: str = ""
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    location: dict = Field(default_factory=dict)
    evidence: list[dict] = Field(default_factory=list)


# ══════════════════════════════════════════════════════════════════════════════
# ── In-memory State ──────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

class VesselState:
    __slots__ = (
        "mmsi", "vessel_name", "lat", "lon", "speed_kn", "course", "heading",
        "status", "voyage_id", "destination", "last_update",
        "ping_history", "voyage_context", "next_policy_flag",
    )

    def __init__(self, ping: AISPing):
        self.mmsi = ping.mmsi
        self.vessel_name = ping.vessel_name
        self.lat = ping.lat
        self.lon = ping.lon
        self.speed_kn = ping.speed_kn
        self.course = ping.course
        self.heading = ping.heading
        self.status = ping.status
        self.voyage_id = ping.voyage_id
        self.destination = ping.destination
        self.last_update = ping.timestamp
        self.ping_history: deque = deque(maxlen=50)
        self.ping_history.append(ping)
        self.voyage_context: Optional[dict] = None
        self.next_policy_flag = False

    def update(self, ping: AISPing):
        self.lat = ping.lat
        self.lon = ping.lon
        self.speed_kn = ping.speed_kn
        self.course = ping.course
        self.heading = ping.heading
        self.status = ping.status
        self.last_update = ping.timestamp
        if ping.voyage_id:
            self.voyage_id = ping.voyage_id
        if ping.destination:
            self.destination = ping.destination
        self.ping_history.append(ping)

    def to_dict(self) -> dict:
        return {
            "mmsi": self.mmsi, "vessel_name": self.vessel_name,
            "lat": self.lat, "lon": self.lon,
            "speed_kn": self.speed_kn, "course": self.course,
            "heading": self.heading, "status": self.status,
            "voyage_id": self.voyage_id, "destination": self.destination,
            "last_update": self.last_update,
            "next_policy_flag": self.next_policy_flag,
            "voyage_context": self.voyage_context,
        }


_vessels: dict[str, VesselState] = {}
_pings: deque = deque(maxlen=10_000)
_alerts: list[AISAlert] = []
_subscribers: set[WebSocket] = set()
_voyages: dict[str, dict] = {}  # voyage_id -> voyage registration data

# Shared list for dashboard intel-feed integration
ais_intel_items: list[dict] = []


# ══════════════════════════════════════════════════════════════════════════════
# ── Geo Helpers ──────────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _point_to_segment_km(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    """Approximate distance from point (px,py) to segment (ax,ay)-(bx,by) in km using planar projection."""
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _haversine_km(px, py, ax, ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    proj_lat = ax + t * dx
    proj_lon = ay + t * dy
    return _haversine_km(px, py, proj_lat, proj_lon)


def _distance_to_route(lat: float, lon: float, route: list[list[float]]) -> float:
    """Min distance from point to any segment of a declared route polyline."""
    if len(route) < 2:
        return 0.0
    min_dist = float("inf")
    for i in range(len(route) - 1):
        d = _point_to_segment_km(lat, lon, route[i][0], route[i][1], route[i + 1][0], route[i + 1][1])
        min_dist = min(min_dist, d)
    return min_dist


def _near_port(lat: float, lon: float, threshold_km: float = 20.0) -> bool:
    """Check if position is near any known port."""
    for plat, plon in KNOWN_PORTS:
        if _haversine_km(lat, lon, plat, plon) < threshold_km:
            return True
    return False


def _in_zone(lat: float, lon: float, zone: dict) -> bool:
    """Check if point is inside a circular war zone."""
    return _haversine_km(lat, lon, zone["lat"], zone["lon"]) < zone["radius_km"]


def _get_zone_name(lat: float, lon: float) -> Optional[str]:
    """Return the name of the war zone the point falls in, or None."""
    for z in WAR_ZONES:
        if _in_zone(lat, lon, z):
            return z["name"]
    return None


# ══════════════════════════════════════════════════════════════════════════════
# ── Alert Rule Engine ────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _make_evidence(vessel: VesselState, count: int = 3) -> list[dict]:
    """Build evidence list from recent pings."""
    recent = list(vessel.ping_history)[-count:]
    return [{"ping_ts": p.timestamp, "lat": p.lat, "lon": p.lon, "speed_kn": p.speed_kn} for p in recent]


def _evaluate_rules(ping: AISPing, vessel: VesselState) -> list[AISAlert]:
    """Evaluate all 6 alert rules against the incoming ping. Returns list of new alerts."""
    alerts: list[AISAlert] = []
    evidence = _make_evidence(vessel)
    cargo_value = 0.0
    declared_route: list[list[float]] = []

    if vessel.voyage_context:
        cargo_value = vessel.voyage_context.get("cargo_value_usd", 0.0)
        declared_route = vessel.voyage_context.get("declared_route", [])

    # ── Rule 1: War Risk ─────────────────────────────────────────────────
    if ping.status == "underway":
        zone_name = _get_zone_name(ping.lat, ping.lon)
        if zone_name:
            # Only fire once per vessel per zone (check if already alerted)
            existing = [a for a in _alerts if a.type == "war_risk" and a.mmsi == ping.mmsi
                        and zone_name in a.msg]
            if not existing:
                premium_adj = round(2.0 + (cargo_value / 100_000_000) * 1.5, 1) if cargo_value else 3.0
                alerts.append(AISAlert(
                    type="war_risk", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
                    severity="HIGH",
                    msg=f"Vessel {ping.vessel_name or ping.mmsi} entered {zone_name} war zone — recommend +{premium_adj}% war surcharge",
                    location={"lat": ping.lat, "lon": ping.lon},
                    evidence=evidence,
                ))

    # ── Rule 2: Deviation from declared route ─────────────────────────────
    if declared_route and len(declared_route) >= 2 and ping.status == "underway":
        dist = _distance_to_route(ping.lat, ping.lon, declared_route)
        if dist > 50:  # 50 km threshold
            severity = "HIGH" if dist > 150 else "MEDIUM"
            # Avoid duplicate deviation alerts within 5 minutes
            recent_dev = [a for a in _alerts[-20:] if a.type == "deviation" and a.mmsi == ping.mmsi]
            if not recent_dev:
                alerts.append(AISAlert(
                    type="deviation", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
                    severity=severity,
                    msg=f"Vessel {ping.vessel_name or ping.mmsi} deviated {dist:.0f}km from declared route — coverage breach warning",
                    location={"lat": ping.lat, "lon": ping.lon},
                    evidence=evidence,
                ))

    # ── Rule 3: Emergency (speed drop >80% in time window + not near port) ─
    if len(vessel.ping_history) >= 2 and not _near_port(ping.lat, ping.lon):
        prev_pings = list(vessel.ping_history)
        # Check speed drop within recent pings (2-minute window approximation)
        recent_fast = [p for p in prev_pings[-5:-1] if p.speed_kn > 5.0]
        if recent_fast and ping.speed_kn < 1.0:
            max_recent_speed = max(p.speed_kn for p in recent_fast)
            drop_pct = (max_recent_speed - ping.speed_kn) / max_recent_speed * 100
            if drop_pct > 80:
                existing_em = [a for a in _alerts[-10:] if a.type == "emergency" and a.mmsi == ping.mmsi]
                if not existing_em:
                    alerts.append(AISAlert(
                        type="emergency", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
                        severity="CRITICAL",
                        msg=f"EMERGENCY — Vessel {ping.vessel_name or ping.mmsi} speed dropped {drop_pct:.0f}% (from {max_recent_speed:.1f}kn to {ping.speed_kn:.1f}kn) — possible distress",
                        location={"lat": ping.lat, "lon": ping.lon},
                        evidence=evidence,
                    ))

    # Also trigger on explicit SOS status
    if ping.status == "sos":
        existing_sos = [a for a in _alerts[-10:] if a.type == "emergency" and a.mmsi == ping.mmsi]
        if not existing_sos:
            alerts.append(AISAlert(
                type="emergency", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
                severity="CRITICAL",
                msg=f"SOS — Vessel {ping.vessel_name or ping.mmsi} transmitted distress signal at ({ping.lat:.4f}, {ping.lon:.4f})",
                location={"lat": ping.lat, "lon": ping.lon},
                evidence=evidence,
            ))

    # ── Rule 4: AIS Spoofing ─────────────────────────────────────────────
    if ping.speed_kn > 60:
        alerts.append(AISAlert(
            type="spoofing", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
            severity="HIGH",
            msg=f"AIS ANOMALY — Vessel {ping.vessel_name or ping.mmsi} reporting impossible speed {ping.speed_kn:.1f}kn — possible spoofing",
            location={"lat": ping.lat, "lon": ping.lon},
            evidence=evidence,
        ))

    if len(vessel.ping_history) >= 2:
        prev = list(vessel.ping_history)[-2]
        jump = _haversine_km(prev.lat, prev.lon, ping.lat, ping.lon)
        if jump > 500:
            existing_spoof = [a for a in _alerts[-10:] if a.type == "spoofing" and a.mmsi == ping.mmsi]
            if not existing_spoof:
                alerts.append(AISAlert(
                    type="spoofing", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
                    severity="HIGH",
                    msg=f"AIS ANOMALY — Vessel {ping.vessel_name or ping.mmsi} position jumped {jump:.0f}km between pings — possible spoofing",
                    location={"lat": ping.lat, "lon": ping.lon},
                    evidence=evidence,
                ))

    # ── Rule 5: Next-Policy Flag ─────────────────────────────────────────
    high_severity_alerts = [a for a in alerts if a.severity in ("HIGH", "CRITICAL")]
    if high_severity_alerts:
        vessel.next_policy_flag = True
        alerts.append(AISAlert(
            type="next_policy", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
            severity="MEDIUM",
            msg=f"Vessel {ping.vessel_name or ping.mmsi} flagged for next policy review — {len(high_severity_alerts)} high-severity event(s) recorded",
            location={"lat": ping.lat, "lon": ping.lon},
            evidence=evidence,
        ))

    # ── Rule 6: Reinsurance Exposure (zone bucketing) ────────────────────
    # Check if this ping's zone now has ≥3 distinct vessels with HIGH+ alerts
    zone_name = _get_zone_name(ping.lat, ping.lon)
    if zone_name:
        # Collect all distinct MMSIs with HIGH+ alerts in this zone
        mmsis_in_zone: set[str] = set()
        total_cargo = 0.0
        for a in _alerts:
            if a.severity in ("HIGH", "CRITICAL") and a.type != "reinsurance":
                a_zone = _get_zone_name(a.location.get("lat", 0), a.location.get("lon", 0))
                if a_zone == zone_name:
                    mmsis_in_zone.add(a.mmsi)
        # Also count current vessel if it has a high alert
        for a in alerts:
            if a.severity in ("HIGH", "CRITICAL") and a.type != "reinsurance":
                mmsis_in_zone.add(ping.mmsi)

        if len(mmsis_in_zone) >= 3:
            # Check if we already have a reinsurance alert for this zone recently
            existing_re = [a for a in _alerts if a.type == "reinsurance" and zone_name in a.msg]
            if not existing_re:
                # Sum cargo values for vessels in zone
                for m in mmsis_in_zone:
                    v = _vessels.get(m)
                    if v and v.voyage_context:
                        total_cargo += v.voyage_context.get("cargo_value_usd", 0.0)
                alerts.append(AISAlert(
                    type="reinsurance", mmsi="PORTFOLIO", voyage_id="",
                    severity="HIGH",
                    msg=f"REINSURANCE EXPOSURE — {len(mmsis_in_zone)} insured vessels in {zone_name} conflict zone — total cargo exposure: ${total_cargo / 1_000_000:.0f}M",
                    location={"lat": ping.lat, "lon": ping.lon},
                    evidence=[{"mmsi": m, "zone": zone_name} for m in mmsis_in_zone],
                ))

    return alerts


# ══════════════════════════════════════════════════════════════════════════════
# ── WebSocket Broadcasting ───────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

async def _broadcast(message: dict):
    """Broadcast JSON to all subscribers. Broken sockets are removed silently."""
    import json
    data = json.dumps(message)
    dead: list[WebSocket] = []
    for ws in list(_subscribers):
        try:
            await ws.send_text(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _subscribers.discard(ws)


# ══════════════════════════════════════════════════════════════════════════════
# ── REST Endpoints ───────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/ping")
async def ingest_ping(ping: AISPing):
    """Ingest an AIS ping, update vessel state, run alert rules, broadcast."""
    # Store ping
    _pings.append(ping)

    # Update or create vessel state
    if ping.mmsi in _vessels:
        _vessels[ping.mmsi].update(ping)
    else:
        _vessels[ping.mmsi] = VesselState(ping)

    vessel = _vessels[ping.mmsi]

    # Attach voyage context if registered
    if ping.voyage_id and ping.voyage_id in _voyages:
        vessel.voyage_context = _voyages[ping.voyage_id]

    # Run alert rules
    new_alerts = _evaluate_rules(ping, vessel)
    for alert in new_alerts:
        _alerts.append(alert)
        # Add to intel feed
        severity_map = {"CRITICAL": "CRITICAL", "HIGH": "HIGH", "MEDIUM": "MEDIUM"}
        ais_intel_items.append({
            "domain": "SEA",
            "severity": severity_map.get(alert.severity, "MEDIUM"),
            "time": datetime.now(timezone.utc).strftime("%H:%M UTC"),
            "text": alert.msg,
            "alert_id": alert.alert_id,
            "type": alert.type,
        })

    # Broadcast vessel update
    await _broadcast({
        "event": "vessel.update",
        "data": vessel.to_dict(),
    })

    # Broadcast each alert
    for alert in new_alerts:
        await _broadcast({
            "event": "alert.create",
            "data": alert.model_dump(),
        })

    return {
        "status": "ok",
        "vessel": ping.mmsi,
        "alerts_generated": len(new_alerts),
        "alert_ids": [a.alert_id for a in new_alerts],
    }


@router.post("/voyage")
async def register_voyage(voyage: VoyageRegistration):
    """Register a voyage context (declared route, cargo, policy)."""
    _voyages[voyage.voyage_id] = voyage.model_dump()
    # If vessel already tracked, attach context
    if voyage.mmsi in _vessels:
        _vessels[voyage.mmsi].voyage_context = _voyages[voyage.voyage_id]
    return {"status": "ok", "voyage_id": voyage.voyage_id}


@router.get("/vessels")
async def get_vessels():
    """Return all current vessel positions."""
    return {"vessels": [v.to_dict() for v in _vessels.values()]}


@router.get("/alerts")
async def get_alerts(severity: str = "", alert_type: str = "", limit: int = 100):
    """Return alert history with optional filters."""
    filtered = _alerts
    if severity:
        filtered = [a for a in filtered if a.severity == severity.upper()]
    if alert_type:
        filtered = [a for a in filtered if a.type == alert_type]
    return {"alerts": [a.model_dump() for a in filtered[-limit:]]}


@router.get("/voyages")
async def get_voyages():
    """Return all registered voyages."""
    return {"voyages": list(_voyages.values())}


@router.get("/exposure")
async def get_exposure():
    """Return portfolio exposure aggregated by zone."""
    # Build zone buckets
    zone_data: dict[str, dict] = {}
    for z in WAR_ZONES:
        zone_data[z["name"]] = {"zone": z["name"], "vessel_count": 0, "cargo_usd": 0, "alert_count": 0, "mmsis": []}

    # Count vessels per zone
    for mmsi, vessel in _vessels.items():
        zone_name = _get_zone_name(vessel.lat, vessel.lon)
        if zone_name and zone_name in zone_data:
            zone_data[zone_name]["vessel_count"] += 1
            zone_data[zone_name]["mmsis"].append(mmsi)
            if vessel.voyage_context:
                zone_data[zone_name]["cargo_usd"] += vessel.voyage_context.get("cargo_value_usd", 0)

    # Count alerts per zone
    for alert in _alerts:
        if alert.location:
            a_zone = _get_zone_name(alert.location.get("lat", 0), alert.location.get("lon", 0))
            if a_zone and a_zone in zone_data:
                zone_data[a_zone]["alert_count"] += 1

    # Filter out empty zones
    active_zones = [v for v in zone_data.values() if v["vessel_count"] > 0 or v["alert_count"] > 0]
    return {"exposure": active_zones}


@router.post("/reset")
async def reset_state():
    """Reset all in-memory state (for testing/demo)."""
    _vessels.clear()
    _pings.clear()
    _alerts.clear()
    _voyages.clear()
    ais_intel_items.clear()
    return {"status": "reset"}


# ══════════════════════════════════════════════════════════════════════════════
# ── WebSocket Endpoint ───────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@router.websocket("/subscribe")
async def ais_subscribe(websocket: WebSocket):
    """WebSocket endpoint for real-time vessel updates and alerts."""
    await websocket.accept()
    _subscribers.add(websocket)
    try:
        # Send current state snapshot
        import json
        await websocket.send_text(json.dumps({
            "event": "snapshot",
            "data": {
                "vessels": [v.to_dict() for v in _vessels.values()],
                "alerts": [a.model_dump() for a in _alerts[-50:]],
            },
        }))
        # Keep connection alive — listen for client messages / disconnects
        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send keepalive ping
                try:
                    await websocket.send_text('{"event":"ping"}')
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        _subscribers.discard(websocket)
