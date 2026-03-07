
import { MapContainer, TileLayer, Marker, Polyline, Popup, Circle, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, memo } from "react";

// ── Fix Leaflet default icon in Vite/Webpack ─────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// ── Coordinate map ────────────────────────────────────────────────────────────
export const COORDS: Record<string, [number, number]> = {
    // Aviation – ICAO
    "VABB": [19.09, 72.87], // Mumbai, India
    "VIDP": [28.56, 77.10], // New Delhi, India
    "EGLL": [51.47, -0.45], // London, UK
    "WSSS": [1.36, 103.99], // Singapore, Singapore
    "KJFK": [40.64, -73.78], // New York, USA
    "KLAX": [33.94, -118.41], // Los Angeles, USA
    "KORD": [41.98, -87.90], // Chicago, USA
    "KATL": [33.64, -84.42], // Atlanta, USA
    "OMDB": [25.25, 55.36], // Dubai, UAE
    "OTHH": [25.27, 51.61], // Doha, Qatar
    "RJTT": [35.55, 139.78], // Tokyo, Japan
    "YSSY": [-33.95, 151.18], // Sydney, Australia
    "NZAA": [-37.00, 174.78], // Auckland, New Zealand
    "ZSPD": [31.14, 121.80], // Shanghai, China
    "ZBAA": [40.08, 116.58], // Beijing, China
    "VHHH": [22.31, 113.91], // Hong Kong
    "EDDF": [50.03, 8.57], // Frankfurt, Germany
    "EHAM": [52.31, 4.76], // Amsterdam, Netherlands
    "LFPG": [49.01, 2.55], // Paris, France
    "FACT": [-33.97, 18.60], // Cape Town, South Africa
    "FAOR": [-26.13, 28.24], // Johannesburg, South Africa
    "CYYZ": [43.68, -79.63], // Toronto, Canada
    "SBGR": [-23.43, -46.47], // Sao Paulo, Brazil
    "UUEE": [55.97, 37.41], // Moscow, Russia
    // Maritime – Ports
    "INBOM": [18.94, 72.84], // Mumbai
    "NLRTM": [51.92, 4.48], // Rotterdam
    "CNSHA": [31.23, 121.47], // Shanghai
    "USLAX": [33.74, -118.27], // LA
    "AEDXB": [25.20, 55.27], // Dubai
    "SGSIN": [1.26, 103.82], // Singapore
    "USNYC": [40.67, -74.00], // New York
    "USLGB": [33.75, -118.21], // Long Beach
    "DEHAM": [53.54, 9.99], // Hamburg
    "BEANR": [51.23, 4.40], // Antwerp
    "CNSHG": [22.50, 113.88], // Shenzhen
    "CNBUS": [35.10, 129.04], // Busan
    "HKHKG": [22.33, 114.13], // Hong Kong
    "JPYOK": [35.44, 139.64], // Yokohama
    "MYPKG": [3.00, 101.40], // Port Klang
    "MYTPP": [1.36, 103.55], // Tanjung Pelepas
    "TWKHH": [22.56, 120.31], // Kaohsiung
    "AUSYD": [-33.86, 151.20], // Sydney
    "AUMEL": [-37.81, 144.96], // Melbourne
    // Railway – Stations (India)
    "NDLS": [28.56, 77.10], // Delhi IGI
    "CSMT": [18.94, 72.84], // Mumbai CSMT
    "MAS": [13.08, 80.27], // Chennai
    "HWH": [22.58, 88.36], // Kolkata
    "SBC": [12.97, 77.59], // Bengaluru
    "SC": [17.45, 78.47], // Hyderabad
    "PUNE": [18.52, 73.87], // Pune
    "ADI": [23.02, 72.59], // Ahmedabad
    "JP": [26.92, 75.78], // Jaipur
    "CNB": [26.44, 80.34], // Kanpur
    "LKO": [26.83, 80.91], // Lucknow
    "NGP": [21.15, 79.08], // Nagpur
    "PNBE": [25.60, 85.13], // Patna
    "BPL": [23.26, 77.41], // Bhopal
    "ST": [21.20, 72.82], // Surat
    "INDB": [22.71, 75.87], // Indore
};

export function getCoords(name: string): [number, number] {
    if (COORDS[name]) return COORDS[name];
    // Hash-based fallback
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return [(hash % 60) + 10, ((hash * 7) % 120) + 20];
}

// ── Risk colour helper ────────────────────────────────────────────────────────
export function riskColor(level: string): string {
    if (level === "CRITICAL") return "#ef4444";
    if (level === "HIGH") return "#f97316";
    if (level === "ELEVATED" || level === "WARNING") return "#f59e0b";
    return "#10b981";
}

// ── Great-circle curved points ───────────────────────────────────────────────
// Returns a list of lat/lng points forming a smooth arc between two coords
export function curvedPoints(
    a: [number, number],
    b: [number, number],
    segments = 24,
    offsetDeg = 4,
): [number, number][] {
    const pts: [number, number][] = [];
    // Midpoint with perpendicular offset to simulate great-circle curve
    const midLat = (a[0] + b[0]) / 2 + offsetDeg;
    const midLng = (a[1] + b[1]) / 2;
    // Quadratic Bezier interpolation
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const lat = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * midLat + t * t * b[0];
        const lng = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * midLng + t * t * b[1];
        pts.push([lat, lng]);
    }
    return pts;
}

// ── Helper to auto-fit map bounds ─────────────────────────────────────────────
function FitBounds({ positions }: { positions: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (positions.length >= 2) {
            const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
            map.fitBounds(bounds, { padding: [40, 40] });
        }
    }, [positions, map]);
    return null;
}

