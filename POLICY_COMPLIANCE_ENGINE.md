# Policy Compliance and Coverage Lifecycle Engine

## Overview

The **Policy Compliance and Coverage Lifecycle Engine** transforms the GlobalRisk Intelligence AIS tracking system into an operational **marine insurance underwriting platform**. It evaluates vessel behavior in real time against insurance policies and automatically manages the lifecycle of coverage states.

### Purpose

Real-world marine insurers monitor insured vessels throughout active voyages to ensure:
- Vessels don't enter high-risk geographical zones without proper coverage
- Vessels comply with declared routing and port restrictions
- AIS transponders remain active (required for policy validity)
- Vessel movement patterns indicate no AIS spoofing or manipulation
- Vessels don't breach policy terms and conditions mid-voyage

When violations occur, coverage status automatically escalates from **ACTIVE** → **WARNING** → **BREACH** → **VOID**, with each state change generating compliance events that propagate through the AIS alert system and dashboard intelligence feeds.

---

## Coverage Lifecycle State Machine

```
ACTIVE
  ↓ (policy violation detected)
WARNING
  ↓ (violation continues or escalates)
BREACH
  ↓ (severe or sustained violation)
VOID (terminal state — coverage no longer valid)
```

### State Descriptions

| State | Meaning | Example Trigger |
|-------|---------|-----------------|
| **ACTIVE** | Coverage fully valid, no violations | Normal operations, compliant routing |
| **WARNING** | Early indicators of policy violation detected | Vessel approaching war zone without surcharge; minor deviation from declared route |
| **BREACH** | Policy term clearly violated but coverage may be recoverable | Extended deviation beyond tolerance, unauthorized port entry |
| **VOID** | Coverage voided, no protection remains | Unauthorized entry into sanctioned port; extended AIS loss; sustained war zone residency |

---

## Violation Scenarios

The engine continuously evaluates five distinct policy violation scenarios:

### 1. **Unauthorized War Risk Zone Entry**

**Detection Logic:**
- Vessel enters one of seven predefined war-risk maritime zones
- Policy does not have war-risk surcharge clause activated

**Escalation Path:**
- **WARNING**: Vessel enters war zone without active war surcharge
- **BREACH**: If vessel remains in zone beyond tolerance window (default: 24 hours)
- **VOID**: If `void_on_extended_stay` is enabled in policy

**Zones Monitored:**
- Strait of Hormuz (250 km radius)
- Red Sea / Bab el-Mandeb (450 km radius)
- Gulf of Aden (380 km radius)
- Black Sea (300 km radius)
- Gulf of Guinea (500 km radius)
- Strait of Malacca (300 km radius)
- South China Sea (700 km radius)

**Example Event:**
```json
{
  "event_type": "COVERAGE_ESCALATION",
  "from": "ACTIVE",
  "to": "WARNING",
  "reason": "war_risk_entry",
  "message": "Vessel entered Red Sea war zone without surcharge — coverage warning issued"
}
```

---

### 2. **Major Voyage Deviation**

**Detection Logic:**
- Vessel strays from declared route beyond configurable thresholds
- Distance measured perpendicularly from route polyline

**Escalation Path:**
- **WARNING**: Distance > warning_threshold (default: 50 km) — deviation detected
- **BREACH**: Distance > max_deviation (default: 150 km) AND sustained for > tolerance_duration (default: 6 hours)
- Auto-recovery: If vessel returns to route, warning/breach state resets

**Policy Terms (Configurable):**
```python
{
  "max_deviation_km": 150,        # Maximum acceptable deviation distance
  "warning_threshold_km": 50,      # Distance that triggers warning
  "tolerance_duration_hours": 6,   # How long at max_deviation before breaching
}
```

**Example Event:**
```json
{
  "event_type": "COVERAGE_ESCALATION",
  "from": "ACTIVE",
  "to": "WARNING",
  "reason": "route_deviation_start",
  "message": "Vessel deviated 75km from declared route — monitoring deviation",
  "evidence": { "current_deviation_km": 75 }
}
```

---

### 3. **AIS Transponder Loss**

**Detection Logic:**
- WebSocket monitoring detects no AIS pings received within timeout window
- AIS is a required policy term for insured voyages (coverage can be suspended without it)

**Escalation Path:**
- **WARNING**: No AIS signals > max_loss_duration (default: 30 minutes)
- **BREACH**: No AIS signals > breach_duration (default: 120 minutes)
- **VOID**: Extended loss — coverage deemed invalid (vessel untracked)
- Exception: Loss near known ports (anchorage) is acceptable

