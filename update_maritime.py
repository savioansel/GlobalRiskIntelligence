import re
import sys

with open("frontend/src/components/RiskMap.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# The section to replace starts at "// ── MARITIME WAYPOINTS " and ends right before "// ── RAILWAY WAYPOINTS"
start_marker = "// ══════════════════════════════════════════════════════════════════════════════\n// ── MARITIME WAYPOINTS ────────────────────────────────────────────────────────\n// ══════════════════════════════════════════════════════════════════════════════\n"
end_marker = "// ══════════════════════════════════════════════════════════════════════════════\n// ── 4. RAILWAY RISK MAP (India) ───────────────────────────────────────────────\n// ══════════════════════════════════════════════════════════════════════════════\n"

# Wait, looking closely at the file dump:
# The end marker should be:
# 1474: // ══════════════════════════════════════════════════════════════════════════════
# 1475: // ── 4. RAILWAY RISK MAP (India) ───────────────────────────────────────────────
# 1476: // ══════════════════════════════════════════════════════════════════════════════

end_marker_alt = "// ══════════════════════════════════════════════════════════════════════════════\n// ── RAILWAY WAYPOINTS (India) ─────────────────────────────────────────────────\n// ══════════════════════════════════════════════════════════════════════════════\n"

NEW_MARITIME_ROUTING = """
const MARITIME_WP = {
    // ── Europe / Mediterranean ──────────────────────────────────────────────
    NORTH_SEA: [52.5, 4.0] as [number, number],
    ENGLISH_CHANNEL: [50.0, -2.0] as [number, number],
    BAY_OF_BISCAY: [45.0, -7.0] as [number, number],
    GIBRALTAR: [35.9, -6.6] as [number, number],
    MED_WEST: [38.0, 5.0] as [number, number],
    MED_EAST: [34.0, 25.0] as [number, number],
    SUEZ_NORTH: [31.5, 32.3] as [number, number],

    // ── Africa / Middle East ────────────────────────────────────────────────
    SUEZ_SOUTH: [29.5, 32.5] as [number, number],
    RED_SEA_NORTH: [25.0, 35.0] as [number, number],
    RED_SEA_SOUTH: [15.0, 41.5] as [number, number],
    BAB_EL_MANDEB: [12.6, 43.3] as [number, number],
    GULF_OF_ADEN: [12.0, 47.0] as [number, number],
    HORMUZ: [26.3, 56.4] as [number, number],
    GULF_OF_OMAN: [24.0, 59.0] as [number, number],
    ARABIAN_SEA_NORTH: [20.0, 65.0] as [number, number],
    ARABIAN_SEA_WEST: [15.0, 55.0] as [number, number],
    ARABIAN_SEA_EAST: [15.0, 70.0] as [number, number],
    EAST_AFRICA_NORTH: [5.0, 50.0] as [number, number],
    EAST_AFRICA_SOUTH: [-15.0, 45.0] as [number, number], // Mozambique Channel
    CAPE_OF_GOOD_HOPE: [-36.0, 20.0] as [number, number],
    WEST_AFRICA_SOUTH: [-20.0, 10.0] as [number, number],
    GULF_OF_GUINEA: [0.0, 0.0] as [number, number],
    WEST_AFRICA_NORTH: [15.0, -18.0] as [number, number],

    // ── Indian Ocean / Asia ─────────────────────────────────────────────────
    INDIAN_OCEAN_MID: [-5.0, 75.0] as [number, number],
    INDIAN_OCEAN_EAST: [0.0, 90.0] as [number, number],
    BAY_OF_BENGAL: [12.0, 85.0] as [number, number],
    SRI_LANKA_SOUTH: [5.5, 80.0] as [number, number],
    ANDAMAN_SEA: [10.0, 95.0] as [number, number],
    MALACCA_NORTH: [5.0, 98.0] as [number, number],
    MALACCA_SOUTH: [1.2, 103.5] as [number, number],
    SOUTH_CHINA_SEA_SOUTH: [5.0, 108.0] as [number, number],
    SOUTH_CHINA_SEA_MID: [15.0, 115.0] as [number, number],
    EAST_CHINA_SEA: [28.0, 124.0] as [number, number],
    SEA_OF_JAPAN: [38.0, 134.0] as [number, number],

    // ── Oceania ─────────────────────────────────────────────────────────────
    JAVA_SEA: [-5.0, 110.0] as [number, number],
    TIMOR_SEA: [-12.0, 125.0] as [number, number],
    AUS_NORTH: [-10.0, 135.0] as [number, number],
    AUS_EAST: [-25.0, 155.0] as [number, number],
    AUS_SOUTH: [-40.0, 135.0] as [number, number],
    AUS_WEST: [-25.0, 110.0] as [number, number],

    // ── Pacific Ocean ───────────────────────────────────────────────────────
    PACIFIC_NORTH_WEST: [45.0, 160.0] as [number, number],
    PACIFIC_NORTH_MID: [45.0, -170.0] as [number, number], // Dateline cross
    PACIFIC_NORTH_EAST: [40.0, -135.0] as [number, number],
    PACIFIC_MID_WEST: [20.0, 140.0] as [number, number],
    PACIFIC_MID: [20.0, -175.0] as [number, number],       // Dateline cross
    PACIFIC_MID_EAST: [20.0, -120.0] as [number, number],
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
    US_EAST_COAST_NORTH: [40.0, -70.0] as [number, number],
    NORTH_ATLANTIC_WEST: [45.0, -45.0] as [number, number],
    NORTH_ATLANTIC_EAST: [48.0, -20.0] as [number, number],
    MID_ATLANTIC_WEST: [25.0, -60.0] as [number, number],
    MID_ATLANTIC_EAST: [30.0, -35.0] as [number, number],
    EQUATORIAL_ATLANTIC: [0.0, -30.0] as [number, number],
    SOUTH_ATLANTIC_WEST: [-25.0, -35.0] as [number, number],
    SOUTH_ATLANTIC_EAST: [-25.0, -5.0] as [number, number],
    CAPE_HORN: [-57.0, -67.0] as [number, number],
    CHILE_COAST: [-30.0, -75.0] as [number, number]
};

const WP_EDGES: Array<[keyof typeof MARITIME_WP, keyof typeof MARITIME_WP]> = [
    // Europe & Med
    ["NORTH_SEA", "ENGLISH_CHANNEL"],
    ["ENGLISH_CHANNEL", "BAY_OF_BISCAY"],
    ["BAY_OF_BISCAY", "GIBRALTAR"],
    ["BAY_OF_BISCAY", "NORTH_ATLANTIC_EAST"],
    ["GIBRALTAR", "MED_WEST"],
    ["GIBRALTAR", "WEST_AFRICA_NORTH"],
    ["GIBRALTAR", "MID_ATLANTIC_EAST"],
    ["NORTH_ATLANTIC_EAST", "MID_ATLANTIC_EAST"],
    ["MED_WEST", "MED_EAST"],
    ["MED_EAST", "SUEZ_NORTH"],

    // Red Sea & Middle East (CRITICAL CHOKEPOINT)
    ["SUEZ_NORTH", "SUEZ_SOUTH"],
    ["SUEZ_SOUTH", "RED_SEA_NORTH"],
    ["RED_SEA_NORTH", "RED_SEA_SOUTH"],
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
    ["ARABIAN_SEA_EAST", "INDIAN_OCEAN_MID"],
    ["EAST_AFRICA_NORTH", "EAST_AFRICA_SOUTH"],
    ["EAST_AFRICA_NORTH", "INDIAN_OCEAN_MID"],
    ["EAST_AFRICA_SOUTH", "CAPE_OF_GOOD_HOPE"],
    ["CAPE_OF_GOOD_HOPE", "WEST_AFRICA_SOUTH"],
    ["CAPE_OF_GOOD_HOPE", "SOUTH_ATLANTIC_EAST"],
    ["WEST_AFRICA_SOUTH", "GULF_OF_GUINEA"],
    ["GULF_OF_GUINEA", "WEST_AFRICA_NORTH"],
    ["WEST_AFRICA_NORTH", "EQUATORIAL_ATLANTIC"],
    ["GULF_OF_GUINEA", "EQUATORIAL_ATLANTIC"],
    ["WEST_AFRICA_SOUTH", "SOUTH_ATLANTIC_EAST"],

    // Asia & Australia
    ["SRI_LANKA_SOUTH", "INDIAN_OCEAN_EAST"],
    ["SRI_LANKA_SOUTH", "BAY_OF_BENGAL"],
    ["SRI_LANKA_SOUTH", "ANDAMAN_SEA"],
    ["BAY_OF_BENGAL", "ANDAMAN_SEA"],
    ["ANDAMAN_SEA", "MALACCA_NORTH"],
    ["MALACCA_NORTH", "MALACCA_SOUTH"],
    ["INDIAN_OCEAN_MID", "INDIAN_OCEAN_EAST"],
    ["INDIAN_OCEAN_EAST", "JAVA_SEA"],
    ["INDIAN_OCEAN_EAST", "AUS_WEST"],
    ["JAVA_SEA", "TIMOR_SEA"],
    ["JAVA_SEA", "MALACCA_SOUTH"],
    ["TIMOR_SEA", "AUS_NORTH"],
    ["AUS_NORTH", "AUS_EAST"],
    ["AUS_WEST", "AUS_SOUTH"],
    ["AUS_SOUTH", "AUS_EAST"],
    ["MALACCA_SOUTH", "SOUTH_CHINA_SEA_SOUTH"],
    ["SOUTH_CHINA_SEA_SOUTH", "SOUTH_CHINA_SEA_MID"],
    ["SOUTH_CHINA_SEA_MID", "EAST_CHINA_SEA"],
    ["EAST_CHINA_SEA", "SEA_OF_JAPAN"],
    ["EAST_CHINA_SEA", "PACIFIC_MID_WEST"],
    ["SEA_OF_JAPAN", "PACIFIC_NORTH_WEST"],

    // Pacific Crossing (Handles Dateline)
    ["PACIFIC_NORTH_WEST", "PACIFIC_NORTH_MID"],
    ["PACIFIC_NORTH_MID", "PACIFIC_NORTH_EAST"],
    ["PACIFIC_NORTH_EAST", "US_WEST_COAST"],
    ["PACIFIC_MID_WEST", "PACIFIC_MID"],
    ["PACIFIC_MID", "PACIFIC_MID_EAST"],
    ["PACIFIC_MID_EAST", "MEXICO_WEST"],
    ["AUS_EAST", "PACIFIC_SOUTH_WEST"],
    ["PACIFIC_SOUTH_WEST", "PACIFIC_SOUTH_MID"],
    ["PACIFIC_SOUTH_MID", "PACIFIC_SOUTH_EAST"],
    ["PACIFIC_SOUTH_EAST", "CHILE_COAST"],
    ["CHILE_COAST", "CAPE_HORN"],
    ["CHILE_COAST", "PANAMA_PACIFIC"],
    ["MEXICO_WEST", "PANAMA_PACIFIC"],
    ["US_WEST_COAST", "MEXICO_WEST"],

    // Americas & Atlantic Crossing
    ["PANAMA_PACIFIC", "PANAMA_ATLANTIC"],
    ["PANAMA_ATLANTIC", "CARIBBEAN_SEA"],
    ["CARIBBEAN_SEA", "FLORIDA_STRAIT"],
    ["CARIBBEAN_SEA", "MID_ATLANTIC_WEST"],
    ["GULF_OF_MEXICO", "FLORIDA_STRAIT"],
    ["FLORIDA_STRAIT", "US_EAST_COAST_SOUTH"],
    ["US_EAST_COAST_SOUTH", "US_EAST_COAST_NORTH"],
    ["US_EAST_COAST_NORTH", "NORTH_ATLANTIC_WEST"],
    ["NORTH_ATLANTIC_WEST", "NORTH_ATLANTIC_EAST"],
    ["US_EAST_COAST_SOUTH", "MID_ATLANTIC_WEST"],
    ["MID_ATLANTIC_WEST", "MID_ATLANTIC_EAST"],
    ["MID_ATLANTIC_EAST", "EQUATORIAL_ATLANTIC"],
    ["EQUATORIAL_ATLANTIC", "SOUTH_ATLANTIC_WEST"],
    ["SOUTH_ATLANTIC_WEST", "SOUTH_ATLANTIC_EAST"],
    ["SOUTH_ATLANTIC_WEST", "CAPE_HORN"],
    ["MID_ATLANTIC_WEST", "NORTH_ATLANTIC_WEST"]
];

const PORT_TO_WP: Record<string, keyof typeof MARITIME_WP> = {
    "INBOM": "ARABIAN_SEA_EAST",
    "NLRTM": "NORTH_SEA",
    "CNSHA": "EAST_CHINA_SEA",
    "USLAX": "US_WEST_COAST",
    "AEDXB": "HORMUZ",
    "SGSIN": "MALACCA_SOUTH",
    "USNYC": "US_EAST_COAST_NORTH",
    "USLGB": "US_WEST_COAST",
    "DEHAM": "NORTH_SEA",
    "BEANR": "ENGLISH_CHANNEL",
    "CNSHG": "SOUTH_CHINA_SEA_MID",
    "CNBUS": "SEA_OF_JAPAN",
    "HKHKG": "SOUTH_CHINA_SEA_MID",
    "JPYOK": "PACIFIC_NORTH_WEST",
    "MYPKG": "MALACCA_NORTH",
    "MYTPP": "MALACCA_SOUTH",
    "TWKHH": "EAST_CHINA_SEA",
    "AUSYD": "AUS_EAST",
    "AUMEL": "AUS_SOUTH"
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
            const dangerNodes = ["BAB_EL_MANDEB", "RED_SEA_NORTH", "RED_SEA_SOUTH", "GULF_OF_ADEN", "SUEZ_NORTH", "SUEZ_SOUTH"];
            if (dangerNodes.includes(u) || dangerNodes.includes(v)) weight += 50000; // Adds 50,000km penalty
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
function smoothPath(path: [number, number][], segmentsPerEdge = 3): [number, number][] {
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
            const lng = p1[1] + (p2[1] - p1[1]) * t;
            if (j === segmentsPerEdge) smooth.push(p2);
            else smooth.push([lat, lng]);
        }
    }
    return smooth;
}

export function getMaritimeRoute(origin: string, destination: string, pref: string = "shortest"): [number, number][] {
    const oc = getCoords(origin);
    const dc = getCoords(destination);
    const startWp = PORT_TO_WP[origin];
    const endWp = PORT_TO_WP[destination];

    if (startWp && endWp && startWp !== endWp) {
        const wpPath = findDijkstraPath(startWp, endWp, pref);
        let pathCoords: [number, number][] = [oc, ...wpPath, dc];

        // Smooth the path to look like realistic curved shipping lanes
        pathCoords = smoothPath(pathCoords);

        // Prevent path wrap-around across the dateline for continuous rendering on a 2D map
        for (let i = 0; i < pathCoords.length - 1; i++) {
            if (pathCoords[i + 1][1] - pathCoords[i][1] > 180) pathCoords[i + 1][1] -= 360;
            else if (pathCoords[i][1] - pathCoords[i + 1][1] > 180) pathCoords[i + 1][1] += 360;
        }
        return pathCoords;
    }

    // Same-WP fallback: port→port in same region (e.g., two nearby ports)
    if (startWp && endWp && startWp === endWp) {
        return [oc, MARITIME_WP[startWp], dc];
    }

    // Final fallback: direct curve if port not perfectly mapped
    const offset = pref === "safest" ? -25 : -10;
    return curvedPoints(oc, dc, 16, offset);
}
"""

start_idx = content.find(start_marker)
end_idx = content.find(end_marker_alt)

if start_idx != -1 and end_idx != -1:
    new_content = content[:start_idx] + start_marker + NEW_MARITIME_ROUTING + "\n" + end_marker_alt + content[end_idx + len(end_marker_alt):]
    with open("frontend/src/components/RiskMap.tsx", "w", encoding="utf-8") as f:
        f.write(new_content)
    print("Successfully replaced maritime routing section!")
else:
    print(f"Error: Markers not found. start_idx: {start_idx}, end_idx: {end_idx}")
    sys.exit(1)
