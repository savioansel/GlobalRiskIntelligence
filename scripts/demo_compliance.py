#!/usr/bin/env python3
"""
Demo Compliance Generator — Sends synthetic AIS pings for 2 vessels to demonstrate the Policy Engine.

Vessel 1: Compliant Mariner (LA to Yokohama) — Safe route.
Vessel 2: Rebel Voyager (Suez to Mumbai) — Enters Red Sea war zone and stays for 48+ hours.
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

ROUTES_DEFS = {
    "safe_route": {
        "origin": "Los Angeles", "destination": "Yokohama",
        "start": [-118.27, 33.74], "end": [139.77, 35.44]
    },
    "risk_route": {
        "origin": "Mumbai", "destination": "Tanjung Pelepas",
        "start": [72.84, 18.94], "end": [103.55, 1.37]
    },
    # Background Traffic Routes
    "bg_1": { "origin": "Rotterdam", "destination": "New York", "start": [4.48, 51.92], "end": [-74.00, 40.67] },
    "bg_2": { "origin": "Dubai", "destination": "Shanghai", "start": [55.27, 25.20], "end": [121.47, 31.23] },
    "bg_3": { "origin": "Singapore", "destination": "Los Angeles", "start": [103.82, 1.26], "end": [-118.27, 33.74] },
    "bg_4": { "origin": "Mumbai", "destination": "Dubai", "start": [72.84, 18.94], "end": [55.27, 25.20] },
    "bg_5": { "origin": "Yokohama", "destination": "Singapore", "start": [139.64, 35.44], "end": [103.82, 1.26] },
}

ROUTES = {}
for key, rdef in ROUTES_DEFS.items():
    print(f"Generating sea route for {rdef['origin']} to {rdef['destination']}...")
    res = sr.searoute(rdef['start'], rdef['end'])
    waypoints = [(p[1], p[0]) for p in res["geometry"]["coordinates"]]
    ROUTES[key] = {
        "origin": rdef["origin"],
        "destination": rdef["destination"],
        "waypoints": waypoints
    }

def _haversine_nm(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R_nm = 3440.065
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R_nm * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def _bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    dlon = math.radians(lon2 - lon1)
    lat1r, lat2r = math.radians(lat1), math.radians(lat2)
    x = math.sin(dlon) * math.cos(lat2r)
    y = math.cos(lat1r) * math.sin(lat2r) - math.sin(lat1r) * math.cos(lat2r) * math.cos(dlon)
    return math.degrees(math.atan2(x, y)) % 360

class DemoVessel:
    def __init__(self, mmsi: str, name: str, route_key: str, start_fraction: float = 0.0, is_background: bool = False):
        self.mmsi = mmsi
        self.name = name
        self.route_key = route_key
        self.is_background = is_background
        self.route = ROUTES[route_key]
        self.waypoints = self.route["waypoints"]
        self.speed_kn = 14.0
        
        total_segs = len(self.waypoints) - 1
        self.segment_idx = min(int(total_segs * start_fraction), total_segs - 1) if total_segs > 0 else 0
        self.segment_progress = 0.0
        self.lat, self.lon = self._position_on_segment()
        self.heading = self._segment_bearing()
        self.course = self.heading
        self.status = "underway"
        self.voyage_id = f"comp_voy_{mmsi}"
        self.vessel_type = "container"
        self.cargo_value = 150_000_000
        self.time_offset_seconds = 0.0
        self.entered_zone = False
        self.time_jumped = False
        self.toggled_zone = False

    def _position_on_segment(self) -> tuple[float, float]:
        idx = min(self.segment_idx, len(self.waypoints) - 2)
        a = self.waypoints[idx]
        b = self.waypoints[idx + 1]
        t = max(0.0, min(1.0, self.segment_progress))
        return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

    def _segment_bearing(self) -> float:
        idx = min(self.segment_idx, len(self.waypoints) - 2)
        a = self.waypoints[idx]
        b = self.waypoints[idx + 1]
        return _bearing(a[0], a[1], b[0], b[1])

    def advance(self, dt_seconds: float):
        if self.segment_idx >= len(self.waypoints) - 1:
            return

        idx = min(self.segment_idx, len(self.waypoints) - 2)
        a = self.waypoints[idx]
        b = self.waypoints[idx + 1]

        seg_dist_nm = _haversine_nm(a[0], a[1], b[0], b[1])
        if seg_dist_nm < 0.1: seg_dist_nm = 0.1

        dist_nm = self.speed_kn * (dt_seconds / 3600.0)
        self.segment_progress += dist_nm / seg_dist_nm

        while self.segment_progress >= 1.0 and self.segment_idx < len(self.waypoints) - 2:
            overshoot = self.segment_progress - 1.0
            self.segment_idx += 1
            idx = min(self.segment_idx, len(self.waypoints) - 2)
            a = self.waypoints[idx]
            b = self.waypoints[idx + 1]
            seg_dist_nm = _haversine_nm(a[0], a[1], b[0], b[1])
            if seg_dist_nm < 0.1: seg_dist_nm = 0.1
            self.segment_progress = overshoot * (_haversine_nm(*self.waypoints[max(0, idx - 1)], *a) / seg_dist_nm) if seg_dist_nm > 0 else 0
            self.segment_progress = min(self.segment_progress, 0.99)

        self.lat, self.lon = self._position_on_segment()
        self.heading = self._segment_bearing()
        self.course = self.heading

    def to_ping(self) -> dict:
        ts = time.time() + self.time_offset_seconds
        dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        return {
            "mmsi": self.mmsi,
            "vessel_name": self.name,
            "imo": f"IMO{self.mmsi[-7:]}",
            "type": self.vessel_type,
            "voyage_id": self.voyage_id,
            "timestamp": dt.isoformat(),
            "lat": round(self.lat, 5),
            "lon": round(self.lon, 5),
            "speed_kn": round(self.speed_kn, 1),
            "course": round(self.course % 360, 1),
            "heading": round(self.heading % 360, 0),
            "status": self.status,
            "destination": self.route["destination"],
            "eta": "2026-03-15T08:00:00Z",
            "extra": {"sea_state": 3, "cargo_value_usd": self.cargo_value, "is_background": self.is_background},
        }

    def to_voyage_registration(self) -> dict:
        return {
            "voyage_id": self.voyage_id,
            "mmsi": self.mmsi,
            "vessel_name": self.name,
            "origin": self.route["origin"],
            "destination": self.route["destination"],
            "cargo_value_usd": self.cargo_value,
            "policy_id": f"POL-{self.mmsi[-4:]}",
            "declared_route": [list(w) for w in self.waypoints],
        }

async def run_demo(api_url: str):
    print(f"\n{'='*60}")
    print(f"  Compliance Engine Demo Generator")
    print(f"{'='*60}\n")

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            await client.post(f"{api_url}/api/ais/reset")
            print("[RESET] Cleared state")
        except: pass

    vessels = [
        DemoVessel("777000001", "Compliant Mariner", "safe_route", 0.0),
        DemoVessel("777000002", "Rebel Voyager", "risk_route", 0.0),
        DemoVessel("777001001", "Oceanic Swift", "bg_1", 0.3, True),
        DemoVessel("777001002", "Eastern Pearl", "bg_2", 0.6, True),
        DemoVessel("777001003", "Pacific Trader", "bg_3", 0.1, True),
        DemoVessel("777001004", "Gulf Star", "bg_4", 0.8, True),
        DemoVessel("777001005", "Asian Express", "bg_5", 0.5, True),
    ]

    async with httpx.AsyncClient(timeout=10.0) as client:
        for v in vessels:
            try:
                await client.post(f"{api_url}/api/ais/voyage", json=v.to_voyage_registration())
                print(f"  [VOYAGE] {v.name} registered")
            except: pass

    print(f"\n  Streaming pings... (Ctrl+C to stop)\n")
    start_time = time.time()
    tick = 0
    tick_dt = 0.2  # 5 FPS
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            elapsed = time.time() - start_time

            for v in vessels:
                if v.name == "Rebel Voyager":
                    if getattr(v, 'time_jumped', False):
                        # After time jump, move normally
                        v.advance(tick_dt)
                    elif not getattr(v, 'entered_zone', False):
                        if v.lon >= 95.0 and not getattr(v, 'toggled_zone', False):
                            try:
                                await client.post(f"{api_url}/api/ais/zones/toggle?zone_name=Strait of Malacca")
                                v.toggled_zone = True
                                print(f"\n  🚨  MID-JOURNEY UPDATE: 'Strait of Malacca' Risk Zone has been DECLARED ACTIVE!\n")
                            except Exception as e:
                                print(f"Error toggling zone: {e}")

                        if v.lon < 103.0:  # Approaching Strait of Malacca from the west
                            sim_dt = 1575.0  # Increased by 25% (was 1260.0)
                            v.time_offset_seconds += sim_dt - tick_dt
                            v.advance(sim_dt)
                        else:
                            v.entered_zone = True
                            v.arrival_time = elapsed
                            print(f"\n  ⚠️  [{v.name}] Arrived inside the Strait of Malacca Risk Zone! (Should trigger WARNING)\n")
                    else:
                        # Inside zone, wait 3 seconds real-time before jumping time
                        if elapsed - getattr(v, 'arrival_time', elapsed) > 3.0:
                            v.time_jumped = True
                            v.time_offset_seconds += 48 * 3600
                            print(f"\n  ⛔  [{v.name}] Ignored warnings and stayed in zone for 48 hours! (Should trigger VOID)\n")
                        else:
                            v.advance(tick_dt)
                else: # Compliant Mariner and Background Traffic
                    sim_dt = 437.5 # Move at a moderate pace to visualize route on UI (Increased by 25%)
                    v.time_offset_seconds += sim_dt - tick_dt
                    v.advance(sim_dt)
                
                ping = v.to_ping()
                try:
                    resp = await client.post(f"{api_url}/api/ais/ping", json=ping)
                    data = resp.json()
                    st = data.get("coverage_event", None)
                    alerts = data.get("alerts_generated", 0)
                    cov_status = "ok" if not st else f"EVENT: {st}"
                    if alerts > 0:
                        print(f"  [BACKEND ALERTS] {v.name} triggered {alerts} alert(s) at dist {(v.lon)}")
                    # Only print every 5th tick to avoid spamming the console
                    if tick % 5 == 0:
                        print(f"  {v.name:18s} ({v.lat:8.4f}, {v.lon:9.4f}) | {cov_status}")
                except Exception as e:
                    if tick % 5 == 0:
                        print(f"  {v.name} err: {e}")

            tick += 1
            await asyncio.sleep(tick_dt)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default="http://localhost:8000")
    args = parser.parse_args()
    try: asyncio.run(run_demo(args.api_url))
    except KeyboardInterrupt: print("\nStopped.")
