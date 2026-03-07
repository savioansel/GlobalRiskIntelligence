import { useRef, useMemo, useState, useCallback, useEffect, memo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import {
    ALL_ZONES, AVIATION_ZONES, MARITIME_ZONES, RAILWAY_ZONES,
    getCoords, riskColor, getMaritimeRoute, getRailRoute,
    curvedPoints,
} from "./RiskMap";
import type { StationWaypoint } from "./RiskMap";

// ── Helpers ────────────────────────────────────────────────────────────────────

const GLOBE_RADIUS = 2;
const DEG2RAD = Math.PI / 180;

/** Convert lat/lng to a 3D point on the globe surface. */
function latLngToVec3(lat: number, lng: number, r = GLOBE_RADIUS): THREE.Vector3 {
    const phi = (90 - lat) * DEG2RAD;
    const theta = (lng + 180) * DEG2RAD;
    return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
    );
}



// ── Earth sphere ──────────────────────────────────────────────────────────────

function Earth() {
    const meshRef = useRef<THREE.Mesh>(null!);
    const texture = useMemo(() => {
        const loader = new THREE.TextureLoader();
        return loader.load(
            "https://unpkg.com/three-globe@2.41.12/example/img/earth-blue-marble.jpg",
        );
    }, []);
    const bumpMap = useMemo(() => {
        const loader = new THREE.TextureLoader();
        return loader.load(
            "https://unpkg.com/three-globe@2.41.12/example/img/earth-topology.png",
        );
    }, []);

    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[GLOBE_RADIUS, 64, 64]} />
            <meshStandardMaterial
                map={texture}
                bumpMap={bumpMap}
                bumpScale={0.02}
                roughness={0.6}
                metalness={0.1}
            />
        </mesh>
    );
}

// ── Atmosphere glow ───────────────────────────────────────────────────────────

function Atmosphere() {
    return (
        <mesh>
            <sphereGeometry args={[GLOBE_RADIUS * 1.015, 64, 64]} />
            <meshBasicMaterial color="#4da6ff" transparent opacity={0.07} side={THREE.BackSide} />
        </mesh>
    );
}

// ── Danger zone circle on globe ───────────────────────────────────────────────

