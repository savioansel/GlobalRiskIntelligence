import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { simulateScenario } from "../api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface ScenarioResult {
    overall_risk_score: number;
    risk_level: string;
    risk_breakdown: {
        weather_risk: number;
        geopolitical_risk: number;
        piracy_risk: number;
        infrastructure_risk: number;
        cargo_specific_risk: number;
    };
    estimated_loss_exposure: string;
    recommended_coverage: string[];
    coverage_gaps: string[];
    recommended_actions: string[];
    executive_summary: string;
    raw_text?: string;
    error?: string;
}

export function RiskScenarioSimulator() {
    const [formData, setFormData] = useState({
        transport_mode: "Maritime",
        origin: "",
        destination: "",
        cargo_type: "General Goods",
        cargo_value: "",
        departure_date: "",
        risk_event: ""
    });
    const [result, setResult] = useState<ScenarioResult | null>(null);

    const mutation = useMutation({
        mutationFn: async (data: typeof formData) => {
            const apiKey = localStorage.getItem("groq_api_key");
            return simulateScenario({
                ...data,
                cargo_value: parseFloat(data.cargo_value) || 0,
                api_key: apiKey
            });
        },
        onSuccess: (data) => {
            if (data.error) {
                alert(data.error);
                if (data.raw_text) setResult(data); // Show fallback if parsing failed
            } else {
                setResult(data);
            }
        },
        onError: (err) => {
            alert("Simulation failed: " + err);
        }
    });

    const handleSimulate = () => {
        if (!formData.origin || !formData.destination || !formData.cargo_value) {
            alert("Origin, Destination, and Cargo Value are required.");
            return;
        }
        mutation.mutate(formData);
    };

    const getRiskColor = (score: number) => {
        if (score >= 80) return "#7c3aed"; // critical purple
        if (score >= 60) return "#ef4444"; // red
        if (score >= 40) return "#f59e0b"; // amber
        return "#10b981"; // green
    };

    const chartData = result?.risk_breakdown ? [
        { name: "Weather", score: result.risk_breakdown.weather_risk },
        { name: "Geo-Politics", score: result.risk_breakdown.geopolitical_risk },
        { name: "Piracy/Theft", score: result.risk_breakdown.piracy_risk },
        { name: "Infrastructure", score: result.risk_breakdown.infrastructure_risk },
        { name: "Cargo", score: result.risk_breakdown.cargo_specific_risk }
    ] : [];

    return (
        <div className="card p-6 border border-primary/20 bg-gradient-to-b from-white to-slate-50 mb-6">
            <div className="flex gap-3 items-center mb-6 border-b pb-4">
                <span className="ms text-blue-600 text-[24px]">policy</span>
                <div>
                    <h2 className="section-title text-xl">Cargo Risk Simulator</h2>
                    <p className="text-xs text-gray-500 mt-1">AI-powered underwriter scenario modeling</p>
                </div>
            </div>

            {/* Input Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Transport Mode</label>
                    <select
                        className="input-field mt-1 w-full"
                        value={formData.transport_mode}
                        onChange={e => setFormData({ ...formData, transport_mode: e.target.value })}
                    >
                        <option>Maritime</option>
                        <option>Aviation</option>
                        <option>Railway</option>
                        <option>Multimodal</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Cargo Type</label>
                    <select
                        className="input-field mt-1 w-full"
                        value={formData.cargo_type}
                        onChange={e => setFormData({ ...formData, cargo_type: e.target.value })}
                    >
                        <option>General Goods</option>
                        <option>Hazardous Materials</option>
                        <option>Perishables</option>
                        <option>Livestock</option>
                        <option>High-Value Electronics</option>
                        <option>Heavy Machinery</option>
                        <option>Oil & Gas</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Origin</label>
                    <input
                        type="text"
                        className="input-field mt-1 w-full"
                        placeholder="e.g. Port of Shanghai"
                        value={formData.origin}
                        onChange={e => setFormData({ ...formData, origin: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Destination</label>
                    <input
                        type="text"
                        className="input-field mt-1 w-full"
                        placeholder="e.g. Port of Rotterdam"
                        value={formData.destination}
                        onChange={e => setFormData({ ...formData, destination: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Cargo Value (USD)</label>
                    <input
                        type="number"
                        className="input-field mt-1 w-full"
                        placeholder="2500000"
                        value={formData.cargo_value}
                        onChange={e => setFormData({ ...formData, cargo_value: e.target.value })}
                    />
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-500 uppercase">Departure Date</label>
                    <input
                        type="date"
                        className="input-field mt-1 w-full"
                        value={formData.departure_date}
                        onChange={e => setFormData({ ...formData, departure_date: e.target.value })}
                    />
                </div>
                <div className="lg:col-span-2">
                    <label className="text-xs font-bold text-gray-500 uppercase">Specific Risk Event (Optional)</label>
                    <div className="flex gap-2 mt-1">
                        <input
                            type="text"
                            className="input-field flex-1"
                            placeholder="e.g. Typhoon forecast along South China Sea"
                            value={formData.risk_event}
                            onChange={e => setFormData({ ...formData, risk_event: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && handleSimulate()}
                        />
                        <button
                            onClick={handleSimulate}
                            disabled={mutation.isPending}
                            className="btn px-6 py-2 bg-[#0f172a] text-white font-semibold rounded-lg hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
                        >
                            {mutation.isPending ? <span className="ms animate-spin">autorenew</span> : <span className="ms text-[18px]">analytics</span>}
                            {mutation.isPending ? "Analyzing..." : "Analyze Risk"}
                        </button>
                    </div>
                </div>
            </div>

            {/* AI Results */}
            {result && (
                <div className="space-y-6 animate-fade-in border-t pt-6">
                    {result.raw_text && !result.risk_level ? (
                        <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800">
                            <h3 className="font-bold mb-2 flex items-center gap-2"><span className="ms">warning</span> Failed to parse structured JSON from AI. Raw output below:</h3>
                            <pre className="text-xs whitespace-pre-wrap font-mono">{result.raw_text}</pre>
                        </div>
                    ) : (
                        <>
                            {/* Top row: Dial, Chart, Loss */}
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                {/* Risk Score Dial/Gauge simulation */}
                                <div className="card p-6 flex flex-col items-center justify-center text-center bg-white shadow-sm border border-gray-100 relative overflow-hidden">
                                    <div className="absolute top-0 w-full h-1" style={{ backgroundColor: getRiskColor(result.overall_risk_score) }}></div>
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Overall Risk</h3>
                                    <div className="text-[56px] font-black leading-none mb-1" style={{ color: getRiskColor(result.overall_risk_score) }}>
                                        {result.overall_risk_score}
                                    </div>
                                    <div className="text-sm font-bold px-3 py-1 rounded-full uppercase tracking-widest"
                                        style={{ backgroundColor: `${getRiskColor(result.overall_risk_score)}15`, color: getRiskColor(result.overall_risk_score) }}>
                                        {result.risk_level}
                                    </div>
                                </div>

                                {/* Category Bars */}
                                <div className="lg:col-span-2 card p-5 bg-white shadow-sm border border-gray-100">
                                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Risk Breakdown</h3>
                                    <div style={{ height: 160 }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                                <XAxis type="number" domain={[0, 100]} hide />
                                                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#4b5563', fontWeight: 600 }} width={100} />
                                                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }} />
                                                <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={16}>
                                                    {chartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={getRiskColor(entry.score)} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Loss Exposure */}
                                <div className="card p-6 flex flex-col justify-center bg-slate-900 border-none relative overflow-hidden group">
                                    <div className="absolute right-[-10%] top-[-10%] opacity-10 ms text-[120px] text-white transition-transform group-hover:scale-110">attach_money</div>
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 relative z-10">Estimated Exposure</h3>
                                    <div className="text-2xl font-black text-white relative z-10 leading-tight">
                                        {result.estimated_loss_exposure}
                                    </div>
                                </div>
                            </div>

                            {/* Middle row: Cards */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-emerald-50 border border-emerald-200 p-5 rounded-xl">
                                    <h4 className="text-emerald-800 font-bold mb-3 flex items-center gap-2"><span className="ms text-emerald-600">verified_user</span> Recommended Coverage</h4>
                                    <ul className="space-y-2">
                                        {result.recommended_coverage.map((c, i) => (
                                            <li key={i} className="text-sm text-emerald-900 flex items-start gap-2">
                                                <span className="text-emerald-500 mt-0.5">•</span> {c}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-rose-50 border border-rose-200 p-5 rounded-xl">
                                    <h4 className="text-rose-800 font-bold mb-3 flex items-center gap-2"><span className="ms text-rose-600">health_and_safety</span> Coverage Gaps</h4>
                                    <ul className="space-y-2">
                                        {result.coverage_gaps.map((c, i) => (
                                            <li key={i} className="text-sm text-rose-900 flex items-start gap-2">
                                                <span className="text-rose-500 mt-0.5">•</span> {c}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="bg-amber-50 border border-amber-200 p-5 rounded-xl">
                                    <h4 className="text-amber-800 font-bold mb-3 flex items-center gap-2"><span className="ms text-amber-600">build</span> Recommended Actions</h4>
                                    <ul className="space-y-2">
                                        {result.recommended_actions.map((c, i) => (
                                            <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                                                <span className="text-amber-500 mt-0.5">•</span> {c}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Bottom: Executive Summary */}
                            <div className="card p-6 bg-white border border-gray-200">
                                <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <span className="ms text-blue-600">summarize</span> Executive Summary
                                </h3>
                                <p className="text-sm leading-relaxed text-slate-600">
                                    {result.executive_summary}
                                </p>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
