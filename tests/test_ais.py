"""
Tests for AIS Live Tracking router — rule engine, endpoints, intel-feed integration.

Run: python -m pytest tests/test_ais.py -v
"""
import sys
import os

# Ensure project root is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from fastapi.testclient import TestClient
from backend.main import app
from backend.routers import ais


@pytest.fixture(autouse=True)
def _reset_state():
    """Reset AIS state between tests."""
    ais._vessels.clear()
    ais._pings.clear()
    ais._alerts.clear()
    ais._voyages.clear()
    ais.ais_intel_items.clear()
    yield
    ais._vessels.clear()
    ais._pings.clear()
    ais._alerts.clear()
    ais._voyages.clear()
    ais.ais_intel_items.clear()


client = TestClient(app)

# ── Helper ───────────────────────────────────────────────────────────────────

def _ping(mmsi="123456789", lat=25.0, lon=55.0, speed=14.0, status="underway", **kwargs):
    """Build a minimal AIS ping dict."""
    return {
        "mmsi": mmsi,
        "vessel_name": kwargs.get("vessel_name", "Test Vessel"),
        "lat": lat, "lon": lon,
        "speed_kn": speed,
        "course": kwargs.get("course", 90.0),
        "heading": kwargs.get("heading", 90.0),
        "status": status,
        "voyage_id": kwargs.get("voyage_id", ""),
        "destination": kwargs.get("destination", ""),
    }


# ══════════════════════════════════════════════════════════════════════════════
# Tests
# ══════════════════════════════════════════════════════════════════════════════

def test_ping_ingestion():
    """POST valid ping → 200, vessel appears in GET /api/ais/vessels."""
    resp = client.post("/api/ais/ping", json=_ping())
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["vessel"] == "123456789"

    vessels = client.get("/api/ais/vessels").json()
    assert len(vessels["vessels"]) == 1
    assert vessels["vessels"][0]["mmsi"] == "123456789"


def test_ping_validation():
    """POST ping with missing required fields → 422."""
    resp = client.post("/api/ais/ping", json={"lat": 25.0})
    assert resp.status_code == 422


def test_war_risk_alert():
    """Ping inside Red Sea war zone → war_risk alert."""
    # Red Sea zone center: lat=15.0, lon=42.5, radius=450km
    resp = client.post("/api/ais/ping", json=_ping(lat=15.0, lon=42.5))
    data = resp.json()
    assert data["alerts_generated"] >= 1

    alerts = client.get("/api/ais/alerts", params={"alert_type": "war_risk"}).json()
    assert len(alerts["alerts"]) >= 1
    assert "war zone" in alerts["alerts"][0]["msg"].lower()


def test_emergency_sos_alert():
    """Ping with status='sos' → CRITICAL emergency alert."""
    resp = client.post("/api/ais/ping", json=_ping(status="sos"))
    data = resp.json()
    assert data["alerts_generated"] >= 1

    alerts = client.get("/api/ais/alerts", params={"alert_type": "emergency"}).json()
    assert len(alerts["alerts"]) >= 1
    assert alerts["alerts"][0]["severity"] == "CRITICAL"


def test_speed_drop_emergency():
    """Speed drop >80% (12kn → 0kn) not near port → emergency alert."""
    mmsi = "SPEED_DROP"
    # Send several pings at normal speed (to build history)
    for i in range(4):
        client.post("/api/ais/ping", json=_ping(mmsi=mmsi, speed=12.0, lat=20.0 + i * 0.01, lon=60.0))
    # Now drop speed to 0 (lat=20.04, lon=60.0 — NOT near any known port)
    resp = client.post("/api/ais/ping", json=_ping(mmsi=mmsi, speed=0.0, lat=20.05, lon=60.0))
    data = resp.json()
    assert data["alerts_generated"] >= 1

    alerts = client.get("/api/ais/alerts", params={"alert_type": "emergency"}).json()
    assert any(a["mmsi"] == mmsi for a in alerts["alerts"])


def test_deviation_alert():
    """Vessel with declared route, ping far from route → deviation alert."""
    voyage_id = "voy_dev_test"
    mmsi = "DEVIATE_01"

    # Register voyage with declared route (Mumbai → Singapore)
    client.post("/api/ais/voyage", json={
        "voyage_id": voyage_id,
        "mmsi": mmsi,
        "vessel_name": "Deviant Ship",
        "origin": "Mumbai",
        "destination": "Singapore",
        "cargo_value_usd": 100_000_000,
        "declared_route": [[18.94, 72.84], [10.0, 75.0], [5.5, 80.0], [1.26, 103.82]],
    })

    # Send ping far from route (200km north)
    resp = client.post("/api/ais/ping", json=_ping(
        mmsi=mmsi, voyage_id=voyage_id, lat=12.0, lon=85.0,  # far from route
    ))
    data = resp.json()

    alerts = client.get("/api/ais/alerts", params={"alert_type": "deviation"}).json()
    assert len(alerts["alerts"]) >= 1
    assert "deviated" in alerts["alerts"][0]["msg"].lower()


def test_spoofing_speed():
    """Speed > 60 knots → spoofing alert."""
    resp = client.post("/api/ais/ping", json=_ping(speed=75.0))
    data = resp.json()
    assert data["alerts_generated"] >= 1

    alerts = client.get("/api/ais/alerts", params={"alert_type": "spoofing"}).json()
    assert len(alerts["alerts"]) >= 1
    assert "spoofing" in alerts["alerts"][0]["msg"].lower()


def test_reinsurance_zone_aggregation():
    """≥3 vessels with HIGH+ alerts in same zone → reinsurance exposure alert."""
    # Send 3 different vessels into Red Sea war zone
    for i in range(3):
        mmsi = f"REINS_{i:02d}"
        client.post("/api/ais/ping", json=_ping(
            mmsi=mmsi, lat=15.0 + i * 0.1, lon=42.5,
            vessel_name=f"Reinsurance Ship {i}",
        ))

    alerts = client.get("/api/ais/alerts", params={"alert_type": "reinsurance"}).json()
    assert len(alerts["alerts"]) >= 1
    assert "reinsurance" in alerts["alerts"][0]["msg"].lower()


def test_intel_feed_includes_ais_alerts():
    """AIS alerts appear in dashboard intel feed."""
    # Trigger a war risk alert
    client.post("/api/ais/ping", json=_ping(lat=15.0, lon=42.5))

    feed = client.get("/api/dashboard/intel-feed").json()
    ais_items = [item for item in feed["feed"] if item.get("type") == "war_risk"]
    assert len(ais_items) >= 1


def test_alerts_endpoint_filters():
    """GET /api/ais/alerts supports severity and type filters."""
    # Trigger war_risk (HIGH) and spoofing (HIGH)
    client.post("/api/ais/ping", json=_ping(mmsi="A", lat=15.0, lon=42.5))
    client.post("/api/ais/ping", json=_ping(mmsi="B", speed=70.0))

    # Filter by severity
    high_alerts = client.get("/api/ais/alerts", params={"severity": "HIGH"}).json()
    assert all(a["severity"] == "HIGH" for a in high_alerts["alerts"])

    # Filter by type
    war_alerts = client.get("/api/ais/alerts", params={"alert_type": "war_risk"}).json()
    assert all(a["type"] == "war_risk" for a in war_alerts["alerts"])
