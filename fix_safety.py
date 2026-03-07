import sys

with open("frontend/src/components/RiskMap.tsx", "r", encoding="utf-8") as f:
    content = f.read()

target_str = """    WP_EDGES.forEach(([u, v]) => {
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
    });"""

replacement_str = """    WP_EDGES.forEach(([u, v]) => {
        const pointU = MARITIME_WP[u];
        const pointV = MARITIME_WP[v];
        
        // Safest routes MUST NOT take dangerous shortcuts.
        // We will just refuse to add these edges dynamically so the graph strictly cuts them out.
        if (pref === "safest" && (RED_SEA_DANGER.includes(u) || RED_SEA_DANGER.includes(v))) {
            return; // Disconnect the node completely if safe route is requested
        }
        
        // Also severely punish taking paths through known unsafe water regions like Gulf of Aden
        if (pref === "safest" && (u.includes("ADEN") || v.includes("ADEN") || u.includes("ARABIAN_SEA_NW") || v.includes("ARABIAN_SEA_NW"))) {
             return; // Full blockade
        }

        let weight = haversine(pointU, pointV);
        
        const lonDiff = Math.abs(pointU[1] - pointV[1]);
        if (lonDiff > 180) {
            const wrapLon = pointV[1] > 0 ? pointV[1] - 360 : pointV[1] + 360;
            weight = haversine(pointU, [pointV[0], wrapLon]);
        }

        adj[u].push({ to: v, weight }); adj[v].push({ to: u, weight });
    });"""

if target_str not in content:
    print("Could not find target DIJKSTRA string")
    sys.exit(1)

content = content.replace(target_str, replacement_str)

with open("frontend/src/components/RiskMap.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed safety mapping.")
