# Live Vessel Tracking System Documentation

## Overview

The GlobalRisk Intelligence Platform includes a **real-time maritime vessel tracking system** that monitors vessel positions, detects anomalies, and generates insurance-relevant alerts. The system combines AIS (Automatic Identification System) data ingestion, sophisticated rule-based alert logic, and WebSocket-driven real-time frontend updates.

---

## Architecture

The system is composed of four main layers:

### 1. **Data Ingestion Layer** (`live_tracking_connectors.py`)
- Connects to external AIS data providers (AISStream API)
- Falls back to simulated tracking if no API key is available
- Updates vessel positions in Supabase database
- Runs concurrently for aviation (OpenSky), maritime (AISStream), and railway data

### 2. **Backend Processing Layer** (`backend/routers/ais.py`)
- Maintains in-memory vessel state
- Ingests AIS pings via REST `/ping` endpoint
- Evaluates 6 alert rules in real-time
- Broadcasts updates via WebSocket

### 3. **Frontend Subscription Layer** (`frontend/src/hooks/useAisSubscription.ts`)
- Establishes WebSocket connection to backend
- Receives live vessel updates and alerts
- Maintains vessel map state with automatic reconnection logic

### 4. **Visualization Layer** (`frontend/src/pages/LiveTracking.tsx`)
- Leaflet-based interactive map
- Renders vessel markers with heading indicators
- Displays war-risk zones
- Shows real-time alerts

---

## Data Flow

```
AIS Provider (AISStream)
    ↓
live_tracking_connectors.py (fetches + updates Supabase)
    ↓
Frontend manually polls OR Backend receives direct AIS ping
    ↓
AIS Router: POST /api/ais/ping (Pydantic AISPing model)
    ↓
Backend Vessel State Update (_vessels dict)
    ↓
Alert Rule Evaluation (_evaluate_rules function)
    ↓
WebSocket Broadcast (_broadcast function)
    ↓
Frontend Subscription (useAisSubscription hook)
    ↓
Live Map Display (VesselMarkers component)
```

---

## AIS Ping Ingestion

### Incoming Data Model (`AISPing`)

```python
class AISPing(BaseModel):
    mmsi: str                          # Unique vessel identifier
    vessel_name: str = ""              # Human-readable vessel name
    imo: str = ""                      # International Maritime Organization number
    type: str = "cargo"                # Vessel type (cargo, tanker, etc.)
    voyage_id: str = ""                # Reference to voyage registration
    timestamp: str                     # ISO-8601 timestamp
    lat: float                         # Current latitude
    lon: float                         # Current longitude
    speed_kn: float = 0.0              # Speed over ground (knots)
    course: float = 0.0                # Course over ground (degrees)
    heading: float = 0.0               # Vessel heading (degrees)
    status: str = "underway"           # Status (underway|anchored|moored|sos)
    destination: str = ""              # Destination port
    eta: str = ""                      # Estimated time of arrival
    extra: dict = {}                   # Additional metadata
```

### REST Endpoint: `POST /api/ais/ping`

```python
async def ingest_ping(ping: AISPing):
    """
    1. Store ping in deque (max 10,000 pings)
    2. Look up or create VesselState
    3. Update vessel position & velocity
    4. Attach voyage context if registered
    5. Evaluate alert rules
    6. Broadcast updates to subscribers
    """
```

---

## Vessel State Management

### `VesselState` Class

Maintains real-time vessel data with:
- **Current Position**: lat, lon, speed, heading
- **Ping History**: Deque of last 50 pings (used for anomaly detection)
- **Voyage Context**: Associated cargo value, declared route, policy ID
- **Next Policy Flag**: Indicates need for policy review

```python
class VesselState:
    def __init__(self, ping: AISPing):
        # Initialize from first ping
        self.mmsi = ping.mmsi
        self.lat = ping.lat
        self.lon = ping.lon
        self.ping_history = deque(maxlen=50)  # Rolling window
        self.voyage_context = None
        
    def update(self, ping: AISPing):
        # Update position and velocity, keep history
        self.lat = ping.lat
        self.lon = ping.lon
        self.ping_history.append(ping)
```

### In-Memory Storage

