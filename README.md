# 🌐 GlobalRisk Intelligence Platform v1.0

**Unified Aviation + Maritime Risk Intelligence for Insurance Underwriting**

Combines AeroRisk (v4.0) and MarineRisk (v2.0) into a single intelligence platform.

---

## 🏗 Architecture

```
globalrisk/
├── mega_app.py              ← Main entry point — Global Dashboard
├── pages/
│   ├── 1_✈️_Aviation_Risk.py  ← Aviation Risk Intelligence (AeroRisk v4.0)
│   └── 2_⚓_Maritime_Risk.py  ← Maritime Voyage Risk Intelligence (MarineRisk v2.0)
├── aviation/                ← Aviation backend modules
│   ├── config.py
│   ├── ai_insights.py
│   ├── app.py               ← Aviation app core (run via page wrapper)
│   ├── data/
│   │   ├── airports.py      ← 60+ ICAO airports with safety scores
│   │   ├── conflict_zones.py← Aviation conflict airspace database
│   │   └── data_layer.py    ← Synthetic weather/turbulence/congestion data
│   └── engine/
│       ├── geospatial.py    ← Great-circle math, Haversine
│       ├── risk_engine.py   ← FlightRiskEngine: 5-dimension scoring
│       ├── scoring.py       ← SHAP attribution, premium calc, corridor risk
│       └── ensemble_risk_model.py ← XGBoost + CatBoost + LightGBM ensemble
├── maritime/                ← Maritime backend modules
│   ├── config.py            ← 50+ ports, risk zones, geofenced alerts
│   ├── dashboard.py         ← Maritime app core (run via page wrapper)
│   ├── data_fetcher.py      ← AIS data, Open-Meteo weather, incidents
│   ├── risk_engine.py       ← VoyageRiskReport: 5-dimension composite score
│   ├── anomaly_detector.py  ← Isolation Forest ML + rule-based AIS anomalies
│   ├── maritime_router.py   ← Dijkstra sea-lane routing (200+ waypoints)
│   ├── visualizer.py        ← Folium maps, Plotly gauges, radar charts
│   ├── ai_insights.py       ← GPT-4o-mini or template risk narratives
│   ├── carbon_calculator.py ← IMO CII carbon emissions (CO₂, SOx, NOx)
│   ├── pdf_exporter.py      ← PDF risk certificate export
│   └── real_data_loader.py  ← EMDAT disaster rate by vessel type
└── requirements.txt
```

---

## ⚡ Quick Start

```bash
pip install -r requirements.txt
streamlit run mega_app.py
```

Open `http://localhost:8501`

---

## 🔑 API Keys (optional)

Create a `.env` file in the project root:
```env
OPENAI_API_KEY=sk-...         # Enables GPT-4o-mini risk narratives (both domains)
MARINETRAFFIC_API_KEY=...     # Enables live AIS vessel data (maritime)
```

All features work without API keys — simulated data + template narratives are used.

---

## 📊 Risk Models

### Aviation (AeroRisk v4.0)
| Dimension | Weight |
|-----------|--------|
| Weather / Turbulence | 30% |
| Conflict Zones | 30% |
| Airport Safety | 20% |
| ATC Congestion | 10% |
| Behavioral Deviation | 10% |

- **Ensemble**: XGBoost + CatBoost + LightGBM (60/40 rule+ensemble blend)
- **Routing**: Dijkstra through 60+ airports with aircraft-specific range limits
- **Viz**: 3D WebGL globe + Plotly 3D + Leaflet 2D

### Maritime (MarineRisk v2.0)
| Dimension | Weight |
|-----------|--------|
| Geopolitical / Piracy | 30% |
| Weather / Sea State | 25% |
| AIS Vessel Behavior | 20% |
| Route / Chokepoints | 15% |
| Port Congestion | 10% |

- **Ensemble**: XGBoost + CatBoost + LightGBM voyage scoring
- **Routing**: Dijkstra through 200+ named sea-lane waypoints
- **Extras**: Carbon emissions (IMO CII), War risk surcharge, SHAP attribution

---

## 🌐 Global Dashboard Features
- Combined threat map (aviation + maritime zones on single globe)
- Live intelligence feed (cross-domain threat alerts)
- Risk-by-region comparison chart
- Annual risk trend analysis
- Active critical alerts table with premium loading estimates

---

*GlobalRisk Intelligence Platform · For insurance underwriting use only*
*Not for operational navigation*