function DangerZone({ lat, lng, radiusKm, color, opacity, name, type, reason }: {
    lat: number; lng: number; radiusKm: number;
    color: string; opacity: number; name: string; type: string; reason: string;
}) {
    const [hovered, setHovered] = useState(false);
    const center = useMemo(() => latLngToVec3(lat, lng, GLOBE_RADIUS * 1.001), [lat, lng]);

    // Angular radius on the sphere (Earth radius ≈ 6371 km)
    const angularRadius = radiusKm / 6371;
    const ringSegments = 48;

    const geometry = useMemo(() => {
        // Create a circle of points on the sphere surface around center
        const centerNorm = new THREE.Vector3().copy(center).normalize();
        // Find a tangent vector
        const up = new THREE.Vector3(0, 1, 0);
        const tangent1 = new THREE.Vector3().crossVectors(centerNorm, up).normalize();
        if (tangent1.length() < 0.01) tangent1.set(1, 0, 0);
        tangent1.normalize();
        const tangent2 = new THREE.Vector3().crossVectors(centerNorm, tangent1).normalize();

        const shape = new THREE.Shape();
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i <= ringSegments; i++) {
            const angle = (i / ringSegments) * Math.PI * 2;
            pts.push(new THREE.Vector2(
                Math.cos(angle) * angularRadius,
                Math.sin(angle) * angularRadius,
            ));
        }
        shape.setFromPoints(pts);

        // Build 3D points for the filled circle on the sphere
        const positions: number[] = [];
        // Fan from center
        for (let i = 0; i < ringSegments; i++) {
            const a1 = (i / ringSegments) * Math.PI * 2;
            const a2 = ((i + 1) / ringSegments) * Math.PI * 2;

            positions.push(center.x, center.y, center.z);

            for (const angle of [a1, a2]) {
                const offsetVec = new THREE.Vector3()
                    .addScaledVector(tangent1, Math.cos(angle) * angularRadius)
                    .addScaledVector(tangent2, Math.sin(angle) * angularRadius);
                const point = new THREE.Vector3().copy(centerNorm).add(offsetVec).normalize().multiplyScalar(GLOBE_RADIUS * 1.001);
                positions.push(point.x, point.y, point.z);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        return geo;
    }, [center, angularRadius]);

    const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
    }, []);
    const handlePointerOut = useCallback(() => setHovered(false), []);

    return (
        <group>
            <mesh
                geometry={geometry}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
            >
                <meshBasicMaterial
                    color={color}
                    transparent
                    opacity={hovered ? opacity * 3 : opacity * 1.5}
                    side={THREE.DoubleSide}
                    depthWrite={false}
                />
            </mesh>
            {/* Ring outline */}
            <lineLoop>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        args={[(() => {
                            const centerNorm = new THREE.Vector3().copy(center).normalize();
                            const up = new THREE.Vector3(0, 1, 0);
                            const t1 = new THREE.Vector3().crossVectors(centerNorm, up).normalize();
                            if (t1.length() < 0.01) t1.set(1, 0, 0);
                            t1.normalize();
                            const t2 = new THREE.Vector3().crossVectors(centerNorm, t1).normalize();
                            const arr = new Float32Array((ringSegments + 1) * 3);
                            for (let i = 0; i <= ringSegments; i++) {
                                const a = (i / ringSegments) * Math.PI * 2;
                                const pt = new THREE.Vector3().copy(centerNorm)
                                    .addScaledVector(t1, Math.cos(a) * angularRadius)
                                    .addScaledVector(t2, Math.sin(a) * angularRadius)
                                    .normalize().multiplyScalar(GLOBE_RADIUS * 1.002);
                                arr[i * 3] = pt.x; arr[i * 3 + 1] = pt.y; arr[i * 3 + 2] = pt.z;
                            }
                            return arr;
                        })(), 3]}
                    />
                </bufferGeometry>
                <lineBasicMaterial color={color} transparent opacity={0.6} linewidth={1} />
            </lineLoop>
            {hovered && (
                <Html position={center} zIndexRange={[100, 0]}>
                    <div style={{
                        background: "rgba(15,23,42,0.95)", color: "#fff", padding: "10px 14px",
                        borderRadius: 8, fontSize: 12, width: 220, lineHeight: 1.4,
                        border: `1px solid ${color}`, pointerEvents: "none",
                        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
                    }}>
                        <strong>{name}</strong><br />
                        ⚠️ {type} Risk Zone<br />
                        <span style={{ color: "#94a3b8", fontSize: 11 }}>{reason}</span>
                    </div>
                </Html>
            )}
        </group>
    );
}

// ── Route arc on globe ────────────────────────────────────────────────────────

function RouteArc({ points, color, lineWidth = 2, altitude = 0.005 }: {
    points: [number, number][]; color: string; lineWidth?: number; altitude?: number;
}) {
    const arcPoints = useMemo(() => {
        if (points.length < 2) return [];

        const all: THREE.Vector3[] = [];
        for (let i = 0; i < points.length - 1; i++) {
            const start = latLngToVec3(points[i][0], points[i][1]);
            const end = latLngToVec3(points[i + 1][0], points[i + 1][1]);

            // Subdivide segments so they curve with the globe's surface
            const dist = start.distanceTo(end);
            const segments = Math.max(2, Math.ceil(dist * 8));

            for (let j = 0; j <= segments; j++) {
                if (i > 0 && j === 0) continue; // avoid duplicate points at joins
                const t = j / segments;
                const p = new THREE.Vector3().lerpVectors(start, end, t).normalize();
                p.multiplyScalar(GLOBE_RADIUS * (1 + altitude));
                all.push(p);
            }
        }
        return all;
    }, [points, altitude]);

    if (arcPoints.length < 2) return null;

    const positions = useMemo(() => {
        const arr = new Float32Array(arcPoints.length * 3);
        arcPoints.forEach((p, i) => {
            arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
        });
        return arr;
    }, [arcPoints]);

    return (
        <line>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={color} linewidth={lineWidth} transparent opacity={0.9} />
        </line>
    );
}

// ── Location marker ───────────────────────────────────────────────────────────

