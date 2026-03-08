/**
 * SimulateAIS.ts
 * 
 * Simulates realistic AIS vessel updates and alerts for demo mode.
 * Emits the same message shapes as the WebSocket API.
 */

export interface SimulatorConfig {
  mmsi: string;
  vesselName?: string;
  startLat?: number;
  startLon?: number;
  updateIntervalMs?: number; // ~5-15s between updates
}

export interface SimulatorMessage {
  event: "snapshot" | "vessel.update" | "alert.create" | "ping";
  data: any;
}

// War-risk zones (same as in LiveTracking.tsx)
const ZONES = [
  { name: "Strait of Hormuz", lat: 26.6, lng: 56.3, radiusKm: 250 },
  { name: "Red Sea / Bab el-Mandeb", lat: 15.0, lng: 42.5, radiusKm: 450 },
  { name: "Gulf of Aden", lat: 11.5, lng: 48.5, radiusKm: 380 },
  { name: "Black Sea", lat: 43.5, lng: 34.0, radiusKm: 300 },
  { name: "Gulf of Guinea", lat: 2.0, lng: 5.0, radiusKm: 500 },
  { name: "Strait of Malacca", lat: 3.0, lng: 100.0, radiusKm: 300 },
  { name: "South China Sea", lat: 12.0, lng: 114.0, radiusKm: 700 },
];

function distanceBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function isInZone(lat: number, lon: number, zone: typeof ZONES[0]): boolean {
  return distanceBetween(lat, lon, zone.lat, zone.lng) <= zone.radiusKm;
}

export class AISSimulator {
  private config: Required<SimulatorConfig>;
  private currentLat: number;
  private currentLon: number;
  private speed: number;
  private heading: number;
  private status: string;
  private lastZoneAlertTime: Record<string, number> = {};
  private activeZones: Set<string> = new Set();

  constructor(config: SimulatorConfig) {
    this.config = {
      mmsi: config.mmsi,
      vesselName: config.vesselName || `Vessel ${config.mmsi}`,
      startLat: config.startLat ?? 20.0,
      startLon: config.startLon ?? 50.0,
      updateIntervalMs: config.updateIntervalMs ?? 8000,
    };
    this.currentLat = this.config.startLat;
    this.currentLon = this.config.startLon;
    this.speed = 15 + Math.random() * 8; // 15-23 knots
    this.heading = Math.random() * 360;
    this.status = "underway";
  }

  generateSnapshot(): SimulatorMessage {
    const vessel = {
      mmsi: this.config.mmsi,
      vessel_name: this.config.vesselName,
      lat: this.currentLat,
      lon: this.currentLon,
      speed_kn: this.speed,
      heading: this.heading,
      course: this.heading, // Often same as heading for simplicity
      status: this.status,
      voyage_id: `VOY-${this.config.mmsi}-001`,
      destination: "Singapore",
      last_update: new Date().toISOString(),
      next_policy_flag: Math.random() < 0.2, // 20% chance
      voyage_context: {
        origin: "Shanghai",
        destination: "Singapore",
        cargo_value_usd: 2500000 + Math.random() * 10000000,
        policy_id: `POL-${this.config.mmsi}-001`,
      },
    };

    const alerts: any[] = [];
    // Maybe generate an initial alert
    if (Math.random() < 0.3) {
      alerts.push(this.generateAlert("Vessel entered monitoring zone"));
    }

    return {
      event: "snapshot",
      data: {
        vessels: [vessel],
        alerts,
      },
    };
  }

  generateUpdate(): SimulatorMessage {
    // Small random walk (Brownian motion) in position
    const latDelta = (Math.random() - 0.5) * 0.15; // ~12 km
    const lonDelta = (Math.random() - 0.5) * 0.15;
    this.currentLat += latDelta;
    this.currentLon += lonDelta;

    // Small random walk in heading
    this.heading = (this.heading + (Math.random() - 0.5) * 30) % 360;
    if (this.heading < 0) this.heading += 360;

    // Occasional speed changes
    if (Math.random() < 0.1) {
      this.speed = Math.max(5, Math.min(23, this.speed + (Math.random() - 0.5) * 4));
    }

    // Occasional status changes
    if (Math.random() < 0.05) {
      const statuses = ["underway", "anchored", "moored"];
      this.status = statuses[Math.floor(Math.random() * statuses.length)];
    }

    return {
      event: "vessel.update",
      data: {
        mmsi: this.config.mmsi,
        lat: this.currentLat,
        lon: this.currentLon,
        speed_kn: this.speed,
        heading: this.heading,
        status: this.status,
        last_update: new Date().toISOString(),
      },
    };
  }

