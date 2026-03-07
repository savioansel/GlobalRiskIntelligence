import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "../App";
import {
    analyzeAviation,
    analyzeMaritime,
    analyzeRailway,
    getPortfolio,
    addPortfolioPosition,
    deletePortfolioPosition
} from "../api";
import { toast } from "react-hot-toast";
import {
    PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────
interface Position {
    id: string;
    route: string;
    type: "Aviation" | "Maritime" | "Railway";
    value: number;
    risk: number;
    level: string;
    premium: number;
}

const LEVEL_CLS: Record<string, string> = {
    CRITICAL: "badge-critical", HIGH: "badge-high",
    ELEVATED: "badge-elevated", LOW: "badge-low", NORMAL: "badge-normal",
};
const TYPE_COLOR: Record<string, string> = { Maritime: "#3b82f6", Aviation: "#0d9488", Railway: "#f59e0b" };

// ── Add Position Form ─────────────────────────────────────────────────────────
function AddPositionModal({ onClose }: { onClose: () => void }) {
    const [type, setType] = useState<"Aviation" | "Maritime" | "Railway">("Maritime");
    const [origin, setOrigin] = useState("");
    const [dest, setDest] = useState("");
    const [value, setValue] = useState(10_000_000);
    const [cargoType, setCargoType] = useState("Container");
    const [error, setError] = useState<string | null>(null);

    const aviM = useMutation({ mutationFn: analyzeAviation });
    const marM = useMutation({ mutationFn: analyzeMaritime });
    const railM = useMutation({ mutationFn: analyzeRailway });
    const addM = useMutation({
        mutationFn: addPortfolioPosition,
        onSuccess: () => {
            toast.success("Position added to portfolio");
            onClose();
        },
        onError: () => toast.error("Failed to save to database")
    });

    const isPending = aviM.isPending || marM.isPending || railM.isPending || addM.isPending;

    const analyze = async () => {
        setError(null);
        try {
            let result: any;
            if (type === "Aviation") {
                result = await aviM.mutateAsync({ origin_icao: origin, destination_icao: dest, aircraft_type: "Boeing 777-300ER", cargo_type: cargoType, insured_value_usd: value });
            } else if (type === "Maritime") {
                result = await marM.mutateAsync({ origin_port: origin, destination_port: dest, vessel_type: "Container Ship", cargo_type: cargoType, cargo_value_usd: value, route_preference: "shortest" });
            } else {
                result = await railM.mutateAsync({ origin_station: origin, destination_station: dest, cargo_type: cargoType, cargo_value_usd: value, train_type: "Express Freight" });
            }
            const newPos: Position = {
                id: `${type.substring(0, 3).toUpperCase()}-${String(Date.now()).slice(-3)}`,
                route: `${origin} → ${dest}`,
                type,
                value,
                risk: Math.round(result.overall_score),
                level: result.risk_level,
                premium: Math.round(result.premium.estimated_premium_usd),
            };
            addM.mutate(newPos);
        } catch {
            setError("Failed to analyze route. Check if backend is running and try again.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-fade-in">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display font-bold text-text-main text-lg">Add New Position</h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                        <span className="ms text-xl text-text-muted">close</span>
                    </button>
                </div>

                {/* Type selector */}
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-4">
                    {(["Aviation", "Maritime", "Railway"] as const).map(t => (
                        <button key={t} onClick={() => setType(t)}
                            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${type === t ? "bg-white shadow-sm text-text-main" : "text-text-muted hover:text-text-main"}`}>
                            {t}
                        </button>
                    ))}
                </div>

                <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                                {type === "Aviation" ? "Origin ICAO" : type === "Maritime" ? "Origin Port" : "Origin Station"}
                            </label>
                            <select className="input-field" value={origin} onChange={e => setOrigin(e.target.value)}>
                                {type === "Aviation"
                                    ? ["", "VABB", "EGLL", "WSSS", "KJFK", "OMDB", "RJTT"].map(o => <option key={o} value={o}>{o || "Select…"}</option>)
                                    : type === "Maritime"
                                        ? ["", "Mumbai", "Rotterdam", "Shanghai", "LA", "Dubai", "Singapore"].map(o => <option key={o} value={o}>{o || "Select…"}</option>)
                                        : ["", "Delhi IGI", "Mumbai CSMT", "Chennai", "Kolkata", "Bengaluru", "Hyderabad"].map(o => <option key={o} value={o}>{o || "Select…"}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                                {type === "Aviation" ? "Destination ICAO" : type === "Maritime" ? "Dest. Port" : "Dest. Station"}
                            </label>
                            <select className="input-field" value={dest} onChange={e => setDest(e.target.value)}>
                                {type === "Aviation"
                                    ? ["", "EGLL", "VABB", "WSSS", "KJFK", "OMDB", "RJTT"].map(o => <option key={o} value={o}>{o || "Select…"}</option>)
                                    : type === "Maritime"
                                        ? ["", "Rotterdam", "Mumbai", "Shanghai", "LA", "Dubai", "Singapore"].map(o => <option key={o} value={o}>{o || "Select…"}</option>)
                                        : ["", "Mumbai CSMT", "Delhi IGI", "Chennai", "Kolkata", "Bengaluru", "Hyderabad"].map(o => <option key={o} value={o}>{o || "Select…"}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Cargo / Vessel Type</label>
                        <select className="input-field" value={cargoType} onChange={e => setCargoType(e.target.value)}>
                            {type === "Aviation"
                                ? ["Passenger & Belly Cargo", "General Freight", "High-Value Goods", "Perishables", "Live Animals"].map(o => <option key={o}>{o}</option>)
                                : type === "Maritime"
                                    ? ["Container", "Bulk Commodity", "Crude Oil", "LNG/LPG", "General Cargo", "Hazardous Materials"].map(o => <option key={o}>{o}</option>)
                                    : ["Container", "Bulk", "Hazmat", "Perishable", "High-Value"].map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Insured Value (USD)</label>
                        <input type="number" className="input-field" value={value} onChange={e => setValue(Number(e.target.value))} />
                    </div>

                    {error && <p className="text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">{error}</p>}

                    <button className="btn-primary mt-1 w-full justify-center"
                        onClick={analyze} disabled={isPending || !origin || !dest}>
                        {isPending
                            ? <><span className="ms text-base animate-spin">autorenew</span>Processing…</>
                            : <><span className="ms text-base">analytics</span>Analyze & Add to Portfolio</>}
                    </button>
                    <p className="text-[11px] text-text-muted text-center">This will call the live risk API and save to Supabase.</p>
                </div>
            </div>
        </div>
    );
}

// ── PDF Export ─────────────────────────────────────────────────────────────────
function exportPortfolioPDF(positions: Position[]) {
    const win = window.open("", "_blank");
    if (!win) return;
    const rows = positions.map(p =>
        `<tr><td style="padding:6px 12px">${p.id}</td><td style="padding:6px 12px;font-weight:600">${p.route}</td><td style="padding:6px 12px">${p.type}</td><td style="padding:6px 12px;font-family:monospace">$${(p.value / 1e6).toFixed(0)}M</td><td style="padding:6px 12px;font-family:monospace">${p.risk}/100</td><td style="padding:6px 12px;font-weight:700">${p.level}</td><td style="padding:6px 12px;font-family:monospace">$${p.premium.toLocaleString()}</td></tr>`
    ).join("");
    const total = positions.reduce((a, p) => a + p.value, 0);
    const prem = positions.reduce((a, p) => a + p.premium, 0);
    const avg = Math.round(positions.reduce((a, p) => a + p.risk, 0) / positions.length);
    win.document.write(`<!DOCTYPE html><html><head><title>Portfolio Risk Report</title>
    <style>body{font-family:Inter,sans-serif;padding:40px;max-width:1100px;margin:auto;color:#111}h1{color:#374151}h2{color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-top:32px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#f9fafb;font-size:12px;text-transform:uppercase;color:#6b7280}tr:nth-child(even){background:#f9fafb}.kpi{display:inline-block;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px 20px;margin:0 8px 8px 0}</style></head><body>
    <h1>📊 Portfolio Risk Report</h1>
    <p>Generated: ${new Date().toUTCString()}</p>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Total Positions</div><div style="font-size:24px;font-weight:800">${positions.length}</div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Total Insured Value</div><div style="font-size:24px;font-weight:800;font-family:monospace">$${(total / 1e6).toFixed(0)}M</div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Annual Premium</div><div style="font-size:24px;font-weight:800;font-family:monospace">$${(prem / 1e6).toFixed(2)}M</div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Avg Risk Score</div><div style="font-size:24px;font-weight:800;font-family:monospace">${avg}/100</div></div>
    <h2>Active Positions</h2>
    <table><thead><tr><th>ID</th><th>Route</th><th>Type</th><th>Insured Value</th><th>Risk Score</th><th>Status</th><th>Annual Premium</th></tr></thead><tbody>${rows}</tbody></table>
    <p style="margin-top:40px;color:#9ca3af;font-size:11px">GlobalRisk Intelligence Platform — Confidential Portfolio Report</p>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
}

export default function Portfolio() {
    const queryClient = useQueryClient();
    const { data: positions = [], isLoading } = useQuery<Position[]>({
        queryKey: ["portfolio"],
        queryFn: getPortfolio,
        refetchInterval: 30000 // Refresh every 30s
    });

    const removeM = useMutation({
        mutationFn: deletePortfolioPosition,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["portfolio"] });
            toast.success("Position removed");
        }
    });

    const [showAdd, setShowAdd] = useState(false);
    const [filterType, setFilterType] = useState<string>("All");

    const filtered = filterType === "All" ? positions : positions.filter(p => p.type === filterType);

    const totalVal = filtered.reduce((a, p) => a + p.value, 0);
    const totalPrem = filtered.reduce((a, p) => a + p.premium, 0);
    const avgRisk = filtered.length ? Math.round(filtered.reduce((a, p) => a + p.risk, 0) / filtered.length) : 0;
    const critCount = filtered.filter(p => p.level === "CRITICAL").length;

    // Pie data - computed from actual positions
    const typeCount = filtered.reduce((acc: any, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {});
    const pieData = Object.entries(typeCount).map(([name, value]) => ({ name, value, color: TYPE_COLOR[name] }));

    const riskBuckets = [
        { name: "0–30 (Low)", count: filtered.filter(p => p.risk < 30).length, fill: "#10b981" },
        { name: "30–55 (Elevated)", count: filtered.filter(p => p.risk >= 30 && p.risk < 55).length, fill: "#f59e0b" },
        { name: "55–75 (High)", count: filtered.filter(p => p.risk >= 55 && p.risk < 75).length, fill: "#f97316" },
        { name: "75–100 (Critical)", count: filtered.filter(p => p.risk >= 75).length, fill: "#ef4444" },
    ];


    return (
        <AppLayout title="Portfolio Exposure">
            {showAdd && (
                <AddPositionModal
                    onClose={() => {
                        setShowAdd(false);
                        queryClient.invalidateQueries({ queryKey: ["portfolio"] });
                    }}
                />
            )}
            <div className="max-w-[1440px] mx-auto flex flex-col gap-6 animate-fade-in">

                {/* Header row */}
                <div className="flex items-center justify-between">
                    <div className="flex gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200 text-xs font-medium">
                        {["All", "Aviation", "Maritime", "Railway"].map(t => (
                            <button key={t} onClick={() => setFilterType(t)}
                                className={`px-3 py-1.5 rounded-md transition-all ${filterType === t ? "bg-white shadow-sm text-text-main" : "text-text-muted hover:text-text-main"}`}>
                                {t}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => exportPortfolioPDF(positions)}
                            className="flex items-center gap-1.5 text-xs font-medium text-primary border border-primary/30 hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-colors">
                            <span className="ms text-base">picture_as_pdf</span>Export PDF
                        </button>
                        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
                            <span className="ms text-base">add</span>Add Position
                        </button>
                    </div>
                </div>

                {/* KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
                    {[
                        { label: "Total Positions", value: filtered.length, color: "#3b82f6", icon: "folder_open" },
                        { label: "Total Insured Value", value: `$${(totalVal / 1e6).toFixed(0)}M`, color: "#0d9488", icon: "account_balance" },
                        { label: "Annual Premium", value: `$${(totalPrem / 1e6).toFixed(2)}M`, color: "#f59e0b", icon: "payments" },
                        { label: "Critical Positions", value: critCount, color: "#ef4444", icon: "warning" },
                    ].map(({ label, value, color, icon }) => (
                        <div key={label} className="card p-5" style={{ background: `linear-gradient(135deg, ${color}12 0%, #fff 100%)` }}>
                            <div className="flex justify-between items-start mb-3">
                                <h3 className="text-[11px] font-display uppercase tracking-wider text-text-muted">{label}</h3>
                                <span className="ms text-lg" style={{ color }}>{icon}</span>
                            </div>
                            <p className="font-mono font-[800] text-[28px] leading-none" style={{ color }}>{value}</p>
                        </div>
                    ))}
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    <div className="lg:col-span-5 card p-5">
                        <h3 className="section-title mb-4">Portfolio Composition</h3>
                        <div style={{ height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={75} dataKey="value"
                                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} labelLine={false}>
                                        {pieData.map(({ color }: any, i: number) => <Cell key={i} fill={color} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="lg:col-span-7 card p-5">
                        <h3 className="section-title mb-4">Risk Score Distribution</h3>
                        <div style={{ height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={riskBuckets} barSize={40}>
                                    <CartesianGrid strokeDasharray="4 4" stroke="#f0f0f0" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {riskBuckets.map(({ fill }, i) => <Cell key={i} fill={fill} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Positions table */}
                <div className="card overflow-hidden">
                    <div className="px-5 py-4 border-b border-border-col flex justify-between items-center">
                        <h3 className="section-title"><span className="ms text-primary">table_rows</span>Active Positions ({filtered.length})</h3>
                        <div className="flex gap-2">
                            <span className="text-xs text-text-muted">Avg Risk Score:</span>
                            <span className="text-xs font-mono font-bold text-orange-600">{avgRisk}/100</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-border-col bg-gray-50/50">
                                    {["ID", "Route", "Type", "Insured Value", "Risk Score", "Status", "Annual Premium", ""].map(h => (
                                        <th key={h} className="text-left px-5 py-3 text-[11px] font-semibold text-text-muted uppercase tracking-wider">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((p, i) => (
                                    <tr key={p.id} className={`border-b border-gray-50 hover:bg-gray-50/80 transition-colors ${i % 2 === 0 ? "" : "bg-gray-50/30"}`}>
                                        <td className="px-5 py-3.5 font-mono text-xs text-text-muted">{p.id}</td>
                                        <td className="px-5 py-3.5 font-medium text-text-main">{p.route}</td>
                                        <td className="px-5 py-3.5">
                                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: TYPE_COLOR[p.type] }}>
                                                <span className="w-2 h-2 rounded-full" style={{ background: TYPE_COLOR[p.type] }} />
                                                {p.type}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-text-main">${(p.value / 1e6).toFixed(0)}M</td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full" style={{
                                                        width: `${p.risk}%`,
                                                        background: p.risk >= 75 ? "#ef4444" : p.risk >= 55 ? "#f97316" : p.risk >= 30 ? "#f59e0b" : "#10b981"
                                                    }} />
                                                </div>
                                                <span className="font-mono text-xs">{p.risk}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${LEVEL_CLS[p.level] ?? "badge-normal"}`}>{p.level}</span>
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-text-main">${p.premium.toLocaleString()}</td>
                                        <td className="px-5 py-3.5">
                                            <button onClick={() => removeM.mutate(p.id)}
                                                disabled={removeM.isPending}
                                                className="p-1 hover:bg-rose-50 rounded-lg transition-colors text-text-muted hover:text-rose-500 disabled:opacity-50">
                                                <span className="ms text-base">delete</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {isLoading ? (
                            <div className="p-8 text-center text-text-muted text-sm flex flex-col items-center gap-3">
                                <span className="ms text-2xl animate-spin">sync</span>
                                Loading portfolio data...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="p-8 text-center text-text-muted text-sm">No positions match this filter.</div>
                        ) : null}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
