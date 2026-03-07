import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { getAISummary, aiChat } from "../api";
import { AppLayout } from "../App";
import { toast } from "react-hot-toast";

interface ChatMsg { role: "user" | "ai"; text: string; by?: string; }

const QUICK = [
    "Explain elevated Red Sea risk for maritime cargo",
    "What is BMP5 and why does it reduce maritime loading?",
    "How does Naxal corridor affect Indian railway insurance?",
    "Best practices for aviation hull & liability cross-border?",
];

const MODULES = ["aviation", "maritime", "railway"];

const EXAMPLE_SUMMARY = {
    aviation: {
        origin: "VABB", destination: "EGLL", risk_score: 62, risk_level: "ELEVATED", top_factors: [
            { name: "Conflict Zone Overflight", delta: 12, description: "Restricted airspace proximity." },
            { name: "Adverse Weather", delta: 8, description: "SIGMET turbulence FL320–FL380." },
        ]
    },
    maritime: {
        origin: "Mumbai", destination: "Rotterdam", risk_score: 78, risk_level: "HIGH", top_factors: [
            { name: "Red Sea / Houthi Threat", delta: 18, description: "Active Houthi drone zone." },
            { name: "Adverse Weather", delta: 9, description: "3–4m significant wave height." },
        ]
    },
    railway: {
        origin: "Delhi IGI", destination: "Mumbai CSMT", risk_score: 55, risk_level: "ELEVATED", top_factors: [
            { name: "Red Corridor Proximity", delta: 15, description: "LWE-affected zones." },
            { name: "Monsoon Flooding", delta: 10, description: "Bihar-Assam flood alerts." },
        ]
    },
};

function TypewriterMessage({ text }: { text: string }) {
    const [displayed, setDisplayed] = useState("");
    useEffect(() => {
        let i = 0;
        const timer = setInterval(() => {
            setDisplayed(text.substring(0, i));
            i += 5; // Type five chars at a time for fast streaming effect
            if (i > text.length) {
                setDisplayed(text);
                clearInterval(timer);
            }
        }, 10);
        return () => clearInterval(timer);
    }, [text]);

    return (
        <>
            {displayed.split("\n").map((line, j) => (
                <p key={j} className={j > 0 ? "mt-2" : ""}
                    dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
            ))}
        </>
    );
}

