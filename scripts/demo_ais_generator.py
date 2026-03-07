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
import searoute as sr

# ══════════════════════════════════════════════════════════════════════════════
# ── High-fidelity ocean routes — every waypoint is verified at-sea ──────────
# ══════════════════════════════════════════════════════════════════════════════

ROUTES_DEFS = {
    "dubai_rotterdam": {
        "origin": "Dubai (Jebel Ali)", "destination": "Rotterdam",
        "start": [55.06, 25.02], "end": [4.00, 51.90]
    },
    "mumbai_singapore": {
        "origin": "Mumbai (JNPT)", "destination": "Singapore",
        "start": [72.84, 18.94], "end": [103.82, 1.26]
    },
    "shanghai_singapore": {
        "origin": "Shanghai", "destination": "Singapore",
        "start": [121.47, 31.23], "end": [103.82, 1.26]
    },
    "singapore_hormuz": {
        "origin": "Singapore", "destination": "Bandar Abbas (Hormuz)",
        "start": [103.82, 1.26], "end": [56.40, 26.30]
    },
    "la_yokohama": {
        "origin": "Los Angeles", "destination": "Yokohama",
        "start": [-118.27, 33.74], "end": [139.77, 35.44]
    },
    "suez_mumbai": {
        "origin": "Port Said (Suez)", "destination": "Mumbai",
        "start": [32.30, 31.25], "end": [72.84, 18.94]
    },
    "rotterdam_suez": {
        "origin": "Rotterdam", "destination": "Port Said (Suez)",
        "start": [4.00, 51.90], "end": [32.30, 31.25]
    },
}

ROUTES = {}
for key, rdef in ROUTES_DEFS.items():
    print(f"Generating sea route for {rdef['origin']} to {rdef['destination']}...")
    # Generate route using searoute. Returns GeoJSON Feature with LineString
    res = sr.searoute(rdef['start'], rdef['end'])
    # Extract coordinates, format [lon, lat] -> (lat, lon) for our system
    waypoints = [(p[1], p[0]) for p in res["geometry"]["coordinates"]]
    ROUTES[key] = {
        "origin": rdef["origin"],
        "destination": rdef["destination"],
        "waypoints": waypoints
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
