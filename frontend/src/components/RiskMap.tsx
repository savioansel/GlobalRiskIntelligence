
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
const MARITIME_WP = {
    // ── Exact Port Node Locations ───
    PORT_INBOM: [18.94, 72.84] as [number, number],
    PORT_NLRTM: [51.92, 4.48] as [number, number],
    PORT_CNSHA: [31.23, 121.47] as [number, number],
    PORT_USLAX: [33.74, -118.27] as [number, number],
    PORT_USLGB: [33.75, -118.21] as [number, number],
    PORT_AEDXB: [25.20, 55.27] as [number, number],
    PORT_SGSIN: [1.26, 103.82] as [number, number],
    PORT_USNYC: [40.67, -74.00] as [number, number],
    PORT_DEHAM: [53.54, 9.99] as [number, number],
    PORT_BEANR: [51.23, 4.40] as [number, number],
    PORT_CNSHG: [22.50, 113.88] as [number, number],
    PORT_CNBUS: [35.10, 129.04] as [number, number],
    PORT_HKHKG: [22.33, 114.13] as [number, number],
    PORT_JPYOK: [35.44, 139.64] as [number, number],
    PORT_MYPKG: [3.00, 101.40] as [number, number],
    PORT_MYTPP: [1.36, 103.55] as [number, number],
    PORT_TWKHH: [22.56, 120.31] as [number, number],
    PORT_AUSYD: [-33.86, 151.20] as [number, number],
    PORT_AUMEL: [-37.81, 144.96] as [number, number],

    // ── High-Def Indian Ocean & Asian Coasts ───
    IN_WEST_1: [18.0, 71.5] as [number, number],
    IN_WEST_2: [15.0, 72.0] as [number, number],
    IN_WEST_3: [12.0, 73.5] as [number, number],
    IN_SOUTH: [7.5, 76.5] as [number, number], // Cape Comorin offshore
    LK_WEST: [6.5, 79.0] as [number, number],
    LK_SOUTH: [5.5, 80.5] as [number, number],
    LK_EAST: [6.0, 82.5] as [number, number],
    BAY_BENGAL_S: [6.5, 86.0] as [number, number],
    ANDAMAN_W: [6.5, 91.0] as [number, number],
    ANDAMAN_S: [5.5, 95.0] as [number, number],
    MALACCA_NNW: [5.5, 97.5] as [number, number],
    MALACCA_NW: [4.5, 99.0] as [number, number],
    MALACCA_MID: [3.0, 100.8] as [number, number],
    MALACCA_SE: [1.8, 102.5] as [number, number],
    SINGAPORE_STRAIT_W: [1.1, 103.2] as [number, number],
    SINGAPORE_STRAIT_E: [1.3, 104.5] as [number, number],
    SCS_SW: [4.0, 106.5] as [number, number],
    SCS_W: [8.0, 109.5] as [number, number],
    SCS_MID: [13.0, 112.5] as [number, number],
    SCS_N: [18.0, 115.5] as [number, number],
    HK_APP: [21.5, 114.5] as [number, number],
    TW_STRAIT_S: [22.5, 119.0] as [number, number], // near Kaohsiung
    TW_STRAIT_N: [25.5, 120.5] as [number, number],
    ECS_W: [28.0, 122.5] as [number, number],
    SHA_APP: [30.5, 122.8] as [number, number],

    // ── Japan & Korea ───
    BUSAN_APP: [34.5, 130.0] as [number, number],
    SEA_OF_JAPAN_S: [36.0, 132.0] as [number, number],
    JP_SOUTH: [32.0, 135.0] as [number, number],
    KYUSHU_S: [30.0, 130.5] as [number, number],
    YOK_APP: [34.5, 140.0] as [number, number],
    JP_EAST: [38.0, 143.0] as [number, number],

    // ── Middle East & Red Sea ───
    DXB_APP: [25.5, 55.0] as [number, number],
    HORMUZ: [26.3, 56.4] as [number, number],
    OMAN_GULF: [24.0, 59.0] as [number, number],
    ARABIAN_SEA_N: [21.0, 63.0] as [number, number],
    ARABIAN_SEA_NW: [16.0, 58.0] as [number, number],
    ADEN_E: [12.5, 50.0] as [number, number],
    ADEN_W: [12.0, 46.0] as [number, number],
    BAB_EL_MANDEB: [12.6, 43.3] as [number, number], // DANGER
    RED_SEA_S: [16.0, 40.5] as [number, number], // DANGER
    RED_SEA_MID: [21.0, 38.0] as [number, number], // DANGER
    RED_SEA_N: [26.0, 35.0] as [number, number], // DANGER
    SUEZ_S: [29.5, 32.5] as [number, number], // DANGER
    SUEZ_N: [31.5, 32.3] as [number, number],

    // ── Europe & Atlantic ───
    MED_E: [33.5, 28.0] as [number, number],
    MED_C_E: [35.0, 20.0] as [number, number],
    MED_C: [36.5, 14.0] as [number, number],
    MED_C_W: [38.0, 8.0] as [number, number],
    MED_W: [36.5, 0.0] as [number, number],
    GIBRALTAR: [35.9, -6.6] as [number, number],
    PT_WEST: [38.5, -10.0] as [number, number],
    ES_WEST: [43.0, -10.5] as [number, number],
    BISCAY: [46.0, -8.0] as [number, number],
    ENG_CH_W: [49.5, -4.0] as [number, number],
    ENG_CH_E: [50.5, 0.5] as [number, number],
    RTM_APP: [52.0, 3.5] as [number, number],
    NORTH_SEA: [53.5, 5.0] as [number, number],
    HAM_APP: [54.0, 7.5] as [number, number],

    // ── Trans-Atlantic & US East ───
    ATL_N_E: [49.0, -15.0] as [number, number],
    ATL_N_M: [47.0, -35.0] as [number, number],
    ATL_N_W: [43.0, -55.0] as [number, number],
    NYC_APP_E: [40.5, -68.0] as [number, number],
    NYC_APP: [40.0, -73.0] as [number, number],

    // ── Africa (Cape Route - Safest Alternative) ───
    AFRICA_E_1: [8.0, 52.0] as [number, number],
    AFRICA_E_2: [0.0, 48.0] as [number, number],
    AFRICA_E_3: [-10.0, 43.0] as [number, number],
    AFRICA_E_4: [-20.0, 38.0] as [number, number],
    AFRICA_E_5: [-30.0, 33.0] as [number, number],
    CAPE_HOPE_E: [-36.0, 25.0] as [number, number],
    CAPE_HOPE: [-37.0, 20.0] as [number, number],
    CAPE_HOPE_W: [-35.0, 15.0] as [number, number],
    AFRICA_W_1: [-25.0, 10.0] as [number, number],
    AFRICA_W_2: [-15.0, 5.0] as [number, number],
    AFRICA_W_3: [-5.0, 0.0] as [number, number],
    AFRICA_W_4: [5.0, -10.0] as [number, number],
    AFRICA_W_5: [15.0, -20.0] as [number, number],
    CANARIES_W: [28.0, -20.0] as [number, number],

    // ── Trans-Pacific & US West ───
    PAC_N_W: [42.0, 155.0] as [number, number],
    PAC_N_W2: [45.0, 175.0] as [number, number],
    PAC_N_M: [46.0, -165.0] as [number, number], // dateline
    PAC_N_E2: [44.0, -145.0] as [number, number],
    PAC_N_E: [38.0, -130.0] as [number, number],
    LAX_APP: [34.0, -120.0] as [number, number],

    PAC_M_W: [25.0, 140.0] as [number, number],
    PAC_M_M: [25.0, 180.0] as [number, number], // dateline
    PAC_M_E: [25.0, -140.0] as [number, number],

    PACIFIC_SOUTH_WEST: [-20.0, 170.0] as [number, number],
    PACIFIC_SOUTH_MID: [-25.0, -150.0] as [number, number],
    PACIFIC_SOUTH_EAST: [-30.0, -90.0] as [number, number],

    // ── Oceania ───
    JAVA_SEA_W: [-4.0, 108.0] as [number, number],
    JAVA_SEA_E: [-6.0, 115.0] as [number, number],
    FLORES_SEA: [-8.0, 122.0] as [number, number],
    TIMOR_SEA: [-10.0, 128.0] as [number, number],
    ARAFURA_SEA: [-11.0, 135.0] as [number, number],
    TORRES_STRAIT: [-10.5, 142.0] as [number, number], // Too tight for large ships but okay for general nodes
    SOLOMON_SEA: [-4.0, 153.0] as [number, number], // Safely passes east of PNG
    CORAL_SEA_N: [-15.0, 155.0] as [number, number],
    CORAL_SEA_S: [-22.0, 155.0] as [number, number],
    SYD_APP: [-33.5, 152.0] as [number, number],
    CAPE_HOWE: [-37.8, 150.5] as [number, number],
    BASS_STRAIT_E: [-39.5, 148.0] as [number, number],
    MEL_APP: [-39.5, 145.0] as [number, number],
    GREAT_AUS_BIGHT: [-36.0, 130.0] as [number, number],
    AUS_SW: [-35.0, 115.0] as [number, number],

    // NEW SAFEST BYPASSES: Avoid South China Sea and Malacca by routing to open Ocean
    SUNDA_STRAIT: [-6.0, 105.0] as [number, number], // Escape from Java sea to Indian Ocean
    INDIAN_OCEAN_EAST: [-10.0, 100.0] as [number, number],
    MAKASSAR_STRAIT: [-2.0, 118.0] as [number, number],
    CELEBES_SEA: [3.0, 122.0] as [number, number],
    PHILIPPINE_SEA_S: [8.0, 128.0] as [number, number],
    PHILIPPINE_SEA_M: [15.0, 130.0] as [number, number],
    PHILIPPINE_SEA_N: [22.0, 130.0] as [number, number],
    JP_SOUTH_E: [30.0, 135.0] as [number, number],

    // ── Americas & Atlantic ───
    US_WEST_COAST: [33.0, -122.0] as [number, number],
    MEXICO_WEST: [15.0, -100.0] as [number, number],
    PANAMA_PACIFIC: [7.0, -80.0] as [number, number],
    PANAMA_ATLANTIC: [10.0, -79.5] as [number, number],
    CARIBBEAN_SEA: [15.0, -70.0] as [number, number],
    GULF_OF_MEXICO: [25.0, -90.0] as [number, number],
    FLORIDA_STRAIT: [24.0, -80.0] as [number, number],
    US_EAST_COAST_SOUTH: [30.0, -75.0] as [number, number],
    US_EAST_COAST_MID: [35.0, -73.0] as [number, number],
    US_EAST_COAST_NORTH: [40.0, -70.0] as [number, number],
    CANADIAN_COAST: [45.0, -60.0] as [number, number],
    MID_ATLANTIC_WEST: [25.0, -60.0] as [number, number],
    MID_ATLANTIC_MID: [30.0, -45.0] as [number, number],
    MID_ATLANTIC_EAST: [30.0, -30.0] as [number, number],
    EQUATORIAL_ATLANTIC_WEST: [0.0, -40.0] as [number, number],
    EQUATORIAL_ATLANTIC: [0.0, -25.0] as [number, number],
    SOUTH_ATLANTIC_WEST: [-25.0, -35.0] as [number, number],
    SOUTH_ATLANTIC_MID: [-25.0, -20.0] as [number, number],
    SOUTH_ATLANTIC_EAST: [-25.0, -5.0] as [number, number],
    CAPE_HORN_WEST: [-55.0, -75.0] as [number, number],
    CAPE_HORN: [-57.0, -67.0] as [number, number],
    CAPE_HORN_EAST: [-53.0, -60.0] as [number, number],
    CHILE_COAST: [-30.0, -75.0] as [number, number],
    BRAZIL_COAST: [-20.0, -35.0] as [number, number]
};

