import httpx

data_av = {"origin_icao": "VABB", "destination_icao": "EGLL", "aircraft_type": "Boeing 777-300ER", "cargo_type": "Passenger & Belly Cargo", "insured_value_usd": 150000000, "route_preference": "shortest"}
r1 = httpx.post("http://localhost:8000/api/aviation/analyze", json=data_av, timeout=15.0)
print("Aviation:", r1.text)

data_mar = {"origin_port": "INBOM", "destination_port": "NLRTM", "vessel_type": "Container Ship", "cargo_type": "Container", "cargo_value_usd": 50000000, "route_preference": "shortest"}
r2 = httpx.post("http://localhost:8000/api/maritime/analyze", json=data_mar, timeout=15.0)
print("Maritime:", r2.text)

data_rail = {"origin_station": "NDLS", "destination_station": "CSMT", "train_type": "Express Freight", "cargo_value_usd": 2000000, "route_preference": "shortest", "cargo_type": "Container"}
r3 = httpx.post("http://localhost:8000/api/railway/analyze", json=data_rail, timeout=15.0)
print("Railway:", r3.text)
