/**
 * VesselTrackerDemo.tsx
 *
 * Single-page demo app for tracking one vessel with live alerts.
 * Standalone application (accessible at /track)
 * Features:
 * - Connect to WebSocket or run in demo mode
 * - Filter by MMSI (text input)
 * - Real-time map with vessel marker, track polyline, war-risk zones
 * - Vessel info card with cargo, ETA, policy flag
 * - Alerts panel with severity coloring
 * - Simulation mode with realistic AIS pings
 * - Toast notifications for HIGH/CRITICAL alerts
 * - Click alert to center map on location
 * - Policy compliance & coverage lifecycle tracking
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, Circle, CircleMarker, Popup, useMap, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import toast from "react-hot-toast";
import { useDemoVesselTracker, type VesselState, type AlertState } from "../hooks/useDemoVesselTracker";
import { CoverageStatusBadge } from "../components/CoverageStatusBadge";

// ── Dynamic zones from backend ──────────────────────────────────────────────

// ── Color maps ──────────────────────────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#f59e0b",
  LOW: "#10b981",
};

const SEV_BG: Record<string, string> = {
  CRITICAL: "bg-rose-50 border-rose-200",
  HIGH: "bg-orange-50 border-orange-200",
  MEDIUM: "bg-amber-50 border-amber-200",
  LOW: "bg-emerald-50 border-emerald-200",
};

const STATUS_COLOR: Record<string, string> = {
  underway: "#10b981",
  anchored: "#f59e0b",
  moored: "#6366f1",
  sos: "#ef4444",
};

const TYPE_LABEL: Record<string, string> = {
  war_risk: "WAR RISK",
  deviation: "DEVIATION",
  emergency: "EMERGENCY",
  spoofing: "AIS SPOOFING",
  next_policy: "NEXT POLICY",
  reinsurance: "REINSURANCE EXPOSURE",
};

// ── Vessel Icon Builder ─────────────────────────────────────────────────────
function makeVesselIcon(heading: number, color: string): L.DivIcon {
  return L.divIcon({
    html: `
      <div style="position:relative;width:32px;height:32px;">
        <svg viewBox="0 0 24 24" width="32" height="32" style="transform:rotate(${heading}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));">
          <path d="M12 2 L20 22 L12 18 L4 22 Z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
          <circle cx="12" cy="10" r="2" fill="#fff" opacity="0.8"/>
        </svg>
      </div>
    `,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

// ── Vessel Marker Layer ─────────────────────────────────────────────────────
function VesselMarker({ vessel }: { vessel: VesselState | null }) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!vessel) return;

    const color = STATUS_COLOR[vessel.status] || "#6b7280";
    const pos: L.LatLngExpression = [vessel.lat, vessel.lon];

    if (markerRef.current) {
      markerRef.current.setLatLng(pos);
      markerRef.current.setIcon(makeVesselIcon(vessel.heading, color));
    } else {
      markerRef.current = L.marker(pos, { icon: makeVesselIcon(vessel.heading, color) });
      markerRef.current.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:200px;">
          <div style="font-weight:800;font-size:14px;margin-bottom:4px;">${vessel.vessel_name || vessel.mmsi}</div>
          <div style="font-size:11px;color:#64748b;margin-bottom:8px;">MMSI: ${vessel.mmsi}</div>
          <table style="font-size:12px;width:100%;border-collapse:collapse;">
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Speed</td><td style="font-weight:600;">${(vessel.speed_kn || 0).toFixed(1)} kn</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Course</td><td style="font-weight:600;">${(vessel.course || 0).toFixed(0)}°</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Status</td><td style="font-weight:600;color:${STATUS_COLOR[vessel.status] || '#6b7280'};text-transform:uppercase;">${vessel.status}</td></tr>
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Destination</td><td style="font-weight:600;">${vessel.destination || "—"}</td></tr>
            ${vessel.voyage_context?.cargo_value_usd ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0;">Cargo</td><td style="font-weight:600;">$${(vessel.voyage_context.cargo_value_usd / 1e6).toFixed(0)}M</td></tr>` : ""}
          </table>
          ${vessel.next_policy_flag ? '<div style="margin-top:6px;padding:4px 8px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:10px;font-weight:700;color:#dc2626;">⚠ FLAGGED FOR NEXT POLICY REVIEW</div>' : ""}
        </div>
      `);
      markerRef.current.addTo(map);
    }
  }, [vessel, map]);

  return null;
}

// ── Map Pan Helper ──────────────────────────────────────────────────────────
function MapPanner({ center, zoom }: { center: [number, number] | null; zoom: number }) {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center, zoom, map]);

  return null;
}

// ── Alert Card ──────────────────────────────────────────────────────────────
function AlertCard({
  alert,
  onLocate,
}: {
  alert: AlertState;
  onLocate: (lat: number, lon: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const barColor = SEV_COLOR[alert.severity] || "#6b7280";

  return (
    <div
      className={`bg-white rounded-lg border shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden ${SEV_BG[alert.severity] || ""}`}
      onClick={() => {
        if (alert.location?.lat && alert.location?.lon) {
          onLocate(alert.location.lat, alert.location.lon);
        }
      }}
    >
      <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: barColor }} />
      <div className="p-3 pl-4">
        <div className="flex justify-between items-start mb-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: barColor }}>
              {TYPE_LABEL[alert.type] || alert.type}
            </span>
          </div>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ background: barColor }}
          >
            {alert.severity}
          </span>
        </div>
        <p className="text-[12px] font-medium text-gray-700 leading-relaxed mt-1">{alert.msg}</p>
        <div className="flex justify-between items-center mt-2">
          <span className="text-[9px] text-gray-400 font-mono">{new Date(alert.timestamp).toLocaleTimeString()}</span>
          {alert.evidence && alert.evidence.length > 0 && (
            <button
              className="text-[9px] text-blue-600 font-semibold hover:underline"
              onClick={e => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
            >
              {expanded ? "Hide" : "Show"} evidence ({alert.evidence.length})
            </button>
          )}
        </div>
        {expanded && alert.evidence && alert.evidence.length > 0 && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-[9px] font-mono text-gray-600 max-h-24 overflow-auto">
            {alert.evidence.map((e: any, i: number) => (
              <div key={i}>{JSON.stringify(e)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN PAGE ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function VesselTrackerDemo() {
  // Get MMSI from query params or default
  const defaultMMSI =
    new URL(window.location.href).searchParams.get("mmsi") || "777000002";
  const [mmsi, setMmsi] = useState(defaultMMSI);
  const [inputValue, setInputValue] = useState(mmsi);
  const [forceDemoMode, setForceDemoMode] = useState(false);
  const [autoPan, setAutoPan] = useState(true);
  const [sevFilter, setSevFilter] = useState<string>("ALL");
  const [mapCenter, setMapCenter] = useState<[number, number] | null>(null);
  const [mapZoom, setMapZoom] = useState(5);

  const { vessel, alerts, track, zones, safeRoute, connectionStatus } = useDemoVesselTracker({
    mmsi,
    defaultVesselName: `Vessel ${mmsi}`,
    startLat: 15.0,
    startLon: 42.5,
    useDemoMode: forceDemoMode,
  });

  // Toast for new alerts
  const lastAlertCountRef = useRef(0);
  useEffect(() => {
    if (alerts.length > lastAlertCountRef.current && lastAlertCountRef.current > 0) {
      const newest = alerts[0];
      if (newest && (newest.severity === "HIGH" || newest.severity === "CRITICAL")) {
        const icon = newest.severity === "CRITICAL" ? "🚨" : "⚠️";
        toast(`${icon} ${TYPE_LABEL[newest.type] || newest.type}: ${newest.msg}`, {
          duration: 5000,
          style: {
            borderLeft: `4px solid ${SEV_COLOR[newest.severity]}`,
            fontSize: "12px",
            maxWidth: "420px",
          },
        });
      }
    }
    lastAlertCountRef.current = alerts.length;
  }, [alerts]);

  // Auto-pan to vessel
  useEffect(() => {
    if (autoPan && vessel) {
      setMapCenter([vessel.lat, vessel.lon]);
      setMapZoom(6);
    }
  }, [vessel, autoPan]);

  // Handle MMSI input
  const handleSetMmsi = () => {
    const trimmed = inputValue.trim();
    if (trimmed && trimmed !== mmsi) {
      setMmsi(trimmed);
      setMapCenter(null); // Reset map position
    }
  };

  // Filter alerts by severity
  const filteredAlerts = useMemo(() => {
    if (sevFilter === "ALL") return alerts;
    return alerts.filter(a => a.severity === sevFilter);
  }, [alerts, sevFilter]);

  // Locate alert on map
  const onLocateAlert = useCallback((lat: number, lon: number) => {
    setMapCenter([lat, lon]);
    setMapZoom(7);
    setAutoPan(false);
  }, []);

  // Stats
  const critCount = alerts.filter(a => a.severity === "CRITICAL").length;
  const highCount = alerts.filter(a => a.severity === "HIGH").length;

  // Map initialization position
  const initialCenter: [number, number] = vessel ? [vessel.lat, vessel.lon] : [15.0, 42.5];

  return (
    <div className="h-screen overflow-hidden bg-bg-app flex flex-col">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-border-col flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="ms text-primary text-xl">directions_boat</span>
          <div>
            <h1 className="font-display font-bold text-text-main">Vessel Tracker</h1>
            <p className="text-xs text-text-muted">Real-time maritime tracking</p>
          </div>
        </div>
        <div className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-2 border ${connectionStatus === "connected"
          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
          : connectionStatus === "demo"
            ? "bg-purple-50 text-purple-700 border-purple-200"
            : "bg-orange-50 text-orange-700 border-orange-200"
          }`}>
          <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: connectionStatus === "connected" ? "#10b981" : connectionStatus === "demo" ? "#a855f7" : "#f97316" }} />
          {connectionStatus === "connected"
            ? "CONNECTED"
            : connectionStatus === "demo"
              ? "DEMO MODE"
              : "CONNECTING…"}
        </div>
      </header>

      {/* ── Main Content ────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-hidden px-6 pb-6 flex flex-col gap-4">
        {/* ── Controls ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-lg border border-border-col shadow-sm p-4 space-y-3 flex-shrink-0">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* MMSI Input */}
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Vessel MMSI</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyPress={e => e.key === "Enter" && handleSetMmsi()}
                  placeholder="Enter vessel MMSI..."
                  className="flex-1 bg-gray-50 border border-border-col text-text-main px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm placeholder:text-text-muted/60"
                />
                <button
                  onClick={handleSetMmsi}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  Track
                </button>
              </div>
              <p className="text-xs text-text-muted mt-1">Current: {mmsi}</p>
            </div>

            {/* Alert Filters */}
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-2">Alert Filter</label>
              <div className="flex flex-wrap gap-2">
                {["ALL", "CRITICAL", "HIGH", "MEDIUM"].map(sev => (
                  <button
                    key={sev}
                    onClick={() => setSevFilter(sev)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border ${sevFilter === sev
                      ? "bg-white shadow-sm text-text-main border-gray-300"
                      : "text-gray-400 border-transparent hover:bg-gray-50"
                      }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode Controls */}
            <div className="flex flex-col gap-2">
              <label className="block text-xs font-semibold text-text-muted">Options</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setForceDemoMode(!forceDemoMode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${forceDemoMode
                    ? "bg-purple-50 text-purple-700 border-purple-200"
                    : "bg-gray-50 text-gray-600 border-border-col hover:bg-gray-100"
                    }`}
                >
                  {forceDemoMode ? "🎮 Demo ON" : "Demo"}
                </button>
                <button
                  onClick={() => setAutoPan(!autoPan)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${autoPan
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : "bg-gray-50 text-gray-600 border-border-col hover:bg-gray-100"
                    }`}
                >
                  {autoPan ? "📍 Pan ON" : "Pan"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Content Grid ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 overflow-hidden">
          {/* Map + Vessel Info */}
          <div className="lg:col-span-2 space-y-4 overflow-hidden flex flex-col min-h-0">
            {/* Map */}
            <div className="bg-white rounded-lg border border-border-col overflow-hidden shadow-sm flex-1 overflow-hidden min-h-0">
              <MapContainer
                center={initialCenter}
                zoom={mapZoom}
                style={{ height: "100%", width: "100%" }}
                scrollWheelZoom
                worldCopyJump
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution="© CartoDB"
                />

                {/* War Zones */}
                {zones?.filter((z: any) => z.active).map((z: any) => (
                  <Circle
                    key={z.name}
                    center={[z.lat, z.lon]}
                    radius={z.radius_km * 1000}
                    pathOptions={{
                      color: z.color || "#ef4444",
                      fillColor: z.color || "#ef4444",
                      fillOpacity: z.opacity || 0.15,
                      weight: 1.5,
                      dashArray: "4 4",
                    }}
                  >
                    <Popup className="font-sans text-sm">
                      <strong>{z.name}</strong>
                      <br />
                      ⚠️ {z.type} Risk Zone
                    </Popup>
                  </Circle>
                ))}

                {/* Track Polyline */}
                {track.length > 1 && (
                  <Polyline
                    positions={track.map(p => [p.lat, p.lon])}
                    pathOptions={{
                      color: vessel ? STATUS_COLOR[vessel.status] || "#6b7280" : "#6b7280",
                      weight: 2,
                      opacity: 0.5,
                      dashArray: "4 4",
                    }}
                  />
                )}

                {/* Safe Route Polyline (shown when auto-rerouted) */}
                {safeRoute && safeRoute.length > 1 && (
                  <Polyline
                    positions={safeRoute}
                    pathOptions={{
                      color: "#10b981",
                      weight: 3,
                      opacity: 0.9,
                      dashArray: "8 4",
                    }}
                  >
                    <Popup className="font-sans text-xs">
                      <strong>⚡ Safe Alternative Route</strong><br />
                      Auto-calculated to avoid active risk zones.
                    </Popup>
                  </Polyline>
                )}

                {/* Alert pings */}
                {alerts
                  .filter(a => a.location?.lat)
                  .slice(0, 15)
                  .map(a => (
                    <CircleMarker
                      key={a.alert_id}
                      center={[a.location.lat, a.location.lon]}
                      radius={6}
                      pathOptions={{
                        color: SEV_COLOR[a.severity] || "#6b7280",
                        fillColor: SEV_COLOR[a.severity] || "#6b7280",
                        fillOpacity: 0.3,
                        weight: 2,
                        dashArray: "3 3",
                      }}
                    >
                      <Popup className="font-sans text-xs">
                        <strong>{TYPE_LABEL[a.type] || a.type}</strong>
                        <br />
                        {a.msg}
                      </Popup>
                    </CircleMarker>
                  ))}

                {/* Vessel Marker */}
                <VesselMarker vessel={vessel} />

                {/* Map Panner */}
                <MapPanner center={mapCenter} zoom={mapZoom} />
              </MapContainer>
            </div>

            {/* Vessel Info Card */}
            {vessel ? (
              <div className="bg-white rounded-lg border border-border-col shadow-sm p-4 flex-shrink-0 space-y-3">
                <div>
                  <h3 className="section-title mb-3">
                    <span className="ms text-blue-500">info</span>
                    <span>Vessel Information</span>
                  </h3>
                  {/* Coverage Status Badge */}
                  <div className="mb-3">
                    <CoverageStatusBadge
                      status={(vessel.coverage_status || "ACTIVE") as any}
                      reason={vessel.coverage_reason}
                      compact={false}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase mb-1">Name</p>
                    <p className="text-sm font-bold text-text-main">{vessel.vessel_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase mb-1">MMSI</p>
                    <p className="text-sm font-mono text-text-main">{vessel.mmsi}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase mb-1">Speed</p>
                    <p className="text-sm font-bold text-emerald-600">{(vessel.speed_kn || 0).toFixed(1)} kn</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase mb-1">Course</p>
                    <p className="text-sm font-bold text-amber-600">{(vessel.course || 0).toFixed(0)}°</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase mb-1">Status</p>
                    <p className="text-sm font-bold" style={{ color: STATUS_COLOR[vessel.status] || "#6b7280", textTransform: "uppercase" }}>
                      {vessel.status}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted font-semibold uppercase mb-1">Destination</p>
                    <p className="text-sm font-semibold text-text-main">{vessel.destination || "—"}</p>
                  </div>
                  {vessel.voyage_context?.cargo_value_usd && (
                    <div>
                      <p className="text-xs text-text-muted font-semibold uppercase mb-1">Cargo</p>
                      <p className="text-sm font-bold text-amber-600">
                        ${(vessel.voyage_context.cargo_value_usd / 1e6).toFixed(1)}M
                      </p>
                    </div>
                  )}
                  {vessel.next_policy_flag && (
                    <div className="col-span-2 md:col-span-1">
                      <p className="text-xs text-rose-600 font-semibold uppercase mb-1">Policy</p>
                      <p className="text-xs font-bold px-2 py-1 bg-rose-50 rounded text-rose-700 inline-block border border-rose-200">
                        ⚠ Review
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-border-col shadow-sm p-8 flex items-center justify-center flex-shrink-0">
                <p className="text-text-muted text-center">
                  {forceDemoMode || connectionStatus === "demo"
                    ? "Waiting for vessel data..."
                    : "Enter a valid MMSI to start tracking"}
                </p>
              </div>
            )}
          </div>

          {/* Alerts Panel */}
          <div className="bg-white rounded-lg border border-border-col shadow-sm flex flex-col overflow-hidden min-h-0">
            <div className="px-4 py-3 border-b border-border-col flex items-center justify-between flex-shrink-0">
              <h3 className="section-title">
                <span className="w-2 h-2 bg-rose-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
                <span>Alert Center</span>
              </h3>
              <span className="text-[11px] font-mono text-gray-400">{alerts.length} total</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50/50 min-h-0">
              {filteredAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-300 py-8">
                  <span className="ms text-3xl mb-2">notifications_none</span>
                  <p className="text-xs text-gray-400">No alerts yet</p>
                </div>
              ) : (
                filteredAlerts.map(a => (
                  <AlertCard key={a.alert_id} alert={a} onLocate={onLocateAlert} />
                ))
              )}
            </div>

            {/* Alert Stats */}
            {(critCount > 0 || highCount > 0) && (
              <div className="px-4 py-3 border-t border-border-col flex gap-2 flex-wrap flex-shrink-0">
                {critCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-1 bg-rose-50 text-rose-600 rounded-full border border-rose-200">
                    {critCount} CRITICAL
                  </span>
                )}
                {highCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-1 bg-orange-50 text-orange-600 rounded-full border border-orange-200">
                    {highCount} HIGH
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
