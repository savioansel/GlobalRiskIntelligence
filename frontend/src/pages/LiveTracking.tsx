import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { AppLayout } from "../App";
import { RiskBadge } from "../components/shared";
import { useAisSubscription } from "../hooks/useAisSubscription";
import type { VesselData, AISAlertData } from "../hooks/useAisSubscription";
import { getAisExposure } from "../api";

// ── Zone data (inlined to avoid heavy RiskMap imports) ──────────────────────
const ZONES = [
    { name: "Strait of Hormuz", lat: 26.6, lng: 56.3, radiusKm: 250, color: "#ef4444", opacity: 0.18, type: "CRITICAL", reason: "US/Israel strikes on Iran — tanker traffic collapsed, GPS jamming 1,100+ ships" },
    { name: "Red Sea / Bab el-Mandeb", lat: 15.0, lng: 42.5, radiusKm: 450, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Houthi attacks ongoing, ceasefire fragile, vessels being targeted" },
    { name: "Gulf of Aden", lat: 11.5, lng: 48.5, radiusKm: 380, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Houthi + Somali piracy overlap, hijackings since late 2023" },
    { name: "Black Sea", lat: 43.5, lng: 34.0, radiusKm: 300, color: "#f97316", opacity: 0.14, type: "HIGH", reason: "Ukraine-Russia conflict, drone strikes on tankers" },
    { name: "Gulf of Guinea", lat: 2.0, lng: 5.0, radiusKm: 500, color: "#f97316", opacity: 0.12, type: "HIGH", reason: "Piracy, kidnapping for ransom" },
    { name: "Strait of Malacca", lat: 3.0, lng: 100.0, radiusKm: 300, color: "#f97316", opacity: 0.14, type: "HIGH", reason: "Armed piracy incidents rising" },
    { name: "South China Sea", lat: 12.0, lng: 114.0, radiusKm: 700, color: "#f59e0b", opacity: 0.12, type: "ELEVATED", reason: "Territorial disputes near Spratly Islands" },
];

// ── Severity Helpers ────────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
    CRITICAL: "#ef4444", HIGH: "#f97316", MEDIUM: "#f59e0b", LOW: "#10b981",
};
const SEV_BG: Record<string, string> = {
    CRITICAL: "bg-rose-50 border-rose-200", HIGH: "bg-orange-50 border-orange-200",
    MEDIUM: "bg-amber-50 border-amber-200", LOW: "bg-emerald-50 border-emerald-200",
};
const STATUS_COLOR: Record<string, string> = {
    underway: "#10b981", anchored: "#f59e0b", moored: "#6366f1", sos: "#ef4444",
};
const TYPE_LABEL: Record<string, string> = {
    war_risk: "WAR RISK", deviation: "DEVIATION", emergency: "EMERGENCY",
    spoofing: "AIS SPOOFING", next_policy: "NEXT POLICY", reinsurance: "REINSURANCE EXPOSURE",
};
const TYPE_ICON: Record<string, string> = {
    war_risk: "shield", deviation: "alt_route", emergency: "sos",
    spoofing: "gpp_bad", next_policy: "policy", reinsurance: "account_balance",
};

// ── Vessel Icon Builder ─────────────────────────────────────────────────────
function makeVesselIcon(heading: number, color: string, label: string): L.DivIcon {
    return L.divIcon({
        html: `<div style="position:relative;width:28px;height:28px;">
            <svg viewBox="0 0 24 24" width="28" height="28" style="transform:rotate(${heading}deg);filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
                <path d="M12 2 L18 20 L12 16 L6 20 Z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
            </svg>
            <div style="position:absolute;top:28px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:9px;font-weight:700;color:#0f172a;text-shadow:1px 1px 2px #fff,-1px -1px 2px #fff;pointer-events:none;">${label.split(" ").slice(0, 2).join(" ")}</div>
        </div>`,
        className: "",
        iconSize: [28, 42],
        iconAnchor: [14, 14],
    });
}

function vesselPopupContent(v: VesselData): string {
    const cargo = v.voyage_context?.cargo_value_usd
        ? `$${(v.voyage_context.cargo_value_usd / 1e6).toFixed(0)}M`
        : "N/A";
    return `
        <div style="font-family:Inter,sans-serif;min-width:200px;">
            <div style="font-weight:800;font-size:14px;margin-bottom:4px;">${v.vessel_name || v.mmsi}</div>
            <div style="font-size:11px;color:#64748b;margin-bottom:8px;">MMSI: ${v.mmsi}</div>
            <table style="font-size:12px;width:100%;border-collapse:collapse;">
                <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Speed</td><td style="font-weight:600;">${v.speed_kn?.toFixed(1) ?? "—"} kn</td></tr>
                <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Course</td><td style="font-weight:600;">${v.course?.toFixed(0) ?? "—"}°</td></tr>
                <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Status</td><td style="font-weight:600;color:${STATUS_COLOR[v.status] || '#6b7280'};text-transform:uppercase;">${v.status}</td></tr>
                <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Destination</td><td style="font-weight:600;">${v.destination || "—"}</td></tr>
                <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Cargo</td><td style="font-weight:600;">${cargo}</td></tr>
                <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Voyage</td><td style="font-weight:600;">${v.voyage_id || "—"}</td></tr>
            </table>
            ${v.next_policy_flag ? '<div style="margin-top:6px;padding:4px 8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:10px;font-weight:700;color:#dc2626;">⚠ FLAGGED FOR NEXT POLICY REVIEW</div>' : ""}
        </div>
    `;
}

// ── Vessel Marker Layer (Leaflet-ref based, no React re-renders) ───────────
function VesselMarkers({ vessels }: { vessels: Map<string, VesselData> }) {
    const map = useMap();
    const markersRef = useRef<Map<string, L.Marker>>(new Map());
    const tracksRef = useRef<Map<string, L.Polyline>>(new Map());
    const posHistoryRef = useRef<Map<string, [number, number][]>>(new Map());

    useEffect(() => {
        const interval = setInterval(() => {
            vessels.forEach((v, mmsi) => {
                const pos: L.LatLngExpression = [v.lat, v.lon];
                const color = STATUS_COLOR[v.status] || "#6b7280";

                if (!posHistoryRef.current.has(mmsi)) posHistoryRef.current.set(mmsi, []);
                const hist = posHistoryRef.current.get(mmsi)!;
                hist.push([v.lat, v.lon]);
                if (hist.length > 30) hist.shift();

                let marker = markersRef.current.get(mmsi);
                if (marker) {
                    marker.setLatLng(pos);
                    marker.setIcon(makeVesselIcon(v.heading, color, v.vessel_name || v.mmsi));
                } else {
                    marker = L.marker(pos, {
                        icon: makeVesselIcon(v.heading, color, v.vessel_name || v.mmsi),
                    });
                    marker.bindPopup(() => vesselPopupContent(v));
                    marker.addTo(map);
                    markersRef.current.set(mmsi, marker);
                }

                let track = tracksRef.current.get(mmsi);
                if (track) {
                    track.setLatLngs(hist);
                } else {
                    track = L.polyline(hist, { color, weight: 2, opacity: 0.5, dashArray: "4 4" });
                    track.addTo(map);
                    tracksRef.current.set(mmsi, track);
                }
            });
        }, 500);

        return () => {
            clearInterval(interval);
            markersRef.current.forEach(m => m.remove());
            tracksRef.current.forEach(t => t.remove());
            markersRef.current.clear();
            tracksRef.current.clear();
        };
    }, [map, vessels]);

    return null;
}

// ── Map Pan Helper ──────────────────────────────────────────────────────────
function MapPanner({ target }: { target: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
        if (target) map.flyTo(target, 6, { duration: 1.2 });
    }, [target, map]);
    return null;
}

