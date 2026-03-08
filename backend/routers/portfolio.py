from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import httpx
from backend.db import SUPABASE_URL, SUPABASE_KEY

router = APIRouter()

headers = {
    "apikey": SUPABASE_KEY or "",
    "Authorization": f"Bearer {SUPABASE_KEY or ''}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

class PortfolioPosition(BaseModel):
    id: str
    route: str
    type: str
    value: float
    risk: int
    level: str
    premium: float

# Realistic mock data — used when Supabase is unreachable
MOCK_POSITIONS: List[dict] = [
    {"id": "1", "route": "Mumbai → Singapore", "type": "Maritime",  "value": 45_000_000, "risk": 72, "level": "HIGH",     "premium": 1_350_000},
    {"id": "2", "route": "Dubai → Rotterdam",   "type": "Maritime",  "value": 62_000_000, "risk": 58, "level": "MEDIUM",   "premium": 1_116_000},
    {"id": "3", "route": "JFK → LHR",           "type": "Aviation",  "value": 18_000_000, "risk": 41, "level": "MEDIUM",   "premium":   378_000},
    {"id": "4", "route": "Shanghai → LA",        "type": "Maritime",  "value": 83_000_000, "risk": 34, "level": "LOW",      "premium": 1_162_000},
    {"id": "5", "route": "Delhi → Mumbai Rail",  "type": "Railway",   "value":  9_500_000, "risk": 22, "level": "LOW",      "premium":   114_000},
    {"id": "6", "route": "Gulf of Aden transit", "type": "Maritime",  "value": 55_000_000, "risk": 88, "level": "CRITICAL", "premium": 2_750_000},
    {"id": "7", "route": "CDG → SIN",            "type": "Aviation",  "value": 21_000_000, "risk": 29, "level": "LOW",      "premium":   315_000},
]

@router.get("/", response_model=List[PortfolioPosition])
async def get_portfolio():
    # Try Supabase first; gracefully fall back to mock data on any connection error
    if SUPABASE_URL and SUPABASE_KEY:
        url = f"{SUPABASE_URL}/rest/v1/portfolio_positions?select=*"
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    return data
                # Empty table — fall through to mocks
        except Exception:
            pass  # Connection refused, timeout, WinError 10054, etc.

    return MOCK_POSITIONS

@router.post("/", response_model=PortfolioPosition)
async def add_position(pos: PortfolioPosition):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase credentials not configured")
    
    url = f"{SUPABASE_URL}/rest/v1/portfolio_positions"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, headers=headers, json=pos.dict())
            resp.raise_for_status()
            data = resp.json()
            if data:
                return data[0]
            return pos
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.delete("/{id}")
async def delete_position(id: str):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase credentials not configured")
    
    url = f"{SUPABASE_URL}/rest/v1/portfolio_positions?id=eq.{id}"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.delete(url, headers=headers)
            resp.raise_for_status()
            return {"status": "deleted", "id": id}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