**Policy Terms (Configurable):**
```python
{
  "max_loss_duration_minutes": 30,    # Duration before warning
  "breach_duration_minutes": 120,     # Duration before breach
  "acceptable_near_port": True,        # Allow losses when near port
}
```

**Example Event:**
```json
{
  "event_type": "COVERAGE_ESCALATION",
  "from": "WARNING",
  "to": "BREACH",
  "reason": "ais_loss_extended",
  "message": "Extended AIS transponder silent (145 min) — coverage breach"
}
```

---

### 4. **AIS Anomaly / Spoofing Indicators**

**Detection Logic:**
- Detects unrealistic vessel movements:
  - Speed > 60 knots (physically impossible for surface vessels)
  - Position jumps > 500 km between consecutive pings
  - Other indicators flagged from existing alert rules

**Escalation Path:**
- **BREACH**: High-severity anomaly detected (likely spoofing)
- **WARNING**: Medium-severity anomaly (unusual but possible)

**Example Detection:**
```
Previous ping: (15.6°N, 42.5°E) at 10:05 UTC
Current ping:  (35.4°N, 54.8°E) at 10:10 UTC
Distance: 2,847 km in 5 minutes → IMPOSSIBLE
→ AIS Spoofing Alert + BREACH
```

---

### 5. **Unauthorized Port Entry**

**Detection Logic:**
- Vessel enters a port not on the declared voyage plan
- Optional: Port is classified as sanctioned/high-risk

**Escalation Path:**
- **BREACH**: Undeclared port entry detected
- **VOID**: Port is on sanctioned list (immediate coverage void)
- Exception: Minor anchorages near known ports may be acceptable

**Policy Terms (Configurable):**
```python
{
  "allow_undeclared_anchorage": True,  # Allow near-port anchorages
  "sanctioned_ports": [                 # Ports that void coverage
    "Crimea",
    "North Korean ports",
    ...
  ]
}
```

---

## System Architecture

### 1. **ComplianceEngine** (`backend/services/compliance_engine.py`)

Core evaluation engine. Responsibilities:
- Maintain in-memory coverage state for each voyage
- Evaluate incoming AIS pings against policy rules
- Detect violation escalations
- Generate CoverageEvent objects
- Track AIS loss via timeout detection

**Key Methods:**
```python
def register_vessel_policy(mmsi: str, policy: MarinePolicy) -> MarinePolicy
def initiate_coverage(voyage_id: str, mmsi: str, policy_id: str) -> VoyageCoverageState
def evaluate_ping(voyage_id, mmsi, lat, lon, speed_kn, timestamp, ...) -> Optional[CoverageEvent]
def detect_ais_loss(mmsi, voyage_id, current_time) -> Optional[CoverageEvent]
```

### 2. **Policy Models** (`backend/models/policy.py`)

Data structures:
- `CoverageStatus`: Enum (ACTIVE | WARNING | BREACH | VOID)
- `BreachReason`: Enum listing all violation types
- `MarinePolicy`: Insurance policy with clauses
- `PolicyClause`: Individual policy terms (war risk, deviation, ais_loss, port_restriction)
- `VoyageCoverageState`: Tracks lifecycle state for one voyage
- `CoverageEvent`: Emitted when status changes

### 3. **AIS Router Integration** (`backend/routers/ais.py`)

Enhanced ping ingestion pipeline:

```
1. Accept AIS ping
   ↓
2. Update vessel state
   ↓
3. Attach voyage context
   ↓
4. [NEW] Evaluate compliance (ComplianceEngine.evaluate_ping())
   ↓
5. Run operat ional alert rules
   ↓
6. Generate both operational & compliance events
   ↓
7. Broadcast to WebSocket subscribers
   ↓
8. Add to dashboard intelligence feed
```

**New API Endpoints:**
- `GET /api/ais/coverage/state/{voyage_id}` — Get coverage state for voyage
- `GET /api/ais/coverage/all` — Get all coverage states
- `GET /api/ais/coverage/by_mmsi/{mmsi}` — Get all coverage for a vessel
- `GET /api/ais/alerts/policy-compliance` — Get only compliance alerts
- `GET /api/ais/alerts/by_mmsi/{mmsi}` — Get all alerts for a vessel

### 4. **Frontend Display** (`frontend/src/components/CoverageStatusBadge.tsx`)

