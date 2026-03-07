"""Dashboard router — combined KPI + intel feed for the Global Dashboard."""
from __future__ import annotations
from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime, timezone
import random
import os
import urllib.request
import json
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(dotenv_path=env_path, override=True)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

headers = {
    "apikey": SUPABASE_KEY or "",
    "Authorization": f"Bearer {SUPABASE_KEY or ''}",
    "Content-Type": "application/json"
}

router = APIRouter()


class DashboardSummary(BaseModel):
    active_critical_alerts: int
    avg_portfolio_risk: int
    value_at_risk_millions: float
    aviation_status: str
    maritime_status: str
    railway_status: str
    last_updated: str


INTEL_FEED = [
    {"domain": "SEA",  "severity": "CRITICAL", "time": "14:20 UTC",
     "text": "Taiwan Strait: Unscheduled naval drills causing minor diversion delays and increased war risk premiums."},
    {"domain": "AIR",  "severity": "HIGH",     "time": "12:45 UTC",
     "text": "New drone sightings near major European hub; temporary ground stop extended for all cargo flights."},
    {"domain": "RAIL", "severity": "HIGH",   "time": "11:10 UTC",
     "text": "US East Coast freight rail operators vote to strike later this month. Shippers advised to seek alternative modes."},
    {"domain": "SEA",  "severity": "MEDIUM",     "time": "09:30 UTC",
     "text": "Panama Canal drought restrictions updated: maximum draft reduced by an additional foot, affecting fully loaded Panamax vessels."},
    {"domain": "RAIL", "severity": "MEDIUM", "time": "08:15 UTC",
     "text": "Germany: Signal failure near Frankfurt causes widespread logistics backlog across Central Europe."},
    {"domain": "AIR",  "severity": "WARNING",     "time": "06:40 UTC",
     "text": "Severe winter storms in US Midwest causing major cargo flight cancellations based out of ORD and SDF."},
    {"domain": "SEA",  "severity": "LOW", "time": "04:55 UTC",
     "text": "Suez Canal transits increasing; wait times normalizing after recent backlog clearance."},
    {"domain": "SEA",  "severity": "CRITICAL",     "time": "03:20 UTC",
     "text": "Cyberattack on major terminal operator leads to manual cargo processing at select US ports."},
]

RISK_TREND = {
    "labels": ["01 Apr", "05 Apr", "10 Apr", "15 Apr", "20 Apr", "25 Apr", "30 Apr"],
    "aviation":  [42, 45, 44, 48, 46, 50, 47],
    "maritime":  [62, 65, 68, 70, 67, 72, 74],
    "railway":   [35, 38, 42, 55, 65, 58, 45],
}


@router.get("/summary", response_model=DashboardSummary)
def get_summary():
    # Fetch from portfolio_positions Table
    active_critical = 0
    total_risk = 0.0
    total_records = 0
    total_insured_value = 0.0

    try:
        url = f"{SUPABASE_URL}/rest/v1/portfolio_positions?select=risk,level,value"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=15.0) as resp:
            if resp.status == 200:
                rows = json.loads(resp.read().decode())
                for r in rows:
                    risk = float(r.get("risk") or 0)
                    level = str(r.get("level") or "").upper()
                    val = float(r.get("value") or 0)
                    
                    if level == "CRITICAL" or risk > 75:
                        active_critical += 1
                    
                    total_risk += risk
                    total_insured_value += val
                    total_records += 1
    except Exception as e:
        print(f"Error fetching portfolio_positions: {e}")
        pass

    if total_records > 0:
        avg_risk = int(total_risk / total_records)
        # We'll use 1/1000th of value as "Value at Risk" for demo, or keep it simple
        val_at_risk_m = round(total_insured_value / 1_000_000, 1)
             
        return DashboardSummary(
            active_critical_alerts=active_critical,
            avg_portfolio_risk=avg_risk,
            value_at_risk_millions=val_at_risk_m,
            aviation_status="NORMAL",
            maritime_status="CRITICAL",
            railway_status="WARNING",
            last_updated=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        )
    else:
        # Fallback if DB is empty or connection fails
        return DashboardSummary(
            active_critical_alerts=14,
            avg_portfolio_risk=42,
            value_at_risk_millions=4200.0,
            aviation_status="NORMAL",
            maritime_status="CRITICAL",
            railway_status="WARNING",
            last_updated=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        )


@router.get("/intel-feed")
def get_intel_feed():
    return {"feed": INTEL_FEED}


@router.get("/risk-trend")
def get_risk_trend(days: int = 30):
    if days == 7:
        return {
            "labels": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            "aviation":  [45, 46, 44, 45, 48, 49, 47],
            "maritime":  [70, 71, 68, 69, 72, 73, 74],
            "railway":   [55, 58, 60, 59, 57, 50, 45],
        }
    elif days == 90:
        return {
            "labels": ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
            "aviation":  [40, 42, 45, 43, 44, 47],
            "maritime":  [60, 63, 62, 68, 70, 74],
            "railway":   [30, 35, 38, 45, 50, 45],
        }
    else:
        return RISK_TREND