function LocationMarker({ lat, lng, color, label, emoji = "📍" }: {
    lat: number; lng: number; color: string; label: string; emoji?: string;
}) {
    const pos = useMemo(() => latLngToVec3(lat, lng, GLOBE_RADIUS * 1.005), [lat, lng]);
    const [hovered, setHovered] = useState(false);

    return (
        <group position={pos}>
            <mesh
                onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
                onPointerOut={() => setHovered(false)}
            >
                <sphereGeometry args={[0.025, 16, 16]} />
                <meshBasicMaterial color={color} />
            </mesh>
            {/* Glow ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                <ringGeometry args={[0.03, 0.05, 24]} />
                <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>
            {/* Always-visible label */}
            <Html zIndexRange={[50, 0]} style={{ pointerEvents: "none" }}>
                <div style={{
                    color: "#fff", fontSize: 10, fontWeight: 700,
                    textShadow: "0 1px 4px rgba(0,0,0,0.8)", whiteSpace: "nowrap",
                    transform: "translate(8px, -6px)",
                }}>
                    {emoji} {label}
                </div>
            </Html>
            {hovered && (
                <Html zIndexRange={[100, 0]}>
                    <div style={{
                        background: "rgba(15,23,42,0.95)", color: "#fff", padding: "6px 10px",
                        borderRadius: 6, fontSize: 11, whiteSpace: "nowrap",
                        border: `1px solid ${color}`, transform: "translate(8px, 14px)",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.5)", pointerEvents: "none",
                    }}>
                        {emoji} {label}
                    </div>
                </Html>
            )}
        </group>
    );
}

// ── Station marker (small, for railway waypoints) ─────────────────────────────

function StationMarkerGlobe({ lat, lng, name }: { lat: number; lng: number; name: string }) {
    const pos = useMemo(() => latLngToVec3(lat, lng, GLOBE_RADIUS * 1.003), [lat, lng]);
    const [hovered, setHovered] = useState(false);

    return (
        <group position={pos}>
            <mesh
                onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
                onPointerOut={() => setHovered(false)}
            >
                <sphereGeometry args={[0.015, 12, 12]} />
                <meshBasicMaterial color="#9ca3af" />
            </mesh>
            {hovered && (
                <Html zIndexRange={[100, 0]}>
                    <div style={{
                        background: "rgba(15,23,42,0.95)", color: "#fff", padding: "4px 8px",
                        borderRadius: 4, fontSize: 10, whiteSpace: "nowrap",
                        transform: "translate(6px, -4px)", pointerEvents: "none",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                    }}>
                        🚆 {name}
                    </div>
                </Html>
            )}
        </group>
    );
}

// ── Auto-rotate scene ─────────────────────────────────────────────────────────

function AutoRotate() {
    const { scene } = useThree();
    useFrame((_state, delta) => {
        scene.rotation.y += delta * 0.05;
    });
    return null;
}

// ── Focus camera on lat/lng ───────────────────────────────────────────────────

function FocusCamera({ lat, lng }: { lat: number; lng: number }) {
    const { camera } = useThree();
    useMemo(() => {
        const target = latLngToVec3(lat, lng, GLOBE_RADIUS * 3.5);
        camera.position.set(target.x, target.y, target.z);
        camera.lookAt(0, 0, 0);
    }, [lat, lng, camera]);
    return null;
}

// ── Country borders ────────────────────────────────────────────────────────
let borderDataCache: Float32Array | null = null;
let borderDataPromise: Promise<Float32Array> | null = null;

