import os
import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

# Load environment variables from .env file
# Load environment variables from .env file
env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path, override=True)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print(f"Warning: Missing SUPABASE_URL or SUPABASE_KEY from {env_path}")

def _fetch_from_supabase(table: str, params: dict):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Database connection not configured")
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    try:
        resp = httpx.get(url, headers=headers, params=params, timeout=5.0)
        resp.raise_for_status()
        data = resp.json()
        if data and len(data) > 0:
            return data[0]
        return None
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database fetch error: {str(e)}")

def fetch_aviation_flight(origin_icao: str, destination_icao: str):
    """Fetch flight data from Supabase replacing hardcoded defaults."""
    return _fetch_from_supabase("aviation_flights", {
        "origin_icao": f"eq.{origin_icao}",
        "destination_icao": f"eq.{destination_icao}",
        "limit": "1"
    })

def fetch_maritime_voyage(origin_port: str, destination_port: str):
    """Fetch maritime voyage data from Supabase replacing hardcoded defaults."""
    return _fetch_from_supabase("maritime_voyages", {
        "origin_port": f"eq.{origin_port}",
        "destination_port": f"eq.{destination_port}",
        "limit": "1"
    })

def fetch_railway_train(origin_station: str, destination_station: str):
    """Fetch railway train data from Supabase replacing hardcoded defaults."""
    return _fetch_from_supabase("railway_trains", {
        "origin_station": f"eq.{origin_station}",
        "destination_station": f"eq.{destination_station}",
        "limit": "1"
    })