```python
_vessels: dict[str, VesselState] = {}       # MMSI → VesselState
_pings: deque = deque(maxlen=10_000)        # Last 10,000 pings (any vessel)
_alerts: list[AISAlert] = []                # Alert history
_subscribers: set[WebSocket] = set()        # Connected WebSocket clients
_voyages: dict[str, dict] = {}              # voyage_id → voyage metadata
```

---

## Alert Rule Engine

The system evaluates **6 insurance-critical rules** for each incoming AIS ping:

### Rule 1: War Risk Zone Detection

**Trigger**: Vessel enters a known high-risk zone while underway

**War Zones Defined**:
- Red Sea / Bab el-Mandeb (450 km radius)
- Strait of Hormuz (250 km radius)
- Gulf of Aden (380 km radius)
- Black Sea (300 km radius)
- Gulf of Guinea (500 km radius)
- Strait of Malacca (300 km radius)
- South China Sea (700 km radius)

**Alert Severity**: `HIGH`

**Premium Adjustment**: Calculated as
$$\text{Surcharge} = 2.0 + \frac{\text{cargo\_value\_usd}}{100,000,000} \times 1.5$$

**Deduplication**: Only fires once per vessel per zone (checked in alert history)

```python
zone_name = _get_zone_name(ping.lat, ping.lon)  # Haversine distance check
if zone_name and not already_alerted:
    alert = AISAlert(type="war_risk", severity="HIGH", ...)
```

---

### Rule 2: Route Deviation Detection

**Trigger**: Vessel moves >50 km away from declared route

**Distance Calculation**: Uses point-to-segment distance via planar projection to polyline

**Alert Severity**:
- `MEDIUM` if deviation is 50–150 km
- `HIGH` if deviation is >150 km

**Deduplication**: Prevents duplicate deviation alerts within 5 minutes

```python
if declared_route and ping.status == "underway":
    dist = _distance_to_route(ping.lat, ping.lon, declared_route)
    if dist > 50 and not_recently_alerted:
        alert = AISAlert(type="deviation", severity=..., ...)
```

---

### Rule 3: Emergency/Distress Detection

**Trigger 1**: Sudden speed drop >80% when not near port

- Compares current speed to max recent speed (last 5 pings)
- Confirms vessel is not near major port (20 km threshold)
- Severity: `CRITICAL`

**Trigger 2**: SOS status flag

- Direct maritime distress signal
- Severity: `CRITICAL`

```python
if len(ping_history) >= 2 and not _near_port(lat, lon):
    recent_max_speed = max(p.speed_kn for p in prev_pings[-5:-1])
    if recent_max_speed > 5.0 and ping.speed_kn < 1.0:
        drop_pct = (recent_max_speed - ping.speed_kn) / recent_max_speed * 100
        if drop_pct > 80:
            alert = AISAlert(type="emergency", severity="CRITICAL", ...)
```

---

### Rule 4: AIS Spoofing Detection

**Trigger 1**: Impossible speed

- Speed >60 knots indicates AIS signal manipulation
- Severity: `HIGH`

**Trigger 2**: Position jump >500 km between consecutive pings

- Detected via Haversine distance comparison
- Indicates signal spoofing or vessel teleportation
- Severity: `HIGH`

```python
if ping.speed_kn > 60:
    alert = AISAlert(type="spoofing", severity="HIGH", ...)

if len(ping_history) >= 2:
    prev = ping_history[-2]
    jump = _haversine_km(prev.lat, prev.lon, ping.lat, ping.lon)
    if jump > 500:
        alert = AISAlert(type="spoofing", severity="HIGH", ...)
```

---

### Rule 5: Next Policy Flag

**Trigger**: Any high-severity or critical alert is generated

**Purpose**: Flags vessel for policy review in next underwriting cycle

```python
if any_high_or_critical_alert:
    vessel.next_policy_flag = True
    alert = AISAlert(type="next_policy", severity="MEDIUM", ...)
```

---

### Rule 6: Reinsurance Exposure Aggregation

**Trigger**: ≥3 distinct vessels with high-severity alerts in same war zone

**Purpose**: Portfolio-level risk aggregation for reinsurance underwriting

