import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { analyzeAviation } from "../api";
import { AppLayout } from "../App";
import { AviationRiskMap } from "../components/RiskMap";
import { AviationRiskMap3D } from "../components/GlobeMap";
import { RiskBadge, ScoreGauge, UnderwriterChecklist, AISummaryBlock, OptimisedScorePill } from "../components/shared";
import type { Mitigation } from "../components/shared";
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
} from "recharts";

// ── Aviation-specific PDF Export ──────────────────────────────────────────────
function exportPDF(result: any, form: any) {
    const win = window.open("", "_blank");
    if (!win) return;
    const dims = (result.dimensions ?? []).map((d: any) =>
        `<tr><td style="padding:6px 12px">${d.name}</td><td style="padding:6px 12px;font-family:monospace">${d.score.toFixed(1)}</td><td><div style="background:${d.color};height:8px;width:${d.score}%;border-radius:4px"></div></td></tr>`
    ).join("");
    const factors = (result.top_factors ?? []).map((f: any) =>
        `<li style="margin-bottom:6px"><strong>+${f.delta} pts — ${f.name}:</strong> ${f.description}</li>`
    ).join("");
    win.document.write(`
    <!DOCTYPE html><html><head><title>Aviation Risk Report — ${result.origin} → ${result.destination}</title>
    <style>body{font-family:Inter,sans-serif;padding:40px;max-width:900px;margin:auto;color:#111}
    h1{color:#0d9488}h2{color:#374151;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-top:32px}
    table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#f9fafb;font-size:12px;text-transform:uppercase;color:#6b7280}
    tr:nth-child(even){background:#f9fafb}.kpi{display:inline-block;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:12px 20px;margin:0 8px 8px 0}
    </style></head><body>
    <h1>✈ Aviation Risk Underwriting Report</h1>
    <p><strong>Route:</strong> ${result.origin} &rarr; ${result.destination} &nbsp;|&nbsp; <strong>Aircraft:</strong> ${form.aircraft_type} &nbsp;|&nbsp; <strong>Cargo:</strong> ${form.cargo_type}</p>
    <p><strong>Generated:</strong> ${new Date().toUTCString()}</p>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Overall Risk Score</div><div style="font-size:28px;font-weight:800;font-family:monospace;color:${result.overall_score >= 75 ? "#dc2626" : result.overall_score >= 55 ? "#ea580c" : "#0d9488"}">${result.overall_score.toFixed(0)}<span style="font-size:14px">/100</span></div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Risk Level</div><div style="font-size:18px;font-weight:700">${result.risk_level}</div></div>
    <div class="kpi"><div style="font-size:11px;color:#6b7280;text-transform:uppercase">Est. Premium (USD)</div><div style="font-size:18px;font-weight:700;font-family:monospace">$${result.premium.estimated_premium_usd.toLocaleString()}</div></div>
    <h2>Risk Dimensions</h2><table><thead><tr><th>Dimension</th><th>Score</th><th>Visual</th></tr></thead><tbody>${dims}</tbody></table>
    <h2>Top Risk Factors</h2><ul>${factors}</ul>
    <h2>Mitigation Suggestions</h2><ul>${(result.suggestions ?? []).map((s: string) => `<li>${s}</li>`).join("")}</ul>
    <p style="margin-top:40px;color:#9ca3af;font-size:11px">GlobalRisk Intelligence Platform — Confidential Underwriting Document</p>
    <script>window.onload=()=>window.print()</script></body></html>`);
    win.document.close();
}

// ── Mitigations ──────────────────────────────────────────────────────────────
const MITIGATIONS: Mitigation[] = [
    { id: "reroute", label: "Re-route to avoid restricted airspace", savings: 8 },
    { id: "etops", label: "File ETOPS alternate for overwater segment", savings: 5 },
    { id: "slot", label: "Request priority ATC slot at destination", savings: 4 },
    { id: "wx", label: "Delay departure 6h to avoid SIGMET", savings: 6 },
    { id: "pmsc", label: "Engage security briefing for crew", savings: 3 },
];

const DEFAULT = {
    origin_icao: "VABB",
    destination_icao: "EGLL",
    aircraft_type: "Boeing 777-300ER",
    cargo_type: "Passenger & Belly Cargo",
    insured_value_usd: 150_000_000,
    route_preference: "shortest",
};

