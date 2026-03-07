import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
    timeout: 30_000,
});

export default api;

// Dashboard
export const getDashboardSummary = () => api.get("/api/dashboard/summary").then(r => r.data);
export const getIntelFeed = () => api.get("/api/dashboard/intel-feed").then(r => r.data);
export const getRiskTrend = (days: number = 30) => api.get(`/api/dashboard/risk-trend?days=${days}`).then(r => r.data);

// Aviation
export const analyzeAviation = (body: object) =>
    api.post("/api/aviation/analyze", body).then(r => r.data);

// Maritime
export const analyzeMaritime = (body: object) =>
    api.post("/api/maritime/analyze", body).then(r => r.data);

// Railway
export const analyzeRailway = (body: object) =>
    api.post("/api/railway/analyze", body).then(r => r.data);

// AI
export const getAISummary = (body: object) =>
    api.post("/api/ai/analyze", body).then(r => r.data);

export const aiChat = (body: object) =>
    api.post("/api/ai/chat", body).then(r => r.data);

export const simulateScenario = (body: object) =>
    api.post("/api/ai/simulate-scenario", body).then(r => r.data);

// Portfolio
export const getPortfolio = () => api.get("/api/portfolio").then(r => r.data);
export const addPortfolioPosition = (body: object) => api.post("/api/portfolio", body).then(r => r.data);
export const deletePortfolioPosition = (id: string) => api.delete(`/api/portfolio/${id}`).then(r => r.data);