const WP_EDGES: Array<[keyof typeof MARITIME_WP, keyof typeof MARITIME_WP]> = [
    // Ports to Approaches
    ["PORT_INBOM", "IN_WEST_1"],
    ["PORT_NLRTM", "RTM_APP"],
    ["PORT_BEANR", "RTM_APP"],
    ["PORT_DEHAM", "HAM_APP"],
    ["PORT_USNYC", "NYC_APP"],
    ["PORT_AEDXB", "DXB_APP"],
    ["PORT_SGSIN", "SINGAPORE_STRAIT_W"],
    ["PORT_MYTPP", "SINGAPORE_STRAIT_W"],
    ["PORT_MYPKG", "MALACCA_MID"],
    ["PORT_CNSHA", "SHA_APP"],
    ["PORT_HKHKG", "HK_APP"],
    ["PORT_CNSHG", "HK_APP"],
    ["PORT_TWKHH", "TW_STRAIT_S"],
    ["PORT_CNBUS", "BUSAN_APP"],
    ["PORT_JPYOK", "YOK_APP"],
    ["PORT_USLAX", "LAX_APP"],
    ["PORT_USLGB", "LAX_APP"],
    ["PORT_AUSYD", "SYD_APP"],
    ["PORT_AUMEL", "MEL_APP"],

    // India to Singapore (The Route requested to be smooth)
    ["IN_WEST_1", "IN_WEST_2"],
    ["IN_WEST_2", "IN_WEST_3"],
    ["IN_WEST_3", "IN_SOUTH"],
    ["IN_SOUTH", "LK_WEST"],
    ["LK_WEST", "LK_SOUTH"],
    ["LK_SOUTH", "LK_EAST"],
    ["LK_EAST", "BAY_BENGAL_S"],
    ["BAY_BENGAL_S", "ANDAMAN_W"],
    ["ANDAMAN_W", "ANDAMAN_S"],
    ["ANDAMAN_S", "MALACCA_NNW"],
    ["MALACCA_NNW", "MALACCA_NW"],
    ["MALACCA_NW", "MALACCA_MID"],
    ["MALACCA_MID", "MALACCA_SE"],
    ["MALACCA_SE", "SINGAPORE_STRAIT_W"],
    ["SINGAPORE_STRAIT_W", "SINGAPORE_STRAIT_E"],

    // Middle East to India
    ["DXB_APP", "HORMUZ"],
    ["HORMUZ", "OMAN_GULF"],
    ["OMAN_GULF", "ARABIAN_SEA_N"],
    ["ARABIAN_SEA_N", "IN_WEST_1"],

    // Red Sea / Suez (DANGER ZONE)
    ["ARABIAN_SEA_NW", "ADEN_E"],
    ["ARABIAN_SEA_N", "ARABIAN_SEA_NW"],
    ["IN_WEST_1", "ARABIAN_SEA_NW"],
    ["ADEN_E", "ADEN_W"],
    ["ADEN_W", "BAB_EL_MANDEB"],
    ["BAB_EL_MANDEB", "RED_SEA_S"],
    ["RED_SEA_S", "RED_SEA_MID"],
    ["RED_SEA_MID", "RED_SEA_N"],
    ["RED_SEA_N", "SUEZ_S"],
    ["SUEZ_S", "SUEZ_N"],
    ["SUEZ_N", "MED_E"],

    // Cap of Good Hope (SAFE ALTERNATIVE)
    ["IN_SOUTH", "AFRICA_E_1"],
    ["ARABIAN_SEA_NW", "AFRICA_E_1"],
    ["AFRICA_E_1", "AFRICA_E_2"],
    ["AFRICA_E_2", "AFRICA_E_3"],
    ["AFRICA_E_3", "AFRICA_E_4"],
    ["AFRICA_E_4", "AFRICA_E_5"],
    ["AFRICA_E_5", "CAPE_HOPE_E"],
    ["CAPE_HOPE_E", "CAPE_HOPE"],
    ["CAPE_HOPE", "CAPE_HOPE_W"],
    ["CAPE_HOPE_W", "AFRICA_W_1"],
    ["AFRICA_W_1", "AFRICA_W_2"],
    ["AFRICA_W_2", "AFRICA_W_3"],
    ["AFRICA_W_3", "AFRICA_W_4"],
    ["AFRICA_W_4", "AFRICA_W_5"],
    ["AFRICA_W_5", "CANARIES_W"],
    ["CANARIES_W", "GIBRALTAR"],
    ["CANARIES_W", "PT_WEST"], // Bypass gibraltar for N. Europe

    // Europe / Med
    ["MED_E", "MED_C_E"],
    ["MED_C_E", "MED_C"],
    ["MED_C", "MED_C_W"],
    ["MED_C_W", "MED_W"],
    ["MED_W", "GIBRALTAR"],
    ["GIBRALTAR", "PT_WEST"],
    ["PT_WEST", "ES_WEST"],
    ["ES_WEST", "BISCAY"],
    ["BISCAY", "ENG_CH_W"],
    ["ENG_CH_W", "ENG_CH_E"],
    ["ENG_CH_E", "RTM_APP"],
    ["RTM_APP", "NORTH_SEA"],
    ["NORTH_SEA", "HAM_APP"],

    // Asia & China Sea
    ["SINGAPORE_STRAIT_E", "SCS_SW"],
    ["SCS_SW", "SCS_W"],
    ["SCS_W", "SCS_MID"],
    ["SCS_MID", "HK_APP"],
    ["SCS_MID", "SCS_N"],
    ["HK_APP", "SCS_N"],
    ["SCS_N", "TW_STRAIT_S"],
    ["TW_STRAIT_S", "TW_STRAIT_N"],
    ["TW_STRAIT_N", "ECS_W"],
    ["ECS_W", "SHA_APP"],

    // Japan
    ["ECS_W", "BUSAN_APP"],
    ["BUSAN_APP", "SEA_OF_JAPAN_S"],
    ["TW_STRAIT_N", "KYUSHU_S"],
    ["ECS_W", "KYUSHU_S"],
    ["SHA_APP", "KYUSHU_S"],
    ["BUSAN_APP", "KYUSHU_S"],
    ["KYUSHU_S", "JP_SOUTH"],
    ["JP_SOUTH", "YOK_APP"], // external approach
    ["YOK_APP", "JP_EAST"],

    // Pacific Crossing
    ["JP_EAST", "PAC_N_W"],
    ["PAC_N_W", "PAC_N_W2"],
    ["PAC_N_W2", "PAC_N_M"],
    ["PAC_N_M", "PAC_N_E2"],
    ["PAC_N_E2", "PAC_N_E"],
    ["PAC_N_E", "LAX_APP"],
    ["JP_SOUTH", "PAC_M_W"],
    ["PAC_M_W", "PAC_M_M"],
    ["PAC_M_M", "PAC_M_E"],
    ["PAC_M_E", "LAX_APP"],

    // Trans-Atlantic
    ["BISCAY", "ATL_N_E"],
    ["ENG_CH_W", "ATL_N_E"],
    ["ATL_N_E", "ATL_N_M"],
    ["ATL_N_M", "ATL_N_W"],
    ["ATL_N_W", "NYC_APP_E"],
    ["NYC_APP_E", "NYC_APP"],
    ["NYC_APP", "US_EAST_COAST_NORTH"],

    // Oceania
    ["SINGAPORE_STRAIT_E", "JAVA_SEA_W"],
    ["JAVA_SEA_W", "JAVA_SEA_E"],
    ["JAVA_SEA_E", "FLORES_SEA"],
    ["FLORES_SEA", "TIMOR_SEA"],
    ["TIMOR_SEA", "ARAFURA_SEA"],
    ["ARAFURA_SEA", "TORRES_STRAIT"],
    ["TORRES_STRAIT", "CORAL_SEA_N"],
    ["CORAL_SEA_N", "CORAL_SEA_S"],
    ["CORAL_SEA_S", "SYD_APP"],
    ["SYD_APP", "CAPE_HOWE"],
    ["CAPE_HOWE", "BASS_STRAIT_E"],
    ["BASS_STRAIT_E", "MEL_APP"],
    ["MEL_APP", "GREAT_AUS_BIGHT"],
    ["GREAT_AUS_BIGHT", "AUS_SW"],
    ["AUS_SW", "JAVA_SEA_W"], // Australian loop

    // NEW SAFEST BYPASSES: Avoid South China Sea and Malacca by routing to open Ocean
    ["JAVA_SEA_W", "SUNDA_STRAIT"],
    ["SUNDA_STRAIT", "INDIAN_OCEAN_EAST"], // escape past Sumatra
    ["INDIAN_OCEAN_EAST", "IN_SOUTH"], // Added edge to hook into Indian ocean network
    ["INDIAN_OCEAN_EAST", "AUS_SW"],

    ["JAVA_SEA_E", "MAKASSAR_STRAIT"],
    ["MAKASSAR_STRAIT", "CELEBES_SEA"],
    ["CELEBES_SEA", "PHILIPPINE_SEA_S"],
    ["PHILIPPINE_SEA_S", "PHILIPPINE_SEA_M"],
    ["PHILIPPINE_SEA_M", "PHILIPPINE_SEA_N"],
    ["PHILIPPINE_SEA_N", "JP_SOUTH_E"],
    ["JP_SOUTH_E", "YOK_APP"],
    ["JP_SOUTH_E", "JP_SOUTH"], // Re-enter Japan safely without SCS

    // Connect Philippines bypass to Australia correctly
    ["PHILIPPINE_SEA_S", "SOLOMON_SEA"],
    ["SOLOMON_SEA", "CORAL_SEA_N"],
    ["CORAL_SEA_S", "PACIFIC_SOUTH_WEST"],
    ["PACIFIC_SOUTH_WEST", "PACIFIC_SOUTH_MID"],
    ["PACIFIC_SOUTH_MID", "PACIFIC_SOUTH_EAST"],

    // Americas & Atlantic Crossing
    ["LAX_APP", "US_WEST_COAST"],
    ["US_WEST_COAST", "MEXICO_WEST"],
    ["MEXICO_WEST", "PANAMA_PACIFIC"],
    ["CHILE_COAST", "PANAMA_PACIFIC"],
    ["PACIFIC_SOUTH_EAST", "CHILE_COAST"],
    ["CHILE_COAST", "CAPE_HORN_WEST"],
    ["CAPE_HORN_WEST", "CAPE_HORN"],
    ["CAPE_HORN", "CAPE_HORN_EAST"],
    ["CAPE_HORN_EAST", "BRAZIL_COAST"],
    ["PANAMA_PACIFIC", "PANAMA_ATLANTIC"],
    ["PANAMA_ATLANTIC", "CARIBBEAN_SEA"],
    ["CARIBBEAN_SEA", "FLORIDA_STRAIT"],
    ["CARIBBEAN_SEA", "MID_ATLANTIC_WEST"],
    ["CARIBBEAN_SEA", "EQUATORIAL_ATLANTIC_WEST"],
    ["GULF_OF_MEXICO", "FLORIDA_STRAIT"],
    ["FLORIDA_STRAIT", "US_EAST_COAST_SOUTH"],
    ["US_EAST_COAST_SOUTH", "US_EAST_COAST_MID"],
    ["US_EAST_COAST_MID", "US_EAST_COAST_NORTH"],
    ["US_EAST_COAST_NORTH", "CANADIAN_COAST"],
    ["CANADIAN_COAST", "ATL_N_W"],
    ["US_EAST_COAST_MID", "ATL_N_W"],
    ["US_EAST_COAST_SOUTH", "MID_ATLANTIC_WEST"],
    ["MID_ATLANTIC_WEST", "MID_ATLANTIC_MID"],
    ["MID_ATLANTIC_MID", "MID_ATLANTIC_EAST"],
    ["MID_ATLANTIC_EAST", "EQUATORIAL_ATLANTIC"],
    ["MID_ATLANTIC_MID", "ATL_N_M"],
    ["EQUATORIAL_ATLANTIC_WEST", "EQUATORIAL_ATLANTIC"],
    ["EQUATORIAL_ATLANTIC", "SOUTH_ATLANTIC_MID"],
    ["SOUTH_ATLANTIC_MID", "SOUTH_ATLANTIC_EAST"],
    ["SOUTH_ATLANTIC_WEST", "SOUTH_ATLANTIC_MID"],
    ["BRAZIL_COAST", "SOUTH_ATLANTIC_WEST"]
];

