from __future__ import annotations
import sys, os, asyncio
from fastapi import APIRouter
from pydantic import BaseModel, Field

from backend.utils import get_risk_level

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_TRAIN = os.path.join(_ROOT, "train_cargo")
if _TRAIN not in sys.path:
    sys.path.insert(0, _TRAIN)

router = APIRouter()

class RailwayRequest(BaseModel):
    origin_station: str = Field("NDLS", description="Origin station name")
    destination_station: str = Field("CSMT", description="Destination station name")
    cargo_value_usd: float = Field(2_000_000)
    train_type: str = Field("Express Freight")
    route_preference: str = Field("shortest", description="'shortest' or 'safest'")

class RailwayResponse(BaseModel):
    overall_score: float
    risk_level: str
    origin: str
    destination: str
    dimensions: list[dict]
    top_factors: list[dict]
    anomalies: list[dict]
    geofence_alerts: list[dict]
    premium: dict
    suggestions: list[str]



@router.post("/analyze", response_model=RailwayResponse)
async def analyze_railway(req: RailwayRequest):
    await asyncio.sleep(1.2)  # Simulated computation delay for demo
    db_data = None
    try:
        from risk_engine import compute_shipment_risk  # type: ignore
        res = compute_shipment_risk(req.origin_station, req.destination_station,
                                    req.cargo_type, req.train_type)
        dims_raw = {d.name: d.score for d in res.dimension_scores}
    except Exception:
        from backend.db import fetch_railway_train
        db_data = fetch_railway_train(req.origin_station, req.destination_station)

        import random, hashlib
        seed = int(hashlib.md5(f"{req.origin_station}{req.destination_station}".encode()).hexdigest(), 16) % 10000
        rng = random.Random(seed)
        
        if db_data and db_data.get("risk_score"):
            overall_db = float(db_data["risk_score"])
            dims_raw = {
                "Security / Naxal": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "Weather / Monsoon": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "Train Behavior": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "Route / Terrain": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
                "Terminal Congestion": min(100.0, overall_db * rng.uniform(0.8, 1.2)),
            }
        else:
            dims_raw = {
                "Security / Naxal": rng.uniform(10, 92),
                "Weather / Monsoon": rng.uniform(15, 75),
                "Train Behavior":    rng.uniform(10, 60),
                "Route / Terrain":   rng.uniform(15, 65),
                "Terminal Congestion": rng.uniform(10, 55),
            }

    dim_weights = [0.25, 0.20, 0.20, 0.20, 0.15]
    dim_colors = ["#ef4444", "#3b82f6", "#f97316", "#8b5cf6", "#10b981"]
    dim_keys = list(dims_raw.keys())

    import joblib
    import pandas as pd
    
    # 1. Isolation Forest - Anomaly Dimension Generation
    try:
        ifo_path = os.path.join(os.path.dirname(__file__), "..", "models", "railway_iforest.pkl")
        if os.path.exists(ifo_path):
            iso_forest = joblib.load(ifo_path)
            
            # Generate current flight telemetry (simulated)
            # Speed (km/h), Unscheduled Stops (count), Delay (mins), Track Temp (C)
            current_telemetry = pd.DataFrame([{
                "Speed": rng.uniform(40, 110),
                "Unscheduled_Stops": rng.randint(0, 3),
                "Delay": rng.uniform(0, 45),
                "Track_Temp": rng.uniform(15, 45)
            }])
            
            anomaly_pred = iso_forest.predict(current_telemetry)[0]
            anomaly_score_raw = iso_forest.decision_function(current_telemetry)[0]
            
            # Baseline is 50. Increase risk as score goes negative. Decrease as it goes positive.
            normalized_anomaly_risk = 50 - (anomaly_score_raw * 250)
            normalized_anomaly_risk = float(max(10, min(100, normalized_anomaly_risk)))
            
            if anomaly_pred == -1:
                normalized_anomaly_risk = max(75.0, normalized_anomaly_risk)
                
            # Overwrite the train behavior dimension with the real anomaly score
            dims_raw["Train Behavior"] = normalized_anomaly_risk
            print(f"[Railway Isolation Forest] Anomaly Score: {normalized_anomaly_risk:.1f} (Raw: {anomaly_score_raw:.3f})")
    except Exception as e:
        print(f"Isolation Forest Error (Railway): {e}")

    # 2. Derive overall score using ML Ensemble if available, otherwise fallback
    try:
        model_path = os.path.join(os.path.dirname(__file__), "..", "models", "railway_ensemble.pkl")
        if os.path.exists(model_path):
            ensemble_model = joblib.load(model_path)
            
            # Prepare feature vector matching the training script order
            feature_names = ["Security / Naxal", "Weather / Monsoon", "Train Behavior", "Route / Terrain", "Terminal Congestion"]
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
    _lwe_stations = {"NDLS", "CSMT", "HWH", "RNC", "BSP", "R", "PNBE", "ALD", "CNB"}
    _flood_zones = {"HWH", "PNBE", "GHY", "NJP", "DBG"}
    top_factors = []
    if {req.origin_station, req.destination_station} & _lwe_stations and dims_raw.get("Security / Naxal", 0) > 40:
        top_factors.append(
            {"name": "Red Corridor Proximity", "delta": round(dims_raw["Security / Naxal"] * 0.16, 1),
             "description": "Route passes through Jharkhand–Chhattisgarh LWE affected zones."})
    if dims_raw.get("Weather / Monsoon", 0) > 40:
        top_factors.append(
            {"name": "Monsoon Flooding", "delta": round(dims_raw["Weather / Monsoon"] * 0.13, 1),
             "description": f"Flood alerts active. {max(1, round(dims_raw['Weather / Monsoon'] * 0.04))} track sections waterlogged."})
    if dims_raw.get("Train Behavior", 0) > 30:
        top_factors.append(
            {"name": "Unscheduled Stops", "delta": round(dims_raw["Train Behavior"] * 0.1, 1),
             "description": f"{max(1, round(dims_raw['Train Behavior'] * 0.05))} unscheduled stops detected on this corridor."})
    if not top_factors:
        top_factors.append(
            {"name": "Standard Risk Profile", "delta": 2.0,
             "description": "No exceptional risk factors identified for this route."})

    anomalies = [
        {"type": "Unscheduled Stop", "duration_min": 47, "location": "Mughalsarai Junction",
         "severity": "MEDIUM", "description": "Train halted 47min at non-designated location."},
        {"type": "Speed Drop", "delta_kmh": -35, "severity": "LOW",
         "description": "Speed reduced significantly near ghat section — likely track maintenance."},
    ]

    geofence_alerts = [
        {"zone": "Red Corridor", "type": "SECURITY", "severity": "HIGH",
         "description": "Entering Naxal-affected zone — RPF escort recommended."},
        {"zone": "Bihar Flood Zone", "type": "WEATHER", "severity": "MEDIUM",
         "description": "Flood-prone section ahead. Reduce speed and inspect track."},
    ]

    # Train-type base rate modifiers (per IRDAI inland transit guidelines)
    _train_base_rates = {
        "Express Freight": 0.06,    # Standard express service
        "Parcel Express": 0.08,     # Higher value parcels, more handling
        "Standard Freight": 0.05,   # Basic freight, lower base
        "Container Rail": 0.07,     # Containerized, moderate handling risk
    }

    if db_data and db_data.get("base_rate_pct"):
        base_rate = float(db_data["base_rate_pct"])
    else:
        base_rate = _train_base_rates.get(req.train_type, 0.06)
        
    risk_loading = round(overall / 100 * 0.85, 4)  # max ~0.85% at score=100
    effective_rate = min(base_rate + risk_loading, 1.5)  # cap at 1.5%
    premium_usd = round(req.cargo_value_usd * effective_rate / 100, 0)


    suggestions = [
        "Request RPF armed escort for Red Corridor segment",
        "Switch to alternative route via Nagpur — avoids 2 flood-risk sections",
        "Add GPS real-time tracker on wagon for anomaly detection",
    ]

    return RailwayResponse(
        overall_score=overall,
        risk_level=get_risk_level(overall),
        origin=req.origin_station,
        destination=req.destination_station,
        dimensions=dimensions,
        top_factors=top_factors,
        anomalies=anomalies,
        geofence_alerts=geofence_alerts,
        premium={
            "base_rate_pct": base_rate,
            "risk_loading_pct": round(risk_loading, 4),
            "estimated_premium_usd": premium_usd,
        },
        suggestions=suggestions,
    )
