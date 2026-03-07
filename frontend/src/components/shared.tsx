import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAISummary } from "../api";

// ── Risk Badge ────────────────────────────────────────────────────────────────
const BADGE_CLS: Record<string, string> = {
    CRITICAL: "badge-critical", HIGH: "badge-high",
    ELEVATED: "badge-elevated", WARNING: "badge-elevated",
    LOW: "badge-low", NORMAL: "badge-normal",
};

export function RiskBadge({ level }: { level: string }) {
    return (
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${BADGE_CLS[level] ?? "badge-normal"}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />{level}
        </span>
    );
}

// ── Score Ring / Gauge ─────────────────────────────────────────────────────────
export function ScoreGauge({ score, size = 128 }: { score: number; size?: number }) {
    const color = score >= 75 ? "#ef4444" : score >= 55 ? "#f97316" : score >= 30 ? "#f59e0b" : "#10b981";
    const pct = Math.min(score, 100);
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative" style={{ width: size, height: size }}>
                <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="10"
                        strokeDasharray={`${(pct / 100) * 314} 314`} strokeLinecap="round"
                        style={{ transition: "stroke-dasharray 0.6s ease" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-mono font-[800] text-[26px] leading-tight" style={{ color }}>{score.toFixed(0)}</span>
                    <span className="text-[10px] text-text-muted font-medium">/ 100</span>
                </div>
            </div>
        </div>
    );
}

// ── Underwriter Checklist ─────────────────────────────────────────────────────
export type Mitigation = { id: string; label: string; savings: number };

export function UnderwriterChecklist({ mitigations, baseScore, onOptimized }: {
    mitigations: Mitigation[]; baseScore: number; onOptimized: (s: number) => void;
}) {
    const [checked, setChecked] = useState<Record<string, boolean>>({});
    const toggle = (id: string) => {
        setChecked(prev => {
            const next = { ...prev, [id]: !prev[id] };
            const savings = mitigations.filter(m => next[m.id]).reduce((a, m) => a + m.savings, 0);
            onOptimized(Math.max(0, baseScore - savings));
            return next;
        });
    };
    const totalSavings = mitigations.filter(m => checked[m.id]).reduce((a, m) => a + m.savings, 0);
    return (
        <div className="card p-5">
            <h3 className="section-title mb-1"><span className="ms text-emerald-500">checklist</span>Underwriter Checklist</h3>
            <p className="text-xs text-text-muted mb-4">Check mitigations to recalculate optimised risk score.</p>
            <div className="flex flex-col gap-3">
                {mitigations.map(m => (
                    <label key={m.id} className="flex items-start gap-3 cursor-pointer group">
                        <input type="checkbox" className="mt-0.5 accent-emerald-500 w-4 h-4 shrink-0"
                            checked={!!checked[m.id]} onChange={() => toggle(m.id)} />
                        <div className="flex-1">
                            <span className="text-sm text-text-main group-hover:text-primary transition-colors">{m.label}</span>
                            <span className="ml-2 text-[11px] font-mono text-emerald-600 font-semibold">−{m.savings} pts</span>
                        </div>
                    </label>
                ))}
            </div>
            {totalSavings > 0 && (
                <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex justify-between items-center">
                    <span className="text-sm font-semibold text-emerald-700">Optimised Score</span>
                    <span className="font-mono font-[800] text-emerald-700 text-lg">{Math.max(0, baseScore - totalSavings).toFixed(0)} / 100</span>
                </div>
            )}
        </div>
    );
}

// ── AI Summary Block ──────────────────────────────────────────────────────────
export function AISummaryBlock({ module, result, apiKey, borderColor = "border-indigo-400", iconColor = "text-indigo-500", placeholder }: {
    module: string; result: any; apiKey: string;
    borderColor?: string; iconColor?: string; placeholder?: string;
}) {
    const [summary, setSummary] = useState<string | null>(null);
    const [genBy, setGenBy] = useState("");
    const m = useMutation({
        mutationFn: () => getAISummary({
            module,
            risk_score: result.overall_score,
            risk_level: result.risk_level,
            origin: result.origin,
            destination: result.destination,
            top_factors: result.top_factors,
            api_key: apiKey || undefined,
        }),
        onSuccess(data) { setSummary(data.summary); setGenBy(data.generated_by); },
    });
    return (
        <div className={`card p-5 border-l-4 ${borderColor}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="section-title"><span className={`ms ${iconColor}`}>auto_awesome</span>AI Executive Summary</h3>
                {!summary && (
                    <button className="btn-primary text-xs py-1.5 px-3" onClick={() => m.mutate()} disabled={m.isPending}>
                        {m.isPending ? <><span className="ms text-sm animate-spin">autorenew</span>Generating…</> : <><span className="ms text-sm">smart_toy</span>Generate</>}
                    </button>
                )}
            </div>
            {summary ? (
                <div className="space-y-2">
                    {summary.split("\n\n").map((para, i) => (
                        <p key={i} className="text-sm text-text-main leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                    ))}
                    <p className="text-[10px] text-text-muted mt-2">via {genBy === "groq" ? "Groq Llama 3.3" : genBy === "error" ? "System Error" : "template fallback"}</p>
                    <button className="text-xs text-primary hover:underline mt-1" onClick={() => { setSummary(null); m.reset(); }}>Regenerate</button>
                </div>
            ) : (
                <p className="text-sm text-text-muted italic">{placeholder ?? `Click "Generate" to get an AI-written underwriting narrative.`}</p>
            )}
        </div>
    );
}

// ── Optimised Score Pill ──────────────────────────────────────────────────────
export function OptimisedScorePill({ score }: { score: number | null }) {
    if (score === null) return null;
    return (
        <div className="card p-4 bg-emerald-50/80 border border-emerald-200 flex items-center gap-3">
            <span className="ms text-emerald-500 text-2xl">check_circle</span>
            <div>
                <p className="text-xs text-emerald-700 font-semibold uppercase tracking-wide">Optimised Score</p>
                <p className="font-mono font-[800] text-2xl text-emerald-700">{score.toFixed(0)}<span className="text-sm font-normal">/100</span></p>
            </div>
        </div>
    );
}