const PORT_TO_WP: Record<string, keyof typeof MARITIME_WP> = {
    "INBOM": "PORT_INBOM",
    "NLRTM": "PORT_NLRTM",
    "CNSHA": "PORT_CNSHA",
    "USLAX": "PORT_USLAX",
    "AEDXB": "PORT_AEDXB",
    "SGSIN": "PORT_SGSIN",
    "USNYC": "PORT_USNYC",
    "USLGB": "PORT_USLGB",
    "DEHAM": "PORT_DEHAM",
    "BEANR": "PORT_BEANR",
    "CNSHG": "PORT_CNSHG",
    "CNBUS": "PORT_CNBUS",
    "HKHKG": "PORT_HKHKG",
    "JPYOK": "PORT_JPYOK",
    "MYPKG": "PORT_MYPKG",
    "MYTPP": "PORT_MYTPP",
    "TWKHH": "PORT_TWKHH",
    "AUSYD": "PORT_AUSYD",
    "AUMEL": "PORT_AUMEL"
};

function haversine(a: [number, number], b: [number, number]) {
    const Math_PI = Math.PI;
    const Math_cos = Math.cos;
    const Math_sin = Math.sin;
    const dLat = (b[0] - a[0]) * Math_PI / 180;
    const dLon = (b[1] - a[1]) * Math_PI / 180;
    const Math_sin_dLat_2 = Math_sin(dLat / 2);
    const Math_sin_dLon_2 = Math_sin(dLon / 2);
    const a_val = Math_sin_dLat_2 * Math_sin_dLat_2 +
        Math_sin_dLon_2 * Math_sin_dLon_2 * Math_cos(a[0] * Math_PI / 180) * Math_cos(b[0] * Math_PI / 180);
    return 6371 * 2 * Math.atan2(Math.sqrt(a_val), Math.sqrt(1 - a_val));
}

