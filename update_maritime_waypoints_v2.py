import sys

with open("frontend/src/components/RiskMap.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if "const MARITIME_WP =" in line:
        start_idx = i
        break

for i in range(start_idx, len(lines)):
    if "const BASE_RAIL_ROUTES:" in lines[i] or "function getRailRoute" in lines[i] or "const SAFE_RAIL_ROUTES:" in lines[i]:
        end_idx = i
        break

# Go back one to hit the true end marker properly
while "// ════════════════" not in lines[end_idx-1]:
    if end_idx <= start_idx:
        break
    end_idx -= 1
end_idx -= 1

if start_idx == -1 or end_idx <= 0:
    print(f"Failed to find indices: start={start_idx}, end={end_idx}")
    sys.exit(1)

NEW_MARITIME_ROUTING = """const MARITIME_WP = {
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
    JP_SOUTH: [33.0, 135.0] as [number, number],
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

    // ── Oceania ───
    JAVA_SEA_W: [-4.0, 108.0] as [number, number],
    JAVA_SEA_E: [-6.0, 115.0] as [number, number],
    FLORES_SEA: [-8.0, 122.0] as [number, number],
    TIMOR_SEA: [-10.0, 128.0] as [number, number],
    ARAFURA_SEA: [-11.0, 135.0] as [number, number],
    TORRES_STRAIT: [-10.5, 142.0] as [number, number],
    CORAL_SEA_N: [-15.0, 148.0] as [number, number],
    CORAL_SEA_S: [-22.0, 154.0] as [number, number],
    SYD_APP: [-33.5, 152.0] as [number, number],
    TASMAN_SEA: [-38.0, 150.0] as [number, number],
    MEL_APP: [-39.0, 145.0] as [number, number],
    GREAT_AUS_BIGHT: [-36.0, 130.0] as [number, number],
    AUS_SW: [-35.0, 115.0] as [number, number]
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
    ["TW_STRAIT_N", "JP_SOUTH"],
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
    ["SYD_APP", "TASMAN_SEA"],
    ["TASMAN_SEA", "MEL_APP"],
    ["MEL_APP", "GREAT_AUS_BIGHT"],
    ["GREAT_AUS_BIGHT", "AUS_SW"],
    ["AUS_SW", "JAVA_SEA_W"] // Australian loop
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
    
    // Dynamic weight mapping for Safest paths
    const RED_SEA_DANGER = ["BAB_EL_MANDEB", "RED_SEA_S", "RED_SEA_MID", "RED_SEA_N", "SUEZ_S", "SUEZ_N"];

    WP_EDGES.forEach(([u, v]) => {
        const pointU = MARITIME_WP[u];
        const pointV = MARITIME_WP[v];
        
        let weight = haversine(pointU, pointV);
        
        // Handle Dateline Crossing mathematically so it connects
        const lonDiff = Math.abs(pointU[1] - pointV[1]);
        if (lonDiff > 180) {
            const wrapLon = pointV[1] > 0 ? pointV[1] - 360 : pointV[1] + 360;
            weight = haversine(pointU, [pointV[0], wrapLon]);
        }

        // Severely penalize Red Sea / Suez if "safest" is requested
        if (pref === "safest" && (RED_SEA_DANGER.includes(u) || RED_SEA_DANGER.includes(v))) {
            weight += 500000;
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

/** 
 * Advanced Catmull-Rom Spline interpolation.
 * Perfectly rounds corners while hitting every waypoint exactly to avoid land overlap. 
 */
function smoothPath(path: [number, number][], segments = 16): [number, number][] {
    if (path.length < 3) return path;
    const smooth: [number, number][] = [];
    
    for (let i = 0; i < path.length - 1; i++) {
        const p0 = i === 0 ? path[0] : path[i - 1];
        const p1 = path[i];
        const p2 = path[i + 1];
        const p3 = i + 2 < path.length ? path[i + 2] : path[path.length - 1];
        
        // Anti-wrap logic
        if (Math.abs(p1[1] - p2[1]) > 180) {
            smooth.push(p1);
            continue; // Draw straight line across dateline wrap cut
        }

        // Normalize boundary points against the main segment to prevent spline curling across planet
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
    
    return smooth; // Perfectly curving route points!
}

export function getMaritimeRoute(origin: string, destination: string, pref: string = "shortest"): [number, number][] {
    const startWp = PORT_TO_WP[origin];
    const endWp = PORT_TO_WP[destination];

    if (startWp && endWp && startWp !== endWp) {
        const wpPath = findDijkstraPath(startWp, endWp, pref);
        let pathCoords: [number, number][] = [...wpPath];

        // Process through high-density Catmull-Rom spline
        pathCoords = smoothPath(pathCoords, 16); 

        // Fix any longitude overshoots post-spline filtering (+180/-180)
        for (let i = 0; i < pathCoords.length - 1; i++) {
            if (pathCoords[i + 1][1] - pathCoords[i][1] > 180) pathCoords[i + 1][1] -= 360;
            else if (pathCoords[i][1] - pathCoords[i + 1][1] > 180) pathCoords[i + 1][1] += 360;
        }
        return pathCoords;
    }
    
    // Final fallback
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
