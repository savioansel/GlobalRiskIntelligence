import requests
import json
import sys

base_url = "http://127.0.0.1:8000/api"

tests = {
    "Aviation_1_Dubai_London": {
        "description": "Conflict Zone Proximity (Dubai to London)",
        "url": f"{base_url}/aviation/analyze",
        "data": {
            "origin_icao": "OMDB",
            "destination_icao": "EGLL",
            "aircraft_type": "Boeing 777-300ER",
            "cargo_type": "Passenger & Belly Cargo",
            "insured_value_usd": 150000000,
            "route_preference": "safest"
        }
    },
    "Aviation_2_NY_LA": {
        "description": "Standard Busy Route (NY to LA)",
        "url": f"{base_url}/aviation/analyze",
        "data": {
            "origin_icao": "KJFK",
            "destination_icao": "KLAX",
            "aircraft_type": "Airbus A350-900",
            "cargo_type": "Passenger",
            "insured_value_usd": 120000000,
            "route_preference": "shortest"
        }
    },
    "Maritime_1_Mumbai_Rotterdam": {
        "description": "Red Sea Threat (Mumbai to Rotterdam)",
        "url": f"{base_url}/maritime/analyze",
        "data": {
            "origin_port": "INBOM",
            "destination_port": "NLRTM",
            "vessel_type": "Container Ship",
            "cargo_type": "Container",
            "cargo_value_usd": 50000000,
            "route_preference": "safest"
        }
    },
    "Maritime_2_Singapore_LA": {
        "description": "Standard Route (Singapore to LA)",
        "url": f"{base_url}/maritime/analyze",
        "data": {
            "origin_port": "SGSIN",
            "destination_port": "USLAX",
            "vessel_type": "Oil Tanker",
            "cargo_type": "Crude Oil",
            "cargo_value_usd": 80000000,
            "route_preference": "shortest"
        }
    },
    "Railway_1_Howrah_Patna": {
        "description": "Red Corridor & Flood Zone (Howrah to Patna)",
        "url": f"{base_url}/railway/analyze",
        "data": {
            "origin_station": "HWH",
            "destination_station": "PNBE",
            "train_type": "Express Freight",
            "cargo_value_usd": 2000000,
            "route_preference": "shortest"
        }
    },
    "Railway_2_Delhi_Mumbai": {
        "description": "Standard Commute (Delhi to Mumbai)",
        "url": f"{base_url}/railway/analyze",
        "data": {
            "origin_station": "NDLS",
            "destination_station": "CSMT",
            "train_type": "Container Rail",
            "cargo_value_usd": 5000000,
            "route_preference": "safest"
        }
    }
}

results = {}
for test_name, test_info in tests.items():
    try:
        response = requests.post(test_info["url"], json=test_info["data"])
        response.raise_for_status()
        res_json = response.json()
        results[test_name] = {
            "description": test_info["description"],
            "score": res_json.get("overall_score"),
            "risk_level": res_json.get("risk_level"),
            "premium_usd": res_json.get("premium", {}).get("estimated_premium_usd"),
            "premium_pct": res_json.get("premium", {}).get("risk_loading_pct", 0) + res_json.get("premium", {}).get("base_rate_pct", 0),
            "top_factors": [f.get("name") if isinstance(f, dict) else f.name for f in res_json.get("top_factors", [])]
        }
    except Exception as e:
        results[test_name] = {"error": str(e)}

with open("test_results.json", "w", encoding="utf-8") as f:
    json.dump(results, f, indent=4)
