"""
AIS Live Tracking Router — Real-time vessel monitoring, alert engine, WebSocket pub/sub.
Integrates Policy Compliance and Coverage Lifecycle Engine for insurance underwriting.
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

from backend.services.compliance_engine import ComplianceEngine
from backend.models.policy import CoverageStatus, CoverageEvent

router = APIRouter()

# Initialize global compliance engine
_compliance_engine = ComplianceEngine()

# ── War-risk zone polygons (Dynamic state streamed to UI) ────────────────
WAR_ZONES = [
    {"name": "Red Sea / Bab el-Mandeb", "lat": 15.0, "lon": 42.5, "radius_km": 450, "color": "#ef4444", "opacity": 0.15, "type": "CRITICAL", "reason": "Houthi attacks ongoing, ceasefire fragile, vessels being targeted", "active": True},
    {"name": "Strait of Hormuz",        "lat": 26.6, "lon": 56.3, "radius_km": 250, "color": "#ef4444", "opacity": 0.18, "type": "CRITICAL", "reason": "US/Israel strikes on Iran — tanker traffic collapsed", "active": True},
    {"name": "Gulf of Aden",            "lat": 11.5, "lon": 48.5, "radius_km": 380, "color": "#ef4444", "opacity": 0.15, "type": "CRITICAL", "reason": "Houthi + Somali piracy overlap, hijackings", "active": True},
    {"name": "Black Sea",               "lat": 43.5, "lon": 34.0, "radius_km": 300, "color": "#f97316", "opacity": 0.14, "type": "HIGH",     "reason": "Ukraine-Russia conflict, drone strikes on tankers", "active": True},
    {"name": "Gulf of Guinea",          "lat":  2.0, "lon":  5.0, "radius_km": 500, "color": "#f97316", "opacity": 0.12, "type": "HIGH",     "reason": "Piracy, kidnapping for ransom", "active": True},
    {"name": "Strait of Malacca",       "lat":  3.0, "lon": 100.0, "radius_km": 300, "color": "#f97316", "opacity": 0.14, "type": "HIGH",    "reason": "Armed piracy incidents rising — strait closure imminent", "active": False},
    {"name": "South China Sea",         "lat": 12.0, "lon": 114.0, "radius_km": 700, "color": "#f59e0b", "opacity": 0.12, "type": "ELEVATED", "reason": "Territorial disputes near Spratly Islands", "active": True},
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
        "coverage_status", "coverage_id", "coverage_reason",
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
        # Coverage tracking
        self.coverage_status: str = "ACTIVE"  # ACTIVE|WARNING|BREACH|VOID
        self.coverage_id: str = ""
        self.coverage_reason: str = ""

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
            "coverage_status": self.coverage_status.value if hasattr(self.coverage_status, 'value') else str(self.coverage_status),
            "coverage_id": self.coverage_id,
            "coverage_reason": self.coverage_reason,
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
    """Return the name of the active war zone the point falls in, or None."""
    for z in WAR_ZONES:
        if z.get("active", True) and _in_zone(lat, lon, z):
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
                        and zone_name in a.msg and "entered" in a.msg.lower()]
            if not existing:
                premium_adj = round(2.0 + (cargo_value / 100_000_000) * 1.5, 1) if cargo_value else 3.0
                alerts.append(AISAlert(
                    type="war_risk", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
                    severity="CRITICAL",
                    msg=f"Vessel {ping.vessel_name or ping.mmsi} entered {zone_name} war zone — recommend +{premium_adj}% war surcharge",
                    location={"lat": ping.lat, "lon": ping.lon},
                    evidence=evidence,
                ))

    # ── Rule 1.5: Approaching War Risk Zone ──────────────────────────────
    if ping.status == "underway" and not zone_name:
        for z in WAR_ZONES:
            if not z.get("active", True):
                continue
            dist = _haversine_km(ping.lat, ping.lon, z["lat"], z["lon"])
            if z["radius_km"] < dist <= z["radius_km"] + 500.0:
                existing_appr = [a for a in _alerts if a.type == "war_risk" and a.mmsi == ping.mmsi
                                 and z["name"] in a.msg and "approaching" in a.msg.lower()]
                if not existing_appr:
                    alerts.append(AISAlert(
                        type="war_risk", mmsi=ping.mmsi, voyage_id=ping.voyage_id,
                        severity="HIGH",
                        msg=f"Vessel {ping.vessel_name or ping.mmsi} approaching {z['name']} war zone ({(dist - z['radius_km']):.0f}km away) — consider policy review",
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
# ── Helper Functions ─────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _create_alert_from_coverage_event(event: CoverageEvent) -> AISAlert:
    """Convert a CoverageEvent to an AISAlert for uniform alert handling."""
    return AISAlert(
        alert_id=event.event_id,
        type="policy_compliance",
        mmsi=event.mmsi,
        voyage_id=event.voyage_id,
        severity=event.severity,
        msg=event.msg,
        timestamp=event.timestamp,
        location=event.location,
        evidence=event.evidence,
    )


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
    """Ingest an AIS ping, update vessel state, run alert rules, evaluate policy compliance, broadcast."""
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

    # Background traffic only updates position on the map, no alerts/compliance
    if ping.extra.get("is_background"):
        await _broadcast({
            "event": "vessel.update",
            "data": vessel.to_dict(),
        })
        return {
            "status": "ok",
            "vessel": ping.mmsi,
            "alerts_generated": 0,
            "alert_ids": [],
            "coverage_event": None,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # POLICY COMPLIANCE EVALUATION
    # ─────────────────────────────────────────────────────────────────────────
    
    # Register vessel policy if not already registered
    if ping.mmsi not in _compliance_engine.policies:
        _compliance_engine.register_vessel_policy(ping.mmsi)
    
    # Initiate coverage if no voyage-level coverage exists
    if ping.voyage_id and ping.voyage_id not in _compliance_engine.coverage_states:
        _compliance_engine.initiate_coverage(ping.voyage_id, ping.mmsi, ping.extra.get("policy_id", ""))
    
    # Build vessel context for compliance evaluation
    vessel_context = {}
    if vessel.voyage_context:
        vessel_context["declared_route"] = vessel.voyage_context.get("declared_route", [])
        vessel_context["declared_ports"] = vessel.voyage_context.get("destination", "").split(",") if vessel.voyage_context.get("destination") else []
    
    # Check war zone and add to context
    zone_name = _get_zone_name(ping.lat, ping.lon)
    if zone_name:
        vessel_context["current_war_zone"] = zone_name
    
    # Evaluate compliance for this ping
    coverage_event = None
    if ping.voyage_id:
        coverage_event = _compliance_engine.evaluate_ping(
            voyage_id=ping.voyage_id,
            mmsi=ping.mmsi,
            lat=ping.lat,
            lon=ping.lon,
            speed_kn=ping.speed_kn,
            timestamp=ping.timestamp,
            vessel_context=vessel_context,
            known_ports=KNOWN_PORTS,
        )
    
    # Update vessel coverage status from engine state
    if ping.voyage_id:
        coverage_state = _compliance_engine.get_coverage_state(ping.voyage_id)
        if coverage_state:
            vessel.coverage_status = coverage_state.status
            vessel.coverage_id = coverage_state.coverage_id
            vessel.coverage_reason = str(coverage_state.last_breach_reason) if coverage_state.last_breach_reason else ""

    # ─────────────────────────────────────────────────────────────────────────
    # ALERT GENERATION
    # ─────────────────────────────────────────────────────────────────────────
    
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

    # ─────────────────────────────────────────────────────────────────────────
    # BROADCAST UPDATES
    # ─────────────────────────────────────────────────────────────────────────

    # Broadcast vessel update
    await _broadcast({
        "event": "vessel.update",
        "data": vessel.to_dict(),
    })

    # Broadcast each operational alert
    for alert in new_alerts:
        await _broadcast({
            "event": "alert.create",
            "data": alert.model_dump(),
        })
    
    # Broadcast coverage event (if coverage status changed)
    if coverage_event:
        _alerts.append(_create_alert_from_coverage_event(coverage_event))
        await _broadcast({
            "event": "coverage.status_change",
            "data": {
                "event_id": coverage_event.event_id,
                "voyage_id": coverage_event.voyage_id,
                "mmsi": coverage_event.mmsi,
                "previous_status": coverage_event.previous_status,
                "new_status": coverage_event.new_status,
                "severity": coverage_event.severity,
                "msg": coverage_event.msg,
                "timestamp": coverage_event.timestamp,
                "location": coverage_event.location,
                "evidence": coverage_event.evidence,
            },
        })
        # Also add to intel feed
        ais_intel_items.append({
            "domain": "SEA",
            "severity": coverage_event.severity,
            "time": datetime.now(timezone.utc).strftime("%H:%M UTC"),
            "text": f"[COVERAGE] {coverage_event.msg}",
            "alert_id": coverage_event.event_id,
            "type": "policy_compliance",
        })

    return {
        "status": "ok",
        "vessel": ping.mmsi,
        "alerts_generated": len(new_alerts),
        "alert_ids": [a.alert_id for a in new_alerts],
        "coverage_event": coverage_event.event_id if coverage_event else None,
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


@router.post("/reroute")
async def reroute_vessel(mmsi: str):
    """
    Compute an alternative safe route for a vessel from its current position
    to its registered destination, using the searoute library.
    Broadcasts the new route via WebSocket as a 'reroute' event.
    """
    import json
    try:
        import searoute as sr
    except ImportError:
        return {"error": "searoute library not installed"}

    vessel = _vessels.get(mmsi)
    if not vessel:
        return {"error": f"Vessel {mmsi} not found"}

    voyage_ctx = vessel.voyage_context
    if not voyage_ctx:
        return {"error": "No voyage context for vessel"}

    # Get destination coords from waypoints of the declared route
    declared_route = voyage_ctx.get("declared_route", [])
    if len(declared_route) < 2:
        return {"error": "Declared route has insufficient waypoints"}

    # Use the last waypoint of the declared route as destination
    dest = declared_route[-1]  # [lat, lon]

    try:
        # current position as starting point, destination as end
        # searoute expects [lon, lat] format
        result = sr.searoute(
            [vessel.lon, vessel.lat],
            [dest[1], dest[0]],
        )
        waypoints = [(p[1], p[0]) for p in result["geometry"]["coordinates"]]  # [(lat, lon), ...]
        route_coords = [[lat, lon] for lat, lon in waypoints]

        # Broadcast the new safe route to all subscribers
        msg = json.dumps({
            "event": "reroute",
            "data": {
                "mmsi": mmsi,
                "vessel_name": vessel.vessel_name,
                "route": route_coords,
                "reason": "Alternative safe route computed — avoids active risk zones",
            }
        })
        for ws in list(_subscribers):
            try:
                await ws.send_text(msg)
            except Exception:
                continue

        return {
            "status": "ok",
            "mmsi": mmsi,
            "waypoints": len(route_coords),
            "route": route_coords[:5],  # abbreviated in response
        }
    except Exception as e:
        return {"error": f"Route calculation failed: {e}"}



@router.get("/exposure")
async def get_exposure():
    """Return portfolio exposure aggregated by zone."""
    # Build zone buckets
    zone_data: dict[str, dict] = {}
    for z in WAR_ZONES:
        if z.get("active", True):
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


# ══════════════════════════════════════════════════════════════════════════════
# ── Policy Compliance & Coverage Endpoints ──────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/coverage/state/{voyage_id}")
async def get_coverage_state(voyage_id: str):
    """Get current coverage state for a voyage."""
    coverage = _compliance_engine.get_coverage_state(voyage_id)
    if not coverage:
        return {"error": "Coverage not tracked for this voyage", "status": "ACTIVE"}
    return {"coverage": coverage.model_dump()}


@router.get("/coverage/all")
async def get_all_coverage_states():
    """Get all coverage states across all voyages."""
    return {
        "coverage_states": [cs.model_dump() for cs in _compliance_engine.coverage_states.values()]
    }


@router.post("/coverage/initiate")
async def initiate_voyage_coverage(voyage_id: str, mmsi: str, policy_id: str = ""):
    """Initiate coverage tracking for a new voyage."""
    coverage = _compliance_engine.initiate_coverage(voyage_id, mmsi, policy_id)
    return {"coverage": coverage.model_dump()}


@router.get("/coverage/by_mmsi/{mmsi}")
async def get_coverage_by_vessel(mmsi: str):
    """Get all coverage states for a specific vessel (across all voyages)."""
    vessel_coverage = [
        cs.model_dump() for cs in _compliance_engine.coverage_states.values()
        if cs.mmsi == mmsi
    ]
    return {"coverage_states": vessel_coverage}


@router.get("/alerts/policy-compliance")
async def get_compliance_alerts(limit: int = 50):
    """Get only policy compliance alerts."""
    compliance_alerts = [a for a in _alerts if a.type == "policy_compliance"]
    return {"alerts": [a.model_dump() for a in compliance_alerts[-limit:]]}


@router.get("/alerts/by_mmsi/{mmsi}")
async def get_alerts_by_vessel(mmsi: str, limit: int = 50):
    """Get all alerts for a specific vessel."""
    vessel_alerts = [a for a in _alerts if a.mmsi == mmsi]
    return {"alerts": [a.model_dump() for a in vessel_alerts[-limit:]]}


@router.post("/reset")
async def reset_state():
    """Reset all in-memory state (for testing/demo)."""
    _vessels.clear()
    _pings.clear()
    _alerts.clear()
    _voyages.clear()
    ais_intel_items.clear()
    _compliance_engine.reset_all()
    # Reset zones to default (Strait of Malacca inactive for demo)
    for z in WAR_ZONES:
        if "Strait of Malacca" in z["name"]:
            z["active"] = False
        else:
            z["active"] = True
    return {"status": "reset"}

@router.post("/zones/toggle")
async def toggle_zone(zone_name: str):
    """Toggle the active state of a risk zone by name."""
    import json
    found = False
    for z in WAR_ZONES:
        if z["name"] == zone_name:
            z["active"] = not z.get("active", True)
            found = True
            break
    
    if found:
        toggled_zone = next((z for z in WAR_ZONES if z["name"] == zone_name), None)
        is_now_active = toggled_zone.get("active", True) if toggled_zone else False

        # Broadcast the updated zones to all websocket clients
        async def _do_broadcast():
            import json
            msg = json.dumps({
                "event": "zones_update",
                "data": {"zones": WAR_ZONES}
            })
            for ws in list(_subscribers):
                try:
                    await ws.send_text(msg)
                except Exception:
                    continue

            # If this zone was just activated, generate immediate alerts for vessels near it
            if is_now_active and toggled_zone:
                z = toggled_zone
                for vessel in _vessels.values():
                    dist = _haversine_km(vessel.lat, vessel.lon, float(z["lat"]), float(z["lon"]))
                    if dist <= float(z["radius_km"]) + 1200.0:  # within 1200km to catch all approaching/inside
                        # Determine alert severity and message
                        if dist <= float(z["radius_km"]):
                            severity = "CRITICAL"
                            alert_msg_text = f"⚠️ RISK ZONE ACTIVATED — Vessel {vessel.vessel_name or vessel.mmsi} is NOW INSIDE {z['name']} war zone — IMMEDIATE policy review required"
                        else:
                            severity = "HIGH"
                            alert_msg_text = f"🚨 NEW RISK ZONE AHEAD — Vessel {vessel.vessel_name or vessel.mmsi} is {(dist - float(z['radius_km'])):.0f}km from newly activated {z['name']} war zone — review policy now"

                        alert = AISAlert(
                            type="war_risk",
                            mmsi=vessel.mmsi,
                            voyage_id=vessel.voyage_id or "",
                            severity=severity,
                            msg=alert_msg_text,
                            location={"lat": vessel.lat, "lon": vessel.lon},
                            evidence=[],
                        )
                        _alerts.append(alert)
                        ais_intel_items.append({
                            "domain": "SEA",
                            "severity": severity,
                            "time": datetime.now(timezone.utc).strftime("%H:%M UTC"),
                            "text": alert.msg,
                            "alert_id": alert.alert_id,
                            "type": alert.type,
                        })
                        broadcast_alert_msg = json.dumps({"event": "alert.create", "data": alert.model_dump()})
                        for ws2 in list(_subscribers):
                            try:
                                await ws2.send_text(broadcast_alert_msg)
                            except Exception:
                                continue

                        # Auto-compute zone-AVOIDING alternative route for this vessel
                        print(f"  [REROUTE] Computing safe route for vessel {vessel.mmsi} (dist={dist:.0f}km from zone)")
                        try:
                            import searoute as sr

                            # Zone bypass waypoints: points that lie safely OUTSIDE each zone,
                            # forcing the multi-leg route to detour around the blocked area.
                            ZONE_BYPASS_WAYPOINTS: dict[str, list[float]] = {
                                "Strait of Malacca": [105.87, -6.10],  # Sunda Strait (between Java & Sumatra) — natural bypass
                                "Red Sea":           [43.15, 11.60],   # Gulf of Aden south of Bab el-Mandeb
                                "Strait of Hormuz":  [58.59, 23.58],   # Muscat, Oman — safe port outside the Gulf
                                "Black Sea":         [29.00, 41.00],   # Istanbul strait area bypass
                                "Gulf of Aden":      [45.00, 11.00],   # South of Gulf of Aden
                                "Bab el-Mandeb":     [43.50, 11.00],   # South of Bab el-Mandeb
                            }

                            voyage_ctx = vessel.voyage_context
                            declared_route = voyage_ctx.get("declared_route", []) if voyage_ctx else []
                            zone_name_key = str(z.get("name", ""))

                            if len(declared_route) >= 2 and zone_name_key in ZONE_BYPASS_WAYPOINTS:
                                bypass_lonlat = ZONE_BYPASS_WAYPOINTS[zone_name_key]  # [lon, lat]
                                bypass_lat, bypass_lon = bypass_lonlat[1], bypass_lonlat[0]

                                dest = declared_route[-1]  # [lat, lon]
                                dest_lon, dest_lat = float(dest[1]), float(dest[0])

                                print(f"  [REROUTE] Leg 1: ({vessel.lat:.2f},{vessel.lon:.2f}) → bypass ({bypass_lat:.2f},{bypass_lon:.2f})")
                                # Leg 1: current position → bypass waypoint
                                leg1 = sr.searoute(
                                    [vessel.lon, vessel.lat],
                                    [bypass_lon, bypass_lat],
                                )
                                leg1_coords = [[p[1], p[0]] for p in leg1["geometry"]["coordinates"]]

                                print(f"  [REROUTE] Leg 2: bypass → dest ({dest_lat:.2f},{dest_lon:.2f})")
                                # Leg 2: bypass waypoint → original destination
                                leg2 = sr.searoute(
                                    [bypass_lon, bypass_lat],
                                    [dest_lon, dest_lat],
                                )
                                leg2_coords = [[p[1], p[0]] for p in leg2["geometry"]["coordinates"]]

                                # Combine legs (drop duplicate joining point)
                                route_coords = leg1_coords + leg2_coords[1:]
                                print(f"  [REROUTE] Computed {len(route_coords)} total waypoints for {vessel.mmsi}")

                                reroute_msg = json.dumps({
                                    "event": "reroute",
                                    "data": {
                                        "mmsi": vessel.mmsi,
                                        "vessel_name": vessel.vessel_name,
                                        "route": route_coords,
                                        "reason": f"⚡ Auto-rerouted via {ZONE_BYPASS_WAYPOINTS[zone_name_key]} — avoids {zone_name_key} risk zone",
                                    }
                                })
                                for ws3 in list(_subscribers):
                                    try:
                                        await ws3.send_text(reroute_msg)
                                    except Exception:
                                        continue
                            elif len(declared_route) >= 2:
                                # Fallback: direct route even without a specific bypass
                                dest = declared_route[-1]
                                result = sr.searoute([vessel.lon, vessel.lat], [float(dest[1]), float(dest[0])])
                                route_coords = [[p[1], p[0]] for p in result["geometry"]["coordinates"]]
                                reroute_msg = json.dumps({
                                    "event": "reroute",
                                    "data": {
                                        "mmsi": vessel.mmsi,
                                        "vessel_name": vessel.vessel_name,
                                        "route": route_coords,
                                        "reason": f"⚡ Alternative route — {zone_name_key} risk zone active",
                                    }
                                })
                                for ws3 in list(_subscribers):
                                    try:
                                        await ws3.send_text(reroute_msg)
                                    except Exception:
                                        continue
                            else:
                                print(f"  [REROUTE] Skipped — no declared route for {vessel.mmsi}")
                        except Exception as reroute_err:
                            print(f"  [REROUTE ERROR] {vessel.mmsi}: {reroute_err}")

        asyncio.create_task(_do_broadcast())
        return {"status": "toggled"}
    return {"error": "Zone not found"}, 404



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
                "zones": WAR_ZONES,
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