function findDijkstraPath(startNode: keyof typeof MARITIME_WP, endNode: keyof typeof MARITIME_WP, pref: string): [number, number][] {
    const nodes = Object.keys(MARITIME_WP) as (keyof typeof MARITIME_WP)[];
    const dist: Record<string, number> = {};
    const prev: Record<string, string | null> = {};
    const Q = new Set<string>(nodes);

    nodes.forEach(n => { dist[n] = Infinity; prev[n] = null; });
    dist[startNode] = 0;

    const adj: Record<string, Array<{ to: string, weight: number }>> = {};
    nodes.forEach(n => adj[n] = []);

    // Instead of hardcoding arrays, dynamically check proximity to ANY danger zone in MARITIME_ZONES!
    WP_EDGES.forEach(([u, v]) => {
        const pointU = MARITIME_WP[u];
        const pointV = MARITIME_WP[v];

        let weight = haversine(pointU, pointV);

        // Adjust for world wrapping
        const lonDiff = Math.abs(pointU[1] - pointV[1]);
        if (lonDiff > 180) {
            const wrapLon = pointV[1] > 0 ? pointV[1] - 360 : pointV[1] + 360;
            weight = haversine(pointU, [pointV[0], wrapLon]);
        }

        // Massive dynamic penalty if ANY of the nodes overlap a danger zone when doing 'safest'
        if (pref === "safest") {
            // we will evaluate RiskMap's exported MARITIME_ZONES
            let proximityPenalty = 0;

            // Re-define here minimally to avoid TS import loops if we're evaluating inside this function 
            // but we can just use the literal constants based on the exact same ones
            const DangerZones = [
                { lat: 26.6, lng: 56.3, rKm: 250, t: 1 }, // Hormuz (CRITICAL)
                { lat: 15.0, lng: 42.5, rKm: 450, t: 1 }, // Red Sea (CRITICAL)
                { lat: 11.5, lng: 48.5, rKm: 380, t: 1 }, // Aden (CRITICAL)
                { lat: 43.5, lng: 34.0, rKm: 300, t: 1 },  // Black Sea (HIGH)
                { lat: 2.0, lng: 5.0, rKm: 500, t: 1 },  // Guinea
                { lat: 3.0, lng: 100.0, rKm: 300, t: 1 },  // Malacca
                { lat: 12.0, lng: 114.0, rKm: 700, t: 1 }, // South China Sea
                { lat: 13.0, lng: -66.0, rKm: 500, t: 1 } // Caribbean
            ];

            for (const z of DangerZones) {
                // If segment endpoint u or v is inside range
                const distU = haversine(pointU, [z.lat, z.lng]);
                const distV = haversine(pointV, [z.lat, z.lng]);

                // If the node itself is deep inside the exclusion area,
                // check if the destination ITSELF is inside. 
                // We MUST not penalize entering the zone if that zone contains our destination/start.
                if (distU < z.rKm || distV < z.rKm) {
                    const distEnd = haversine(MARITIME_WP[endNode], [z.lat, z.lng]);
                    const distStart = haversine(MARITIME_WP[startNode], [z.lat, z.lng]);

                    // Only apply a massive penalty if we are passing THROUGH this zone (neither dest nor start is in it)
                    if (distEnd > z.rKm && distStart > z.rKm) {
                        proximityPenalty += 1000000;
                    }
                }
            }
            weight += proximityPenalty;
        }

        adj[u].push({ to: v, weight }); adj[v].push({ to: u, weight });
    });

    while (Q.size > 0) {
        let u: string | null = null;
        let minDist = Infinity;
        Q.forEach(node => { if (dist[node] < minDist) { minDist = dist[node]; u = node; } });
        if (!u || minDist === Infinity) break;
        if (u === endNode) break;
        Q.delete(u);

        adj[u].forEach(neighbor => {
            if (Q.has(neighbor.to)) {
                const alt = dist[u!] + neighbor.weight;
                if (alt < dist[neighbor.to]) {
                    dist[neighbor.to] = alt;
                    prev[neighbor.to] = u;
                }
            }
        });
    }

    const pathKeys: string[] = [];
    let curr: string | null = endNode;
    while (curr) { pathKeys.unshift(curr); curr = prev[curr]; }

    if (pathKeys.length === 0 || pathKeys[0] !== startNode) {
        return [MARITIME_WP[startNode], MARITIME_WP[endNode]];
    }

    return pathKeys.map(k => MARITIME_WP[k as keyof typeof MARITIME_WP]);
}