function CountryBorders() {
    const [borderData, setBorderData] = useState<Float32Array | null>(borderDataCache);

    useEffect(() => {
        if (borderDataCache) {
            setBorderData(borderDataCache);
            return;
        }

        if (!borderDataPromise) {
            borderDataPromise = fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
                .then(r => r.json())
                .then(data => {
                    const points: number[] = [];
                    // GeoJSON uses [longitude, latitude]
                    data.features.forEach((feature: any) => {
                        if (!feature.geometry) return;
                        if (feature.geometry.type === "Polygon") {
                            feature.geometry.coordinates.forEach((ring: number[][]) => {
                                for (let i = 0; i < ring.length - 1; i++) {
                                    const p1 = latLngToVec3(ring[i][1], ring[i][0], GLOBE_RADIUS * 1.002);
                                    const p2 = latLngToVec3(ring[i + 1][1], ring[i + 1][0], GLOBE_RADIUS * 1.002);
                                    points.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                                }
                            });
                        } else if (feature.geometry.type === "MultiPolygon") {
                            feature.geometry.coordinates.forEach((polygon: number[][][]) => {
                                polygon.forEach((ring: number[][]) => {
                                    for (let i = 0; i < ring.length - 1; i++) {
                                        const p1 = latLngToVec3(ring[i][1], ring[i][0], GLOBE_RADIUS * 1.002);
                                        const p2 = latLngToVec3(ring[i + 1][1], ring[i + 1][0], GLOBE_RADIUS * 1.002);
                                        points.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                                    }
                                });
                            });
                        }
                    });
                    const result = new Float32Array(points);
                    borderDataCache = result;
                    return result;
                })
                .catch(err => {
                    console.error("Failed to load borders:", err);
                    borderDataPromise = null;
                    return new Float32Array(0);
                });
        }

        borderDataPromise.then(setBorderData);
    }, []);

    if (!borderData) return null;

    return (
        <lineSegments>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[borderData, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color="#334155" transparent opacity={0.6} linewidth={1} />
        </lineSegments>
    );
}

// ── Globe scene wrapper ───────────────────────────────────────────────────────

function GlobeScene({ children, focusLat, focusLng }: {
    children: React.ReactNode;
    focusLat?: number; focusLng?: number;
}) {
    return (
        <>
            <ambientLight intensity={4.0} />
            <directionalLight position={[5, 3, 5]} intensity={1.0} />
            <directionalLight position={[-5, -3, -5]} intensity={1.0} />
            <directionalLight position={[0, -5, 0]} intensity={1.0} />
            <Earth />
            <Atmosphere />
            <CountryBorders />
            {focusLat !== undefined && focusLng !== undefined ? (
                <FocusCamera lat={focusLat} lng={focusLng} />
            ) : (
                <AutoRotate />
            )}
            <OrbitControls
                enableZoom
                enablePan={false}
                minDistance={GLOBE_RADIUS * 1.5}
                maxDistance={GLOBE_RADIUS * 6}
                rotateSpeed={0.4}
                zoomSpeed={0.6}
            />
            {children}
        </>
    );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── 1. GLOBAL RISK MAP 3D ─────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export const GlobalRiskMap3D = memo(function GlobalRiskMap3D({ height = 420 }: { height?: number }) {
    return (
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#0a0f1a" }}>
            <Canvas dpr={[1, 2]} camera={{ position: [0, 0, GLOBE_RADIUS * 4.5], fov: 45 }}>
                <GlobeScene>
                    {ALL_ZONES.map(z => (
                        <DangerZone key={z.name} {...z} />
                    ))}
                </GlobeScene>
            </Canvas>
        </div>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 2. AVIATION RISK MAP 3D ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export const AviationRiskMap3D = memo(function AviationRiskMap3D({
    origin, destination, riskLevel, routePreference = "shortest", height = 300, routePath = [],
}: { origin: string; destination: string; riskLevel: string; routePreference?: string; height?: number; routePath?: string[] }) {
    const pathNodes = routePath.length >= 2 ? routePath : [origin, destination];
    const pathCoords = pathNodes.map(node => [...getCoords(node)] as [number, number]);

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
    for (let i = 0; i < pathCoords.length - 1; i++) {
        allArcs.push(curvedPoints(pathCoords[i], pathCoords[i + 1], 32, curveOffset));
    }

    const lats = pathCoords.map(c => c[0]);
    const lngs = pathCoords.map(c => c[1]);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const midLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;

    const relevantZones = AVIATION_ZONES.filter(z => {
        const diff = Math.abs(z.lng - midLng);
        return diff < 90 || diff > 270;
    });

    return (
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#0a0f1a" }}>
            <Canvas dpr={[1, 2]} camera={{ position: [0, 0, GLOBE_RADIUS * 4], fov: 45 }}>
                <GlobeScene focusLat={midLat} focusLng={midLng}>
                    {relevantZones.map(z => (
                        <DangerZone key={z.name} {...z} />
                    ))}
                    {allArcs.map((arc, idx) => (
                        <RouteArc key={`arc-${idx}`} points={arc} color={color} lineWidth={3} />
                    ))}
                    {pathNodes.map((node, idx) => {
                        const coords = pathCoords[idx];
                        const isOrigin = idx === 0;
                        const isDest = idx === pathNodes.length - 1;
                        const emoji = isOrigin ? "✈️" : isDest ? "🏁" : "⛽";
                        return <LocationMarker key={`node-${idx}`} lat={coords[0]} lng={coords[1]} color={color} label={node} emoji={emoji} />;
                    })}
                </GlobeScene>
            </Canvas>
        </div>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 3. MARITIME RISK MAP 3D ───────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export const MaritimeRiskMap3D = memo(function MaritimeRiskMap3D({
    origin, destination, riskLevel, routePreference = "shortest", height = 300,
}: { origin: string; destination: string; riskLevel: string; routePreference?: string; height?: number }) {
    const waypoints = getMaritimeRoute(origin, destination, routePreference);
    // Normalize longitudes to [-180, 180] for 3D globe
    const normalizedWaypoints: [number, number][] = waypoints.map(([lat, lng]) => [
        lat, ((lng + 180) % 360 + 360) % 360 - 180,
    ]);
    const oCoords = normalizedWaypoints[0];
    const dCoords = normalizedWaypoints[normalizedWaypoints.length - 1];
    const color = riskColor(riskLevel);
    const midLat = (oCoords[0] + dCoords[0]) / 2;
    const midLng = (oCoords[1] + dCoords[1]) / 2;

    return (
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#0a0f1a" }}>
            <Canvas dpr={[1, 2]} camera={{ position: [0, 0, GLOBE_RADIUS * 4], fov: 45 }}>
                <GlobeScene focusLat={midLat} focusLng={midLng}>
                    {MARITIME_ZONES.map(z => (
                        <DangerZone key={z.name} {...z} />
                    ))}
                    <RouteArc points={normalizedWaypoints} color={color} lineWidth={3} />
                    <LocationMarker lat={oCoords[0]} lng={oCoords[1]} color={color} label={origin} emoji="🚢" />
                    <LocationMarker lat={dCoords[0]} lng={dCoords[1]} color={color} label={destination} emoji="⚓" />
                </GlobeScene>
            </Canvas>
        </div>
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// ── 4. RAILWAY RISK MAP 3D ────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export const RailwayRiskMap3D = memo(function RailwayRiskMap3D({
    origin, destination, riskLevel, routePreference = "shortest", height = 300,
}: { origin: string; destination: string; riskLevel: string; routePreference?: string; height?: number }) {
    const waypoints: StationWaypoint[] = getRailRoute(origin, destination, routePreference);
    const allPositions: [number, number][] = waypoints.map(w => w.pos);
    const color = riskColor(riskLevel);
    const midLat = (allPositions[0][0] + allPositions[allPositions.length - 1][0]) / 2;
    const midLng = (allPositions[0][1] + allPositions[allPositions.length - 1][1]) / 2;

    return (
        <div style={{ height, width: "100%", borderRadius: 16, overflow: "hidden", background: "#0a0f1a" }}>
            <Canvas dpr={[1, 2]} camera={{ position: [0, 0, GLOBE_RADIUS * 3.5], fov: 45 }}>
                <GlobeScene focusLat={midLat} focusLng={midLng}>
                    {RAILWAY_ZONES.map(z => (
                        <DangerZone key={z.name} {...z} />
                    ))}
                    <RouteArc points={allPositions} color={color} lineWidth={3} />
                    {/* Intermediate stations */}
                    {waypoints.slice(1, -1).map((station, i) => (
                        <StationMarkerGlobe key={i} lat={station.pos[0]} lng={station.pos[1]} name={station.name} />
                    ))}
                    {/* Origin and destination */}
                    <LocationMarker lat={allPositions[0][0]} lng={allPositions[0][1]} color={color} label={origin} emoji="🚉" />
                    <LocationMarker
                        lat={allPositions[allPositions.length - 1][0]}
                        lng={allPositions[allPositions.length - 1][1]}
                        color={color} label={destination} emoji="🏁"
                    />
                </GlobeScene>
            </Canvas>
        </div>
    );
});