export default function AICenter() {
    const [chat, setChat] = useState<ChatMsg[]>([]);
    const [input, setInput] = useState("");
    const [apiKey, setApiKey] = useState(() => localStorage.getItem("groq_api_key") || "");
    const [selectedModule, setSelectedModule] = useState<"aviation" | "maritime" | "railway">("aviation");
    const chatBottom = useRef<HTMLDivElement>(null);

    const chatM = useMutation({
        mutationFn: (q: string) => aiChat({ question: q, api_key: apiKey || undefined }),
        onSuccess(data) {
            setChat(c => [...c, { role: "ai", text: data.summary, by: data.generated_by }]);
        },
        onError() {
            toast.error("Failed to fetch chat response");
        }
    });

    const summaryM = useMutation({
        mutationFn: () => {
            const ctx = EXAMPLE_SUMMARY[selectedModule];
            return getAISummary({ module: selectedModule, ...ctx, api_key: apiKey || undefined });
        },
        onSuccess(data) {
            setChat(c => [...c, {
                role: "ai",
                text: `**${selectedModule.toUpperCase()} Risk Summary** (${EXAMPLE_SUMMARY[selectedModule].risk_level} — ${EXAMPLE_SUMMARY[selectedModule].risk_score}/100)\n\n${data.summary}`,
                by: data.generated_by,
            }]);
            toast.success("Summary generated");
        },
        onError() {
            toast.error("Failed to generate summary");
        }
    });

    useEffect(() => {
        chatBottom.current?.scrollIntoView({ behavior: "smooth" });
    }, [chat]);

    const saveKey = () => {
        localStorage.setItem("groq_api_key", apiKey);
        toast.success("API Key saved");
    };

    const sendChat = () => {
        if (!input.trim()) return;
        const q = input.trim();
        setInput("");
        setChat(c => [...c, { role: "user", text: q }]);
        chatM.mutate(q);
    };

    const isLoading = chatM.isPending || summaryM.isPending;

    return (
        <AppLayout title="AI Center">
            <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-116px)] animate-fade-in">

                {/* ── Config sidebar ───────────────────────────────────────── */}
                <div className="lg:col-span-4 flex flex-col gap-5 overflow-y-auto">
                    {/* API Key */}
                    <div className="card p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-100 ms text-xl">key</span>
                            <h2 className="section-title">Groq API Key</h2>
                        </div>
                        <div className="flex flex-col gap-3">
                            <input className="input-field font-mono text-xs" type="password"
                                placeholder="Enter your Groq API key…"
                                value={apiKey} onChange={e => setApiKey(e.target.value)} />
                            <button onClick={saveKey} className="btn-primary text-sm py-2">
                                <span className="ms text-base">save</span>Save Key
                            </button>
                            <p className="text-[11px] text-text-muted">
                                Key is stored in <code>localStorage</code>. Without a key, the AI uses smart template fallbacks.
                            </p>
                        </div>
                    </div>

                    {/* Generate summary */}
                    <div className="card p-5">
                        <h3 className="section-title mb-4"><span className="ms text-primary">auto_awesome</span>Generate Risk Summary</h3>
                        <div className="flex flex-col gap-3">
                            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                                {MODULES.map(m => (
                                    <button key={m} onClick={() => setSelectedModule(m as any)}
                                        className={`flex-1 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${selectedModule === m ? "bg-white text-text-main shadow-sm" : "text-text-muted hover:text-text-main"}`}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                            <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-text-muted space-y-1">
                                <p>Module: <strong className="text-text-main capitalize">{selectedModule}</strong></p>
                                <p>Route: <strong className="text-text-main">{EXAMPLE_SUMMARY[selectedModule].origin} → {EXAMPLE_SUMMARY[selectedModule].destination}</strong></p>
                                <p>Risk: <strong className="text-text-main">{EXAMPLE_SUMMARY[selectedModule].risk_score}/100 ({EXAMPLE_SUMMARY[selectedModule].risk_level})</strong></p>
                            </div>
                            <button onClick={() => summaryM.mutate()} disabled={isLoading}
                                className="btn-primary text-sm py-2">
                                <span className="ms text-base">smart_toy</span>Generate AI Summary
                            </button>
                        </div>
                    </div>

                    {/* Quick questions */}
                    <div className="card p-5">
                        <h3 className="section-title mb-3"><span className="ms text-primary">tips_and_updates</span>Quick Questions</h3>
                        <div className="flex flex-col gap-2">
                            {QUICK.map((q, i) => (
                                <button key={i} disabled={isLoading}
                                    onClick={() => { setChat(c => [...c, { role: "user", text: q }]); chatM.mutate(q); }}
                                    className="text-left text-xs p-3 rounded-xl border border-border-col bg-gray-50/80 hover:bg-primary/5 hover:border-primary/30 transition-all text-text-muted hover:text-primary font-medium">
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Chat area ────────────────────────────────────────────── */}
                <div className="lg:col-span-8 flex flex-col card overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 border-b border-border-col flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-white">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-xl border border-indigo-200">
                            <span className="ms text-[22px]">smart_toy</span>
                        </div>
                        <div>
                            <h2 className="font-display font-bold text-text-main">GlobalRisk AI</h2>
                            <p className="text-[11px] text-text-muted">Powered by Groq Llama 3.3 (70B) Versatile · Transport Risk Intelligence</p>
                        </div>
                        <div className="ml-auto flex items-center gap-1.5 text-[11px] font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-emerald-600">Live</span>
                        </div>
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/40">
                        {chat.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                                <span className="ms text-[56px] text-gray-200">smart_toy</span>
                                <div>
                                    <p className="font-display font-semibold text-text-main">AI Intelligence Assistant</p>
                                    <p className="text-sm text-text-muted mt-1 max-w-xs">Ask questions about transport risk, generate summaries, or use the quick questions to get started.</p>
                                </div>
                            </div>
                        )}
                        {chat.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                {msg.role === "ai" && (
                                    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mr-2 mt-1">
                                        <span className="ms text-sm">smart_toy</span>
                                    </div>
                                )}
                                <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${msg.role === "user"
                                    ? "bg-primary text-white rounded-tr-sm"
                                    : "bg-white border border-gray-100 shadow-sm text-text-main rounded-tl-sm"
                                    }`}>
                                    {msg.role === "ai" ? (
                                        <TypewriterMessage text={msg.text} />
                                    ) : (
                                        msg.text.split("\n").map((line, j) => (
                                            <p key={j} className={j > 0 ? "mt-2" : ""}
                                                dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
                                        ))
                                    )}
                                    {msg.by && (
                                        <p className={`text-[10px] mt-2 ${msg.role === "user" ? "text-white/60" : msg.by === "error" ? "text-red-500 font-medium" : "text-text-muted"}`}>
                                            via {msg.by === "groq" ? "Groq Llama 3.3" : msg.by === "error" ? "System Error" : "template fallback"}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex justify-start">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mr-2">
                                    <span className="ms text-sm">smart_toy</span>
                                </div>
                                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                                    <div className="flex gap-1 items-center">
                                        {[0, 1, 2].map(d => (
                                            <div key={d} className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce"
                                                style={{ animationDelay: `${d * 0.15}s` }} />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={chatBottom} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-border-col bg-white">
                        <div className="flex gap-3 items-end">
                            <textarea
                                className="flex-1 resize-none input-field text-sm leading-relaxed min-h-[44px] max-h-[120px]"
                                placeholder="Ask about aviation, maritime, or railway risk…"
                                rows={1}
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
                            />
                            <button className="btn-primary px-4 py-2.5 shrink-0" onClick={sendChat} disabled={isLoading || !input.trim()}>
                                <span className="ms text-base">send</span>
                            </button>
                        </div>
                        <p className="text-[10px] text-text-muted mt-2">Press Enter to send · Shift+Enter for new line</p>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
