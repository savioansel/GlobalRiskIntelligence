import { useEffect, useRef, useState, useCallback } from "react";

// ── Types ───────────────────────────────────────────────────────────────────
export interface VesselData {
    mmsi: string;
    vessel_name: string;
    lat: number;
    lon: number;
    speed_kn: number;
    course: number;
    heading: number;
    status: string;
    voyage_id: string;
    destination: string;
    last_update: string;
    next_policy_flag: boolean;
    voyage_context: {
        origin?: string;
        destination?: string;
        cargo_value_usd?: number;
        policy_id?: string;
    } | null;
}

export interface AISAlertData {
    alert_id: string;
    type: string;
    mmsi: string;
    voyage_id: string;
    severity: string;
    msg: string;
    timestamp: string;
    location: { lat: number; lon: number };
    evidence: any[];
}

interface AisSubscriptionResult {
    vessels: Map<string, VesselData>;
    alerts: AISAlertData[];
    connected: boolean;
    vesselCount: number;
    error: string | null;
}

// ── Hook ────────────────────────────────────────────────────────────────────
export function useAisSubscription(): AisSubscriptionResult {
    // We use a ref for vessels to avoid re-renders on every position update.
    // The Leaflet markers are updated via the ref directly — see LiveTracking.tsx.
    const vesselsRef = useRef<Map<string, VesselData>>(new Map());
    const [vesselCount, setVesselCount] = useState(0);
    const [alerts, setAlerts] = useState<AISAlertData[]>([]);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef(0);
    const listenersRef = useRef<Set<() => void>>(new Set());

    // Vessel update listeners (for map component to subscribe to position updates)
    const onVesselUpdate = useCallback((cb: () => void) => {
        listenersRef.current.add(cb);
        return () => listenersRef.current.delete(cb);
    }, []);

    const notifyListeners = useCallback(() => {
        listenersRef.current.forEach(cb => cb());
    }, []);

    useEffect(() => {
        let unmounted = false;
        let reconnectTimer: ReturnType<typeof setTimeout>;

        function connect() {
            if (unmounted) return;
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const apiBase = (import.meta as any).env?.VITE_API_URL || "http://localhost:8000";
            const wsUrl = apiBase.replace(/^http/, "ws") + "/api/ais/subscribe";

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (unmounted) return;
                setConnected(true);
                setError(null);
                retryRef.current = 0;
            };

            ws.onmessage = (evt) => {
                if (unmounted) return;
                try {
                    const msg = JSON.parse(evt.data);

                    if (msg.event === "snapshot") {
                        // Initial snapshot of all vessels and recent alerts
                        const vs = msg.data?.vessels || [];
                        const as_ = msg.data?.alerts || [];
                        const map = new Map<string, VesselData>();
                        vs.forEach((v: VesselData) => map.set(v.mmsi, v));
                        vesselsRef.current = map;
                        setVesselCount(map.size);
                        setAlerts(as_);
                        notifyListeners();
                    } else if (msg.event === "vessel.update") {
                        const v = msg.data as VesselData;
                        vesselsRef.current.set(v.mmsi, v);
                        setVesselCount(vesselsRef.current.size);
                        notifyListeners();
                    } else if (msg.event === "alert.create") {
                        const a = msg.data as AISAlertData;
                        setAlerts(prev => [a, ...prev]);
                    }
                    // ping messages are keepalive — ignore
                } catch (e) {
                    // Ignore parse errors
                }
            };

            ws.onerror = () => {
                if (unmounted) return;
                setError("WebSocket error");
            };

            ws.onclose = () => {
                if (unmounted) return;
                setConnected(false);
                // Exponential backoff reconnect: 1s, 2s, 4s, 8s, ... max 30s
                const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
                retryRef.current++;
                reconnectTimer = setTimeout(connect, delay);
            };
        }

        connect();

        return () => {
            unmounted = true;
            clearTimeout(reconnectTimer);
            if (wsRef.current) {
                wsRef.current.close();
            }
        };
    }, [notifyListeners]);

    return {
        vessels: vesselsRef.current,
        alerts,
        connected,
        vesselCount,
        error,
    };
}