  private generateAlert(reason: string = ""): any {
    const types = ["war_risk", "deviation", "emergency", "spoofing", "reinsurance"];
    const type = types[Math.floor(Math.random() * types.length)];
    const severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
    const severity = severities[Math.floor(Math.random() * severities.length)];

    return {
      alert_id: `alert_${Math.random().toString(16).slice(2, 10)}`,
      type,
      mmsi: this.config.mmsi,
      voyage_id: `VOY-${this.config.mmsi}-001`,
      severity,
      msg: reason || this.generateAlertMessage(type),
      timestamp: new Date().toISOString(),
      location: {
        lat: this.currentLat + (Math.random() - 0.5) * 0.5,
        lon: this.currentLon + (Math.random() - 0.5) * 0.5,
      },
      evidence: [
        {
          ping_id: `ping_${Date.now()}`,
          timestamp: new Date().toISOString(),
          data: { lat: this.currentLat, lon: this.currentLon, speed: this.speed },
        },
      ],
    };
  }

  private generateAlertMessage(type: string): string {
    const messages: Record<string, string[]> = {
      war_risk: [
        "Vessel approaching Red Sea danger zone",
        "War-risk zone entry imminent",
        "Geopolitical risk escalation detected",
      ],
      deviation: [
        "Course deviation detected",
        "Unexpected route change",
        "Vessel off planned track",
      ],
      emergency: [
        "Emergency beacon activated",
        "Distress signal received",
        "Medical emergency on board",
      ],
      spoofing: [
        "AIS position anomaly detected",
        "Possible GPS spoofing",
        "Position jump inconsistent with speed",
      ],
      reinsurance: [
        "Portfolio exposure threshold exceeded",
        "Reinsurance trigger condition met",
      ],
    };

    const list = messages[type] || ["Unknown alert"];
    return list[Math.floor(Math.random() * list.length)];
  }

  checkZoneEntry(): SimulatorMessage | null {
    // Check if vessel entered a war zone and generate alert if so
    for (const zone of ZONES) {
      if (isInZone(this.currentLat, this.currentLon, zone)) {
        const now = Date.now();
        const lastAlert = this.lastZoneAlertTime[zone.name] || 0;

        // Only alert every 60 seconds per zone
        if (now - lastAlert > 60000 && !this.activeZones.has(zone.name)) {
          this.lastZoneAlertTime[zone.name] = now;
          this.activeZones.add(zone.name);
          return {
            event: "alert.create",
            data: this.generateAlert(`Vessel entered ${zone.name} war-risk zone`),
          };
        }
      } else {
        this.activeZones.delete(zone.name);
      }
    }
    return null;
  }

  generateRandomEvent(): SimulatorMessage | null {
    // ~10% chance of random alert per update
    if (Math.random() < 0.1) {
      return {
        event: "alert.create",
        data: this.generateAlert(),
      };
    }
    return null;
  }

  getNextUpdateInterval(): number {
    // Randomize between 5-15 seconds
    return this.config.updateIntervalMs + (Math.random() - 0.5) * 6000;
  }
}

/**
 * Start a demo stream that emits messages via a callback.
 * Returns a stop function.
 */
export function startDemoStream(
  config: SimulatorConfig,
  onMessage: (msg: SimulatorMessage) => void
): () => void {
  const simulator = new AISSimulator(config);
  let timers: ReturnType<typeof setInterval>[] = [];

  // Send initial snapshot
  onMessage(simulator.generateSnapshot());

  // Every 5-15 seconds: send a vessel update
  const updateTimer = setInterval(() => {
    onMessage(simulator.generateUpdate());

    // Check for zone alerts
    const zoneAlert = simulator.checkZoneEntry();
    if (zoneAlert) onMessage(zoneAlert);

    // Random alerts
    const randomAlert = simulator.generateRandomEvent();
    if (randomAlert) onMessage(randomAlert);
  }, simulator.getNextUpdateInterval());

  timers.push(updateTimer);

  // Periodic keepalive pings
  const pingTimer = setInterval(() => {
    onMessage({ event: "ping", data: {} });
  }, 30000);

  timers.push(pingTimer);

  // Return stop function
  return () => {
    timers.forEach(t => clearInterval(t));
  };
}
