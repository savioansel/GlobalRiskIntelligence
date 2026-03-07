import os
import sys
import json
import time
import asyncio
import httpx
import websockets
from dotenv import load_dotenv
import random

# Load environment
env_path = os.path.join(os.path.dirname(__file__), "backend", ".env")
load_dotenv(dotenv_path=env_path, override=True)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
AISSTREAM_API_KEY = os.environ.get("AISSTREAM_API_KEY", "")
RAILWAY_API_KEY = os.environ.get("RAILWAY_API_KEY", "")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

async def fetch_and_update_opensky():
    print("\n[OpenSky] Fetching real-time flights...")
    async with httpx.AsyncClient() as client:
        try:
            # We fetch a bounding box or all states
            resp = await client.get("https://opensky-network.org/api/states/all", timeout=15.0)
            resp.raise_for_status()
            data = resp.json()
            states = data.get("states", [])
            if not states:
                print("[OpenSky] No flights found currently.")
                return

            # Grab flights with valid lat/long
            valid_flights = [s for s in states if len(s) > 9 and s[5] is not None and s[6] is not None and s[9] is not None]
            
            sup_resp = await client.get(f"{SUPABASE_URL}/rest/v1/aviation_flights?select=id", headers=headers)
            sup_resp.raise_for_status()
            db_flights = sup_resp.json()
            
            if not db_flights:
                print("[OpenSky] No active flights found in database to update.")
                return

            updates_count = 0
            for i, db_f in enumerate(db_flights):
                if i < len(valid_flights):
                    flight_data = valid_flights[i]
                    update_data = {
                        "current_lat": float(flight_data[6]),
                        "current_long": float(flight_data[5]),
                        "current_speed": float(flight_data[9] * 3.6), # m/s to km/h
                        "status": "EN_ROUTE"
                    }
                    patch_url = f"{SUPABASE_URL}/rest/v1/aviation_flights?id=eq.{db_f['id']}"
                    await client.patch(patch_url, headers=headers, json=update_data)
                    updates_count += 1

            print(f"[OpenSky] >>> Successfully updated {updates_count} flights in Supabase with live tracking data.")
        except Exception as e:
            print(f"[OpenSky] Error: {e}")

async def aisstream_listener():
    if not AISSTREAM_API_KEY:
        print("\n[AISStream] Warning: No AISSTREAM_API_KEY found in environment.")
        print("[AISStream] Will simulate live AIS maritime data for demonstration purposes...")
        await simulate_aisstream()
        return
        
    print("\n[AISStream] Connecting to WebSocket for real-time maritime vessels...")
    ws_url = "wss://stream.aisstream.io/v0/stream"
    subscribe_message = {
        "APIKey": AISSTREAM_API_KEY,
        "BoundingBoxes": [[[-90, -180], [90, 180]]],
        "FilterMessageTypes": ["PositionReport"]
    }
    
    async with httpx.AsyncClient() as client:
        sup_resp = await client.get(f"{SUPABASE_URL}/rest/v1/maritime_voyages?select=id", headers=headers)
        sup_resp.raise_for_status()
        db_voyages = sup_resp.json()
        
        if not db_voyages:
            print("[AISStream] No maritime_voyages found in DB.")
            return

    try:
        async with websockets.connect(ws_url) as websocket:
            await websocket.send(json.dumps(subscribe_message))
            
            voyage_idx = 0
            while True:
                message_str = await websocket.recv()
                message = json.loads(message_str)
                if message["MessageType"] == "PositionReport":
                    report = message["Message"]["PositionReport"]
                    lat = report.get("Latitude")
                    lon = report.get("Longitude")
                    speed = report.get("Sog") # Speed over ground
                    
                    if lat and lon and voyage_idx < len(db_voyages):
                        db_id = db_voyages[voyage_idx]["id"]
                        update_data = {
                            "current_lat": float(lat),
                            "current_long": float(lon),
                            "current_speed": float(speed) if speed else 0.0,
                            "status": "EN_ROUTE"
                        }
                        
                        async with httpx.AsyncClient() as client:
                            patch_url = f"{SUPABASE_URL}/rest/v1/maritime_voyages?id=eq.{db_id}"
                            await client.patch(patch_url, headers=headers, json=update_data)
                        
                        print(f"[AISStream] >>> Updated voyage {db_id} with live vessel pos: {lat}, {lon}")
                        voyage_idx += 1
                        
                        if voyage_idx >= len(db_voyages):
                            print("[AISStream] All database voyages updated with live data. Waiting for next cycle...")
                            voyage_idx = 0
                            await asyncio.sleep(10)
    except Exception as e:
        print(f"[AISStream] WebSocket Error: {e}")

async def simulate_aisstream():
    """Fallback if no API key is provided, generating realistic movement for existing ships."""
    async with httpx.AsyncClient() as client:
        sup_resp = await client.get(f"{SUPABASE_URL}/rest/v1/maritime_voyages?select=id,current_lat,current_long,current_speed", headers=headers)
        sup_resp.raise_for_status()
        db_voyages = sup_resp.json()
        
        while True:
            for v in db_voyages:
                # Add small random deltas to simulate movement
                lat = v.get("current_lat") or 0.0
                lon = v.get("current_long") or 0.0
                speed = v.get("current_speed") or 15.0
                
                lat += random.uniform(-0.05, 0.05)
                lon += random.uniform(-0.05, 0.05)
                speed += random.uniform(-1.0, 1.0)
                
                update_data = {
                    "current_lat": lat,
                    "current_long": lon,
                    "current_speed": max(0.0, speed),
                    "status": "EN_ROUTE"
                }
                
                patch_url = f"{SUPABASE_URL}/rest/v1/maritime_voyages?id=eq.{v['id']}"
                await client.patch(patch_url, headers=headers, json=update_data)
                print(f"[AISStream (Simulated)] >>> Updated voyage {v['id']} with pos: {lat:.4f}, {lon:.4f}")
                
            await asyncio.sleep(15)

