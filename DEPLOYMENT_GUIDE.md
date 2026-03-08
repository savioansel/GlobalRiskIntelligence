# GlobalRisk Intelligence Platform - Deployment Guide

This guide details how to deploy the platform online for hackathon judging.

## 1. Backend Deployment (FastAPI)
Recommended Platform: **Render.com** or **Railway.app**

### Steps for Render:
1.  **Select Repository**: Connect your GitHub repository.
2.  **Runtime**: Select **Python**.
3.  **Build Command**: `pip install -r requirements.txt`
4.  **Start Command**: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
    - *Note: Render will automatically detect the Procfile if you use a "Web Service" type.*
5.  **Environment Variables**: Add the following in the dashboard:
    - `GROQ_API_KEY`: Your Groq API key.
    - `SUPABASE_URL`: Your Supabase Project URL.
    - `SUPABASE_KEY`: Your Supabase Service Role or Anon Key.
    - `PYTHON_VERSION`: `3.12.0` (Recommended)

---

## 2. Frontend Deployment (React/Vite)
Recommended Platform: **Vercel** or **Netlify**

### Steps for Vercel:
1.  **Select Repository**: Connect your GitHub repository.
2.  **Framework Preset**: Select **Vite**.
3.  **Root Directory**: `frontend`
4.  **Install Command**: `npm install`
5.  **Build Command**: `npm run build`
6.  **Environment Variables**:
    - `VITE_API_URL`: The **full URL** of your deployed backend (e.g., `https://your-backend.onrender.com`).
    - *Important: Do NOT include a trailing slash.*

### 2.1 SPA Routing
I have included a `vercel.json` in the `frontend` directory. This ensures that direct navigation to routes like `/track` works correctly without showing a 404 error.

---

## 3. Post-Deployment Verification
1.  **Health Check**: Visit `https://your-backend.onrender.com/api/health` to ensure the backend is live.
2.  **Vessel Tracker**: Open the deployed frontend.
    - You should see "WAITING FOR TELEMETRY..." in the ship list.
    - Click **▶ Start Demo**.
    - The backend will launch the Python simulation script as a subprocess.
    - Ships should appear on the map after ~5-10 seconds.

## 4. Troubleshooting
- **CORS Errors**: If you get a CORS error, ensure `backend/main.py` has `allow_origins=["*"]` during the hackathon period.
- **WebSocket Fails**: If the tracker stays on "WAITING...", check if your backend host supports persistent WebSockets (Render "Free" tier sometimes puts them to sleep).
- **Subprocess Issues**: If `Start Demo` doesn't work, check the backend logs. Ensure the deployment platform allows spawning subprocesses (Render and Railway both support this).
