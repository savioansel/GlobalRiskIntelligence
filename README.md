# 🌐 GlobalRisk Intelligence Platform

**Unified Aviation, Maritime, and Railway Risk Intelligence for Insurance Underwriting**

GlobalRisk is a next-generation analytical platform designed specifically for cargo and hull insurance underwriters. It aggregates real-time telemetry, machine learning anomaly detection, and geopolitical data to provide precise risk scoring, exposure metrics, and dynamic premium adjustments.

---

## 🏗 Architecture & Tech Stack

The application is built on a modern, decoupled architecture:

### Frontend (`/frontend`)
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + custom glassmorphism design system
- **State Management**: React Query (TanStack Query)
- **Data Viz**: Recharts (bar/trend charts), React Leaflet (interactive maps)
- **Icons**: Google Material Symbols

### Backend (`/backend`)
- **Framework**: FastAPI (Python 3.12+)
- **Server**: Uvicorn (ASGI)
- **Database**: Supabase (PostgreSQL)
- **AI Integration**: Groq API (`llama-3.3-70b-versatile`) for natural language underwriting executive summaries and dynamic scenario simulation.

### Machine Learning (`/backend/models`)
- **Libraries**: `joblib`, `pandas`, `numpy`, `scikit-learn`, `catboost`
- **Models**:
  - **Isolation Forest**: Real-time AIS vessel telemetry anomaly detection.
  - **Ensemble Regressors**: CatBoost/XGBoost-based models for calculating 5-dimensional risk breakdowns (Weather, Geopolitics, Behavior, Infrastructure/Chokepoints, Cargo).

---

## ✨ Key Features

1. **Dashboard & Portfolio Manager**
   - Track active exposure totals (e.g., "$3.8M at risk").
   - Monitor live intelligence feeds for global supply chain disruptions.
   - Manage real-world underlying assets (ships, planes, trains) via Supabase persistence.

2. **Domain-Specific Underwriting Centers**
   - **Maritime**: Route chokepoint analysis (e.g., Strait of Malacca, Bab el-Mandeb), piracy tracking, and port congestion.
   - **Aviation**: Airspace conflict zone monitoring, turbulence forecasting, and airport safety.
   - **Railway**: Infrastructure degradation, border delays, and cargo-specific vulnerabilities.

3. **Live AIS Vessel Tracking & Compliance Alerts**
   - Real-time WebSocket connection streaming simulated AIS data.
   - Live compliance engine evaluating vessels against geo-fenced risk zones (e.g., Strait of Malacca).
   - Instant visual alerts and toast notifications when vessels cross into active risk zones.

4. **AI Cargo Risk Simulator**
   - An interactive scenario modeling tool powered by Groq LLMs.
   - Inputs (Origin, Destination, Cargo Value, Specific Risk Events) yield a strict, JSON-structured breakdown of risk dimensions, recommended coverages, and executive summaries.

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js (v18+)
- Python (3.12+)
- API Keys: 
  - `GROQ_API_KEY` (For AI narratives)
  - `SUPABASE_URL` / `SUPABASE_KEY` (For Portfolio database)

### 2. Backend Setup

```bash
# Navigate to project root
cd GlobalRiskIntelligence

# Create and activate virtual environment (Windows)
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Create .env file
echo "GROQ_API_KEY=your_groq_api_key_here" > backend/.env
echo "SUPABASE_URL=your_supabase_url_here" >> backend/.env
echo "SUPABASE_KEY=your_supabase_key_here" >> backend/.env

# Run the FastAPI server
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
The backend will be available at `http://localhost:8000`. API documentation is automatically generated at `http://localhost:8000/docs`.

### 3. Frontend Setup

```bash
# Open a new terminal
cd frontend

# Install Node dependencies
npm install

# Create .env file for frontend
echo "VITE_API_URL=http://localhost:8000" > .env

# Start the Vite development server
npm run dev
```
The frontend will be available at `http://localhost:5173`.

---

## 🚢 Running the Live AIS Tracking Demo

To experience the real-time websocket tracking and geo-fencing compliance, ensure your backend server is running, then execute the simulation script in a separate terminal:

```bash
cd GlobalRiskIntelligence
# Ensure your virtual environment is activated
python scripts/demo_compliance.py
```

This will simulate a fleet of vessels. Navigate to the **"Demo: Vessel Tracker"** page in the frontend to watch the `Rebel Voyager` approach the Strait of Malacca risk zone, ultimately triggering a compliance warning.

---

*GlobalRisk Intelligence Platform · Designed for professional insurance underwriting scenario modeling.*