**Example Alert**:
> "REINSURANCE EXPOSURE — 5 insured vessels in Strait of Hormuz conflict zone — total cargo exposure: $250M"

```python
mmsis_in_zone = set(alert.mmsi for alert in _alerts 
                    if alert.severity in ("HIGH", "CRITICAL")
                    and zone_name matches)
if len(mmsis_in_zone) >= 3:
    total_cargo = sum(vessel.voyage_context["cargo_value_usd"] 
                      for vessel in relevant_vessels)
    alert = AISAlert(type="reinsurance", severity="HIGH", ...)
```

---

## Alert System

### `AISAlert` Model

```python
class AISAlert(BaseModel):
    alert_id: str                       # Unique identifier (uuid-based)
    type: str                           # war_risk|deviation|emergency|spoofing|next_policy|reinsurance
    mmsi: str = ""                      # Vessel MMSI (or "PORTFOLIO" for reinsurance)
    voyage_id: str = ""                 # Associated voyage
    severity: str                       # CRITICAL|HIGH|MEDIUM|LOW
    msg: str                            # Human-readable message
    timestamp: str                      # ISO-8601 timestamp
    location: dict                      # {"lat": float, "lon": float}
    evidence: list[dict]                # Historical ping data supporting alert
```

### Alert Deduplication Strategy

- **War Risk**: One per vessel per zone
- **Deviation**: One per vehicle per 5-minute window
- **Emergency**: One per vessel
- **Spoofing**: One per vessel per window
- **Reinsurance**: One per zone

Checked against `_alerts[-10:]` or `_alerts[-20:]` (recent alerts)

---

## WebSocket Broadcasting

### Real-Time Event Streaming

```python
async def _broadcast(message: dict):
    """Send JSON message to all connected subscribers."""
    data = json.dumps(message)
    for ws in _subscribers:
        try:
            await ws.send_text(data)
        except:
            dead.append(ws)  # Remove dead connections
```

### Event Types Broadcasted

#### 1. Snapshot (Initial Connection)
```json
{
    "event": "snapshot",
    "data": {
        "vessels": [/* all VesselState objects */],
        "alerts": [/* recent alerts */]
    }
}
```

#### 2. Vessel Update
```json
{
    "event": "vessel.update",
    "data": {
        "mmsi": "211378120",
        "lat": 15.32,
        "lon": 42.45,
        "speed_kn": 18.5,
        "status": "underway",
        ...
    }
}
```

#### 3. Alert Creation
```json
{
    "event": "alert.create",
    "data": {
        "alert_id": "alert_abc123def456",
        "type": "war_risk",
        "mmsi": "211378120",
        "severity": "HIGH",
        "msg": "Vessel entered Red Sea war zone...",
        ...
    }
}
```

#### 4. Keepalive Ping
```json
{
    "event": "ping",
    "timestamp": "2026-03-08T14:23:45Z"
}
```

---

## Frontend Real-Time Subscription

### Hook: `useAisSubscription()`

Manages WebSocket lifecycle with automatic reconnection:

```typescript
export function useAisSubscription(): AisSubscriptionResult {
    const vesselsRef = useRef<Map<string, VesselData>>(new Map());
    const [connected, setConnected] = useState(false);
    const [alerts, setAlerts] = useState<AISAlertData[]>([]);
    
    useEffect(() => {
        def connect() {
            const ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                setConnected(true);
                retryCount = 0;
            };
            
            ws.onmessage = (evt) => {
                const msg = JSON.parse(evt.data);
                
                if (msg.event === "snapshot") {
                    // Initial load of all vessels and alerts
                    vesselsRef.current = new Map(msg.data.vessels);
                    setAlerts(msg.data.alerts);
                    
                } else if (msg.event === "vessel.update") {
                    // Update single vessel
                    vesselsRef.current.set(v.mmsi, v);
                    
                } else if (msg.event === "alert.create") {
                    // Prepend new alert
                    setAlerts(prev => [alert, ...prev]);
                }
            };
            
            ws.onclose = () => {
                // Exponential backoff: 1s → 2s → 4s → ... → 30s max
                const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
                setTimeout(connect, delay);
            };
        }
        
        connect();
    }, []);
    
    return {
        vessels: vesselsRef.current,
        alerts,
        connected,
        vesselCount: vesselsRef.current.size,
        error
    };
}
```

