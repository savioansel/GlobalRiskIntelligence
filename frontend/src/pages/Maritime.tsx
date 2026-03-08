import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { analyzeMaritime } from "../api";
import { AppLayout } from "../App";
import { MaritimeRiskMap } from "../components/RiskMap";
import { MaritimeRiskMap3D } from "../components/GlobeMap";
import { RiskBadge, ScoreGauge, UnderwriterChecklist, AISummaryBlock, OptimisedScorePill } from "../components/shared";
import type { Mitigation } from "../components/shared";
import { toast } from "react-hot-toast";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ── Maritime-specific mitigations ─────────────────────────────────────────────
const MITIGATIONS_MAR: Mitigation[] = [
    { id: "cape", label: "Re-route via Cape of Good Hope (avoid Red Sea)", savings: 18 },
    { id: "pmsc", label: "Embark Private Maritime Security Contractors (PMSC)", savings: 8 },
    { id: "convoy", label: "Request naval convoy through Strait of Hormuz", savings: 6 },
    { id: "delay", label: "Delay sailing 48h pending improved weather forecast", savings: 5 },
    { id: "bmp5", label: "Implement full BMP5 protocols", savings: 4 },
];

// ── PDF Export ────────────────────────────────────────────────────────────────
function exportPDF(result: any, form: any) {
    const win = window.open("", "_blank");
    if (!win) return;
    const dims = (result.dimensions ?? []).map((d: any) =>
        `<tr><td style="padding:6px 12px">${d.name}</td><td style="padding:6px 12px;font-family:monospace">${d.score.toFixed(1)}</td><td><div style="background:${d.color};height:8px;width:${d.score}%;border-radius:4px"></div></td></tr>`
    ).join("");
    const anomalies = (result.anomalies ?? []).map((a: any) =>
        `<li><strong>${a.type}</strong> (${a.severity}): ${a.description}</li>`
    ).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Maritime Risk Report — ${result.origin} → ${result.destination}</title>
    <style>body{font-family:Inter,sans-serif;padding:40px;max-width:900px;margin:auto;color:#111}h1{color:#3b82f6}h2{color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-top:32px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#f9fafb;font-size:12px;text-transform:uppercase;color:#6b7280}tr:nth-child(even){background:#f9fafb}.kpi{display:inline-block;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 20px;margin:0 8px 8px 0}</style></head><body>
    <h1>⚓ Maritime Risk Underwriting Report</h1>
    <p><strong>Route:</strong> ${result.origin} &rarr; ${result.destination} &nbsp;|&nbsp; <strong>Vessel:</strong> ${form.vessel_type} &nbsp;|&nbsp; <strong>Cargo:</strong> ${form.cargo_type}</p>
    <p><strong>Generated:</strong> ${new Date().toUTCString()}</p>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Overall Risk Score</div><div style="font-size:28px;font-weight:800;font-family:monospace;color:${result.overall_score >= 75 ? "#dc2626" : result.overall_score >= 55 ? "#ea580c" : "#2563eb"}">${result.overall_score.toFixed(0)}<span style="font-size:14px">/100</span></div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Risk Level</div><div style="font-size:18px;font-weight:700">${result.risk_level}</div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Est. Premium (USD)</div><div style="font-size:18px;font-weight:700;font-family:monospace">$${result.premium.estimated_premium_usd.toLocaleString()}</div></div>
    <h2>Risk Dimensions</h2><table><thead><tr><th>Dimension</th><th>Score</th><th>Visual</th></tr></thead><tbody>${dims}</tbody></table>
    <h2>AIS Anomalies</h2><ul>${anomalies}</ul>
    <h2>Mitigation Suggestions</h2><ul>${(result.suggestions ?? []).map((s: string) => `<li>${s}</li>`).join("")}</ul>
    <p style="margin-top:40px;color:#9ca3af;font-size:11px">GlobalRisk Intelligence Platform — Confidential Underwriting Document</p>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
}

const DEFAULT = {
    origin_port: "INBOM",
    destination_port: "NLRTM",
    vessel_type: "Container Ship",
    cargo_type: "Container",
    cargo_value_usd: 50_000_000,
    route_preference: "shortest",
};
const VESSEL_TYPES = ["Container Ship", "Bulk Carrier", "Oil Tanker", "LNG Carrier", "General Cargo"];
const CARGO_TYPES = ["Container", "Bulk Commodity", "Crude Oil", "LNG/LPG", "General Cargo", "Hazardous Materials"];

const PORT_OPTIONS = [
    { value: "INBOM", label: "INBOM - Mumbai, India" },
    { value: "NLRTM", label: "NLRTM - Rotterdam, Netherlands" },
    { value: "CNSHA", label: "CNSHA - Shanghai, China" },
    { value: "USLAX", label: "USLAX - Los Angeles, USA" },
    { value: "AEDXB", label: "AEDXB - Dubai, UAE" },
    { value: "SGSIN", label: "SGSIN - Singapore, Singapore" },
    { value: "USNYC", label: "USNYC - New York, USA" },
    { value: "USLGB", label: "USLGB - Long Beach, USA" },
    { value: "DEHAM", label: "DEHAM - Hamburg, Germany" },
    { value: "BEANR", label: "BEANR - Antwerp, Belgium" },
    { value: "CNSHG", label: "CNSHG - Shenzhen, China" },
    { value: "CNBUS", label: "CNBUS - Busan, South Korea" },
    { value: "HKHKG", label: "HKHKG - Hong Kong, Hong Kong" },
    { value: "JPYOK", label: "JPYOK - Yokohama, Japan" },
    { value: "MYPKG", label: "MYPKG - Port Klang, Malaysia" },
    { value: "MYTPP", label: "MYTPP - Tanjung Pelepas, Malaysia" },
    { value: "TWKHH", label: "TWKHH - Kaohsiung, Taiwan" },
    { value: "AUSYD", label: "AUSYD - Sydney, Australia" },
    { value: "AUMEL", label: "AUMEL - Melbourne, Australia" },
];

export default function Maritime() {
    const [form, setForm] = useState(DEFAULT);
    const [optimisedScore, setOptimisedScore] = useState<number | null>(null);
    const [is3D, setIs3D] = useState(false);
    const [apiKey] = useState(() => localStorage.getItem("groq_api_key") || "");
    const m = useMutation({
        mutationFn: analyzeMaritime,
        onSuccess: () => toast.success("Analysis complete"),
        onError: () => toast.error("Failed to fetch risk data")
    });
    const upd = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));
    const result: any = m.data;
    const barData = result?.dimensions?.map((d: any) => ({ name: d.name.replace(" / ", "/"), score: d.score, fill: d.color })) ?? [];

    return (
        <AppLayout title="Maritime Risk">
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">

                {/* ── Form ──────────────────────────────────────────────── */}
                <div className="lg:col-span-4 flex flex-col gap-5">
                    <div className="card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 ms text-xl shadow-sm">sailing</span>
                            <h2 className="section-title"><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-800 to-blue-500">Shipment Parameters</span></h2>
                        </div>
                        <div className="flex flex-col gap-4">
                            {[
                                { label: "Origin Port", key: "origin_port", opts: PORT_OPTIONS },
                                { label: "Destination Port", key: "destination_port", opts: PORT_OPTIONS },
                            ].map(({ label, key, opts }) => (
                                <div key={key} className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">{label}</label>
                                    <select className="input-field" value={(form as any)[key]} onChange={e => upd(key, e.target.value)}>
                                        {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                            ))}
                            {[
                                { label: "Vessel Type", key: "vessel_type", opts: VESSEL_TYPES.map(v => ({ value: v, label: v })) },
                                { label: "Cargo Type", key: "cargo_type", opts: CARGO_TYPES.map(v => ({ value: v, label: v })) },
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
                                    ? <><span className="ms text-base animate-spin">autorenew</span>Analyzing…</>
                                    : <><span className="ms text-base">analytics</span>Analyze Shipment Risk</>}
                            </button>
                        </div>
                    </div>

                    {/* Route comparison */}
                    {result?.route_comparison && (
                        <div className="card p-5">
                            <h3 className="section-title mb-4"><span className="ms text-blue-500 drop-shadow-sm">route</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-800 to-blue-500">Route Comparison</span></h3>
                            {(["shortest", "safest"] as const).map(k => {
                                const r = result.route_comparison[k];
                                return (
                                    <div key={k}
                                        onClick={() => {
                                            if (form.route_preference !== k) {
                                                upd("route_preference", k);
                                                m.mutate({ ...form, route_preference: k });
                                                setOptimisedScore(null);
                                            }
                                        }}
                                        className={`p-3 rounded-xl border mb-3 cursor-pointer transition-colors ${form.route_preference === k ? "border-primary bg-primary/5" : "border-border-col bg-gray-50/50 hover:bg-gray-100/50"}`}>
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-sm font-semibold capitalize text-text-main">{k}</span>
                                            <span className="font-mono text-sm text-rose-600">{r.score.toFixed(0)} pts</span>
                                        </div>
                                        <p className="text-xs text-text-muted">+{r.extra_days}d transit · Premium ${r.premium_usd.toLocaleString()}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Underwriter Checklist */}
                    {result && (
                        <UnderwriterChecklist mitigations={MITIGATIONS_MAR} baseScore={result.overall_score} onOptimized={setOptimisedScore} />
                    )}
                    <OptimisedScorePill score={optimisedScore} />
                </div>

                {/* ── Results ───────────────────────────────────────────── */}
                <div className="lg:col-span-8 flex flex-col gap-5">
                    {!result && !m.isPending && (
                        <div className="card p-12 flex flex-col items-center justify-center gap-4 text-center">
                            <span className="ms text-[56px] text-gray-200">directions_boat</span>
                            <p className="text-text-muted text-sm max-w-xs">Configure shipment parameters and click <strong>Analyze</strong> to see the maritime risk profile.</p>
                        </div>
                    )}
                    {m.isPending && (
                        <div className="card p-12 flex flex-col items-center justify-center gap-3">
                            <span className="ms text-[40px] text-primary animate-spin">autorenew</span>
                            <p className="text-text-muted text-sm">Running maritime risk models…</p>
                        </div>
                    )}

                    {result && (
                        <div className="flex flex-col gap-5 animate-slide-up">
                            {/* Score header */}
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
                                            <p className="font-mono font-[700] text-text-main">{result.premium.base_rate_pct.toFixed(3)}%</p>
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
                            <AISummaryBlock module="maritime" result={result} apiKey={apiKey}
                                borderColor="border-blue-400" iconColor="text-blue-500"
                                placeholder='Click "Generate" to get an AI-written underwriting narrative for this voyage.' />

                            {/* Map */}
                            <div className="card p-5">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="section-title"><span className="ms text-blue-500 drop-shadow-sm">map</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-800 to-blue-500">Route Map</span></h3>
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
                                    ? <MaritimeRiskMap3D origin={result.origin} destination={result.destination} riskLevel={result.risk_level} routePreference={form.route_preference} height={280} />
                                    : <MaritimeRiskMap origin={result.origin} destination={result.destination} riskLevel={result.risk_level} routePreference={form.route_preference} height={280} />
                                }
                            </div>

                            {/* Dimensions bar chart */}
                            <div className="card p-5">
                                <h3 className="section-title mb-4"><span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-800 to-blue-500">Risk Dimensions</span></h3>
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

                            {/* Anomalies */}
                            {result.anomalies?.length > 0 && (
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-amber-500 drop-shadow-sm">radar</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-700 to-amber-500">AIS Anomalies</span></h3>
                                    <div className="flex flex-col gap-3">
                                        {result.anomalies.map((a: any, i: number) => (
                                            <div key={i} className="flex items-start gap-3 p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                                                <span className={`text-[10px] font-bold px-2 py-1 rounded-full shrink-0 ${a.severity === "HIGH" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {a.severity}
                                                </span>
                                                <div>
                                                    <p className="text-sm font-semibold text-text-main">{a.type}</p>
                                                    <p className="text-xs text-text-muted mt-0.5">{a.description}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Top factors + suggestions */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-rose-500 drop-shadow-sm">warning</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-800 to-rose-500">Top Factors</span></h3>
                                    <div className="flex flex-col gap-3">
                                        {result.top_factors.map((f: any, i: number) => (
                                            <div key={i} className="border-l-2 border-rose-400 pl-3">
                                                <p className="text-sm font-semibold text-text-main">{f.name} <span className="text-rose-600 font-mono">+{f.delta}</span></p>
                                                <p className="text-xs text-text-muted mt-0.5">{f.description}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-emerald-500 drop-shadow-sm">tips_and_updates</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-800 to-emerald-500">Mitigations</span></h3>
                                    <ul className="flex flex-col gap-2">
                                        {result.suggestions.map((s: string, i: number) => (
                                            <li key={i} className="flex items-start gap-2 text-sm text-text-main">
                                                <span className="ms text-emerald-500 shrink-0 text-base mt-0.5">check_circle</span>{s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </AppLayout>
    );
}
