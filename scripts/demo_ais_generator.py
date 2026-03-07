#!/usr/bin/env python3
"""
Demo AIS Generator — Sends realistic synthetic AIS pings to the backend.

Usage:
    python scripts/demo_ais_generator.py --scenario mixed --count 10 --interval 2
    python scripts/demo_ais_generator.py --scenario war-entry --count 5 --interval 3
    python scripts/demo_ais_generator.py --scenario sos --count 3

Scenarios:
    normal     — vessels move along routes normally
    war-entry  — 3 vessels approach and enter Red Sea war zone
    deviation  — 1 vessel deviates from declared route
    sos        — 1 vessel drops speed to 0 and sets SOS
    mixed      — full demo storyline (normal → war-entry → deviation → SOS → exposure)
"""
from __future__ import annotations

import argparse
import asyncio
import math
import random
import time
from datetime import datetime, timezone

import httpx

# ══════════════════════════════════════════════════════════════════════════════
# ── High-fidelity ocean routes — every waypoint is verified at-sea ──────────
# ══════════════════════════════════════════════════════════════════════════════

ROUTES = {
    "dubai_rotterdam": {
        "origin": "Dubai (Jebel Ali)", "destination": "Rotterdam",
        "waypoints": [
            # Jebel Ali → Strait of Hormuz → Gulf of Oman → Arabian Sea
            (25.02, 55.06), (25.30, 55.50), (25.95, 56.25), (26.30, 56.40),
            (25.40, 57.80), (24.50, 58.80), (23.00, 60.00), (21.00, 61.50),
            # Arabian Sea → Gulf of Aden
            (18.00, 58.00), (14.50, 52.00), (12.50, 50.00), (12.00, 48.00),
            # Bab el-Mandeb → Red Sea
            (12.60, 43.50), (13.50, 42.80), (14.50, 42.00), (16.00, 41.00),
            (18.00, 39.50), (21.00, 38.00), (24.00, 37.00), (27.50, 34.50),
            # Suez Canal → Mediterranean
            (29.95, 32.58), (31.20, 32.30), (31.80, 30.50),
            (33.60, 28.50), (35.00, 24.00), (35.50, 18.00),
            # Mediterranean → Strait of Gibraltar → Atlantic
            (36.00, 12.00), (36.50, 5.00), (35.90, -5.70), (36.10, -7.50),
            # Atlantic → English Channel → Rotterdam
            (38.00, -9.50), (43.00, -10.00), (47.00, -7.00), (48.70, -5.40),
            (49.50, -3.50), (50.30, -1.00), (51.20, 1.80), (51.90, 4.00),
        ],
    },
    "mumbai_singapore": {
        "origin": "Mumbai (JNPT)", "destination": "Singapore",
        "waypoints": [
            # Mumbai → Arabian Sea → Indian Ocean (south of Sri Lanka)
            (18.94, 72.84), (18.20, 72.00), (17.00, 72.00), (15.00, 73.00),
            (12.00, 75.00), (9.00, 76.50), (7.00, 78.00),
            # South of Sri Lanka → Bay of Bengal → Strait of Malacca
            (5.50, 80.00), (5.00, 82.00), (5.00, 85.00), (5.00, 88.00),
            (5.50, 92.00), (5.80, 95.00), (4.50, 97.50), (3.50, 99.50),
            # Strait of Malacca to Singapore
            (2.80, 100.80), (2.00, 102.00), (1.50, 103.40), (1.26, 103.82),
        ],
    },
    "shanghai_singapore": {
        "origin": "Shanghai", "destination": "Singapore",
        "waypoints": [
            # Shanghai → East China Sea → Taiwan Strait
            (31.23, 121.47), (30.50, 122.50), (29.00, 122.50), (27.00, 121.50),
            (25.00, 120.50), (23.50, 119.50),
            # South China Sea
            (21.00, 117.50), (18.50, 115.00), (15.00, 112.50), (12.00, 110.00),
            (8.00, 108.00), (5.00, 106.00), (3.00, 105.00),
            # Singapore Strait
            (2.00, 104.00), (1.26, 103.82),
        ],
    },
    "singapore_hormuz": {
        "origin": "Singapore", "destination": "Bandar Abbas (Hormuz)",
        "waypoints": [
            # Singapore → Strait of Malacca → Indian Ocean
            (1.26, 103.82), (1.50, 103.40), (2.00, 102.00), (2.80, 100.80),
            (3.50, 99.50), (4.50, 97.50), (5.80, 95.00), (5.50, 92.00),
            # Bay of Bengal → Arabian Sea → Gulf of Oman
            (5.00, 85.00), (5.50, 80.00), (7.00, 72.00), (9.00, 65.00),
            (12.00, 60.00), (15.50, 57.00), (20.00, 59.50),
            # Gulf of Oman → Hormuz
            (23.00, 60.00), (24.50, 58.80), (25.40, 57.80), (26.30, 56.40),
        ],
    },
    "la_yokohama": {
        "origin": "Los Angeles", "destination": "Yokohama",
        "waypoints": [
            # LA → Pacific (Great Circle approximation, staying in open ocean)
            (33.74, -118.27), (33.50, -120.00), (34.00, -130.00),
            (35.50, -140.00), (37.00, -150.00), (38.50, -160.00),
            (39.00, -170.00), (38.50, 180.00), (38.00, 170.00),
            (37.00, 160.00), (36.00, 150.00), (35.50, 145.00),
            (35.44, 139.77),  # Yokohama
        ],
    },
    "suez_mumbai": {
        "origin": "Port Said (Suez)", "destination": "Mumbai",
        "waypoints": [
            # Suez → Red Sea → Bab el-Mandeb → Arabian Sea → Mumbai
            (31.25, 32.30), (29.95, 32.58), (27.50, 34.50), (24.00, 37.00),
            (21.00, 38.00), (18.00, 39.50), (16.00, 41.00), (14.50, 42.00),
            (13.50, 42.80), (12.60, 43.50), (12.00, 48.00), (12.50, 50.00),
            (14.50, 52.00), (18.00, 58.00), (20.00, 63.00), (18.94, 72.84),
        ],
    },
    "rotterdam_suez": {
        "origin": "Rotterdam", "destination": "Port Said (Suez)",
        "waypoints": [
            (51.90, 4.00), (51.20, 1.80), (50.30, -1.00), (49.50, -3.50),
            (48.70, -5.40), (47.00, -7.00), (43.00, -10.00), (38.00, -9.50),
            (36.10, -7.50), (35.90, -5.70), (36.50, 5.00), (36.00, 12.00),
            (35.50, 18.00), (35.00, 24.00), (33.60, 28.50), (31.80, 30.50),
            (31.25, 32.30),
        ],
    },
}