function smoothPath(path: [number, number][], segments = 16): [number, number][] {
    if (path.length < 3) return path;
    const smooth: [number, number][] = [];

    for (let i = 0; i < path.length - 1; i++) {
        const p0 = i === 0 ? path[0] : path[i - 1];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = i + 2 < path.length ? path[i + 2] : path[path.length - 1];

        if (Math.abs(p1[1] - p2[1]) > 180) {
            smooth.push(p1);
            continue;
        }

        const normalizeLng = (ref: number, tgt: number) => Math.abs(tgt - ref) > 180 ? (tgt < ref ? tgt + 360 : tgt - 360) : tgt;
        const nLng0 = normalizeLng(p1[1], p0[1]);
        const nLng3 = normalizeLng(p2[1], p3[1]);

        for (let j = 0; j < segments; j++) {
            const t = j / segments;
            const t2 = t * t;
            const t3 = t2 * t;

            const lat = 0.5 * (
                (2 * p1[0]) +
                (-p0[0] + p2[0]) * t +
                (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
            );

            const lng = 0.5 * (
                (2 * p1[1]) +
                (-nLng0 + p2[1]) * t +
                (2 * nLng0 - 5 * p1[1] + 4 * p2[1] - nLng3) * t2 +
                (-nLng0 + 3 * p1[1] - 3 * p2[1] + nLng3) * t3
            );

            smooth.push([lat, lng]);
        }
    }
    smooth.push(path[path.length - 1]);

    return smooth;
}

export function getMaritimeRoute(origin: string, destination: string, pref: string = "shortest"): [number, number][] {
    const startWp = PORT_TO_WP[origin];
    const endWp = PORT_TO_WP[destination];

    if (startWp && endWp && startWp !== endWp) {
        const wpPath = findDijkstraPath(startWp, endWp, pref);
        let pathCoords: [number, number][] = [...wpPath];

        pathCoords = smoothPath(pathCoords, 16);

        for (let i = 0; i < pathCoords.length - 1; i++) {
            if (pathCoords[i + 1][1] - pathCoords[i][1] > 180) pathCoords[i + 1][1] -= 360;
            else if (pathCoords[i][1] - pathCoords[i + 1][1] > 180) pathCoords[i + 1][1] += 360;
        }
        return pathCoords;
    }

    const oc = getCoords(origin);
    const dc = getCoords(destination);
    const offset = pref === "safest" ? -25 : -10;
    return curvedPoints(oc, dc, 24, offset);
}

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
                    url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
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
                    url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
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
                    url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
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
                    url="https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors'
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
