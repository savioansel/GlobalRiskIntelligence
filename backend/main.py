"""
GlobalRisk Intelligence Platform — FastAPI Backend
===================================================
Run:  uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations
import sys, os

# Ensure project root (parent of backend/) is on sys.path
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _ROOT)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routers import aviation, maritime, railway, dashboard, ai_router

app = FastAPI(
    title="GlobalRisk Intelligence API",
    description="Aviation, Maritime & Railway Risk Intelligence for Insurance Underwriting",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(aviation.router,  prefix="/api/aviation",  tags=["Aviation"])
app.include_router(maritime.router,  prefix="/api/maritime",  tags=["Maritime"])
app.include_router(railway.router,   prefix="/api/railway",   tags=["Railway"])
app.include_router(ai_router.router, prefix="/api/ai",        tags=["AI"])


@app.get("/api/health")
def health():
    return {"status": "ok", "platform": "GlobalRisk Intelligence v2.0"}
