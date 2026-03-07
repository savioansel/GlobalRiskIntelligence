import sys

with open("frontend/src/components/RiskMap.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "const RED_SEA_APPROACH =" in line:
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if "const RAIL_ROUTES: Record" in lines[i]:
        end_idx = i
        break

while "// ════════════════" not in lines[end_idx-1]:
    end_idx -= 1
end_idx -= 1

if start_idx == -1 or end_idx == -1:
    print(f"Failed to find indices: start={start_idx}, end={end_idx}")
    sys.exit(1)

NEW_MARITIME_ROUTING = """const MARITIME_WP = {
    // ── Exact Port Node Locations (To avoid sharp angles at terminals) ───
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

    // ── Local Approaches (Smooth turning points into ports) ─────────────
    APP_INBOM: [17.5, 71.0] as [number, number],
    APP_NLRTM: [52.3, 3.5] as [number, number],
    APP_DEHAM: [54.0, 7.5] as [number, number],
    APP_CNSHA: [30.5, 123.0] as [number, number],
    APP_USLAX: [33.5, -119.5] as [number, number],
    APP_AEDXB: [25.8, 55.0] as [number, number],
    APP_SGSIN: [1.1, 104.2] as [number, number],
    APP_USNYC: [40.0, -73.0] as [number, number],
    APP_HKHKG: [21.5, 114.5] as [number, number],
    APP_JPYOK: [34.5, 140.0] as [number, number],
    APP_AUSYD: [-33.8, 153.0] as [number, number],
    APP_AUMEL: [-39.0, 145.0] as [number, number],

    // ── Europe / Mediterranean ──────────────────────────────────────────────
    NORTH_SEA: [52.5, 4.0] as [number, number],
    ENGLISH_CHANNEL: [50.0, -2.0] as [number, number],
    BAY_OF_BISCAY: [45.0, -7.0] as [number, number],
    GIBRALTAR: [35.9, -6.6] as [number, number],
    MED_WEST: [38.0, 5.0] as [number, number],
    MED_CENTRAL: [36.0, 15.0] as [number, number],
    MED_EAST: [34.0, 25.0] as [number, number],
    SUEZ_NORTH: [31.5, 32.3] as [number, number],

    // ── Africa / Middle East ────────────────────────────────────────────────
    SUEZ_SOUTH: [29.5, 32.5] as [number, number],
    RED_SEA_NORTH: [25.0, 35.0] as [number, number],
    RED_SEA_MID: [20.0, 38.5] as [number, number],
    RED_SEA_SOUTH: [15.0, 41.5] as [number, number],
    BAB_EL_MANDEB: [12.6, 43.3] as [number, number],
    GULF_OF_ADEN: [12.0, 47.0] as [number, number],
    HORMUZ: [26.3, 56.4] as [number, number],
    GULF_OF_OMAN: [24.0, 59.0] as [number, number],
    ARABIAN_SEA_NORTH: [20.0, 65.0] as [number, number],
    ARABIAN_SEA_WEST: [15.0, 55.0] as [number, number],
    ARABIAN_SEA_EAST: [15.0, 70.0] as [number, number],
    EAST_AFRICA_NORTH: [5.0, 50.0] as [number, number],
    EAST_AFRICA_MID: [-5.0, 42.0] as [number, number],
    EAST_AFRICA_SOUTH: [-15.0, 45.0] as [number, number], // Mozambique Channel
    MADAGASCAR_EAST: [-15.0, 55.0] as [number, number],
    CAPE_OF_GOOD_HOPE: [-36.0, 20.0] as [number, number],
    WEST_AFRICA_SOUTH: [-20.0, 10.0] as [number, number],
    GULF_OF_GUINEA: [0.0, 0.0] as [number, number],
    WEST_AFRICA_MID: [8.0, -15.0] as [number, number],
    WEST_AFRICA_NORTH: [15.0, -18.0] as [number, number],
    CANARY_ISLANDS_OFFSHORE: [28.0, -18.0] as [number, number],

    // ── Indian Ocean / Asia ─────────────────────────────────────────────────
    INDIAN_OCEAN_MID_WEST: [-5.0, 60.0] as [number, number],
    INDIAN_OCEAN_MID: [-5.0, 75.0] as [number, number],
    INDIAN_OCEAN_EAST: [0.0, 90.0] as [number, number],
    BAY_OF_BENGAL: [12.0, 85.0] as [number, number],
    SRI_LANKA_SOUTH: [5.5, 80.0] as [number, number],
    ANDAMAN_SEA: [10.0, 95.0] as [number, number],
    MALACCA_NORTH: [5.0, 98.0] as [number, number],
    MALACCA_MID: [3.0, 101.0] as [number, number],
    MALACCA_SOUTH: [1.2, 103.5] as [number, number],
    SOUTH_CHINA_SEA_SOUTH: [5.0, 108.0] as [number, number],
    SOUTH_CHINA_SEA_MID: [15.0, 115.0] as [number, number],
    SOUTH_CHINA_SEA_NORTH: [19.0, 118.0] as [number, number],
    TAIWAN_STRAIT: [24.0, 119.5] as [number, number],
    EAST_CHINA_SEA: [28.0, 124.0] as [number, number],
    SEA_OF_JAPAN: [38.0, 134.0] as [number, number],

    // ── Oceania ─────────────────────────────────────────────────────────────
    JAVA_SEA: [-5.0, 110.0] as [number, number],
    FLORES_SEA: [-8.0, 120.0] as [number, number],
    TIMOR_SEA: [-12.0, 125.0] as [number, number],
    AUS_NORTH: [-10.0, 135.0] as [number, number],
    CORAL_SEA: [-15.0, 150.0] as [number, number],
    AUS_EAST: [-25.0, 155.0] as [number, number],
    TASMAN_SEA: [-35.0, 155.0] as [number, number],
    AUS_SOUTH: [-40.0, 135.0] as [number, number],
    GREAT_AUSTRALIAN_BIGHT: [-35.0, 125.0] as [number, number],
    AUS_WEST: [-25.0, 110.0] as [number, number],

    // ── Pacific Ocean ───────────────────────────────────────────────────────
    PACIFIC_NORTH_WEST: [45.0, 160.0] as [number, number],
    PACIFIC_NORTH_MID: [45.0, -170.0] as [number, number], // Dateline cross
    PACIFIC_NORTH_EAST: [40.0, -135.0] as [number, number],
    PACIFIC_MID_WEST: [20.0, 140.0] as [number, number],
    PACIFIC_MID: [20.0, -175.0] as [number, number],       // Dateline cross
    PACIFIC_MID_EAST: [20.0, -120.0] as [number, number],
    PACIFIC_EQUATOR_WEST: [0.0, 160.0] as [number, number],
    PACIFIC_EQUATOR_MID: [0.0, -170.0] as [number, number],
    PACIFIC_EQUATOR_EAST: [0.0, -120.0] as [number, number],
    PACIFIC_SOUTH_WEST: [-20.0, 170.0] as [number, number],
    PACIFIC_SOUTH_MID: [-25.0, -150.0] as [number, number],
    PACIFIC_SOUTH_EAST: [-30.0, -90.0] as [number, number],

    // ── Americas / Atlantic ─────────────────────────────────────────────────
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
    NORTH_ATLANTIC_WEST: [45.0, -45.0] as [number, number],
    NORTH_ATLANTIC_MID: [48.0, -30.0] as [number, number],
    NORTH_ATLANTIC_EAST: [48.0, -15.0] as [number, number],
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
    // --- Connections to exactly mapped ports ---
    ["PORT_INBOM", "APP_INBOM"],
    ["APP_INBOM", "ARABIAN_SEA_EAST"],
    ["PORT_NLRTM", "APP_NLRTM"],
    ["APP_NLRTM", "NORTH_SEA"],
    ["PORT_BEANR", "APP_NLRTM"], // Antwerp close to Rotterdam logic
    ["PORT_DEHAM", "APP_DEHAM"],
    ["APP_DEHAM", "NORTH_SEA"],
    ["PORT_USNYC", "APP_USNYC"],
    ["APP_USNYC", "US_EAST_COAST_NORTH"],
    ["PORT_AEDXB", "APP_AEDXB"],
    ["APP_AEDXB", "HORMUZ"],
    ["PORT_SGSIN", "APP_SGSIN"],
    ["APP_SGSIN", "MALACCA_SOUTH"],
    ["PORT_MYTPP", "APP_SGSIN"], // Tanjung pelepas adjacent to Singapore
    ["PORT_MYPKG", "MALACCA_MID"], // Port klang in straight of malacca
    ["PORT_HKHKG", "APP_HKHKG"],
    ["APP_HKHKG", "SOUTH_CHINA_SEA_NORTH"],
    ["PORT_CNSHG", "APP_HKHKG"], // Shenzhen near HK
    ["PORT_TWKHH", "TAIWAN_STRAIT"],
    ["PORT_CNSHA", "APP_CNSHA"],
    ["APP_CNSHA", "EAST_CHINA_SEA"],
    ["PORT_CNBUS", "SEA_OF_JAPAN"],
    ["PORT_JPYOK", "APP_JPYOK"],
    ["APP_JPYOK", "PACIFIC_NORTH_WEST"],
    ["PORT_USLAX", "APP_USLAX"],
    ["PORT_USLGB", "APP_USLAX"],
    ["APP_USLAX", "US_WEST_COAST"],
    ["PORT_AUSYD", "APP_AUSYD"],
    ["APP_AUSYD", "TASMAN_SEA"],
    ["PORT_AUMEL", "APP_AUMEL"],
    ["APP_AUMEL", "AUS_SOUTH"],

    // Europe & Med
    ["NORTH_SEA", "ENGLISH_CHANNEL"],
    ["ENGLISH_CHANNEL", "BAY_OF_BISCAY"],
    ["BAY_OF_BISCAY", "GIBRALTAR"],
    ["BAY_OF_BISCAY", "NORTH_ATLANTIC_EAST"],
    ["GIBRALTAR", "MED_WEST"],
    ["GIBRALTAR", "CANARY_ISLANDS_OFFSHORE"],
    ["CANARY_ISLANDS_OFFSHORE", "WEST_AFRICA_NORTH"],
    ["GIBRALTAR", "MID_ATLANTIC_EAST"],
    ["NORTH_ATLANTIC_EAST", "MID_ATLANTIC_EAST"],
    ["NORTH_ATLANTIC_EAST", "NORTH_ATLANTIC_MID"],
    ["NORTH_ATLANTIC_MID", "NORTH_ATLANTIC_WEST"],
    ["MED_WEST", "MED_CENTRAL"],
    ["MED_CENTRAL", "MED_EAST"],
    ["MED_EAST", "SUEZ_NORTH"],

    // Red Sea & Middle East (CRITICAL CHOKEPOINT)
    ["SUEZ_NORTH", "SUEZ_SOUTH"],
    ["SUEZ_SOUTH", "RED_SEA_NORTH"],
    ["RED_SEA_NORTH", "RED_SEA_MID"],
    ["RED_SEA_MID", "RED_SEA_SOUTH"],
    ["RED_SEA_SOUTH", "BAB_EL_MANDEB"],
    ["BAB_EL_MANDEB", "GULF_OF_ADEN"],
    ["GULF_OF_ADEN", "ARABIAN_SEA_WEST"],
    ["HORMUZ", "GULF_OF_OMAN"],
    ["GULF_OF_OMAN", "ARABIAN_SEA_NORTH"],

    // Indian Ocean & Africa Coast
    ["ARABIAN_SEA_WEST", "ARABIAN_SEA_NORTH"],
    ["ARABIAN_SEA_WEST", "EAST_AFRICA_NORTH"],
    ["ARABIAN_SEA_NORTH", "ARABIAN_SEA_EAST"],
    ["ARABIAN_SEA_EAST", "SRI_LANKA_SOUTH"],
    ["ARABIAN_SEA_EAST", "INDIAN_OCEAN_MID_WEST"],
    ["EAST_AFRICA_NORTH", "EAST_AFRICA_MID"],
    ["EAST_AFRICA_NORTH", "INDIAN_OCEAN_MID_WEST"],
    ["INDIAN_OCEAN_MID_WEST", "INDIAN_OCEAN_MID"],
    ["MADAGASCAR_EAST", "INDIAN_OCEAN_MID_WEST"],
    ["EAST_AFRICA_MID", "EAST_AFRICA_SOUTH"],
    ["EAST_AFRICA_SOUTH", "CAPE_OF_GOOD_HOPE"],
    ["MADAGASCAR_EAST", "CAPE_OF_GOOD_HOPE"], // Alternative route off madagascar
    ["CAPE_OF_GOOD_HOPE", "WEST_AFRICA_SOUTH"],
    ["CAPE_OF_GOOD_HOPE", "SOUTH_ATLANTIC_EAST"],
    ["WEST_AFRICA_SOUTH", "GULF_OF_GUINEA"],
    ["GULF_OF_GUINEA", "WEST_AFRICA_MID"],
    ["WEST_AFRICA_MID", "WEST_AFRICA_NORTH"],
    ["WEST_AFRICA_NORTH", "EQUATORIAL_ATLANTIC"],
    ["GULF_OF_GUINEA", "EQUATORIAL_ATLANTIC"],
    ["WEST_AFRICA_SOUTH", "SOUTH_ATLANTIC_EAST"],

    // Asia & Australia
    ["SRI_LANKA_SOUTH", "INDIAN_OCEAN_MID"],
    ["INDIAN_OCEAN_MID", "INDIAN_OCEAN_EAST"],
    ["SRI_LANKA_SOUTH", "BAY_OF_BENGAL"],
    ["SRI_LANKA_SOUTH", "ANDAMAN_SEA"],
    ["BAY_OF_BENGAL", "ANDAMAN_SEA"],
    ["ANDAMAN_SEA", "MALACCA_NORTH"],
    ["MALACCA_NORTH", "MALACCA_MID"],
    ["MALACCA_MID", "MALACCA_SOUTH"],
    ["INDIAN_OCEAN_EAST", "JAVA_SEA"],
    ["INDIAN_OCEAN_EAST", "AUS_WEST"],
    ["JAVA_SEA", "FLORES_SEA"],
    ["FLORES_SEA", "TIMOR_SEA"],
    ["JAVA_SEA", "MALACCA_SOUTH"],
    ["TIMOR_SEA", "AUS_NORTH"],
    ["AUS_NORTH", "CORAL_SEA"],
    ["CORAL_SEA", "AUS_EAST"],
    ["AUS_WEST", "GREAT_AUSTRALIAN_BIGHT"],
    ["GREAT_AUSTRALIAN_BIGHT", "AUS_SOUTH"],
    ["AUS_SOUTH", "TASMAN_SEA"],
    ["TASMAN_SEA", "AUS_EAST"],
    ["MALACCA_SOUTH", "SOUTH_CHINA_SEA_SOUTH"],
    ["SOUTH_CHINA_SEA_SOUTH", "SOUTH_CHINA_SEA_MID"],
    ["SOUTH_CHINA_SEA_MID", "SOUTH_CHINA_SEA_NORTH"],
    ["SOUTH_CHINA_SEA_NORTH", "TAIWAN_STRAIT"],
    ["TAIWAN_STRAIT", "EAST_CHINA_SEA"],
    ["SOUTH_CHINA_SEA_NORTH", "PACIFIC_MID_WEST"], // Path east of Taiwan / Phil
    ["EAST_CHINA_SEA", "SEA_OF_JAPAN"],
    ["EAST_CHINA_SEA", "PACIFIC_MID_WEST"],
    ["SEA_OF_JAPAN", "PACIFIC_NORTH_WEST"],
    ["PACIFIC_NORTH_WEST", "PACIFIC_MID_WEST"],

    // Pacific Crossing (Handles Dateline)
    ["PACIFIC_NORTH_WEST", "PACIFIC_NORTH_MID"],
    ["PACIFIC_NORTH_MID", "PACIFIC_NORTH_EAST"],
    ["PACIFIC_NORTH_EAST", "US_WEST_COAST"],
    ["PACIFIC_NORTH_EAST", "CANADIAN_COAST"],
    ["PACIFIC_MID_WEST", "PACIFIC_MID"],
    ["PACIFIC_MID", "PACIFIC_MID_EAST"],
    ["PACIFIC_MID_EAST", "US_WEST_COAST"],
    ["PACIFIC_MID_EAST", "MEXICO_WEST"],
    ["PACIFIC_MID_WEST", "PACIFIC_EQUATOR_WEST"],
    ["PACIFIC_EQUATOR_WEST", "PACIFIC_EQUATOR_MID"],
    ["PACIFIC_EQUATOR_MID", "PACIFIC_EQUATOR_EAST"],
    ["PACIFIC_EQUATOR_EAST", "PANAMA_PACIFIC"],
    ["PACIFIC_EQUATOR_EAST", "MEXICO_WEST"],
    ["AUS_EAST", "PACIFIC_SOUTH_WEST"],
    ["PACIFIC_SOUTH_WEST", "PACIFIC_SOUTH_MID"],
    ["PACIFIC_SOUTH_MID", "PACIFIC_SOUTH_EAST"],
    ["PACIFIC_SOUTH_EAST", "CHILE_COAST"],
    ["CHILE_COAST", "CAPE_HORN_WEST"],
    ["CAPE_HORN_WEST", "CAPE_HORN"],
    ["CAPE_HORN", "CAPE_HORN_EAST"],
    ["CAPE_HORN_EAST", "BRAZIL_COAST"],
    ["CHILE_COAST", "PANAMA_PACIFIC"],
    ["MEXICO_WEST", "PANAMA_PACIFIC"],
    ["US_WEST_COAST", "MEXICO_WEST"],

    // Americas & Atlantic Crossing
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
    ["CANADIAN_COAST", "NORTH_ATLANTIC_WEST"],
    ["US_EAST_COAST_MID", "NORTH_ATLANTIC_WEST"],
    ["US_EAST_COAST_SOUTH", "MID_ATLANTIC_WEST"],
    ["MID_ATLANTIC_WEST", "MID_ATLANTIC_MID"],
    ["MID_ATLANTIC_MID", "MID_ATLANTIC_EAST"],
    ["MID_ATLANTIC_EAST", "EQUATORIAL_ATLANTIC"],
    ["MID_ATLANTIC_MID", "NORTH_ATLANTIC_MID"],
    ["EQUATORIAL_ATLANTIC_WEST", "EQUATORIAL_ATLANTIC"],
    ["EQUATORIAL_ATLANTIC", "SOUTH_ATLANTIC_MID"],
    ["SOUTH_ATLANTIC_MID", "SOUTH_ATLANTIC_EAST"],
    ["SOUTH_ATLANTIC_WEST", "SOUTH_ATLANTIC_MID"],
    ["BRAZIL_COAST", "SOUTH_ATLANTIC_WEST"],
    ["SOUTH_ATLANTIC_WEST", "CAPE_HORN_EAST"],
    ["MID_ATLANTIC_WEST", "NORTH_ATLANTIC_WEST"]
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
    WP_EDGES.forEach(([u, v]) => {
        const pointU = MARITIME_WP[u];
        const pointV = MARITIME_WP[v];
        
        let weight = haversine(pointU, pointV);
        
        // Handle Dateline Crossing (Longitude wrap) dynamically
        const lonDiff = Math.abs(pointU[1] - pointV[1]);
        if (lonDiff > 180) {
            // It's crossing the Pacific dateline, correct the distance calculation
            const wrapLon = pointV[1] > 0 ? pointV[1] - 360 : pointV[1] + 360;
            weight = haversine(pointU, [pointV[0], wrapLon]);
        }

        // For "safest", severely penalize Red Sea / Bab el-Mandeb / Black Sea
        if (pref === "safest") {
            const dangerNodes = ["BAB_EL_MANDEB", "RED_SEA_NORTH", "RED_SEA_MID", "RED_SEA_SOUTH", "GULF_OF_ADEN", "SUEZ_NORTH", "SUEZ_SOUTH"];
            if (dangerNodes.includes(u) || dangerNodes.includes(v)) {
                // MASSIVE penalty to force routing around Cape of Good Hope
                weight += 200000;
            }
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
    
    // Fallback if no path found
    if (pathKeys.length === 0 || pathKeys[0] !== startNode) {
        return [MARITIME_WP[startNode], MARITIME_WP[endNode]];
    }

    return pathKeys.map(k => MARITIME_WP[k as keyof typeof MARITIME_WP]);
}

/** Inserts intermediate points to make rigid straight lines smooth along a great circle */
function smoothPath(path: [number, number][], segmentsPerEdge = 6): [number, number][] {
    if (path.length < 2) return path;
    const smooth: [number, number][] = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
        const p1 = path[i];
        const p2 = path[i + 1];
        
        // Don't smooth across dateline wrap
        if (Math.abs(p1[1] - p2[1]) > 180) {
            smooth.push(p2);
            continue;
        }

        for (let j = 1; j <= segmentsPerEdge; j++) {
            const t = j / segmentsPerEdge;
            const lat = p1[0] + (p2[0] - p1[0]) * t;
            // Introduce a very tiny bezier/cosine wave offset to make it look even more organic like ship tracking data
            const lng = p1[1] + (p2[1] - p1[1]) * t;
            if (j === segmentsPerEdge) smooth.push(p2);
            else smooth.push([lat, lng]);
        }
    }
    return smooth;
}

export function getMaritimeRoute(origin: string, destination: string, pref: string = "shortest"): [number, number][] {
    const startWp = PORT_TO_WP[origin];
    const endWp = PORT_TO_WP[destination];

    if (startWp && endWp && startWp !== endWp) {
        const wpPath = findDijkstraPath(startWp, endWp, pref);
        let pathCoords: [number, number][] = [...wpPath];

        // Smooth the path to look like highly detailed curved shipping lanes
        pathCoords = smoothPath(pathCoords, 24); // Heavy segmentation for extreme smoothness

        // Prevent path wrap-around across the dateline for continuous rendering on a 2D map
        for (let i = 0; i < pathCoords.length - 1; i++) {
            if (pathCoords[i + 1][1] - pathCoords[i][1] > 180) pathCoords[i + 1][1] -= 360;
            else if (pathCoords[i][1] - pathCoords[i + 1][1] > 180) pathCoords[i + 1][1] += 360;
        }
        return pathCoords;
    }
    
    // Final fallback: direct curve if port not perfectly mapped
    const oc = getCoords(origin);
    const dc = getCoords(destination);
    const offset = pref === "safest" ? -25 : -10;
    return curvedPoints(oc, dc, 24, offset);
}
"""

new_lines = lines[:start_idx] + [NEW_MARITIME_ROUTING + "\n"] + lines[end_idx:]

with open("frontend/src/components/RiskMap.tsx", "w", encoding="utf-8") as f:
    f.writelines(new_lines)
    
print("Successfully replaced.")
