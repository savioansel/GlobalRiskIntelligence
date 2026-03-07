import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary, getIntelFeed, getRiskTrend } from "../api";
import { AppLayout } from "../App";
import { useNavigate } from "react-router-dom";
import { GlobalRiskMap } from "../components/RiskMap";
import { GlobalRiskMap3D } from "../components/GlobeMap";
import { RiskBadge } from "../components/shared";
import { RiskScenarioSimulator } from "../components/RiskScenarioSimulator";
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";


function KpiCard({ label, value, color, icon, delta }: any) {
    return (
        <div className="card p-6 relative overflow-hidden group" style={{ background: `linear-gradient(135deg, ${color}18 0%, #fff 100%)` }}>
            <div className="flex justify-between items-start mb-4">
                <h3 className="font-display text-text-muted text-[11px] uppercase tracking-wider">{label}</h3>
                <div className="bg-white/80 backdrop-blur-sm p-1.5 rounded-lg shadow-sm border border-gray-100 text-gray-600">
                    <span className="ms text-[18px]">{icon}</span>
                </div>
            </div>
            <p className="font-mono text-[38px] font-[800] leading-none tracking-tight" style={{ color }}>{value}</p>
            {delta && <p className="text-sm font-medium mt-2 text-gray-500 flex items-center gap-1"><span className="ms text-base">trending_up</span>{delta}</p>}
        </div>
    );
}

function ModuleTile({ icon, label, status, disruptions, onClick }: any) {
    const colorMap: any = { CRITICAL: "rose", HIGH: "orange", WARNING: "amber", NORMAL: "emerald", LOW: "emerald" };
    const c = colorMap[status] ?? "gray";
    return (
        <div className="card card-hover p-4 flex flex-col gap-4 cursor-pointer" onClick={onClick}>
            <div className="flex justify-between items-start">
                <div className={`p-2.5 bg-${c}-50 text-${c}-600 rounded-xl border border-${c}-100`}>
                    <span className="ms text-[22px]">{icon}</span>
                </div>
                <RiskBadge level={status} />
            </div>
            <div>
                <h3 className="font-display font-bold text-text-main text-[15px]">{label}</h3>
                <p className="text-xs text-text-muted mt-1">{disruptions} active disruptions</p>
            </div>
        </div>
    );
}

function LiveClock() {
    const [currentTime, setCurrentTime] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return (
        <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[10px] font-mono font-bold flex items-center gap-1 border border-rose-100">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            {currentTime.toLocaleTimeString()}
        </span>
    );
}