**Key Features**:
- Reference-based vessel map (no React re-renders on every position update)
- Callback listeners for map component subscriptions
- Exponential backoff reconnection strategy
- Auto-cleanup on unmount

---

## Frontend Visualization

### Live Tracking Map Component

Located in `frontend/src/pages/LiveTracking.tsx`

#### Vessel Markers

- **Icon**: SVG arrow rotated to vessel heading
- **Color**: Based on status (underway=green, anchored=amber, sos=red)
- **Label**: First 2 words of vessel name or MMSI
- **Shadow**: Drop shadow for contrast

```typescript
function makeVesselIcon(heading: number, color: string, label: string): L.DivIcon {
    return L.divIcon({
        html: `<svg ... style="transform:rotate(${heading}deg);">
                <path d="M12 2 L18 20 L12 16 L6 20 Z" fill="${color}" />
               </svg>`,
        iconSize: [28, 42],
        iconAnchor: [14, 14],  // Center the arrow
    });
}
```

#### Position History Tracking

- **Polyline**: Traces last 30 positions (updates every ping)
- **Color**: Matches vessel status color
- **Opacity**: Semi-transparent for visual clarity

```typescript
const hist = posHistoryRef.current.get(mmsi) || [];
hist.push([v.lat, v.lon]);
if (hist.length > 30) hist.shift();  // Keep last 30 pings

tracksRef.current.set(mmsi, L.polyline(hist, { color, weight: 2, opacity: 0.6 }));
```

#### Vessel Popup Content

Clicking a vessel marker displays:
- Vessel name, MMSI, IMO
- Current speed, heading, course
- Status (color-coded)
- Destination, ETA
- Cargo value
- Voyage ID
- ⚠️ Icon if flagged for policy review

#### War-Risk Zone Visualization

7 circular zones overlay the map:
- **Red** (CRITICAL): Strait of Hormuz, Red Sea, Gulf of Aden
- **Orange** (HIGH): Black Sea, Gulf of Guinea, Strait of Malacca
- **Amber** (ELEVATED): South China Sea

```typescript
const ZONES = [
    { name: "Strait of Hormuz", lat: 26.6, lng: 56.3, radiusKm: 250, 
      color: "#ef4444", reason: "US/Israel strikes, GPS jamming" },
    // ...
];

// Rendered as Leaflet Circle components
<Circle center={[lat, lng]} radius={radiusKm * 1000} color={color} />
```

---

## Voyage Context Registration

### REST Endpoint: `POST /api/ais/voyage`

Registers voyage metadata to enable context-aware alerting:

```python
class VoyageRegistration(BaseModel):
    voyage_id: str                      # Unique voyage ID
    mmsi: str                           # Vessel MMSI
    vessel_name: str = ""
    origin: str = ""                    # Origin port code
    destination: str = ""               # Destination port code
    cargo_value_usd: float = 0.0        # Insured cargo value
    policy_id: str = ""                 # Associated insurance policy
    declared_route: list[list[float]]   # Planned route [[lat, lon], ...]
```

**Effect**: When a ping is received with matching `voyage_id`, the vessel state is enriched with cargo value, declared route, and policy ID. This enables:
- Route deviation detection
- Premium surcharge calculation
- Reinsurance exposure aggregation

---

## Data Integration with Database (Supabase)

### Tables (Synced by `live_tracking_connectors.py`)

- **`maritime_voyages`**: Vessel position state synced from AIS
  - `id`, `current_lat`, `current_long`, `current_speed`, `status`

- **`aviation_flights`**: Aircraft positions (OpenSky API)
  - `id`, `current_lat`, `current_long`, `current_speed`, `status`

- **`railway_trains`**: Train positions (Indian Railways)
  - `id`, `train_number`, `current_lat`, `current_long`

### Update Frequency

- **AIS/Maritime**: Every position report (~5–15-second updates depending on vessel speed)
- **Aviation**: Every 30 seconds (OpenSky limitation)
- **Railway**: Every 30 seconds (API rate limit)

---

## Geolocation Utilities

### Haversine Distance (Great-Circle)