const AIRPORT_OPTIONS = [
    { value: "VABB", label: "VABB - Mumbai, India" },
    { value: "VIDP", label: "VIDP - New Delhi, India" },
    { value: "EGLL", label: "EGLL - London, United Kingdom" },
    { value: "WSSS", label: "WSSS - Singapore, Singapore" },
    { value: "KJFK", label: "KJFK - New York, USA" },
    { value: "KLAX", label: "KLAX - Los Angeles, USA" },
    { value: "KORD", label: "KORD - Chicago, USA" },
    { value: "KATL", label: "KATL - Atlanta, USA" },
    { value: "OMDB", label: "OMDB - Dubai, UAE" },
    { value: "OTHH", label: "OTHH - Doha, Qatar" },
    { value: "RJTT", label: "RJTT - Tokyo, Japan" },
    { value: "YSSY", label: "YSSY - Sydney, Australia" },
    { value: "NZAA", label: "NZAA - Auckland, New Zealand" },
    { value: "ZSPD", label: "ZSPD - Shanghai, China" },
    { value: "ZBAA", label: "ZBAA - Beijing, China" },
    { value: "VHHH", label: "VHHH - Hong Kong, Hong Kong SAR" },
    { value: "EDDF", label: "EDDF - Frankfurt, Germany" },
    { value: "EHAM", label: "EHAM - Amsterdam, Netherlands" },
    { value: "LFPG", label: "LFPG - Paris, France" },
    { value: "FACT", label: "FACT - Cape Town, South Africa" },
    { value: "FAOR", label: "FAOR - Johannesburg, South Africa" },
    { value: "CYYZ", label: "CYYZ - Toronto, Canada" },
    { value: "SBGR", label: "SBGR - Sao Paulo, Brazil" },
    { value: "UUEE", label: "UUEE - Moscow, Russia" },
];

