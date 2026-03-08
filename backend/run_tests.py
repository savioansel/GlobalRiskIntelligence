import requests
import json

base_url = "http://127.0.0.1:8000/api"

tests = {
    "Aviation Test 1: Conflict Zone Proximity (Dubai to London)": {
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
    "Aviation Test 2: Standard Busy Route (NY to LA)": {
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
    "Maritime Test 1: Red Sea Threat (Mumbai to Rotterdam)": {
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
    "Maritime Test 2: Standard Route (Singapore to LA)": {
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
    "Railway Test 1: Red Corridor & Flood Zone (Howrah to Patna)": {
        "url": f"{base_url}/railway/analyze",
        "data": {
            "origin_station": "HWH",
            "destination_station": "PNBE",
            "train_type": "Express Freight",
            "cargo_value_usd": 2000000,
            "route_preference": "shortest"
        }
    },
    "Railway Test 2: Standard Commute (Delhi to Mumbai)": {
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

for test_name, test_info in tests.items():
    print(f"\\n--- {test_name} ---")
    try:
        response = requests.post(test_info["url"], json=test_info["data"])
        response.raise_for_status()
        res_json = response.json()
        print(f"Score: {res_json.get('overall_score')}")
        print(f"Risk Level: {res_json.get('risk_level')}")
        print(f"Premium USD: ${res_json.get('premium', {}).get('estimated_premium_usd')}")
        print("Top Factors:")
        for factor in res_json.get('top_factors', []):
            print(f"  - {factor.get('name')}: {factor.get('description')}")
    except Exception as e:
        print(f"Failed: {e}")