```python
def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    """Great-circle distance between two points on Earth."""
    R = 6371.0  # Earth radius in km
    dlat = radians(lat2 - lat1)
    dlon = radians(lon2 - lon1)
    a = sin²(dlat/2) + cos(lat1) × cos(lat2) × sin²(dlon/2)
    c = 2 × atan2(√a, √(1-a))
    return R × c
```

**Usage**: Zone detection, port proximity, spoofing detection, reinsurance exposure mapping

### Point-to-Route Distance

```python
def _distance_to_route(lat, lon, route: list[list[float]]) -> float:
    """Minimum distance from point to any segment of declared route."""
    for segment in route:
        dist_to_segment = _point_to_segment_km(lat, lon, segment[0], segment[1])
        min_dist = min(min_dist, dist_to_segment)
    return min_dist
```

**Usage**: Route deviation detection

### Port Proximity Check

```python
KNOWN_PORTS = [
    (18.94, 72.84),   # Mumbai
    (51.92, 4.48),    # Rotterdam
    (31.23, 121.47),  # Shanghai
    # ... 13 major ports
]

def _near_port(lat, lon, threshold_km=20.0) -> bool:
    """Check if position is near any known port."""
    for plat, plon in KNOWN_PORTS:
        if _haversine_km(lat, lon, plat, plon) < threshold_km:
            return True
    return False
```

**Usage**: Emergency detection (suppress speed drop alerts near ports where anchoring is expected)

---

## API Reference

### REST Endpoints (Backend)

```
POST   /api/ais/ping              # Ingest AIS ping
POST   /api/ais/voyage            # Register voyage context
GET    /api/ais/vessels           # Get all vessel positions
GET    /api/ais/alerts            # Get alert history (paginated)
GET    /api/ais/voyages           # Get all registered voyages
GET    /api/ais/exposure          # Get portfolio exposure by zone
WS     /api/ais/subscribe         # WebSocket for real-time updates
```

### Response Example: `/api/ais/vessels`

```json
{
    "vessels": [
        {
            "mmsi": "211378120",
            "vessel_name": "MV Dune Spirit",
            "lat": 15.32,
            "lon": 42.45,
            "speed_kn": 18.5,
            "course": 245,
            "heading": 243,
            "status": "underway",
            "voyage_id": "VOY-2026-03-001",
            "destination": "NLRTM",
            "last_update": "2026-03-08T14:23:15Z",
            "next_policy_flag": true,
            "voyage_context": {
                "origin": "INBOM",
                "destination": "NLRTM",
                "cargo_value_usd": 45000000,
                "policy_id": "POL-2026-001"
            }
        }
    ]
}
```

### Response Example: `/api/ais/alerts?severity=HIGH`

```json
{
    "alerts": [
        {
            "alert_id": "alert_e2f8c7a3b1d9",
            "type": "war_risk",
            "mmsi": "211378120",
            "voyage_id": "VOY-2026-03-001",
            "severity": "HIGH",
            "msg": "Vessel MV Dune Spirit entered Red Sea / Bab el-Mandeb war zone — recommend +3.2% war surcharge",
            "timestamp": "2026-03-08T14:23:15Z",
            "location": {"lat": 15.32, "lon": 42.45},
            "evidence": [
                {"ping_ts": "2026-03-08T14:22:45Z", "lat": 15.30, "lon": 42.44, "speed_kn": 18.2},
                {"ping_ts": "2026-03-08T14:23:00Z", "lat": 15.31, "lon": 42.45, "speed_kn": 18.4},
                {"ping_ts": "2026-03-08T14:23:15Z", "lat": 15.32, "lon": 42.45, "speed_kn": 18.5}
            ]
        }
    ]
}
```

### Response Example: `/api/ais/exposure`

```json
{
    "Red Sea / Bab el-Mandeb": {
        "zone": "Red Sea / Bab el-Mandeb",
        "vessel_count": 12,
        "cargo_usd": 450000000,
        "alert_count": 8,
        "mmsis": ["211378120", "212567890", ...]
    },
    "Strait of Hormuz": {
        "zone": "Strait of Hormuz",
        "vessel_count": 8,
        "cargo_usd": 320000000,
        "alert_count": 5,
        "mmsis": [...]
    }
}
```