async def main():
    print("Starting Live Tracking Connectors...")
    print(f"Target Database: {SUPABASE_URL}")
    
    # Run all connectors concurrently
    await asyncio.gather(
        opensky_loop(),
        aisstream_listener(),
        railway_loop()
    )

async def opensky_loop():
    while True:
        await fetch_and_update_opensky()
        await asyncio.sleep(30) # Fetch OpenSky every 30s to avoid rate limits

async def railway_loop():
    if not RAILWAY_API_KEY:
        print("\n[Railway] Warning: No RAILWAY_API_KEY found in environment.")
        print("[Railway] Will simulate live Indian railway data for demonstration purposes...")
    
    while True:
        await fetch_and_update_railways()
        # Ensure we wait 30 seconds between updates for railway data
        await asyncio.sleep(30)

async def fetch_and_update_railways():
    if not RAILWAY_API_KEY:
        await simulate_railways_step()
        return

    print("\n[Railway] Fetching real-time Indian railways data...")
    async with httpx.AsyncClient() as client:
        try:
            # We fetch all trains in railway_trains table
            sup_resp = await client.get(f"{SUPABASE_URL}/rest/v1/railway_trains?select=id,train_number,current_lat,current_long", headers=headers)
            sup_resp.raise_for_status()
            db_trains = sup_resp.json()

            if not db_trains:
                print("[Railway] No active trains found in database to update.")
                return

            updates_count = 0
            for db_t in db_trains:
                # Default train number if missing
                train_number = db_t.get("train_number") or "12951"
                
                # We format a typical RailwayAPI/NTES endpoint request
                api_url = f"https://api.railwayapi.com/v2/live/train/{train_number}/date/today/apikey/{RAILWAY_API_KEY}/"
                
                try:
                    resp = await client.get(api_url, timeout=10.0)
                    if resp.status_code == 200:
                        data = resp.json()
                        position = data.get("position", {})
                        lat = position.get("lat")
                        lon = position.get("lng")
                        speed = data.get("speed", 0.0)
                        delay = data.get("delay_in_minutes", 0)
                        
                        status_str = "DELAYED" if float(delay) > 15 else "EN_ROUTE"

                        if lat and lon:
                            update_data = {
                                "current_lat": float(lat),
                                "current_long": float(lon),
                                "current_speed": float(speed),
                                "status": status_str
                            }
                            patch_url = f"{SUPABASE_URL}/rest/v1/railway_trains?id=eq.{db_t['id']}"
                            await client.patch(patch_url, headers=headers, json=update_data)
                            updates_count += 1
                except Exception as e:
                    # Ignore individual train errors
                    pass

            if updates_count > 0:
                print(f"[Railway] >>> Successfully updated {updates_count} Indian trains with live data.")
            else:
                # If API didn't return valid data for any train, run simulation
                await simulate_railways_step()

        except Exception as e:
            print(f"[Railway] Global Error: {e}")
            await simulate_railways_step()

async def simulate_railways_step():
    """Fallback if no API key is provided, generating realistic movement for existing Indian trains."""
    async with httpx.AsyncClient() as client:
        try:
            sup_resp = await client.get(f"{SUPABASE_URL}/rest/v1/railway_trains?select=id,current_lat,current_long,current_speed", headers=headers)
            sup_resp.raise_for_status()
            db_trains = sup_resp.json()
            
            for t in db_trains:
                # Fallback starting position in central India
                lat = t.get("current_lat") or 21.1458
                lon = t.get("current_long") or 79.0882
                speed = t.get("current_speed") or 65.0
                
                lat += random.uniform(-0.02, 0.02)
                lon += random.uniform(-0.02, 0.02)
                speed += random.uniform(-5.0, 5.0)
                
                # Keep roughly within Indian bounds
                lat = max(8.0, min(37.0, lat))
                lon = max(68.0, min(97.0, lon))
                
                delay_mins = random.randint(0, 120)
                status_str = "DELAYED" if delay_mins > 15 else "EN_ROUTE"
                
                update_data = {
                    "current_lat": lat,
                    "current_long": lon,
                    "current_speed": max(0.0, min(160.0, speed)), # typical max train speed
                    "status": status_str
                }
                
                patch_url = f"{SUPABASE_URL}/rest/v1/railway_trains?id=eq.{t['id']}"
                await client.patch(patch_url, headers=headers, json=update_data)
                print(f"[Railway (Simulated)] >>> Updated Indian train {t['id']} pos: {lat:.4f}, {lon:.4f}, speed: {speed:.1f}km/h, status: {status_str}")
                
        except Exception as e:
            print(f"[Railway] Simulation Error: {e}")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Stopping Live Tracking Connectors.")