export default function Dashboard() {
    const navigate = useNavigate();
    const { data: summary } = useQuery({ queryKey: ["dashboard-summary"], queryFn: getDashboardSummary });
    const { data: intelData } = useQuery({ queryKey: ["intel-feed"], queryFn: getIntelFeed });
    const [trendDays, setTrendDays] = useState<7 | 30 | 90>(30);
    const { data: trendData } = useQuery({ queryKey: ["risk-trend", trendDays], queryFn: () => getRiskTrend(trendDays) });
    const [is3D, setIs3D] = useState(false);

    const feed = intelData?.feed ?? [];
    const domainTagColor: Record<string, string> = {
        SEA: "blue", AIR: "sky", RAIL: "emerald",
    };

    // Transform trend for Recharts
    const chartData = (trendData?.labels ?? []).map((l: string, i: number) => ({
        name: l,
        Aviation: trendData?.aviation?.[i],
        Maritime: trendData?.maritime?.[i],
        Railway: trendData?.railway?.[i],
    }));

    return (
        <AppLayout title="Dashboard">
            <div className="max-w-[1440px] mx-auto flex flex-col gap-6 animate-fade-in">

                {/* Risk Scenario Simulator */}
                <RiskScenarioSimulator />

                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <KpiCard label="Active Critical Alerts" value={summary?.active_critical_alerts ?? 14}
                        color="#ef4444" icon="warning" delta="+3 since yesterday" />
                    <KpiCard label="Avg Portfolio Risk" value={`${summary?.avg_portfolio_risk ?? 42}/100`}
                        color="#f59e0b" icon="monitoring" />
                    <KpiCard label="Value at Risk" value={`$${summary?.value_at_risk_billions ?? 4.2}B`}
                        color="#3b82f6" icon="account_balance" />
                </div>

                {/* Map + Feed */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Global Risk Map — real Leaflet map */}
                    <div className="lg:col-span-8 card flex flex-col overflow-hidden" style={{ height: 460 }}>
                        <div className="px-5 py-4 border-b border-border-col flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <h2 className="section-title"><span className="ms text-blue-500 drop-shadow-sm">my_location</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-800 to-blue-500">Global Threat Map</span></h2>
                                <LiveClock />
                            </div>
                            <button
                                onClick={() => setIs3D(!is3D)}
                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all"
                                style={{
                                    background: is3D ? 'linear-gradient(135deg, #0f172a, #1e293b)' : '#f8fafc',
                                    color: is3D ? '#38bdf8' : '#475569',
                                    borderColor: is3D ? '#334155' : '#e2e8f0',
                                }}
                            >
                                <span className="ms text-sm">{is3D ? 'map' : 'language'}</span>
                                {is3D ? '2D Map' : '3D Globe'}
                            </button>
                        </div>
                        <div className="flex-1" style={{ minHeight: 0 }}>
                            {is3D ? <GlobalRiskMap3D height={400} /> : <GlobalRiskMap height={400} />}
                        </div>
                    </div>

                    {/* Intel Feed */}
                    <div className="lg:col-span-4 card flex flex-col" style={{ height: 460 }}>
                        <div className="px-5 py-4 border-b border-border-col flex justify-between items-center">
                            <h2 className="section-title">
                                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]"></span>
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-800 to-rose-500">Live Feed</span>
                            </h2>
                            <button className="text-xs font-medium text-primary hover:text-primary-hover">View All</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 bg-gray-50/50 space-y-2">
                            {feed.map((item: any, i: number) => (
                                <div key={i} className="bg-white p-3.5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden group">
                                    <div className="absolute left-0 top-0 bottom-0 w-[3px]"
                                        style={{ background: item.severity === "CRITICAL" ? "#ef4444" : item.severity === "HIGH" ? "#f97316" : "#34d399" }}></div>
                                    <div className="flex justify-between items-center mb-1.5 pl-2">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border bg-${domainTagColor[item.domain] ?? "gray"}-50 text-${domainTagColor[item.domain] ?? "gray"}-700 border-${domainTagColor[item.domain] ?? "gray"}-200 tracking-wider`}>[{item.domain}]</span>
                                        <span className="font-mono text-[11px] text-gray-400">{item.time}</span>
                                    </div>
                                    <p className="text-[13px] font-medium text-text-main leading-relaxed pl-2">{item.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Trend Chart + Module tiles */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    <div className="lg:col-span-8 card p-5 flex flex-col gap-4">
                        <div className="flex justify-between items-center">
                            <h2 className="section-title"><span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-slate-500">{trendDays}-Day Risk Trend</span></h2>
                            <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200 text-xs font-medium">
                                <button onClick={() => setTrendDays(7)} className={`px-3 py-1 rounded-md transition-colors ${trendDays === 7 ? 'bg-white text-text-main shadow-sm border border-gray-200/50' : 'text-text-muted hover:bg-white'}`}>7D</button>
                                <button onClick={() => setTrendDays(30)} className={`px-3 py-1 rounded-md transition-colors ${trendDays === 30 ? 'bg-white text-text-main shadow-sm border border-gray-200/50' : 'text-text-muted hover:bg-white'}`}>30D</button>
                                <button onClick={() => setTrendDays(90)} className={`px-3 py-1 rounded-md transition-colors ${trendDays === 90 ? 'bg-white text-text-main shadow-sm border border-gray-200/50' : 'text-text-muted hover:bg-white'}`}>90D</button>
                            </div>
                        </div>
                        <div style={{ height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="4 4" stroke="#f0f0f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
                                    <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
                                    <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                                    <Line type="monotone" dataKey="Maritime" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="Aviation" stroke="#0d9488" strokeWidth={2} dot={false} />
                                    <Line type="monotone" dataKey="Railway" stroke="#d97706" strokeWidth={2} dot={false} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Module status tiles (2x2 grid) */}
                    <div className="lg:col-span-4 grid grid-cols-2 gap-4">
                        <ModuleTile icon="flight" label="Aviation" status={summary?.aviation_status ?? "NORMAL"} disruptions={2} onClick={() => navigate("/aviation")} />
                        <ModuleTile icon="sailing" label="Maritime" status={summary?.maritime_status ?? "CRITICAL"} disruptions={14} onClick={() => navigate("/maritime")} />
                        <ModuleTile icon="train" label="Railway" status={summary?.railway_status ?? "WARNING"} disruptions={5} onClick={() => navigate("/railway")} />
                        <div className="card card-hover p-4 flex flex-col gap-4 cursor-pointer bg-gradient-to-br from-white to-indigo-50/30" onClick={() => navigate("/portfolio")}>
                            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100 w-fit">
                                <span className="ms text-[22px]">business_center</span>
                            </div>
                            <div>
                                <h3 className="font-display font-bold text-text-main text-[15px]">Portfolio</h3>
                                <p className="text-xs text-primary mt-1">Manage exposure →</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}