// ══════════════════════════════════════════════════════════════════════════════
// ── DANGER ZONES ──────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export const MARITIME_ZONES = [
    { name: "Strait of Hormuz", lat: 26.6, lng: 56.3, radiusKm: 250, color: "#ef4444", opacity: 0.18, type: "CRITICAL", reason: "US/Israel strikes on Iran Feb 2026 — tanker traffic collapsed, GPS jamming 1,100+ ships" },
    { name: "Red Sea / Bab el-Mandeb", lat: 15.0, lng: 42.5, radiusKm: 450, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Houthi attacks ongoing, ceasefire fragile, vessels being targeted by missiles and drones" },
    { name: "Gulf of Aden", lat: 11.5, lng: 48.5, radiusKm: 380, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Houthi + Somali piracy overlap, 6 hijackings since late 2023" },
    { name: "Black Sea", lat: 43.5, lng: 34.0, radiusKm: 300, color: "#f97316", opacity: 0.14, type: "HIGH", reason: "Ukraine-Russia conflict, drone strikes on tankers, sea mines reported" },
    { name: "Gulf of Guinea (West Africa)", lat: 2.0, lng: 5.0, radiusKm: 500, color: "#f97316", opacity: 0.12, type: "HIGH", reason: "Piracy, kidnapping for ransom, Nigeria/Ghana waters" },
    { name: "Strait of Malacca / Singapore", lat: 3.0, lng: 100.0, radiusKm: 300, color: "#f97316", opacity: 0.14, type: "HIGH", reason: "Busiest trade lane, armed piracy incidents rising, night attacks" },
    { name: "South China Sea", lat: 12.0, lng: 114.0, radiusKm: 700, color: "#f59e0b", opacity: 0.12, type: "ELEVATED", reason: "Chinese vessel aggression near Spratly Islands, territorial disputes" },
    { name: "Caribbean / Venezuela", lat: 13.0, lng: -66.0, radiusKm: 500, color: "#f59e0b", opacity: 0.12, type: "ELEVATED", reason: "US naval blockade, vessel seizure risk, GPS jamming off Venezuela" },
];

export const AVIATION_ZONES = [
    { name: "Iran (OIIX FIR)", lat: 32.0, lng: 53.0, radiusKm: 800, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Closed Feb 2026 — US/Israel strikes, missiles in airspace" },
    { name: "Iraq (ORBB FIR)", lat: 33.0, lng: 43.0, radiusKm: 500, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Closed March 2026 — drone/missile overflight" },
    { name: "Israel (LLLL FIR)", lat: 31.5, lng: 34.7, radiusKm: 200, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Closed March 2026 — active strikes and retaliation" },
    { name: "Ukraine (all FIRs)", lat: 49.0, lng: 31.0, radiusKm: 700, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Fully closed — active war zone, intentional targeting risk" },
    { name: "Middle East Gulf region", lat: 25.0, lng: 51.0, radiusKm: 600, color: "#f97316", opacity: 0.15, type: "HIGH", reason: "EASA CZIB Feb 2026 — Bahrain, Kuwait, Qatar, UAE, Saudi Arabia, Oman" },
    { name: "Afghanistan (OAKX FIR)", lat: 33.0, lng: 66.0, radiusKm: 600, color: "#f97316", opacity: 0.15, type: "HIGH", reason: "No ATC, uncontrolled airspace, Pakistan cross-border strikes" },
    { name: "Sudan", lat: 15.0, lng: 30.0, radiusKm: 800, color: "#f97316", opacity: 0.15, type: "HIGH", reason: "All civilian flights closed, Khartoum airport shut" },
    { name: "Russia (western + eastern ports)", lat: 55.0, lng: 37.0, radiusKm: 1000, color: "#f59e0b", opacity: 0.12, type: "ELEVATED", reason: "GPS jamming 1,500km from Ukraine front, drone strikes near Moscow" },
];

export const RAILWAY_ZONES = [
    { name: "Odisha (Balasore corridor)", lat: 21.5, lng: 86.9, radiusKm: 150, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Deadliest crash 2023, signalling failures unresolved" },
    { name: "Red Corridor (Chhattisgarh / Jharkhand)", lat: 21.0, lng: 82.0, radiusKm: 400, color: "#ef4444", opacity: 0.15, type: "CRITICAL", reason: "Naxalite sabotage — derailments, explosives on tracks" },
    { name: "West Bengal (NJP zone)", lat: 26.7, lng: 88.4, radiusKm: 150, color: "#f97316", opacity: 0.15, type: "HIGH", reason: "Kanchenjunga collision 2024, signalling failure" },
    { name: "Uttar Pradesh (Gonda / Lucknow)", lat: 27.0, lng: 81.5, radiusKm: 200, color: "#f97316", opacity: 0.15, type: "HIGH", reason: "Recurring derailments 2024, track defect pattern" },
    { name: "Jharkhand (Chakradharpur division)", lat: 22.7, lng: 85.6, radiusKm: 150, color: "#f97316", opacity: 0.15, type: "HIGH", reason: "Howrah-Mumbai Mail derailed July 2024" },
    { name: "Northeast monsoon corridors", lat: 26.2, lng: 92.0, radiusKm: 300, color: "#f59e0b", opacity: 0.12, type: "ELEVATED", reason: "Seasonal flood washouts, track subsidence every monsoon" },
];

export const ALL_ZONES = [...MARITIME_ZONES, ...AVIATION_ZONES, ...RAILWAY_ZONES];

// ══════════════════════════════════════════════════════════════════════════════
// ── MARITIME WAYPOINTS ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
const RED_SEA_APPROACH = [
    [11.8, 44.5], [12.6, 43.3], [14.2, 42.5], [19.0, 39.5], [24.0, 36.5], [27.6, 34.2]
] as [number, number][];

const SUEZ_MED_TO_ROTTERDAM = [
    ...RED_SEA_APPROACH,
    [29.9, 32.55], [31.2, 32.34], [33.0, 30.0], [34.5, 23.0],
    [35.6, 17.0], [37.2, 11.5], [37.5, 5.0], [36.5, -2.0], [35.9, -5.6],
    [36.5, -7.5], [38.5, -9.8], [43.0, -10.0], [47.0, -7.0], [49.5, -4.0],
    [50.3, -1.0], [51.2, 1.8], [51.92, 4.48]
] as [number, number][];

const SHANGHAI_TO_SINGAPORE = [
    [31.23, 121.47], [29.0, 123.0], [26.0, 121.5], [22.5, 119.0], [19.0, 116.0],
    [15.0, 112.5], [10.0, 110.0], [4.0, 106.0], [1.5, 104.5], [1.26, 103.82]
] as [number, number][];

const SINGAPORE_TO_ARABIAN_SEA = [
    [1.26, 103.82], [2.5, 101.5], [5.8, 97.5], [5.9, 95.0], [5.8, 85.0],
    [5.5, 80.0], [7.0, 72.0], [9.0, 65.0]
] as [number, number][];

const DUBAI_TO_ARABIAN_SEA = [
    [25.20, 55.27], [26.3, 56.2], [24.5, 57.5], [22.0, 59.5], [16.0, 55.0]
] as [number, number][];

const CAPE_OF_GOOD_HOPE_PATH = [
    [-5.0, 45.0], [-15.0, 45.0], [-25.0, 40.0], [-35.0, 30.0],
    [-38.0, 15.0], [-35.0, 0.0], [-25.0, -10.0], [-10.0, -15.0],
    [5.0, -18.0], [20.0, -20.0], [35.0, -15.0], [45.0, -10.0],
    [48.0, -5.0], [50.0, -1.0], [51.92, 4.48]
] as [number, number][];

const BASE_MARITIME_ROUTES: Record<string, [number, number][]> = {
    "INBOM|NLRTM": [
        [18.94, 72.84], [17.0, 69.5], [14.5, 65.0], [13.0, 58.0], [12.0, 50.0],
        ...SUEZ_MED_TO_ROTTERDAM
    ],
    "INBOM|CNSHA": [
        [18.94, 72.84], [15.0, 71.5], [10.0, 75.0], [5.5, 80.0], [5.8, 85.0],
        [5.9, 95.0], [5.8, 97.5], [2.5, 101.5], [1.26, 103.82],
        ...[...SHANGHAI_TO_SINGAPORE].reverse().slice(1)
    ],
    "INBOM|SGSIN": [
        [18.94, 72.84], [15.0, 71.5], [10.0, 75.0], [5.5, 80.0], [5.8, 85.0],
        [5.9, 95.0], [5.8, 97.5], [2.5, 101.5], [1.26, 103.82]
    ],
    "SGSIN|NLRTM": [
        ...SINGAPORE_TO_ARABIAN_SEA, [11.0, 55.0],
        ...SUEZ_MED_TO_ROTTERDAM
    ],
    "AEDXB|NLRTM": [
        ...DUBAI_TO_ARABIAN_SEA, [13.0, 50.0],
        ...SUEZ_MED_TO_ROTTERDAM
    ],
    "CNSHA|NLRTM": [
        ...SHANGHAI_TO_SINGAPORE, ...SINGAPORE_TO_ARABIAN_SEA.slice(1), [11.0, 55.0],
        ...SUEZ_MED_TO_ROTTERDAM
    ],
    "USLAX|CNSHA": [
        [33.74, -118.27], [34.0, -125.0], [35.5, -135.0], [38.0, -150.0],
        [40.0, -170.0], [38.0, -190.0], [34.0, -210.0], [32.0, -225.0], [31.0, -235.0],
        [31.23, -238.53]
    ],
    "AEDXB|INBOM": [
        ...DUBAI_TO_ARABIAN_SEA, [11.0, 61.0], [15.0, 68.0],
        [18.94, 72.84]
    ],
    "SGSIN|CNSHA": [
        ...[...SHANGHAI_TO_SINGAPORE].reverse()
    ],
    "AEDXB|SGSIN": [
        ...DUBAI_TO_ARABIAN_SEA, [11.0, 61.0], [7.0, 72.0], ...SINGAPORE_TO_ARABIAN_SEA.slice().reverse().slice(3)
    ],
    "AEDXB|CNSHA": [
        ...DUBAI_TO_ARABIAN_SEA, [11.0, 61.0], [7.0, 72.0], ...SINGAPORE_TO_ARABIAN_SEA.slice().reverse().slice(3),
        ...[...SHANGHAI_TO_SINGAPORE].reverse().slice(1)
    ],
    "USLAX|NLRTM": [
        [33.74, -118.27], [20.0, -115.0], [15.0, -105.0], [9.0, -85.0],
        [9.3, -79.9], /* Panama Canal */[15.0, -75.0], [20.0, -70.0],
        [25.0, -60.0], [35.0, -40.0], [45.0, -20.0], [48.0, -10.0],
        [50.0, -3.0], [51.0, 2.0], [51.92, 4.48]
    ],
    "USLAX|SGSIN": [
        [33.74, -118.27], [32.0, -135.0], [25.0, -160.0], [15.0, -170.0],
        [5.0, -190.0], [2.0, -210.0], [-2.0, -230.0], [1.0, -245.0], [1.26, -256.18]
    ],
    "USLAX|INBOM": [
        [33.74, -118.27], [32.0, -135.0], [25.0, -160.0], [15.0, -170.0],
        [5.0, -190.0], [2.0, -210.0], [-2.0, -230.0], [1.0, -245.0], [1.26, -256.18],
        ...[...SINGAPORE_TO_ARABIAN_SEA.map(p => [p[0], p[1] - 360] as [number, number])].slice().reverse(),
        [15.0, -288.5], [18.94, -287.16]
    ],
    "USLAX|AEDXB": [
        [33.74, -118.27], [32.0, -135.0], [25.0, -160.0], [15.0, -170.0],
        [5.0, -190.0], [2.0, -210.0], [-2.0, -230.0], [1.0, -245.0], [1.26, -256.18],
        ...[...SINGAPORE_TO_ARABIAN_SEA.map(p => [p[0], p[1] - 360] as [number, number])].slice().reverse(),
        [11.0, -299.0], [16.0, -305.0], [22.0, -300.5], [24.5, -302.5], [26.3, -303.8], [25.20, -304.73]
    ]
};

// Reverse BASE_MARITIME_ROUTES implicitly
const MARITIME_ROUTES: Record<string, [number, number][]> = { ...BASE_MARITIME_ROUTES };
Object.keys(BASE_MARITIME_ROUTES).forEach(key => {
    const [origin, dest] = key.split("|");
    if (!MARITIME_ROUTES[`${dest}|${origin}`]) {
        MARITIME_ROUTES[`${dest}|${origin}`] = [...BASE_MARITIME_ROUTES[key]].reverse();
    }
});

// SAFE alternatives for Maritime (Cape of Good Hope to avoid Red Sea entirely)
const SAFE_MARITIME_ROUTES: Record<string, [number, number][]> = {
    "INBOM|NLRTM": [
        [18.94, 72.84], [5.0, 65.0], ...CAPE_OF_GOOD_HOPE_PATH
    ],
    "SGSIN|NLRTM": [
        [1.26, 103.82], [-5.0, 100.0], [-15.0, 85.0], [-25.0, 70.0], [-35.0, 50.0],
        ...CAPE_OF_GOOD_HOPE_PATH.slice(3)
    ],
    "CNSHA|NLRTM": [
        ...SHANGHAI_TO_SINGAPORE, [-5.0, 100.0], [-15.0, 85.0], [-25.0, 70.0], [-35.0, 50.0],
        ...CAPE_OF_GOOD_HOPE_PATH.slice(3)
    ],
    "AEDXB|NLRTM": [
        ...DUBAI_TO_ARABIAN_SEA, [10.0, 52.0], [0.0, 48.0],
        ...CAPE_OF_GOOD_HOPE_PATH
    ]
};
Object.keys(SAFE_MARITIME_ROUTES).forEach(key => {
    const [origin, dest] = key.split("|");
    if (!SAFE_MARITIME_ROUTES[`${dest}|${origin}`]) {
        SAFE_MARITIME_ROUTES[`${dest}|${origin}`] = [...SAFE_MARITIME_ROUTES[key]].reverse();
    }
});

export function getMaritimeRoute(origin: string, destination: string, pref: string = "shortest"): [number, number][] {
    const key = `${origin}|${destination}`;

    if (pref === "safest" && SAFE_MARITIME_ROUTES[key]) {
        return SAFE_MARITIME_ROUTES[key];
    }

    if (MARITIME_ROUTES[key]) return MARITIME_ROUTES[key];

    // Fallback: If no hardcoded route, generate a curved point set over water approximation.
    const oc = getCoords(origin);
    const dc = getCoords(destination);
    const offset = pref === "safest" ? -25 : -10;
    return curvedPoints(oc, dc, 16, offset);
}

// ══════════════════════════════════════════════════════════════════════════════
// ── RAILWAY WAYPOINTS (India) ─────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export interface StationWaypoint { name: string; pos: [number, number]; }
const BASE_RAIL_ROUTES: Record<string, StationWaypoint[]> = {
    "NDLS|CSMT": [
        { name: "NDLS", pos: [28.56, 77.10] },
        { name: "Mathura Jn", pos: [27.50, 77.68] },
        { name: "Sawai Madhopur", pos: [25.99, 76.35] },
        { name: "Kota Jn", pos: [25.18, 75.83] },
        { name: "Ratlam Jn", pos: [23.33, 75.06] },
        { name: "Vadodara Jn", pos: [22.31, 73.18] },
        { name: "ST", pos: [21.19, 72.83] },
        { name: "CSMT", pos: [18.94, 72.84] },
    ],
    "NDLS|MAS": [
        { name: "NDLS", pos: [28.56, 77.10] },
        { name: "Agra Cantt", pos: [27.17, 78.00] },
        { name: "Jhansi", pos: [25.45, 78.57] },
        { name: "BPL", pos: [23.27, 77.43] },
        { name: "NGP", pos: [21.14, 79.08] },
        { name: "Balharshah", pos: [19.86, 79.37] },
        { name: "SC", pos: [17.46, 78.50] },
        { name: "Nellore", pos: [14.44, 79.99] },
        { name: "MAS", pos: [13.08, 80.27] },
    ],
    "CSMT|MAS": [
        { name: "CSMT", pos: [18.94, 72.84] },
        { name: "PUNE", pos: [18.52, 73.87] },
        { name: "Solapur", pos: [17.68, 75.91] },
        { name: "Wadi Jn", pos: [17.06, 76.97] },
        { name: "Guntakal", pos: [15.17, 77.37] },
        { name: "Renigunta", pos: [13.64, 79.52] },
        { name: "MAS", pos: [13.08, 80.27] },
    ],
    "NDLS|HWH": [
        { name: "NDLS", pos: [28.56, 77.10] },
        { name: "CNB", pos: [26.45, 80.36] },
        { name: "Allahabad", pos: [25.44, 81.84] },
        { name: "Mughal Sarai", pos: [25.28, 83.12] },
        { name: "Gaya Jn", pos: [24.79, 84.99] },
        { name: "Dhanbad", pos: [23.80, 86.43] },
        { name: "HWH", pos: [22.58, 88.33] },
    ],
    "NDLS|SBC": [
        { name: "NDLS", pos: [28.56, 77.10] },
        { name: "BPL", pos: [23.27, 77.43] },
        { name: "NGP", pos: [21.14, 79.08] },
        { name: "SC", pos: [17.46, 78.50] },
        { name: "Dharmavaram", pos: [14.41, 77.72] },
        { name: "SBC", pos: [12.97, 77.59] },
    ],
    "NDLS|SC": [
        { name: "NDLS", pos: [28.56, 77.10] },
        { name: "Jhansi", pos: [25.45, 78.57] },
        { name: "NGP", pos: [21.14, 79.08] },
        { name: "Balharshah", pos: [19.86, 79.37] },
        { name: "SC", pos: [17.45, 78.47] },
    ],
    "CSMT|HWH": [
        { name: "CSMT", pos: [18.94, 72.84] },
        { name: "Bhusaval", pos: [21.05, 75.79] },
        { name: "NGP", pos: [21.14, 79.08] },
        { name: "Raipur", pos: [21.25, 81.62] },
        { name: "Jharsuguda", pos: [21.85, 84.01] },
        { name: "Tatanagar", pos: [22.80, 86.20] },
        { name: "HWH", pos: [22.58, 88.33] }
    ],
    "CSMT|SBC": [
        { name: "CSMT", pos: [18.94, 72.84] },
        { name: "PUNE", pos: [18.52, 73.87] },
        { name: "Solapur", pos: [17.68, 75.91] },
        { name: "Guntakal", pos: [15.17, 77.37] },
        { name: "SBC", pos: [12.97, 77.59] }
    ],
    "CSMT|SC": [
        { name: "CSMT", pos: [18.94, 72.84] },
        { name: "PUNE", pos: [18.52, 73.87] },
        { name: "Solapur", pos: [17.68, 75.91] },
        { name: "Wadi Jn", pos: [17.06, 76.97] },
        { name: "SC", pos: [17.45, 78.47] }
    ],
    "MAS|HWH": [
        { name: "MAS", pos: [13.08, 80.27] },
        { name: "Vijayawada", pos: [16.50, 80.64] },
        { name: "Visakhapatnam", pos: [17.68, 83.21] },
        { name: "Bhubaneswar", pos: [20.29, 85.82] },
        { name: "Kharagpur", pos: [22.33, 87.32] },
        { name: "HWH", pos: [22.58, 88.33] }
    ],
    "MAS|SBC": [
        { name: "MAS", pos: [13.08, 80.27] },
        { name: "Katpadi", pos: [12.98, 79.13] },
        { name: "Jolarpettai", pos: [12.55, 78.56] },
        { name: "SBC", pos: [12.97, 77.59] }
    ],
    "MAS|SC": [
        { name: "MAS", pos: [13.08, 80.27] },
        { name: "Ongole", pos: [15.50, 80.04] },
        { name: "Vijayawada", pos: [16.50, 80.64] },
        { name: "Nalgonda", pos: [17.05, 79.26] },
        { name: "SC", pos: [17.45, 78.47] }
    ],
    "HWH|SBC": [
        { name: "HWH", pos: [22.58, 88.33] },
        { name: "Bhubaneswar", pos: [20.29, 85.82] },
        { name: "Visakhapatnam", pos: [17.68, 83.21] },
        { name: "Vijayawada", pos: [16.50, 80.64] },
        { name: "Renigunta", pos: [13.64, 79.52] },
        { name: "SBC", pos: [12.97, 77.59] }
    ],
    "HWH|SC": [
        { name: "HWH", pos: [22.58, 88.33] },
        { name: "Bhubaneswar", pos: [20.29, 85.82] },
        { name: "Visakhapatnam", pos: [17.68, 83.21] },
        { name: "Vijayawada", pos: [16.50, 80.64] },
        { name: "Nalgonda", pos: [17.05, 79.26] },
        { name: "SC", pos: [17.45, 78.47] }
    ],
    "SBC|SC": [
        { name: "SBC", pos: [12.97, 77.59] },
        { name: "Dharmavaram", pos: [14.41, 77.72] },
        { name: "Kurnool", pos: [15.82, 78.03] },
        { name: "Mahbubnagar", pos: [16.74, 78.00] },
        { name: "SC", pos: [17.45, 78.47] }
    ]
};

const RAIL_ROUTES: Record<string, StationWaypoint[]> = { ...BASE_RAIL_ROUTES };
Object.keys(BASE_RAIL_ROUTES).forEach(key => {
    const [origin, dest] = key.split("|");
    RAIL_ROUTES[`${dest}|${origin}`] = [...BASE_RAIL_ROUTES[key]].reverse();
});

const SAFE_RAIL_ROUTES: Record<string, StationWaypoint[]> = {
    "NDLS|HWH": [
        { name: "NDLS", pos: [28.56, 77.10] },
        { name: "Moradabad", pos: [28.83, 78.77] },
        { name: "LKO", pos: [26.84, 80.94] },
        { name: "Gorakhpur", pos: [26.76, 83.37] },
        { name: "PNBE", pos: [25.59, 85.13] },
        { name: "Malda Town", pos: [25.00, 88.14] },
        { name: "HWH", pos: [22.58, 88.33] }
    ],
    "CSMT|HWH": [
        { name: "CSMT", pos: [18.94, 72.84] },
        { name: "ST", pos: [21.19, 72.83] },
        { name: "BPL", pos: [23.27, 77.43] },
        { name: "Jabalpur", pos: [23.18, 79.98] },
        { name: "Katni", pos: [23.83, 80.39] },
        { name: "Ranchi", pos: [23.34, 85.30] },
        { name: "HWH", pos: [22.58, 88.33] }
    ],
    "MAS|HWH": [
        { name: "MAS", pos: [13.08, 80.27] },
        { name: "Renigunta", pos: [13.64, 79.52] },
        { name: "Raichur", pos: [16.20, 77.36] },
        { name: "NGP", pos: [21.14, 79.08] },
        { name: "Raipur", pos: [21.25, 81.62] },
        { name: "Jharsuguda", pos: [21.85, 84.01] },
        { name: "HWH", pos: [22.58, 88.33] }
    ]
};
Object.keys(SAFE_RAIL_ROUTES).forEach(key => {
    const [origin, dest] = key.split("|");
    SAFE_RAIL_ROUTES[`${dest}|${origin}`] = [...SAFE_RAIL_ROUTES[key]].reverse();
});

export function getRailRoute(origin: string, destination: string, pref: string = "shortest"): StationWaypoint[] {
    const key = `${origin}|${destination}`;

    if (pref === "safest" && SAFE_RAIL_ROUTES[key]) {
        return SAFE_RAIL_ROUTES[key];
    }

    if (RAIL_ROUTES[key]) return RAIL_ROUTES[key];

    // Fallback intermediate
    return [{ name: origin, pos: getCoords(origin) }, { name: destination, pos: getCoords(destination) }];
}

// ══════════════════════════════════════════════════════════════════════════════
// ── 1. GLOBAL RISK MAP ────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export const GlobalRiskMap = memo(function GlobalRiskMap({ height = 420 }: { height?: number }) {
    return (
        <div style={{ height, width: "100%", borderRadius: "16px", overflow: "hidden" }}>
            <MapContainer
                center={[20, 40]}
                zoom={2}
                style={{ height: "100%", width: "100%", zIndex: 1 }}
                scrollWheelZoom={false}
                worldCopyJump
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution="© CartoDB"
                />

                {/* Danger Zones (Rendered with multiple horizontal copies so panning across Date Line keeps them alive) */}
                {ALL_ZONES.flatMap(z =>
                    [-360, 0, 360].map(offset => (
                        <Circle
                            key={`${z.name}-${offset}`}
                            center={[z.lat, z.lng + offset]}
                            radius={z.radiusKm * 1000}
                            pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: z.opacity, weight: 1.5, dashArray: "4 4" }}
                        >
                            <Popup className="font-sans text-sm" maxWidth={250}>
                                <strong>{z.name}</strong><br />
                                ⚠️ Active Risk Zone ({z.type})<br />
                                <span className="text-xs text-slate-500 mt-1 block">{z.reason}</span>
                            </Popup>
                        </Circle>
                    ))
                )}

                {/* Pulsing markers for critical zones */}
                {ALL_ZONES.filter(z => z.type === "CRITICAL").flatMap((z, idx) =>
                    [-360, 0, 360].map((offset, offIdx) => (
                        <CircleMarker key={`pulse-${idx}-${offIdx}`} center={[z.lat, z.lng + offset]} radius={6} pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.85, weight: 2 }}>
                            <Popup className="font-sans" maxWidth={250}>
                                <strong>🚨 {z.name} — Critical</strong><br />
                                <span className="text-xs text-slate-500 mt-1 block">{z.reason}</span>
                            </Popup>
                        </CircleMarker>
                    ))
                )}
            </MapContainer>
        </div>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 2. AVIATION RISK MAP ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export const AviationRiskMap = memo(function AviationRiskMap({
    origin, destination, riskLevel, routePreference = "shortest", height = 300, routePath = [],
}: { origin: string; destination: string; riskLevel: string; routePreference?: string; height?: number; routePath?: string[] }) {
    const pathNodes = routePath.length >= 2 ? routePath : [origin, destination];
    const pathCoords = pathNodes.map(node => [...getCoords(node)] as [number, number]);

    // Prevent flight paths from crossing the 0 meridian back onto itself
    for (let i = 0; i < pathCoords.length - 1; i++) {
        if (pathCoords[i + 1][1] - pathCoords[i][1] > 180) {
            pathCoords[i + 1][1] -= 360;
        } else if (pathCoords[i][1] - pathCoords[i + 1][1] > 180) {
            pathCoords[i + 1][1] += 360;
        }
    }

    const color = riskColor(riskLevel);
    const curveOffset = routePreference === "safest" ? -14.5 : 4.5;

    const allArcs: [number, number][][] = [];
    const allShadows: [number, number][][] = [];
    for (let i = 0; i < pathCoords.length - 1; i++) {
        allArcs.push(curvedPoints(pathCoords[i], pathCoords[i + 1], 32, curveOffset));
        allShadows.push(curvedPoints(
            [pathCoords[i][0] - 0.3, pathCoords[i][1] + 0.3],
            [pathCoords[i + 1][0] - 0.3, pathCoords[i + 1][1] + 0.3],
            32, curveOffset,
        ));
    }

    const midSegmentIdx = Math.floor(allArcs.length / 2);
    const midArc = allArcs[midSegmentIdx];
    const midPt = midArc[Math.floor(midArc.length / 2)];

    // Filter which danger zones are relevant (roughly along path)
    const lngs = pathCoords.map(c => c[1]);
    const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
    const relevantZones = AVIATION_ZONES.filter(z =>
        Math.abs(z.lng - midLng) < 90,
    );

    // Custom plane icon
    const planeIcon = L.divIcon({
        html: `<span style="font-size:20px;line-height:1;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))">✈</span>`,
        className: "",
        iconAnchor: [10, 10],
    });

    const textLabel = (label: string) => L.divIcon({
        html: `<div style="color:#0f172a;font-size:12px;font-weight:700;text-shadow:1px 1px 2px #fff,-1px -1px 2px #fff,1px -1px 2px #fff,-1px 1px 2px #fff;white-space:nowrap;">${label}</div>`,
        className: "custom-text-label",
        iconSize: [0, 0],
        iconAnchor: [-8, 8]
    });

    return (
        <div style={{ height, width: "100%", borderRadius: "16px", overflow: "hidden" }}>
            <MapContainer
                center={midPt}
                zoom={3}
                style={{ height: "100%", width: "100%", zIndex: 1 }}
                scrollWheelZoom={false}
            >
                <FitBounds positions={pathCoords} />
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution="© CartoDB"
                />

                {/* Danger zones (translucent + wrapped) */}
                {relevantZones.flatMap(z =>
                    [-360, 0, 360].map(offset => (
                        <Circle
                            key={`${z.name}-${offset}`}
                            center={[z.lat, z.lng + offset]}
                            radius={z.radiusKm * 1000}
                            pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: z.opacity, weight: 1, dashArray: "4 4" }}
                        >
                            <Popup className="font-sans text-xs" maxWidth={250}>
                                <strong>{z.name}</strong><br />
                                {z.type} Zone<br />
                                <span className="text-slate-500 mt-1 block leading-tight">{z.reason}</span>
                            </Popup>
                        </Circle>
                    ))
                )}

                {/* Shadow paths */}
                {allShadows.map((shadow, idx) => (
                    <Polyline
                        key={`shadow-${idx}`}
                        positions={shadow}
                        pathOptions={{ color: "rgba(0,0,0,0.15)", weight: 6, opacity: 0.5, lineCap: "round" }}
                    />
                ))}

                {/* Main flight arcs */}
                {allArcs.map((arc, idx) => (
                    <Polyline
                        key={`arc-${idx}`}
                        positions={arc}
                        pathOptions={{ color, weight: 3, dashArray: "8 6", lineCap: "round" }}
                    />
                ))}

                {/* Node markers */}
                {pathNodes.map((node, idx) => {
                    const coords = pathCoords[idx];
                    const isOrigin = idx === 0;
                    const isDest = idx === pathNodes.length - 1;
                    const emoji = isOrigin ? "✈" : isDest ? "🏁" : "⛽";
                    const labelPostfix = isOrigin ? " (Origin)" : isDest ? " (Destination)" : " (Refuel)";

                    return (
                        <div key={`node-${idx}`}>
                            <CircleMarker center={coords} radius={4} pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 1.5 }}>
                                <Popup className="font-sans text-sm font-semibold">{emoji} {node}{labelPostfix}</Popup>
                            </CircleMarker>
                            <Marker position={coords} icon={textLabel(node)} interactive={false} />
                        </div>
                    );
                })}

                {/* Plane icon at midpoint */}
                <Marker position={midPt} icon={planeIcon}>
                    <Popup className="font-sans text-xs">{pathNodes.join(' → ')}</Popup>
                </Marker>
            </MapContainer>
        </div>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 3. MARITIME RISK MAP ──────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export const MaritimeRiskMap = memo(function MaritimeRiskMap({
    origin, destination, riskLevel, routePreference = "shortest", height = 300,
}: { origin: string; destination: string; riskLevel: string; routePreference?: string; height?: number }) {
    const waypoints = getMaritimeRoute(origin, destination, routePreference);
    const oCoords = waypoints[0];
    const dCoords = waypoints[waypoints.length - 1];
    const color = riskColor(riskLevel);

    // Clean text-only label
    const portLabel = (label: string) => L.divIcon({
        html: `<div style="color:#0f172a;font-size:12px;font-weight:700;text-shadow:1px 1px 2px #fff,-1px -1px 2px #fff,1px -1px 2px #fff,-1px 1px 2px #fff;white-space:nowrap;">${label}</div>`,
        className: "custom-port-label",
        iconSize: [0, 0],
        iconAnchor: [-8, 8]
    });

    return (
        <div style={{ height, width: "100%", borderRadius: "16px", overflow: "hidden" }}>
            <MapContainer
                center={[20, 60]}
                zoom={3}
                style={{ height: "100%", width: "100%", zIndex: 1 }}
                scrollWheelZoom={false}
                worldCopyJump
            >
                <FitBounds positions={[oCoords, dCoords]} />
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution="© CartoDB"
                />

                {/* Maritime danger zones (wrapped) */}
                {MARITIME_ZONES.flatMap(z =>
                    [-360, 0, 360].map(offset => (
                        <Circle
                            key={`${z.name}-${offset}`}
                            center={[z.lat, z.lng + offset]}
                            radius={z.radiusKm * 1000}
                            pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: z.opacity, weight: 1, dashArray: "4 4" }}
                        >
                            <Popup className="font-sans text-xs" maxWidth={250}>
                                <strong>{z.name}</strong><br />
                                {z.type} Risk Zone<br />
                                <span className="text-slate-500 mt-1 block leading-tight">{z.reason}</span>
                            </Popup>
                        </Circle>
                    ))
                )}

                {/* SVG styles for animated flowing dash line */}
                <style>{`
                    @keyframes dashFlow {
                        0% { stroke-dashoffset: 24; }
                        100% { stroke-dashoffset: 0; }
                    }
                    .maritime-path-anim {
                        animation: dashFlow 2.5s linear infinite;
                    }
                `}</style>

                {/* Thin shadow */}
                <Polyline
                    positions={waypoints.map(([lat, lng]) => [lat - 0.25, lng + 0.25] as [number, number])}
                    pathOptions={{ color: "rgba(0,0,0,0.12)", weight: 5, opacity: 0.8, lineCap: "round", lineJoin: "round" }}
                />

                {/* Subdued core line */}
                <Polyline
                    positions={waypoints}
                    pathOptions={{ color, weight: 2.5, opacity: 0.5, lineCap: "round", lineJoin: "round" }}
                />

                {/* Bright animated dashed highlight */}
                <Polyline
                    positions={waypoints}
                    pathOptions={{ color: riskLevel === "CRITICAL" ? "#ffffff" : color, weight: 2, dashArray: "6 6", opacity: 0.9, lineCap: "round", lineJoin: "round", className: "maritime-path-anim" }}
                />

                {/* Clean Start/End port dots */}
                <CircleMarker center={oCoords} radius={4} pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 1.5 }}>
                    <Popup className="font-sans text-sm font-semibold">🚢 {origin} (Origin)</Popup>
                </CircleMarker>
                <Marker position={oCoords} icon={portLabel(origin)} interactive={false} />

                <CircleMarker center={dCoords} radius={4} pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 1.5 }}>
                    <Popup className="font-sans text-sm font-semibold">⚓ {destination} (Destination)</Popup>
                </CircleMarker>
                <Marker position={dCoords} icon={portLabel(destination)} interactive={false} />
            </MapContainer>
        </div>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 4. RAILWAY RISK MAP (India) ───────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export const RailwayRiskMap = memo(function RailwayRiskMap({
    origin, destination, riskLevel, routePreference = "shortest", height = 300,
}: { origin: string; destination: string; riskLevel: string; routePreference?: string; height?: number }) {
    const waypoints = getRailRoute(origin, destination, routePreference);
    const allPositions = waypoints.map(w => w.pos);
    const color = riskColor(riskLevel);

    const textLabel = (name: string) => L.divIcon({
        html: `<div style="color:#0f172a;font-size:11px;font-weight:700;text-shadow:1px 1px 2px #fff,-1px -1px 2px #fff,1px -1px 2px #fff,-1px 1px 2px #fff;white-space:nowrap;">${name}</div>`,
        className: "custom-text-label",
        iconSize: [0, 0],
        iconAnchor: [-6, 6],
    });

    return (
        <div style={{ height, width: "100%", borderRadius: "16px", overflow: "hidden" }}>
            <MapContainer
                center={[22.0, 78.0]}
                zoom={5}
                style={{ height: "100%", width: "100%", zIndex: 1 }}
                scrollWheelZoom={false}
                maxBounds={[[6, 68], [35, 98]]}
                maxBoundsViscosity={0.8}
            >
                <FitBounds positions={allPositions} />
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    attribution="© CartoDB"
                />

                {/* Rail danger / risk zones */}
                {RAILWAY_ZONES.map(z => (
                    <Circle
                        key={z.name}
                        center={[z.lat, z.lng]}
                        radius={z.radiusKm * 1000}
                        pathOptions={{ color: z.color, fillColor: z.color, fillOpacity: z.opacity, weight: 1, dashArray: "4 4" }}
                    >
                        <Popup className="font-sans text-xs" maxWidth={250}>
                            <strong>{z.name}</strong><br />
                            {z.type} Risk Zone<br />
                            <span className="text-slate-500 mt-1 block leading-tight">{z.reason}</span>
                        </Popup>
                    </Circle>
                ))}

                {/* SVG styles for animated dash line */}
                <style>{`
                    @keyframes railDash {
                        0% { stroke-dashoffset: 20; }
                        100% { stroke-dashoffset: 0; }
                    }
                    .rail-path-anim {
                        animation: railDash 1.5s linear infinite;
                    }
                `}</style>

                {/* Thin shadow */}
                <Polyline
                    positions={allPositions.map(([lat, lng]) => [lat - 0.15, lng + 0.15] as [number, number])}
                    pathOptions={{ color: "rgba(0,0,0,0.12)", weight: 5, opacity: 0.6 }}
                />

                {/* Railway track under-line */}
                <Polyline
                    positions={allPositions}
                    pathOptions={{ color, weight: 2.5, opacity: 0.5, lineCap: "square" }}
                />

                {/* Railway animated dash on top */}
                <Polyline
                    positions={allPositions}
                    pathOptions={{ color: riskLevel === "CRITICAL" ? "#ffffff" : color, weight: 2, dashArray: "6 6", opacity: 0.9, lineCap: "square", className: "rail-path-anim" }}
                />

                {/* Station markers (little grey dots for stops along the way) */}
                {waypoints.slice(1, -1).map((station, i) => (
                    <CircleMarker key={i} center={station.pos} radius={3} pathOptions={{ color: "#fff", fillColor: "#9ca3af", fillOpacity: 1, weight: 1 }}>
                        <Popup className="font-sans text-xs font-semibold">🚆 {station.name}</Popup>
                    </CircleMarker>
                ))}

                {/* End station markers */}
                <CircleMarker center={waypoints[0].pos} radius={4.5} pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 1.5 }}>
                    <Popup className="font-sans text-sm font-semibold">🚉 {origin} (Origin)</Popup>
                </CircleMarker>
                <Marker position={waypoints[0].pos} icon={textLabel(origin)} interactive={false} />

                <CircleMarker center={waypoints[waypoints.length - 1].pos} radius={4.5} pathOptions={{ color: "#fff", fillColor: color, fillOpacity: 1, weight: 1.5 }}>
                    <Popup className="font-sans text-sm font-semibold">🏁 {destination} (Destination)</Popup>
                </CircleMarker>
                <Marker position={waypoints[waypoints.length - 1].pos} icon={textLabel(destination)} interactive={false} />
            </MapContainer>
        </div>
    );
});

// ── Backward-compat default export (simple flat map) ─────────────────────────
export function RiskMap({ origin, destination, riskLevel, height = 300 }: { origin: string; destination: string; riskLevel: string; height?: number }) {
    return <AviationRiskMap origin={origin} destination={destination} riskLevel={riskLevel} height={height} />;
}