---

## Error Handling & Resilience

### WebSocket Reconnection Strategy

```
Connection Loss
    ↓
Wait 1 second
    ↓
Retry attempt 1 (if still disconnected)
    ↓
Wait 2 seconds
    ↓
Retry attempt 2
    ↓
Wait 4 seconds ... up to 30-second maximum
    ↓
Exponential backoff caps at 30s, then retries indefinitely
```

### Dead WebSocket Cleanup

- Attempted send throws exception → remove socket from `_subscribers`
- Automatic cleanup prevents memory leaks
- No manual client management required

### Database Fallback

- If AIS API unavailable, system falls back to simulator
- Simulator generates realistic movement deltas for existing vessels
- Continues live tracking demo functionality

---

## Performance Considerations

### In-Memory Limits

- **Vessel State**: Unlimited (typically <10,000 active vessels)
- **Ping Queue**: Last 10,000 pings (circular buffer)
- **Ping History per Vessel**: Last 50 pings (sliding window per vessel)
- **Alert History**: Unlimited (recommend archival after 7 days)

### WebSocket Scalability

- Broadcasting is O(n) where n = number of subscribers
- ~1,000 subscribers can handle ~100 updates/sec per subscriber
- Production recommend: scale to multiple instances with Redis pub/sub

### Geospatial Calculations

- **Haversine**: O(1) per calculation
- **Point-to-Route**: O(segments) — typically <50 segments
- **Alert Evaluation**: O(1) with deduplication cache

---

## Security Notes

- **NO authentication on WebSocket** (production should add JWT)
- **AIS data is broadcast to all subscribers** (no fine-grained access control)
- **AISSTREAM_API_KEY** stored in `.env` (not transmitted to frontend)
- **CORS enabled for localhost** (restrict in production)

---

## Testing & Debugging

### Simulated AIS Data

To test without AISSTREAM API key:
```bash
# Remove or don't set AISSTREAM_API_KEY in .env
# System will use simulate_aisstream() function
# Generates realistic position updates for demo
```

### Manual Ping Injection

```bash
curl -X POST http://localhost:8000/api/ais/ping \
  -H "Content-Type: application/json" \
  -d '{
    "mmsi": "211378120",
    "vessel_name": "Test Vessel",
    "lat": 15.32,
    "lon": 42.45,
    "speed_kn": 18.5,
    "status": "underway"
  }'
```

### Voyage Registration

```bash
curl -X POST http://localhost:8000/api/ais/voyage \
  -H "Content-Type: application/json" \
  -d '{
    "voyage_id": "VOY-2026-03-001",
    "mmsi": "211378120",
    "origin": "INBOM",
    "destination": "NLRTM",
    "cargo_value_usd": 45000000,
    "declared_route": [[18.94, 72.84], [15.0, 60.0], [10.0, 50.0], [51.92, 4.48]]
  }'
```

---

## Future Enhancements

1. **Persistent Alert Storage**: Archive alerts to database for compliance
2. **Machine Learning Anomaly Detection**: Detect unusual vessel behavior
3. **Multi-chain Waypoint Prediction**: Forecast vessel route
4. **Crew Safety Monitoring**: Detect man-overboard patterns
5. **Environmental Impact Tracking**: Monitor emissions from vessel speed
6. **Insurance Premium Dynamic Pricing**: Real-time premium adjustment based on zone
7. **Third-party Data Integration**: IMEI, satellite imagery, weather patterns
8. **Regulatory Compliance Tracking**: Flag vessels non-compliant with IMO regulations

---

## Summary

The live vessel tracking system provides **real-time maritime risk intelligence** by:
1. Ingesting AIS position reports
2. Maintaining vessel state with historical ping data
3. Evaluating 6 insurance-critical alert rules
4. Broadcasting updates via WebSocket to frontend
5. Visualizing vessels, zones, and alerts on interactive map
6. Aggregating portfolio exposure for reinsurance underwriting

The architecture is driven by **event-driven updates** (WebSocket), **geospatial analysis** (Haversine calculations), and **rule-based alerting** (6 distinct detection engines), enabling underwriters to monitor maritime risk in real-time.