VESSEL_NAMES = [
    "MSC Aurora", "MV Horizon", "CMA Pegasus", "OOCL Pioneer",
    "Maersk Sentinel", "Evergreen Atlas", "Cosco Galaxy", "HMM Fortune",
    "Yang Ming Venture", "ONE Courage", "ZIM Iberia", "PIL Caspian",
    "Hapag Titan", "MOL Triumph", "NYK Zenith", "Wan Hai Spirit",
    "Torm Kristina", "Diana Explorer", "Star Bulk Aegean", "Euronav Olympia",
]

VESSEL_TYPES = ["container", "tanker", "bulk_carrier", "lng_carrier", "general_cargo"]


# ══════════════════════════════════════════════════════════════════════════════
# ── Vessel Simulation ────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distance in nautical miles."""
    R_nm = 3440.065
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R_nm * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Initial bearing in degrees from point 1 to point 2."""
    dlon = math.radians(lon2 - lon1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(dlon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    return math.degrees(math.atan2(x, y)) % 360


class DemoVessel:
    """Simulates a vessel moving realistically along a maritime route."""

    def __init__(self, mmsi: str, name: str, route_key: str, speed: float = 14.0):
        self.mmsi = mmsi
        self.name = name
        self.route_key = route_key
        self.route = ROUTES[route_key]
        self.waypoints = self.route["waypoints"]
        self.speed_kn = speed + random.uniform(-1.5, 1.5)
        self.segment_idx = random.randint(0, max(0, len(self.waypoints) - 4))
        self.segment_progress = random.uniform(0.0, 0.5)
        self.lat, self.lon = self._position_on_segment()
        self.heading = self._segment_bearing()
        self.course = self.heading
        self.status = "underway"
        self.voyage_id = f"voy_{mmsi[-4:]}"
        self.vessel_type = random.choice(VESSEL_TYPES)
        self.cargo_value = random.randint(50, 220) * 1_000_000
        self.deviated = False
        self.sos_triggered = False

    def _position_on_segment(self) -> tuple[float, float]:
        """Get interpolated position on current route segment."""
        idx = min(self.segment_idx, len(self.waypoints) - 2)
        a = self.waypoints[idx]
        b = self.waypoints[idx + 1]
        t = max(0.0, min(1.0, self.segment_progress))
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def _segment_bearing(self) -> float:
        """Bearing along current segment."""
        idx = min(self.segment_idx, len(self.waypoints) - 2)
        a = self.waypoints[idx]
        b = self.waypoints[idx + 1]
        return _bearing(a[0], a[1], b[0], b[1])

    def advance(self, dt_seconds: float):
        """Advance vessel along route by dt_seconds."""
        if self.status == "sos" or self.segment_idx >= len(self.waypoints) - 1:
            return

        idx = min(self.segment_idx, len(self.waypoints) - 2)
        a = self.waypoints[idx]
        b = self.waypoints[idx + 1]

        # Distance of this segment in nautical miles
        seg_dist_nm = _haversine_nm(a[0], a[1], b[0], b[1])
        if seg_dist_nm < 0.1:
            seg_dist_nm = 0.1

        # How far the vessel travels in dt_seconds
        dist_nm = self.speed_kn * (dt_seconds / 3600.0)
        self.segment_progress += dist_nm / seg_dist_nm

        # Advance to next segment if we've passed the end
        while self.segment_progress >= 1.0 and self.segment_idx < len(self.waypoints) - 2:
            overshoot = self.segment_progress - 1.0
            self.segment_idx += 1
            idx = min(self.segment_idx, len(self.waypoints) - 2)
            a = self.waypoints[idx]
            b = self.waypoints[idx + 1]
            seg_dist_nm = _haversine_nm(a[0], a[1], b[0], b[1])
            if seg_dist_nm < 0.1:
                seg_dist_nm = 0.1
            self.segment_progress = overshoot * (_haversine_nm(*self.waypoints[max(0, idx - 1)], *a) / seg_dist_nm) if seg_dist_nm > 0 else 0
            self.segment_progress = min(self.segment_progress, 0.99)

        self.lat, self.lon = self._position_on_segment()
        self.heading = self._segment_bearing()
        self.course = self.heading + random.uniform(-0.5, 0.5)  # tiny course wobble

        # Very subtle speed variation (realistic for ocean-going vessels)
        self.speed_kn += random.uniform(-0.2, 0.2)
        self.speed_kn = max(10.0, min(20.0, self.speed_kn))

    def deviate(self, offset_km: float = 120):
        """Push vessel laterally off route into open ocean."""
        self.deviated = True
        # Get perpendicular direction to current heading
        perp = math.radians(self.heading + 90)
        offset_deg = offset_km / 111.0
        self.lat += offset_deg * math.cos(perp)
        self.lon += offset_deg * math.sin(perp) / math.cos(math.radians(self.lat))

    def trigger_sos(self):
        """Set vessel to SOS state."""
        self.sos_triggered = True
        self.speed_kn = 0.0
        self.status = "sos"

    def to_ping(self) -> dict:
        return {
            "mmsi": self.mmsi,
            "vessel_name": self.name,
            "imo": f"IMO{self.mmsi[-7:]}",
            "type": self.vessel_type,
            "voyage_id": self.voyage_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "lat": round(self.lat, 5),
            "lon": round(self.lon, 5),
            "speed_kn": round(self.speed_kn, 1),
            "course": round(self.course % 360, 1),
            "heading": round(self.heading % 360, 0),
            "status": self.status,
            "destination": self.route["destination"],
            "eta": "2026-03-15T08:00:00Z",
            "extra": {"sea_state": random.randint(2, 5), "cargo_value_usd": self.cargo_value},
        }

    def to_voyage_registration(self) -> dict:
        return {
            "voyage_id": self.voyage_id,
            "mmsi": self.mmsi,
            "vessel_name": self.name,
            "origin": self.route["origin"],
            "destination": self.route["destination"],
            "cargo_value_usd": self.cargo_value,
            "policy_id": f"POL-{random.randint(1000, 9999)}",
            "declared_route": [list(w) for w in self.waypoints],
        }


# ══════════════════════════════════════════════════════════════════════════════
# ── Run ──────────────────────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

async def run_demo(args):
    api_url = args.api_url.rstrip("/")
    count = args.count
    interval = args.interval
    scenario = args.scenario

    print(f"\n{'='*60}")
    print(f"  AIS Demo Generator")
    print(f"  API: {api_url}")
    print(f"  Vessels: {count}  |  Interval: {interval}s  |  Scenario: {scenario}")
    print(f"{'='*60}\n")

    # Reset state
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.post(f"{api_url}/api/ais/reset")
            print("[RESET] Cleared previous AIS state\n")
        except Exception:
            pass

    # Create vessels on different routes
    route_keys = list(ROUTES.keys())
    vessels: list[DemoVessel] = []

    # Route assignments for realistic distribution
    route_assignments = {
        "normal": None,  # use all routes
        "war-entry": ["dubai_rotterdam", "suez_mumbai", "rotterdam_suez"],
        "deviation": ["mumbai_singapore"],
        "sos": None,
        "mixed": None,
    }

    for i in range(count):
        mmsi = f"2320{i:05d}"
        name = VESSEL_NAMES[i % len(VESSEL_NAMES)]

        if scenario in ("war-entry", "mixed") and i < 3:
            # Force these on Red Sea routes for war-entry scenario
            war_routes = ["dubai_rotterdam", "suez_mumbai", "rotterdam_suez"]
            route_key = war_routes[i % len(war_routes)]
        elif scenario == "deviation" and i == 0:
            route_key = "mumbai_singapore"
        else:
            route_key = route_keys[i % len(route_keys)]

        vessel = DemoVessel(mmsi, name, route_key)
        vessels.append(vessel)

    # Register voyages
    async with httpx.AsyncClient(timeout=10.0) as client:
        for v in vessels:
            reg = v.to_voyage_registration()
            try:
                await client.post(f"{api_url}/api/ais/voyage", json=reg)
                print(f"  [VOYAGE] {v.name:20s} | {v.route['origin']:25s} → {v.route['destination']:20s} | ${v.cargo_value/1e6:.0f}M")
            except Exception as e:
                print(f"  [ERROR] {v.name}: {e}")

    print(f"\n{'─'*60}")
    print(f"  Streaming pings... (Ctrl+C to stop)")
    print(f"{'─'*60}\n")

    tick = 0
    start_time = time.time()

    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            elapsed = time.time() - start_time

            # ── Scenario triggers ─────────────────────────────────────
            if scenario in ("war-entry", "mixed"):
                # At T+60s, jump war-entry vessels deep into Red Sea
                if 58 < elapsed < 62:
                    for v in vessels[:3]:
                        if v.route_key in ("dubai_rotterdam", "suez_mumbai", "rotterdam_suez"):
                            # Jump to a segment that passes through war zone
                            mid = len(v.waypoints) // 2
                            v.segment_idx = min(mid, len(v.waypoints) - 2)
                            v.segment_progress = 0.3
                            v.lat, v.lon = v._position_on_segment()
                            v.heading = v._segment_bearing()

            if scenario in ("deviation", "mixed"):
                if 118 < elapsed < 122:
                    target = next((v for v in vessels if v.route_key == "mumbai_singapore" and not v.deviated), None)
                    if target:
                        target.deviate(offset_km=120)
                        print(f"\n  ⚠️  [{target.name}] DEVIATING 120km from route!\n")

            if scenario in ("sos", "mixed"):
                if 198 < elapsed < 202:
                    target = next((v for v in vessels if not v.sos_triggered and v.status != "sos"), None)
                    if target:
                        target.trigger_sos()
                        print(f"\n  🆘  [{target.name}] SOS — speed dropped to 0!\n")

            # ── Send pings ────────────────────────────────────────────
            for v in vessels:
                v.advance(interval)
                ping = v.to_ping()
                try:
                    resp = await client.post(f"{api_url}/api/ais/ping", json=ping)
                    data = resp.json()
                    n_alerts = data.get("alerts_generated", 0)
                    alert_str = f"  🚨 {n_alerts} alert(s)!" if n_alerts > 0 else ""
                    print(f"  {v.name:20s} ({v.lat:8.4f}, {v.lon:9.4f}) {v.speed_kn:5.1f}kn hdg={v.heading:5.0f}° {v.status:10s}{alert_str}")
                except Exception as e:
                    print(f"  {v.name:20s} ERROR: {e}")

            tick += 1
            print(f"  ── tick {tick}  T+{int(elapsed)}s ──\n")

            await asyncio.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="AIS Demo Generator")
    parser.add_argument("--count", type=int, default=10, help="Number of vessels (default: 10)")
    parser.add_argument("--interval", type=float, default=3.0, help="Seconds between pings (default: 3)")
    parser.add_argument("--scenario", choices=["normal", "war-entry", "deviation", "sos", "mixed"], default="mixed")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Backend API URL")
    args = parser.parse_args()

    try:
        asyncio.run(run_demo(args))
    except KeyboardInterrupt:
        print("\n\nDemo generator stopped.")


if __name__ == "__main__":
    main()