export default function Aviation() {
    const [form, setForm] = useState(DEFAULT);
    const [optimisedScore, setOptimisedScore] = useState<number | null>(null);
    const [is3D, setIs3D] = useState(false);
    const [apiKey] = useState(() => localStorage.getItem("groq_api_key") || "");
    const m = useMutation({ mutationFn: analyzeAviation });

    const upd = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }));

    const result: any = m.data;
    const radarData = result?.dimensions?.map((d: any) => ({ subject: d.name, score: d.score, fullMark: 100 })) ?? [];
    const shapData = result?.top_factors?.map((f: any) => ({ name: f.name, delta: f.delta, fill: "#ef4444" })) ?? [];

    return (
        <AppLayout title="Aviation Risk">
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in">

                {/* ── LEFT: Form ──────────────────────────────────────────── */}
                <div className="lg:col-span-4 flex flex-col gap-5">
                    <div className="card p-5">
                        <div className="flex items-center gap-2 mb-5">
                            <span className="p-2 bg-teal-50 text-teal-600 rounded-lg border border-teal-100 ms text-xl shadow-sm">flight</span>
                            <h2 className="section-title"><span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-800 to-teal-500">Flight Parameters</span></h2>
                        </div>
                        <div className="flex flex-col gap-4">
                            {[
                                { label: "Origin ICAO", key: "origin_icao", opts: AIRPORT_OPTIONS },
                                { label: "Destination ICAO", key: "destination_icao", opts: AIRPORT_OPTIONS },
                                { label: "Aircraft Type", key: "aircraft_type", opts: ["Boeing 777-300ER", "Airbus A350-900", "Boeing 747-8F", "Airbus A330-200"].map(v => ({ value: v, label: v })) },
                                { label: "Cargo Type", key: "cargo_type", opts: ["Passenger & Belly Cargo", "General Freight", "High-Value Goods", "Perishables", "Live Animals"].map(v => ({ value: v, label: v })) },
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
                                <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Insured Value (USD)</label>
                                <input className="input-field" type="number" placeholder="150000000"
                                    value={form.insured_value_usd}
                                    onChange={e => upd("insured_value_usd", Number(e.target.value))} />
                            </div>
                            <button className="btn-primary mt-1" onClick={() => { m.mutate(form); setOptimisedScore(null); }} disabled={m.isPending}>
                                {m.isPending ? (
                                    <><span className="ms text-base animate-spin">autorenew</span>Analyzing…</>
                                ) : (
                                    <><span className="ms text-base">analytics</span>Analyze Flight Risk</>
                                )}
                            </button>
                        </div>
                    </div>

                    {result && <UnderwriterChecklist mitigations={MITIGATIONS} baseScore={result.overall_score} onOptimized={setOptimisedScore} />}
                    <OptimisedScorePill score={optimisedScore} />
                </div>

                {/* ── RIGHT: Results ──────────────────────────────────────── */}
                <div className="lg:col-span-8 flex flex-col gap-5">
                    {!result && !m.isPending && (
                        <div className="card p-12 flex flex-col items-center justify-center gap-4 text-center">
                            <span className="ms text-[56px] text-gray-200">flight_takeoff</span>
                            <p className="text-text-muted text-sm max-w-xs">Enter flight parameters on the left and click <strong>Analyze</strong> to generate a risk assessment.</p>
                        </div>
                    )}

                    {m.isPending && (
                        <div className="card p-12 flex flex-col items-center justify-center gap-3">
                            <span className="ms text-[40px] text-primary animate-spin">autorenew</span>
                            <p className="text-text-muted text-sm">Running risk models…</p>
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
                                        <span className="text-sm text-text-muted font-medium">{result.route ? result.route.join(' → ') : `${result.origin} → ${result.destination}`}</span>
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

                            <AISummaryBlock module="aviation" result={result} apiKey={apiKey}
                                borderColor="border-indigo-400" iconColor="text-indigo-500"
                                placeholder='Click "Generate" to get an AI-written underwriting narrative for this flight.' />

                            <div className="card p-5">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="section-title"><span className="ms text-teal-500 drop-shadow-sm">map</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-800 to-teal-500">Route Map</span></h3>
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
                                    ? <AviationRiskMap3D origin={result.origin} destination={result.destination} riskLevel={result.risk_level} routePreference={form.route_preference} height={280} routePath={result.route} />
                                    : <AviationRiskMap origin={result.origin} destination={result.destination} riskLevel={result.risk_level} routePreference={form.route_preference} height={280} routePath={result.route} />
                                }
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-800 to-teal-500">Risk Dimensions</span></h3>
                                    <div className="flex flex-col gap-3">
                                        {result.dimensions.map((d: any) => (
                                            <div key={d.name} className="flex flex-col gap-1.5">
                                                <div className="flex justify-between text-sm font-medium">
                                                    <span className="text-text-main">{d.name}</span>
                                                    <span className="font-mono" style={{ color: d.color }}>{d.score.toFixed(1)}</span>
                                                </div>
                                                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-700"
                                                        style={{ width: `${d.score}%`, background: d.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-teal-500 drop-shadow-sm">radar</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-teal-800 to-teal-500">Dimension Radar</span></h3>
                                    <div style={{ height: 220 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <RadarChart data={radarData}>
                                                <PolarGrid stroke="#e5e7eb" />
                                                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#6b7280" }} />
                                                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                                <Radar name="Score" dataKey="score" stroke="#0d9488" fill="#0d9488" fillOpacity={0.2} strokeWidth={2} />
                                            </RadarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {shapData.length > 0 && (
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-rose-500 drop-shadow-sm">bar_chart</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-800 to-rose-500">Score Driver Analysis (SHAP)</span></h3>
                                    <div style={{ height: 180 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={shapData} layout="vertical" margin={{ left: 8, right: 30, top: 4, bottom: 4 }}>
                                                <CartesianGrid strokeDasharray="4 4" stroke="#f0f0f0" horizontal={false} />
                                                <XAxis type="number" tick={{ fontSize: 11 }} unit=" pts" />
                                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} width={160} />
                                                <Tooltip formatter={(v: any) => [`+${v} pts`, "Risk Impact"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                                                <Bar dataKey="delta" radius={[0, 6, 6, 0]}>
                                                    {shapData.map((_: any, i: number) => <Cell key={i} fill="#ef4444" />)}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="card p-5">
                                    <h3 className="section-title mb-4"><span className="ms text-rose-500 drop-shadow-sm">warning</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-800 to-rose-500">Top Risk Factors</span></h3>
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
                                    <h3 className="section-title mb-4"><span className="ms text-emerald-500 drop-shadow-sm">tips_and_updates</span><span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-800 to-emerald-500">Mitigation Suggestions</span></h3>
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
