import asyncio
import httpx
from demo_compliance import DemoVessel, _haversine_nm

async def test():
    v = DemoVessel("777000002", "Rebel Voyager", "risk_route")
    
    zone = {"name": "Strait of Hormuz", "lat": 26.6, "lon": 56.3, "radius_km": 250}
    
    R_km = 6371.0
    import math
    def haversine_km(lat1, lon1, lat2, lon2):
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        return R_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    while v.segment_idx < len(v.waypoints) - 1:
        if v.lon <= 64.0:
            dist = haversine_km(v.lat, v.lon, zone["lat"], zone["lon"])
            if v.lon > 56.3:
                sim_dt = 1800.0
                v.time_offset_seconds += sim_dt - 0.2
                v.advance(sim_dt)
                dist2 = haversine_km(v.lat, v.lon, zone["lat"], zone["lon"])
                print(f"lon: {v.lon:.2f}, dist: {dist2:.1f} km, inside approaching? {zone['radius_km'] < dist2 <= zone['radius_km'] + 150.0}")
            else:
                break
        else:
            v.advance(500.0)

if __name__ == "__main__":
    asyncio.run(test())