Color-coded coverage status component embedded in vessel info card:
- **ACTIVE** (green): ✓ Coverage valid
- **WARNING** (yellow): ⚠ Policy warning issued
- **BREACH** (orange): ! Policy breach detected
- **VOID** (red): ✕ Coverage voided, no protection

---

## WebSocket Message Format

### Coverage Status Change Event

When vessel coverage status changes, WebSocket broadcasts:

```json
{
  "event": "coverage.status_change",
  "data": {
    "event_id": "coverage_event_abc123",
    "voyage_id": "voyage_123",
    "mmsi": "211378120",
    "previous_status": "ACTIVE",
    "new_status": "WARNING",
    "reason": "war_risk_entry",
    "severity": "MEDIUM",
    "msg": "Vessel entered Red Sea war zone without surcharge",
    "timestamp": "2026-03-08T10:42:15Z",
    "location": {"lat": 15.2, "lon": 42.8},
    "evidence": [
      {
        "timestamp": "2026-03-08T10:42:15Z",
        "lat": 15.2,
        "lon": 42.8,
        "speed_kn": 12.5,
        "violation_details": {"zone": "Red Sea / Bab el-Mandeb"}
      }
    ]
  }
}
```

Coverage events are also converted to alerts and broadcast as:

```json
{
  "event": "alert.create",
  "data": {
    "alert_id": "coverage_event_abc123",
    "type": "policy_compliance",
    "mmsi": "211378120",
    "severity": "MEDIUM",
    "msg": "[COVERAGE] Vessel entered Red Sea war zone without surcharge",
    "coverage_status": "WARNING",
    "previous_coverage_status": "ACTIVE"
  }
}
```

---

## Demo Scenarios

The existing AIS demo simulator supports policy violation scenarios:

### Scenario 1: War Zone Entry
```bash
# Vessel enters Hormuz without surcharge
POST /api/ais/ping {
  "mmsi": "211378120",
  "lat": 26.6,      # Strait of Hormuz center
  "lon": 56.3,
  "speed_kn": 12.0
}
# → Coverage: ACTIVE → WARNING
```

### Scenario 2: Route Deviation
```bash
# Declare route from Rotterdam (51.92°N, 4.48°E) to Singapore (1.26°N, 103.82°E)
POST /api/ais/voyage {
  "voyage_id": "v123",
  "mmsi": "211378120",
  "declared_route": [
    [51.92, 4.48],    # Rotterdam
    [35.0, 20.0],     # Mediterranean
    [10.0, 60.0],     # Indian Ocean waypoint
    [1.26, 103.82]    # Singapore
  ]
}

# Then send pings 200km off route for 8+ hours
POST /api/ais/ping {
  "mmsi": "211378120",
  "lat": 25.0,
  "lon": 55.0,  # ~200km from route
  "speed_kn": 12.0
}
# → After 6+ hours: Coverage: ACTIVE → WARNING → BREACH
```

### Scenario 3: AIS Loss
```bash
# Vessel sends ping, then goes silent
POST /api/ais/ping { ... }
# [30 mins of silence]
# → Coverage: ACTIVE → WARNING
# [90 mins of silence]
# → Coverage: WARNING → BREACH/VOID
```

### Scenario 4: Unauthorized Port Entry
```bash
# Voyage plan: Rotterdam → Singapore (no Crimean ports)
# Vessel enters Crimea:
POST /api/ais/ping {
  "mmsi": "211378120",
  "lat": 44.5,      # Crimea
  "lon": 34.0,
  "speed_kn": 0.5   # Slow speed (entering port)
}
# → Coverage: ACTIVE → VOID (sanctioned port)
```

---

## Integration with Existing Systems

### 1. **Alert System**
Coverage events appear alongside operational alerts in:
- WebSocket `/api/ais/subscribe` → `coverage.status_change` events
- REST `/api/ais/alerts` endpoint (filtered by type="policy_compliance")
- Dashboard intelligence feed

### 2. **Dashboard**
New "Coverage Lifecycle" panel displays:
- Vessels by coverage status (ACTIVE/WARNING/BREACH/VOID)
- Timeline of coverage transitions
- Compliance breach reasons
- Active policy violations

### 3. **Live Tracking Demo** (`/track`)
Vessel info card now includes:
- Color-coded coverage badge
- Current coverage status
- Reason for non-ACTIVE status (if applicable)
- Coverage events in alert center

### 4. **Policy Management**
Endpoints support runtime policy updates:
- Register policies per vessel
- Enable/disable specific clauses
- Configure tolerance values (deviation, AIS loss duration, etc.)

---

## Configuration and Customization

