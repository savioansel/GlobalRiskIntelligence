from __future__ import annotations
import sys, os, asyncio
from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.utils import get_risk_level

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_MAR = os.path.join(_ROOT, "maritime")
if _MAR not in sys.path:
    sys.path.insert(0, _MAR)

router = APIRouter()

VESSEL_TYPES = ["Container Ship", "Bulk Carrier", "Oil Tanker", "LNG Carrier", "General Cargo"]
CARGO_TYPES  = ["Container", "Bulk Commodity", "Crude Oil", "LNG/LPG", "General Cargo", "Hazardous Materials"]

class MaritimeRequest(BaseModel):
    origin_port: str = Field("INBOM", description="Port of loading")
    destination_port: str = Field("NLRTM", description="Port of discharge")
    vessel_type: str = Field("Container Ship")
    cargo_type: str = Field("Container")
    cargo_value_usd: float = Field(50_000_000)
    route_preference: str = Field("shortest", description="'shortest' or 'safest'")

class MaritimeResponse(BaseModel):
    overall_score: float
    risk_level: str
    origin: str
    destination: str
    dimensions: list[dict]
    top_factors: list[dict]
    anomalies: list[dict]
    premium: dict
    route_comparison: dict | None = None
    suggestions: list[str]



@router.post("/analyze", response_model=MaritimeResponse)
async def analyze_maritime(req: MaritimeRequest):
    await asyncio.sleep(1.8)  # Simulated database/processing delay for demo
    db_data = None
    try:
        # Try real maritime risk engine
        from risk_engine import compute_shipment_risk as _csm  # type: ignore
        res = _csm(req.origin_port, req.destination_port, req.vessel_type, req.cargo_type)
        dims_raw = res.get("dimensions", {})
    except Exception:
        from backend.db import fetch_maritime_voyage
        db_data = fetch_maritime_voyage(req.origin_port, req.destination_port)
        
        import random, hashlib
        seed = int(hashlib.md5(f"{req.origin_port}{req.destination_port}".encode()).hexdigest(), 16) % 10000
        rng = random.Random(seed)
        
        if db_data and db_data.get("risk_score"):
            overall_db = float(db_data["risk_score"])
            dims_raw = {
                "Weather / Sea State": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "Geopolitical / Piracy": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "AIS / Vessel Behavior": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "Route Chokepoints": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "Port Congestion": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
            }
        else:
            dims_raw = {
                "Weather / Sea State": rng.uniform(20, 75),
                "Geopolitical / Piracy": rng.uniform(15, 95),
                "AIS / Vessel Behavior": rng.uniform(10, 60),
                "Route Chokepoints": rng.uniform(20, 80),
                "Port Congestion": rng.uniform(10, 55),
            }

    dim_weights = [0.20, 0.30, 0.20, 0.15, 0.15]
    dim_colors = ["#3b82f6", "#ef4444", "#f97316", "#8b5cf6", "#10b981"]
    dim_keys = list(dims_raw.keys())

    import joblib
    import pandas as pd
    
    # 1. Isolation Forest - Anomaly Dimension Generation
    try:
        ifo_path = os.path.join(os.path.dirname(__file__), "..", "models", "maritime_iforest.pkl")
        if os.path.exists(ifo_path):
            iso_forest = joblib.load(ifo_path)
            
            # Generate current route telemetry (simulated)
            # Speed (knots), Course Deviation (deg), Draft (m), Rate of Turn (deg/min)
            current_telemetry = pd.DataFrame([{
                "Speed": rng.uniform(5, 22),
                "Course_Dev": rng.uniform(-40, 40),
                "Draft": rng.uniform(8, 15),
                "Rate_of_Turn": rng.uniform(-10, 10)
            }])
            
            # -1 for anomaly, 1 for normal
            anomaly_pred = iso_forest.predict(current_telemetry)[0]
            # distance from decision boundary (negative = anomaly)
            anomaly_score_raw = iso_forest.decision_function(current_telemetry)[0]
            
            # Map the raw score to a 0-100 risk dimension
            # Typically decision_function is between -0.5 and 0.5. 
            # Lower means more anomalous -> Higher Risk (closer to 100)
            # 0.0 is the boundary. 0.1 is very normal (low risk), -0.1 is very anomalous (high risk)
            
            # Baseline is 50. Increase risk as score goes negative. Decrease as it goes positive.
            normalized_anomaly_risk = 50 - (anomaly_score_raw * 250)
            normalized_anomaly_risk = float(max(10, min(100, normalized_anomaly_risk)))
            
            # Force higher risk if it explicitly predicted -1
            if anomaly_pred == -1:
                normalized_anomaly_risk = max(75.0, normalized_anomaly_risk)
                
            # Overwrite the vessel behavior dimension with the real anomaly score
            dims_raw["AIS / Vessel Behavior"] = normalized_anomaly_risk
            print(f"[Maritime Isolation Forest] Anomaly Score: {normalized_anomaly_risk:.1f} (Raw: {anomaly_score_raw:.3f})")
    except Exception as e:
        print(f"Isolation Forest Error (Maritime): {e}")

    # 2. Derive overall score using ML Ensemble if available, otherwise fallback
    try:
        model_path = os.path.join(os.path.dirname(__file__), "..", "models", "maritime_ensemble.pkl")
        if os.path.exists(model_path):
            ensemble_model = joblib.load(model_path)
            
            # Prepare feature vector matching the training script order
            feature_names = ["Weather / Sea State", "Geopolitical / Piracy", "AIS / Vessel Behavior", "Route Chokepoints", "Port Congestion"]
            features = {k: [dims_raw.get(k, 50.0)] for k in feature_names}
            df_features = pd.DataFrame(features)
            
            overall = float(ensemble_model.predict(df_features)[0])
            overall = round(max(0, min(100, overall)), 1)
        else:
            overall = round(sum(dims_raw[dim_keys[i]] * dim_weights[i] for i in range(len(dim_keys))), 1)
    except Exception as e:
        print(f"ML Model Error: {e}")
        overall = round(sum(dims_raw[dim_keys[i]] * dim_weights[i] for i in range(len(dim_keys))), 1)

    if req.route_preference == "safest":
        dims_raw = {k: v * 0.65 for k, v in dims_raw.items()}
        overall = round(sum(dims_raw[dim_keys[i]] * dim_weights[i] for i in range(len(dim_keys))), 1)

    dimensions = [
        {"name": dim_keys[i], "score": round(dims_raw[dim_keys[i]], 1), "weight": dim_weights[i], "color": dim_colors[i]}
        for i in range(len(dim_keys))
    ]

    # Route-specific top risk factors
    _high_risk_ports = {"INBOM", "INMUN", "INCCU", "AEJEA", "OMSLL", "SADJB"}
    top_factors = []
    if {req.origin_port, req.destination_port} & _high_risk_ports or dims_raw.get("Geopolitical / Piracy", 0) > 60:
        top_factors.append(
            {"name": "Red Sea / Houthi Threat", "delta": round(dims_raw.get("Geopolitical / Piracy", 50) * 0.2, 1),
             "description": "Route transits Bab el-Mandeb — active Houthi drone zone. BMP5 mandatory."})
    if dims_raw.get("Weather / Sea State", 0) > 40:
        top_factors.append(
            {"name": "Adverse Weather", "delta": round(dims_raw["Weather / Sea State"] * 0.12, 1),
             "description": f"{round(dims_raw['Weather / Sea State'] * 0.06, 1)}m significant wave height forecast."})
    if dims_raw.get("Port Congestion", 0) > 30:
        top_factors.append(
            {"name": "Port Congestion", "delta": round(dims_raw["Port Congestion"] * 0.1, 1),
             "description": f"Destination terminal at high capacity. +{max(1, round(dims_raw['Port Congestion'] * 0.05))} day delay expected."})
    if not top_factors:
        top_factors.append(
            {"name": "Standard Risk Profile", "delta": 2.0,
             "description": "No exceptional risk factors identified for this route."})

    anomalies = [
        {"type": "AIS Dark Period", "duration_hrs": 6.2, "severity": "HIGH",
         "description": "Vessel was AIS-dark for 6.2hrs in Gulf of Oman."},
        {"type": "Speed Anomaly", "delta_knots": -4.5, "severity": "MEDIUM",
         "description": "Speed dropped 4.5 kts below schedule near Strait of Hormuz."},
    ]

    # Cargo-type base rate modifiers (per IUMI/industry data)
    _cargo_base_rates = {
        "Container": 0.12, "Bulk Commodity": 0.10, "Crude Oil": 0.18,
        "LNG/LPG": 0.20, "Hazardous Materials": 0.25, "General Cargo": 0.14,
    }
    # Vessel-type surcharges
    _vessel_surcharges = {
        "Oil Tanker": 0.03, "LNG Carrier": 0.04, "Bulk Carrier": 0.0,
        "Container Ship": 0.0, "General Cargo": 0.01,
    }

    if db_data and db_data.get("base_rate_pct"):
        base_rate = float(db_data["base_rate_pct"])
    else:
        base_rate = _cargo_base_rates.get(req.cargo_type, 0.14)
        base_rate += _vessel_surcharges.get(req.vessel_type, 0.0)
        
    risk_loading = round(overall / 100 * 0.40, 4)  # max ~0.40% at score=100
    effective_rate = min(base_rate + risk_loading, 2.0)  # cap at 2% (high-risk max)
    premium_usd = round(req.cargo_value_usd * effective_rate / 100, 0)

    # Route comparison with realistic marine cargo rates
    safe_score  = round(overall * 0.75, 1)
    short_score = overall
    # Real marine cargo rates: 0.1–0.5% standard, up to 1–2% high-risk
    short_rate = min(base_rate + (short_score / 100 * 0.40), 1.5)
    safe_rate = min(base_rate + (safe_score / 100 * 0.28), 1.0)
    route_comparison = {
        "shortest": {"score": short_score, "extra_days": 0, "premium_usd": round(req.cargo_value_usd * short_rate / 100, 0)},
        "safest":   {"score": safe_score,  "extra_days": 4, "premium_usd": round(req.cargo_value_usd * safe_rate / 100, 0)},
    }

    suggestions = [
        "Re-route via Cape of Good Hope — reduces risk score by ~18 pts (adds 4 days)",
        "Embark PMSC team — reduces security loading by 8 pts",
        "Request convoy escort through Strait of Hormuz",
    ]

    return MaritimeResponse(
        overall_score=overall,
        risk_level=get_risk_level(overall),
        origin=req.origin_port,
        destination=req.destination_port,
        dimensions=dimensions,
        top_factors=top_factors,
        anomalies=anomalies,
        premium={
            "base_rate_pct": base_rate,
            "risk_loading_pct": round(risk_loading, 4),
            "estimated_premium_usd": premium_usd,
        },
        route_comparison=route_comparison,
        suggestions=suggestions,
    )