// ── Alert Card ──────────────────────────────────────────────────────────────
function AlertCard({ alert, onLocate }: { alert: AISAlertData; onLocate: (lat: number, lon: number) => void }) {
    const [expanded, setExpanded] = useState(false);
    const barColor = SEV_COLOR[alert.severity] || "#6b7280";

    return (
        <div
            className={`bg-white rounded-xl border shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden ${SEV_BG[alert.severity] || ""}`}
            onClick={() => {
                if (alert.location?.lat && alert.location?.lon) onLocate(alert.location.lat, alert.location.lon);
            }}
        >
            <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: barColor }} />
            <div className="p-3 pl-4">
                <div className="flex justify-between items-start mb-1">
                    <div className="flex items-center gap-2">
                        <span className="ms text-[16px]" style={{ color: barColor }}>{TYPE_ICON[alert.type] || "warning"}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: barColor }}>{TYPE_LABEL[alert.type] || alert.type}</span>
                    </div>
                    <RiskBadge level={alert.severity} />
                </div>
                <p className="text-[12px] font-medium text-text-main leading-relaxed mt-1">{alert.msg}</p>
                <div className="flex justify-between items-center mt-2">
                    <span className="text-[10px] text-gray-400 font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    {alert.evidence && alert.evidence.length > 0 && (
                        <button className="text-[10px] text-primary font-semibold hover:underline" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
                            {expanded ? "Hide" : "Show"} evidence ({alert.evidence.length})
                        </button>
                    )}
                </div>
                {expanded && alert.evidence && alert.evidence.length > 0 && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-lg text-[10px] font-mono text-gray-600 max-h-24 overflow-auto">
                        {alert.evidence.map((e: any, i: number) => (<div key={i}>{JSON.stringify(e)}</div>))}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Portfolio Exposure Widget ───────────────────────────────────────────────
function ExposurePanel() {
    const { data } = useQuery({
        queryKey: ["ais-exposure"],
        queryFn: getAisExposure,
        refetchInterval: 5000,
    });

    const zones = data?.exposure || [];
    if (zones.length === 0) {
        return (
            <div className="card p-4">
                <h3 className="section-title mb-3">
                    <span className="ms text-amber-500">account_balance</span>
                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-700 to-amber-500">Live Portfolio Exposure</span>
                </h3>
                <p className="text-xs text-gray-400 text-center py-4">No active exposure data yet</p>
            </div>
        );
    }

    return (
        <div className="card p-4">
            <h3 className="section-title mb-3">
                <span className="ms text-amber-500">account_balance</span>
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-700 to-amber-500">Live Portfolio Exposure</span>
            </h3>
            <div className="space-y-2">
                {zones.map((z: any) => (
                    <div key={z.zone} className="flex items-center justify-between p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-text-main truncate">{z.zone}</p>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                    <span className="ms text-[12px]">sailing</span>{z.vessel_count} vessels
                                </span>
                                {z.cargo_usd > 0 && (
                                    <span className="text-[10px] text-gray-500 flex items-center gap-1">
                                        <span className="ms text-[12px]">payments</span>${(z.cargo_usd / 1e6).toFixed(0)}M
                                    </span>
                                )}
                            </div>
                        </div>
                        {z.alert_count > 0 && (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-full border border-rose-200">
                                {z.alert_count} ⚠
                            </span>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function LiveTracking() {
    const { vessels, alerts, connected, vesselCount } = useAisSubscription();
    const [sevFilter, setSevFilter] = useState<string>("ALL");
    const [panTarget, setPanTarget] = useState<[number, number] | null>(null);

    // Toast for new alerts
    const lastAlertCount = useRef(0);
    useEffect(() => {
        if (alerts.length > lastAlertCount.current && lastAlertCount.current > 0) {
            const newest = alerts[0];
            if (newest) {
                const icon = newest.severity === "CRITICAL" ? "🚨" : newest.severity === "HIGH" ? "⚠️" : "ℹ️";
                toast(`${icon} ${TYPE_LABEL[newest.type] || newest.type}: ${newest.msg.slice(0, 80)}...`, {
                    duration: 5000,
                    style: { borderLeft: `4px solid ${SEV_COLOR[newest.severity]}`, fontSize: "12px", maxWidth: "420px" },
                });
            }
        }
        lastAlertCount.current = alerts.length;
    }, [alerts]);

    const filteredAlerts = useMemo(() => {
        if (sevFilter === "ALL") return alerts;
        return alerts.filter(a => a.severity === sevFilter);
    }, [alerts, sevFilter]);

    const onLocateAlert = useCallback((lat: number, lon: number) => {
        setPanTarget([lat, lon]);
    }, []);

    const critCount = alerts.filter(a => a.severity === "CRITICAL").length;
    const highCount = alerts.filter(a => a.severity === "HIGH").length;

    return (
        <AppLayout title="Live AIS Tracking" breadcrumb="Real-time Monitoring">
            <div className="max-w-[1600px] mx-auto flex flex-col gap-5 animate-fade-in">

                {/* ── Stats Bar ─────────────────────────────────────────── */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-4">
                        <h2 className="font-display font-bold text-xl text-text-main flex items-center gap-2">
                            <span className="ms text-blue-500">radar</span>
                            Live Vessel Tracking
                        </h2>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${connected ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                            <span className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                            {connected ? "CONNECTED" : "RECONNECTING…"}
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="ms text-blue-400 text-base">sailing</span>
                            <span className="font-mono font-bold text-text-main">{vesselCount}</span>
                            <span className="text-text-muted text-xs">vessels</span>
                        </div>
                        {critCount > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-50 text-rose-700 rounded-full text-[10px] font-bold border border-rose-200">
                                <span className="ms text-[12px]">warning</span>{critCount} CRITICAL
                            </div>
                        )}
                        {highCount > 0 && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full text-[10px] font-bold border border-orange-200">
                                <span className="ms text-[12px]">error</span>{highCount} HIGH
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Map + Alert Center ────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

                    {/* Map */}
                    <div className="lg:col-span-8 card overflow-hidden flex flex-col" style={{ height: 560 }}>
                        <div className="px-5 py-3 border-b border-border-col flex items-center gap-3">
                            <h3 className="section-title">
                                <span className="ms text-blue-500">map</span>
                                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-800 to-blue-500">Vessel Positions</span>
                            </h3>
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[10px] font-mono font-bold flex items-center gap-1 border border-emerald-100">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                LIVE
                            </span>
                        </div>
                        <div className="flex-1" style={{ minHeight: 0 }}>
                            <MapContainer
                                center={[20, 50]}
                                zoom={3}
                                style={{ height: "100%", width: "100%", zIndex: 1 }}
                                scrollWheelZoom={true}
                                worldCopyJump
                            >
                                <TileLayer
                                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                                    attribution="© CartoDB"
                                />

                                {/* War Zones */}
                                {ZONES.map(z => (
                                    <Circle
                                        key={z.name}
                                        center={[z.lat, z.lng]}
                                        radius={z.radiusKm * 1000}
                                        pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: z.opacity, weight: 1.5, dashArray: "4 4" }}
                                    >
                                        <Popup className="font-sans text-sm" maxWidth={250}>
                                            <strong>{z.name}</strong><br />
                                            ⚠️ {z.type} Risk Zone<br />
                                            <span className="text-xs text-slate-500 mt-1 block">{z.reason}</span>
                                        </Popup>
                                    </Circle>
                                ))}

                                {/* Alert location pings */}
                                {alerts.filter(a => a.location?.lat).slice(0, 20).map(a => (
                                    <CircleMarker
                                        key={a.alert_id}
                                        center={[a.location.lat, a.location.lon]}
                                        radius={8}
                                        pathOptions={{ color: SEV_COLOR[a.severity] || "#6b7280", fillColor: SEV_COLOR[a.severity] || "#6b7280", fillOpacity: 0.3, weight: 2, dashArray: "3 3" }}
                                    >
                                        <Popup className="font-sans text-xs">
                                            <strong>{TYPE_LABEL[a.type] || a.type}</strong><br />
                                            {a.msg}
                                        </Popup>
                                    </CircleMarker>
                                ))}

                                <VesselMarkers vessels={vessels} />
                                <MapPanner target={panTarget} />
                            </MapContainer>
                        </div>
                    </div>

                    {/* Alert Center */}
                    <div className="lg:col-span-4 card flex flex-col" style={{ height: 560 }}>
                        <div className="px-5 py-3 border-b border-border-col">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="section-title">
                                    <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                                    <span className="bg-clip-text text-transparent bg-gradient-to-r from-rose-700 to-rose-500">Alert Center</span>
                                </h3>
                                <span className="text-[11px] font-mono text-gray-400">{alerts.length} total</span>
                            </div>
                            <div className="flex gap-1">
                                {["ALL", "CRITICAL", "HIGH", "MEDIUM"].map(sev => (
                                    <button
                                        key={sev}
                                        onClick={() => setSevFilter(sev)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${sevFilter === sev
                                            ? "bg-white shadow-sm text-text-main border-gray-300"
                                            : "text-gray-400 border-transparent hover:bg-gray-100"
                                            }`}
                                    >
                                        {sev}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/50">
                            {filteredAlerts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-300">
                                    <span className="ms text-5xl mb-2">notifications_none</span>
                                    <p className="text-sm text-gray-400">No alerts yet</p>
                                    <p className="text-[11px] text-gray-300 mt-1">Run the demo generator to see alerts</p>
                                </div>
                            ) : (
                                filteredAlerts.map(a => (
                                    <AlertCard key={a.alert_id} alert={a} onLocate={onLocateAlert} />
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Bottom: Exposure + Timeline ──────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    <div className="lg:col-span-4">
                        <ExposurePanel />
                    </div>

                    <div className="lg:col-span-8 card p-4" style={{ maxHeight: 300 }}>
                        <h3 className="section-title mb-3">
                            <span className="ms text-indigo-500">timeline</span>
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-indigo-500">Event Timeline</span>
                        </h3>
                        <div className="overflow-y-auto space-y-1" style={{ maxHeight: 220 }}>
                            {alerts.slice(0, 30).map((a, i) => (
                                <div key={a.alert_id} className="flex items-start gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors">
                                    <div className="flex flex-col items-center">
                                        <div className="w-2.5 h-2.5 rounded-full border-2 mt-1" style={{
                                            borderColor: SEV_COLOR[a.severity],
                                            backgroundColor: i === 0 ? SEV_COLOR[a.severity] : "transparent",
                                        }} />
                                        {i < Math.min(alerts.length, 30) - 1 && <div className="w-px h-6 bg-gray-200 mt-1" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: SEV_COLOR[a.severity] }}>{TYPE_LABEL[a.type] || a.type}</span>
                                            <span className="text-[9px] text-gray-400 font-mono">{new Date(a.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-600 truncate">{a.msg}</p>
                                    </div>
                                </div>
                            ))}
                            {alerts.length === 0 && (
                                <p className="text-sm text-gray-400 text-center py-8">Timeline will populate as events occur</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
