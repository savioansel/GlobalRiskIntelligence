import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { analyzeRailway } from "../api";
import { AppLayout } from "../App";
import { RailwayRiskMap } from "../components/RiskMap";
import { RailwayRiskMap3D } from "../components/GlobeMap";
import { RiskBadge, ScoreGauge, UnderwriterChecklist, AISummaryBlock, OptimisedScorePill } from "../components/shared";
import type { Mitigation } from "../components/shared";
import { toast } from "react-hot-toast";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── Railway-specific mitigations ──────────────────────────────────────────────
const MITIGATIONS_RAIL: Mitigation[] = [
    { id: "rpf", label: "Request RPF armed escort for Red Corridor segment", savings: 12 },
    { id: "reroute", label: "Alternative route via Nagpur (avoids flood sections)", savings: 8 },
    { id: "gps", label: "Fit real-time GPS tracker on every wagon", savings: 5 },
    { id: "slow", label: "Restrict speed on ghat sections per advisory", savings: 4 },
    { id: "inspect", label: "Pre-departure track inspection sign-off", savings: 3 },
];

// ── Supply Chain Disruption Estimator ─────────────────────────────────────────
function DelayEstimator({ riskScore, cargoValue }: { riskScore: number; cargoValue: number }) {
    const [dailyRevLoss, setDailyRevLoss] = useState(50000);
    const estimatedDelayDays = riskScore >= 75 ? 5 : riskScore >= 55 ? 3 : riskScore >= 30 ? 1 : 0.5;
    const directLoss = Math.round(estimatedDelayDays * dailyRevLoss);
    const spoilagePct = 0.02;
    const cargoLoss = Math.round(cargoValue * spoilagePct * estimatedDelayDays);
    const totalExposure = directLoss + cargoLoss;

    return (
        <div className="card p-5 border-l-4 border-amber-400">
            <h3 className="section-title mb-1"><span className="ms text-amber-500">schedule</span>Supply Chain Delay Estimator</h3>
            <p className="text-xs text-text-muted mb-4">Estimates business interruption cost based on current corridor risk.</p>
            <div className="flex flex-col gap-3 mb-4">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Daily Revenue at Risk (USD)</label>
                    <input type="number" className="input-field" value={dailyRevLoss}
                        onChange={e => setDailyRevLoss(Number(e.target.value))} />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Est. Delay</p>
                    <p className="font-mono font-[800] text-amber-700">{estimatedDelayDays}d</p>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-100">
                    <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Revenue Loss</p>
                    <p className="font-mono font-[800] text-rose-700">${directLoss.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                    <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Cargo Spoilage</p>
                    <p className="font-mono font-[800] text-orange-700">${cargoLoss.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Total BI Exposure</p>
                    <p className="font-mono font-[800] text-red-700">${totalExposure.toLocaleString()}</p>
                </div>
            </div>
        </div>
    );
}

// ── PDF export ────────────────────────────────────────────────────────────────
function exportPDF(result: any, form: any) {
    const win = window.open("", "_blank");
    if (!win) return;
    const dims = (result.dimensions ?? []).map((d: any) =>
        `<tr><td style="padding:6px 12px">${d.name}</td><td style="padding:6px 12px;font-family:monospace">${d.score.toFixed(1)}</td><td><div style="background:${d.color};height:8px;width:${d.score}%;border-radius:4px"></div></td></tr>`
    ).join("");
    const alerts = (result.geofence_alerts ?? []).map((a: any) =>
        `<li><strong>${a.zone} (${a.severity})</strong>: ${a.description}</li>`
    ).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Railway Risk Report — ${result.origin} → ${result.destination}</title>
    <style>body{font-family:Inter,sans-serif;padding:40px;max-width:900px;margin:auto;color:#111}h1{color:#d97706}h2{color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-top:32px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#f9fafb;font-size:12px;text-transform:uppercase;color:#6b7280}tr:nth-child(even){background:#f9fafb}.kpi{display:inline-block;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 20px;margin:0 8px 8px 0}</style></head><body>
    <h1>🚂 Railway Risk Underwriting Report</h1>
    <p><strong>Route:</strong> ${result.origin} &rarr; ${result.destination} &nbsp;|&nbsp; <strong>Train:</strong> ${form.train_type} &nbsp;|&nbsp; <strong>Cargo:</strong> ${form.cargo_type}</p>
    <p><strong>Generated:</strong> ${new Date().toUTCString()}</p>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Overall Risk Score</div><div style="font-size:28px;font-weight:800;font-family:monospace;color:${result.overall_score >= 75 ? "#dc2626" : result.overall_score >= 55 ? "#ea580c" : "#d97706"}">${result.overall_score.toFixed(0)}<span style="font-size:14px">/100</span></div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Status</div><div style="font-size:18px;font-weight:700">${result.risk_level}</div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Est. Premium (USD)</div><div style="font-size:18px;font-weight:700;font-family:monospace">$${result.premium.estimated_premium_usd.toLocaleString()}</div></div>
    <h2>Risk Dimensions</h2><table><thead><tr><th>Dimension</th><th>Score</th><th>Visual</th></tr></thead><tbody>${dims}</tbody></table>
    <h2>Geofence Alerts</h2><ul>${alerts}</ul>
    <h2>Mitigation Suggestions</h2><ul>${(result.suggestions ?? []).map((s: string) => `<li>${s}</li>`).join("")}</ul>
    <p style="margin-top:40px;color:#9ca3af;font-size:11px">GlobalRisk Intelligence Platform — Confidential Underwriting Document</p>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
}

const CARGO_TYPES = ["Container", "Bulk", "Hazmat", "Perishable", "High-Value"];
const TRAIN_TYPES = ["Express Freight", "Goods Train", "Container Special", "Double Stack"];
const DEFAULT = {
    origin_station: "NDLS",
    destination_station: "CSMT",
    cargo_type: "Container",
    cargo_value_usd: 2_000_000,
    train_type: "Express Freight",
    route_preference: "shortest",
};

const STATION_OPTIONS = [
    { value: "NDLS", label: "NDLS - New Delhi, India" },
    { value: "CSMT", label: "CSMT - Mumbai, India" },
    { value: "MAS", label: "MAS - Chennai, India" },
    { value: "HWH", label: "HWH - Kolkata, India" },
    { value: "SBC", label: "SBC - Bengaluru, India" },
    { value: "SC", label: "SC - Hyderabad, India" },
    { value: "PUNE", label: "PUNE - Pune, India" },
    { value: "ADI", label: "ADI - Ahmedabad, India" },
    { value: "JP", label: "JP - Jaipur, India" },
    { value: "CNB", label: "CNB - Kanpur, India" },
    { value: "LKO", label: "LKO - Lucknow, India" },
    { value: "NGP", label: "NGP - Nagpur, India" },
    { value: "PNBE", label: "PNBE - Patna, India" },
    { value: "BPL", label: "BPL - Bhopal, India" },
    { value: "ST", label: "ST - Surat, India" },
    { value: "INDB", label: "INDB - Indore, India" },
];

export default function Railway() {
    const [form, setForm] = useState(DEFAULT);
    const [optimisedScore, setOptimisedScore] = useState<number | null>(null);
    const [is3D, setIs3D] = useState(false);
    const [apiKey] = useState(() => localStorage.getItem("groq_api_key") || "");
    const m = useMutation({
        mutationFn: analyzeRailway,
        onSuccess: () => toast.success("Analysis complete"),
        onError: () => toast.error("Failed to fetch risk data")
    });
    const upd = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));
    const result: any = m.data;

    const barData = result?.dimensions?.map((d: any) => ({ name: d.name, score: d.score, fill: d.color })) ?? [];

    return (
        <AppLayout title="Railway Risk">
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">

                {/* ── Form ──────────────────────────────────────────────── */}
                <div className="lg:col-span-4 flex flex-col gap-5">
                    <div className="card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100 ms text-xl">train</span>
                            <h2 className="section-title">Train Parameters</h2>
                        </div>
                        <div className="flex flex-col gap-4">
                            {[
                                { label: "Origin Station", key: "origin_station", opts: STATION_OPTIONS },
                                { label: "Destination Station", key: "destination_station", opts: STATION_OPTIONS },
                            ].map(({ label, key, opts }) => (
                                <div key={key} className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{label}</label>
                                    <select className="input-field" value={(form as any)[key]} onChange={e => upd(key, e.target.value)}>
                                        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            ))}
                            {[
                                { label: "Cargo Type", key: "cargo_type", opts: CARGO_TYPES.map(v => ({ value: v, label: v })) },
                                { label: "Train Type", key: "train_type", opts: TRAIN_TYPES.map(v => ({ value: v, label: v })) },
                                { label: "Route Preference", key: "route_preference", opts: [{ value: "shortest", label: "Shortest Path" }, { value: "safest", label: "Safest Path" }] },
                            ].map(({ label, key, opts }) => (
                                <div key={key} className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{label}</label>
                                    <select className="input-field" value={(form as any)[key]} onChange={e => upd(key, e.target.value)}>
                                        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            ))}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Cargo Value (USD)</label>
                                <input className="input-field" type="number" value={form.cargo_value_usd}
                                    onChange={e => upd("cargo_value_usd", Number(e.target.value))} />
                            </div>
                            <button className="btn-primary mt-1" onClick={() => { m.mutate(form); setOptimisedScore(null); }} disabled={m.isPending}>
                                {m.isPending
                                    ? <><span className="ms animate-spin text-base">autorenew</span>Analyzing…</>
                                    : <><span className="ms text-base">analytics</span>Analyze Train Risk</>}
                            </button>
                        </div>
                    </div>



                    {/* Delay Estimator */}
                    {result && (
                        <DelayEstimator riskScore={result.overall_score} cargoValue={form.cargo_value_usd} />
                    )}

                    {/* Underwriter Checklist */}
                    {result && (
                        <UnderwriterChecklist mitigations={MITIGATIONS_RAIL} baseScore={result.overall_score} onOptimized={setOptimisedScore} />
                    )}
                    <OptimisedScorePill score={optimisedScore} />
                </div>

                {/* ── Results ───────────────────────────────────────────── */}
                <div className="lg:col-span-8 flex flex-col gap-5">
                    {!result && !m.isPending && (
                        <div className="card p-12 flex flex-col items-center justify-center gap-4 text-center">
                            <span className="ms text-[56px] text-gray-200">train</span>
                            <p className="text-text-muted text-sm max-w-xs">Enter train shipment details and click <strong>Analyze</strong> to view the risk profile.</p>
                        </div>
                    )}
                    {m.isPending && (
                        <div className="card p-12 flex flex-col items-center justify-center gap-3">
                            <span className="ms text-[40px] text-primary animate-spin">autorenew</span>
                            <p className="text-text-muted text-sm">Running railway risk models…</p>
                        </div>
                    )}

                    {result && (
                        <>
                            {/* Score + badge */}
                            <div className="card p-6 flex flex-col sm:flex-row items-center gap-6">
                                <ScoreGauge score={result.overall_score} />
                                <div className="flex flex-col gap-2 flex-1">
                                    <div className="flex items-center gap-3">
                                        <RiskBadge level={result.risk_level} />
                                        <span className="text-sm text-text-muted font-medium">{result.origin} → {result.destination}</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Base Rate</p>
                                            <p className="font-mono font-[700] text-text-main">{(result.premium.base_rate_pct * 100).toFixed(3)}%</p>
                                        </div>
                                        <div className="p-3 bg-orange-50 rounded-xl border border-orange-100">
                                            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Risk Loading</p>
                                            <p className="font-mono font-[700] text-orange-600">+{result.premium.risk_loading_pct.toFixed(2)}%</p>
                                        </div>
                                        <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                                            <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1">Est. Premium</p>
                                            <p className="font-mono font-[700] text-primary">${result.premium.estimated_premium_usd.toLocaleString()}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => exportPDF(result, form)}
                                        className="mt-2 self-start flex items-center gap-1.5 text-xs font-medium text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/30 transition-colors">
                                        <span className="ms text-base">picture_as_pdf</span>Export PDF Report
                                    </button>
                                </div>
                            </div>

                            {/* AI Summary */}
                            <AISummaryBlock module="railway" result={result} apiKey={apiKey}
                                borderColor="border-emerald-400" iconColor="text-emerald-500"
                                placeholder='Click "Generate" for an AI-written underwriting narrative for this rail corridor.' />

                            {/* Map */}
                            <div className="card p-5">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="section-title"><span className="ms text-primary">map</span>Route Map</h3>
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
                                {is3D
                                    ? <RailwayRiskMap3D origin={result.origin} destination={result.destination} riskLevel={result.risk_level} routePreference={form.route_preference} height={300} />
                                    : <RailwayRiskMap origin={result.origin} destination={result.destination} riskLevel={result.risk_level} routePreference={form.route_preference} height={300} />
                                }
                            </div>

                            {/* Dimensions bar chart */}
                            <div className="card p-5">
                                <h3 className="section-title mb-4">Risk Dimensions</h3>
                                <div style={{ height: 220 }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="4 4" stroke="#f0f0f0" horizontal={false} />
                                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} width={130} />
                                            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                            <Bar dataKey="score" radius={[0, 6, 6, 0]}>
                                                {barData.map((entry: any, i: number) => <Cell key={i} fill={entry.fill} />)}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Geofence Alerts */}
                            {result.geofence_alerts?.length > 0 && (
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-rose-500">geofence</span>Geofence Alerts</h3>
                                    <div className="flex flex-col gap-3">
                                        {result.geofence_alerts.map((a: any, i: number) => (
                                            <div key={i} className="flex items-start gap-3 p-3 bg-rose-50/60 rounded-xl border border-rose-100">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${a.severity === "HIGH" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {a.severity}
                                                </span>
                                                <div>
                                                    <p className="text-sm font-semibold text-text-main">{a.zone} — {a.type}</p>
                                                    <p className="text-xs text-text-muted mt-0.5">{a.description}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Train Anomalies */}
                            {result.anomalies?.length > 0 && (
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-amber-500">sensors</span>Train Anomalies</h3>
                                    <div className="flex flex-col gap-3">
                                        {result.anomalies.map((a: any, i: number) => (
                                            <div key={i} className="flex items-start gap-3 p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${a.severity === "HIGH" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {a.severity}
                                                </span>
                                                <div>
                                                    <p className="text-sm font-semibold text-text-main">{a.type}</p>
                                                    <p className="text-xs text-text-muted mt-0.5">{a.description}</p>
                                                    {a.location && <p className="text-xs text-text-muted mt-0.5 font-medium">📍 {a.location}</p>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                {/* Top factors */}
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-rose-500">warning</span>Top Factors</h3>
                                    <div className="flex flex-col gap-3">
                                        {result.top_factors.map((f: any, i: number) => (
                                            <div key={i} className="border-l-2 border-rose-400 pl-3">
                                                <p className="text-sm font-semibold text-text-main">{f.name} <span className="text-rose-600 font-mono">+{f.delta}</span></p>
                                                <p className="text-xs text-text-muted mt-0.5">{f.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Mitigations */}
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-emerald-500">tips_and_updates</span>Mitigations</h3>
                                    <ul className="flex flex-col gap-2">
                                        {result.suggestions.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-text-main">
                                                <span className="ms text-emerald-500 shrink-0 text-base mt-0.5">check_circle</span>{s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