### Default Policy Template

Every vessel receives a default policy with:
```python
{
  "clauses": [
    {
      "type": "war_risk",
      "zones": ["Strait of Hormuz", "Red Sea", "Gulf of Aden", "Gulf of Guinea"],
      "max_zone_residence_hours": 24,
      "void_on_extended_stay": True
    },
    {
      "type": "route_deviation",
      "max_deviation_km": 150,
      "warning_threshold_km": 50,
      "tolerance_duration_hours": 6
    },
    {
      "type": "ais_loss",
      "max_loss_duration_minutes": 30,
      "breach_duration_minutes": 120,
      "acceptable_near_port": True
    },
    {
      "type": "port_restriction",
      "allow_undeclared_anchorage": True,
      "sanctioned_ports": []
    }
  ]
}
```

### Customization Example

```python
from backend.models.policy import MarinePolicy, PolicyClause

# Create custom policy for high-value cargo
policy = MarinePolicy(
  vessel_mmsi="211378120",
  cargo_value_usd=250_000_000,
  premium_usd=500_000
)

# Add strict war-risk clause
policy.clauses.append(PolicyClause(
  clause_type="war_risk",
  terms={
    "zones": ["Strait of Hormuz", "Red Sea / Bab el-Mandeb", "Gulf of Aden"],
    "max_zone_residence_hours": 12,  # Stricter than default
    "void_on_extended_stay": True,
    "require_surcharge": True  # Require surcharge, not optional
  }
))

# Less tolerance for deviation
policy.clauses.append(PolicyClause(
  clause_type="route_deviation",
  terms={
    "max_deviation_km": 100,        # Stricter
    "warning_threshold_km": 30,     # Lower threshold
    "tolerance_duration_hours": 4   # Shorter tolerance
  }
))

engine.register_vessel_policy("211378120", policy)
```

---

## Performance Considerations

### Latency
- Policy evaluation on each ping: **< 5ms** (uses in-memory state)
- No database roundtrips during ping ingestion
- Compliance events broadcast simultaneously with operational alerts

### Scalability
- In-memory hash maps (voyage_id → CoverageState, mmsi → Policy)
- Linear evaluation: O(n) clauses per ping
- No N² reference lookups
- Suitable for 100s of simultaneous monitored vessels

### State Persistence
- Coverage states maintained in-memory for fast access
- Optional: Could be persisted to Supabase for audit trail and recovery
- Reset functionality for testing: `POST /api/ais/reset`

---

## Testing and Demonstration

### Unit Tests
```bash
# Test compliance engine logic
pytest backend/tests/test_compliance_engine.py
```

### Demo Mode
Run the Vessel Demo (`/track`) with real-time simulations:
```bash
# Start backend
uvicorn backend.main:app --reload --port 8000

# Start frontend
npm run dev  # Opens http://localhost:5173/track

# Send demo pings with violations
python scripts/demo_ais_generator.py --scenario war_zone_violation
```

### Manual Verification
```bash
# Check coverage state
curl http://localhost:8000/api/ais/coverage/all

# Get compliance alerts only
curl http://localhost:8000/api/ais/alerts/policy-compliance

# Get vessel-specific alerts
curl "http://localhost:8000/api/ais/alerts/by_mmsi/211378120"
```

---

## Future Enhancements

1. **Persistent Coverage Audit Trail**: Store coverage events in Supabase for regulatory compliance
2. **Dynamic Port Restrictions**: Integrate with OFAC/UNSC sanctioned port databases
3. **Premium Adjustments**: Auto-calculate surcharges based on violations
4. **Machine Learning**: Predict route deviations and anomalies
5. **Policy Auto-Renewal**: Suggest new terms based on voyage history
6. **Geofencing API**: Let underwriters define custom risk zones dynamically
7. **Coverage Recovery**: Workflow for waiving breaches with evidence
8. **Reinsurance Integration**: Aggregate coverage impact across portfolio

---

## Conclusion

The Policy Compliance and Coverage Lifecycle Engine transforms GlobalRisk Intelligence from a visualization tool into an **operational underwriting intelligence system**. It mirrors real-world marine insurance monitoring workflows and enables underwriters to:

✅ Automatically enforce policy compliance  
✅ Receive real-time breach notifications  
✅ Track coverage lifecycle changes  
✅ Demonstrate risk management to regulators  
✅ Make data-driven coverage decisions  

The system integrates seamlessly with existing AIS, alert, and WebSocket infrastructure while maintaining sub-5ms per-ping performance.
