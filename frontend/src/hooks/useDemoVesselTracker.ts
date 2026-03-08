/**
 * useDemoVesselTracker.ts
 *
 * Hook for the single-vessel demo tracker.
 * - Connects to WebSocket and filters for one MMSI
 * - Falls back to demo mode if connection fails
 * - Tracks position history for polyline
 * - Manages alerts specific to the selected vessel
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { startDemoStream, type SimulatorConfig } from "../services/SimulateAIS";

export interface VesselState {
  mmsi: string;
  vessel_name: string;
  lat: number;
  lon: number;
  speed_kn: number;
  heading: number;
  course: number;
  status: string;
  destination: string;
  voyage_id: string;
  last_update: string;
  next_policy_flag: boolean;
  coverage_status?: string;  // ACTIVE|WARNING|BREACH|VOID
  coverage_id?: string;
  coverage_reason?: string;
  voyage_context: {
    origin?: string;
    destination?: string;
    cargo_value_usd?: number;
    policy_id?: string;
  } | null;
}

export interface AlertState {
  alert_id: string;
  type: string;
  mmsi: string;
  severity: string;
  msg: string;
  timestamp: string;
  location: { lat: number; lon: number };
  evidence: any[];
}

export interface TrackPoint {
  lat: number;
  lon: number;
  timestamp: string;
}

export interface DemoTrackerResult {
  vessel: VesselState | null;
  alerts: AlertState[];
  track: TrackPoint[];
  zones: any[];
  safeRoute: [number, number][] | null;  // alternative reroute [[lat,lon],...]
  connected: boolean;
  demoMode: boolean;
  error: string | null;
  connectionStatus: "idle" | "connecting" | "connected" | "failed" | "demo";
}

interface DemoTrackerConfig {
  mmsi: string;
  wsUrl?: string;
  defaultVesselName?: string;
  startLat?: number;
  startLon?: number;
  maxTrackPoints?: number;
  useDemoMode?: boolean; // Force demo mode
}

export function useDemoVesselTracker(config: DemoTrackerConfig): DemoTrackerResult {
  const [vessel, setVessel] = useState<VesselState | null>(null);
  const [alerts, setAlerts] = useState<AlertState[]>([]);
  const [track, setTrack] = useState<TrackPoint[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [safeRoute, setSafeRoute] = useState<[number, number][] | null>(null);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(config.useDemoMode ?? false);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<DemoTrackerResult["connectionStatus"]>("idle");

  const wsRef = useRef<WebSocket | null>(null);
  const stopDemoRef = useRef<(() => void) | null>(null);
  const retryRef = useRef(0);
  const seenAlertsRef = useRef<Set<string>>(new Set());
  const maxTrackPoints = config.maxTrackPoints ?? 30;

  const handleMessage = useCallback(
    (msg: any) => {
      try {
        if (msg.event === "snapshot") {
          const vessels = msg.data?.vessels || [];
          const foundVessel = vessels.find((v: any) => v.mmsi === config.mmsi);
          if (foundVessel) {
            setVessel(foundVessel);
            setTrack([{ lat: foundVessel.lat, lon: foundVessel.lon, timestamp: foundVessel.last_update }]);
          }

          const incomingAlerts = msg.data?.alerts || [];
          const filtered = incomingAlerts.filter((a: any) => a.mmsi === config.mmsi || a.type === "reinsurance" || a.type === "PORTFOLIO");
          filtered.forEach((a: any) => seenAlertsRef.current.add(a.alert_id));
          setAlerts(filtered);
          setZones(msg.data?.zones || []);
        } else if (msg.event === "zones_update") {
          setZones(msg.data?.zones || []);
        } else if (msg.event === "vessel.update") {
          if (msg.data.mmsi === config.mmsi) {
            setVessel(prev => (prev ? { ...prev, ...msg.data } : null));
            setTrack(prev => {
              const updated = [...prev, { lat: msg.data.lat, lon: msg.data.lon, timestamp: msg.data.last_update }];
              if (updated.length > maxTrackPoints) updated.shift();
              return updated;
            });
          }
        } else if (msg.event === "alert.create") {
          const alert = msg.data;
          if ((alert.mmsi === config.mmsi || alert.type === "reinsurance" || alert.type === "PORTFOLIO") && !seenAlertsRef.current.has(alert.alert_id)) {
            seenAlertsRef.current.add(alert.alert_id);
            setAlerts(prev => [alert, ...prev]);
          }
        } else if (msg.event === "reroute") {
          // Show alternative safe route for this vessel
          if (msg.data?.mmsi === config.mmsi) {
            const coords = (msg.data.route || []) as [number, number][];
            setSafeRoute(coords);
          }
        }
        // Ignore ping events
      } catch (e) {
        console.error("Error processing message", e);
      }
    },
    [config.mmsi, maxTrackPoints]
  );

  useEffect(() => {
    let unmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function startWebSocket() {
      if (unmounted) return;
      setConnectionStatus("connecting");

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      let wsUrl =
        new URL(window.location.href).searchParams.get("ws") ||
        config.wsUrl ||
        "ws://localhost:8000/api/ais/subscribe";

      // Normalizace WebSocket URL
      if (!wsUrl.startsWith("ws://") && !wsUrl.startsWith("wss://")) {
        wsUrl = `${protocol}//${wsUrl}`;
      }

      // Close any existing connection before starting a new one
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) { }
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted) return;
        setConnected(true);
        setDemoMode(false);
        setError(null);
        setConnectionStatus("connected");
        retryRef.current = 0;
      };

      ws.onmessage = evt => {
        if (unmounted) return;
        try {
          const msg = JSON.parse(evt.data);
          handleMessage(msg);
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onerror = () => {
        if (unmounted) return;
        setError("WebSocket error");
        setConnectionStatus("failed");
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnected(false);
        // Retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, retryRef.current), 30000);
        retryRef.current++;
        setConnectionStatus("idle");
        reconnectTimer = setTimeout(startWebSocket, delay);
      };
    }

    function startDemo() {
      if (unmounted) return;
      setConnectionStatus("demo");
      setDemoMode(true);
      setConnected(true);

      const simulatorConfig: SimulatorConfig = {
        mmsi: config.mmsi,
        vesselName: config.defaultVesselName || `Vessel ${config.mmsi}`,
        startLat: config.startLat,
        startLon: config.startLon,
      };

      stopDemoRef.current = startDemoStream(simulatorConfig, handleMessage);
    }

    // If demo mode is forced, start demo immediately
    if (config.useDemoMode) {
      startDemo();
    } else {
      startWebSocket();
    }

    return () => {
      unmounted = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch (e) {
          // Ignore
        }
      }
      if (stopDemoRef.current) {
        stopDemoRef.current();
      }
    };
  }, [config.mmsi, config.wsUrl, config.useDemoMode, config.defaultVesselName, config.startLat, config.startLon, handleMessage]);

  return {
    vessel,
    alerts,
    track,
    zones,
    safeRoute,
    connected,
    demoMode,
    error,
    connectionStatus,
  };
}
