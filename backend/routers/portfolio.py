from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import os
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

@router.get("/", response_model=List[PortfolioPosition])
async def get_portfolio():
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise HTTPException(status_code=500, detail="Supabase credentials not configured")
    
    url = f"{SUPABASE_URL}/rest/v1/portfolio_positions?select=*"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            # If table doesn't exist yet, return empty list or handle gracefully
            if "relation \"public.portfolio_positions\" does not exist" in str(e):
                return []
            raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

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
