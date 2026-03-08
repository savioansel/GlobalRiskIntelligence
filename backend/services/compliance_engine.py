"""
Policy Compliance Engine — Evaluates vessel behavior against insurance policies in real time.

Implements the coverage lifecycle state machine:
  ACTIVE → WARNING → BREACH → VOID

Each violation scenario triggers escalation with configurable thresholds for warnings, breaches, and voids.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone, timedelta
from typing import Optional
from collections import defaultdict

from backend.models.policy import (
    CoverageStatus,
    BreachReason,
    VoyageCoverageState,
    CoverageEvent,
    MarinePolicy,
    create_default_policy,
)


class ComplianceEngine:
    """Real-time policy compliance evaluation engine."""
    
    def __init__(self):
        self.coverage_states: dict[str, VoyageCoverageState] = {}  # voyage_id -> coverage state
        self.policies: dict[str, MarinePolicy] = {}  # vessel_mmsi -> policy
        self.vessel_ais_loss_tracker: dict[str, dict] = {}  # mmsi -> {"last_ping_time": ..., "loss_duration_minutes": ...}
        self.vessel_last_positions: dict[str, tuple[float, float, str]] = {}  # mmsi -> (lat, lon, timestamp)
        self.port_proximity_threshold_km = 20.0
        
    def register_vessel_policy(self, mmsi: str, policy: Optional[MarinePolicy] = None) -> MarinePolicy:
        """Register or create a policy for a vessel."""
        if policy is None:
            policy = create_default_policy(mmsi)
        self.policies[mmsi] = policy
        return policy
    
    def initiate_coverage(self, voyage_id: str, mmsi: str, policy_id: str = "") -> VoyageCoverageState:
        """Start tracking coverage for a new voyage."""
        coverage = VoyageCoverageState(
            voyage_id=voyage_id,
            mmsi=mmsi,
            policy_id=policy_id,
            status=CoverageStatus.ACTIVE,
        )
        self.coverage_states[voyage_id] = coverage
        return coverage
    
    def get_coverage_state(self, voyage_id: str) -> Optional[VoyageCoverageState]:
        """Retrieve current coverage state for a voyage."""
        return self.coverage_states.get(voyage_id)
    
    def _haversine_km(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate great-circle distance in km."""
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    def _point_to_segment_km(self, px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
        """Distance from point to line segment."""
        dx, dy = bx - ax, by - ay
        if dx == 0 and dy == 0:
            return self._haversine_km(px, py, ax, ay)
        t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        proj_lat, proj_lon = ax + t * dx, ay + t * dy
        return self._haversine_km(px, py, proj_lat, proj_lon)
    
    def _distance_to_route(self, lat: float, lon: float, route: list[list[float]]) -> float:
        """Min distance from point to any segment of route."""
        if len(route) < 2:
            return 0.0
        min_dist = float("inf")
        for i in range(len(route) - 1):
            d = self._point_to_segment_km(lat, lon, route[i][0], route[i][1], route[i + 1][0], route[i + 1][1])
            min_dist = min(min_dist, d)
        return min_dist
    
    def _near_port(self, lat: float, lon: float, known_ports: list[tuple[float, float]]) -> bool:
        """Check proximity to known ports."""
        for plat, plon in known_ports:
            if self._haversine_km(lat, lon, plat, plon) < self.port_proximity_threshold_km:
                return True
        return False
    
    def evaluate_ping(
        self,
        voyage_id: str,
        mmsi: str,
        lat: float,
        lon: float,
        speed_kn: float,
        timestamp: str,
        vessel_context: Optional[dict] = None,
        known_ports: Optional[list[tuple[float, float]]] = None,
    ) -> Optional[CoverageEvent]:
        """
        Evaluate an incoming AIS ping against the voyage's policy.
        Returns a CoverageEvent if status changed, None otherwise.
        """
        if not vessel_context:
            vessel_context = {}
        if not known_ports:
            known_ports = []
        
        # Ensure coverage state exists
        if voyage_id not in self.coverage_states:
            self.initiate_coverage(voyage_id, mmsi)
        
        coverage = self.coverage_states[voyage_id]
        
        # Get vessel policy
        policy = self.policies.get(mmsi) or create_default_policy(mmsi)
        
        # Determine previous status for event generation
        previous_status = coverage.status
        new_status = coverage.status
        breach_reason: Optional[BreachReason] = None
        event_details = {}
        
        # Short-circuit if already VOID
        if coverage.status == CoverageStatus.VOID:
            return None
        
        # ─────────────────────────────────────────────────────────────────────
        # 1. WAR RISK ZONE EVALUATION
        # ─────────────────────────────────────────────────────────────────────
        war_risk_clause = next((c for c in policy.clauses if c.clause_type == "war_risk"), None)
        if war_risk_clause and war_risk_clause.enabled:
            zone_name = vessel_context.get("current_war_zone")
            
            if zone_name:  # Vessel is in a zone
                # Check if surcharge is active (this would be in vessel_context if policy was properly configured)
                has_war_surcharge = vessel_context.get("war_surcharge_active", False)
                
                if not has_war_surcharge:
                    terms = war_risk_clause.terms
                    max_zone_hours = terms.get("max_zone_residence_hours", 24)
                    
                    if coverage.war_risk_zone_name != zone_name:
                        # NEW zone entry → WARNING
                        coverage.war_risk_zone_name = zone_name
                        coverage.war_risk_entry_time = timestamp
                        if new_status == CoverageStatus.ACTIVE:
                            new_status = CoverageStatus.WARNING
                            breach_reason = BreachReason.WAR_RISK_ENTRY
                            event_details = {"zone": zone_name}
                    
                    elif coverage.war_risk_entry_time:
                        # Already in zone → check duration
                        entry_dt = datetime.fromisoformat(coverage.war_risk_entry_time)
                        current_dt = datetime.fromisoformat(timestamp)
                        duration_hours = (current_dt - entry_dt).total_seconds() / 3600
                        
                        if duration_hours > max_zone_hours:
                            # Extended residence → BREACH or VOID
                            if terms.get("void_on_extended_stay"):
                                new_status = CoverageStatus.VOID
                                breach_reason = BreachReason.WAR_RISK_EXTENDED
                            elif new_status != CoverageStatus.BREACH:
                                new_status = CoverageStatus.BREACH
                                breach_reason = BreachReason.WAR_RISK_EXTENDED
                            event_details = {"zone": zone_name, "duration_hours": round(duration_hours, 1)}
            else:
                # Exited war zone
                coverage.war_risk_zone_name = None
                coverage.war_risk_entry_time = None
        
        # ─────────────────────────────────────────────────────────────────────
        # 2. ROUTE DEVIATION EVALUATION
        # ─────────────────────────────────────────────────────────────────────
        route_clause = next((c for c in policy.clauses if c.clause_type == "route_deviation"), None)
        if route_clause and route_clause.enabled:
            declared_route = vessel_context.get("declared_route", [])
            
            if declared_route and len(declared_route) >= 2:
                distance_km = self._distance_to_route(lat, lon, declared_route)
                terms = route_clause.terms
                warning_threshold = terms.get("warning_threshold_km", 50)
                max_deviation = terms.get("max_deviation_km", 150)
                tolerance_hours = terms.get("tolerance_duration_hours", 6)
                
                if distance_km > warning_threshold:
                    coverage.deviation_max_distance_km = max(coverage.deviation_max_distance_km, distance_km)
                    
                    if coverage.deviation_start_time is None:
                        # Start of deviation
                        coverage.deviation_start_time = timestamp
                        if new_status == CoverageStatus.ACTIVE:
                            new_status = CoverageStatus.WARNING
                            breach_reason = BreachReason.ROUTE_DEVIATION_START
                            event_details = {"deviation_km": round(distance_km, 1)}
                    
                    else:
                        # Ongoing deviation → check duration and distance
                        dev_dt = datetime.fromisoformat(coverage.deviation_start_time)
                        current_dt = datetime.fromisoformat(timestamp)
                        dev_duration_hours = (current_dt - dev_dt).total_seconds() / 3600
                        
                        if dev_duration_hours > tolerance_hours and distance_km > max_deviation:
                            # Extended, significant deviation → BREACH or VOID
                            new_status = CoverageStatus.BREACH
                            breach_reason = BreachReason.ROUTE_DEVIATION_EXTENDED
                            event_details = {
                                "deviation_km": round(distance_km, 1),
                                "duration_hours": round(dev_duration_hours, 1),
                            }
                else:
                    # Back on route
                    coverage.deviation_start_time = None
                    coverage.deviation_max_distance_km = 0.0
        
        # ─────────────────────────────────────────────────────────────────────
        # 3. AIS TRANSPONDER LOSS EVALUATION
        # ─────────────────────────────────────────────────────────────────────
        ais_clause = next((c for c in policy.clauses if c.clause_type == "ais_loss"), None)
        if ais_clause and ais_clause.enabled:
            # We would track AIS loss through pings. If we're receiving this ping, AIS is active.
            # In a real system, we'd have a timeout mechanism to detect loss.
            if mmsi in self.vessel_ais_loss_tracker:
                del self.vessel_ais_loss_tracker[mmsi]
            coverage.ais_loss_start_time = None
        
        # ─────────────────────────────────────────────────────────────────────
        # 4. AIS SPOOFING EVALUATION (from vessel_context if anomaly flag set)
        # ─────────────────────────────────────────────────────────────────────
        if vessel_context.get("ais_anomaly_detected"):
            severity = vessel_context.get("ais_anomaly_severity", "MEDIUM")
            if severity == "HIGH":
                new_status = CoverageStatus.BREACH
                breach_reason = BreachReason.AIS_SPOOFING
                event_details = {"anomaly": vessel_context.get("ais_anomaly_reason", "Unusual movement")}
            elif severity == "MEDIUM" and new_status == CoverageStatus.ACTIVE:
                new_status = CoverageStatus.WARNING
                breach_reason = BreachReason.AIS_SPOOFING
        
        # ─────────────────────────────────────────────────────────────────────
        # 5. UNAUTHORIZED PORT ENTRY
        # ─────────────────────────────────────────────────────────────────────
        port_clause = next((c for c in policy.clauses if c.clause_type == "port_restriction"), None)
        if port_clause and port_clause.enabled:
            current_port = vessel_context.get("current_port")
            declared_ports = vessel_context.get("declared_ports", [])
            sanctioned_ports = port_clause.terms.get("sanctioned_ports", [])
            
            if current_port and current_port not in declared_ports:
                # Check if near known ports (anchorage) is allowed
                allow_anchorage = port_clause.terms.get("allow_undeclared_anchorage", True)
                near_port = self._near_port(lat, lon, known_ports) if allow_anchorage else False
                
                if not near_port:
                    if current_port not in coverage.unauthorized_ports_visited:
                        coverage.unauthorized_ports_visited.append(current_port)
                    
                    # Check if sanctioned
                    if current_port in sanctioned_ports:
                        new_status = CoverageStatus.VOID
                        breach_reason = BreachReason.UNAUTHORIZED_PORT_SANCTIONED
                    elif new_status != CoverageStatus.VOID:
                        new_status = CoverageStatus.BREACH
                        breach_reason = BreachReason.UNAUTHORIZED_PORT
                    
                    event_details = {"port": current_port, "sanctioned": current_port in sanctioned_ports}
        
        # ─────────────────────────────────────────────────────────────────────
        # EMIT EVENT IF STATUS CHANGED
        # ─────────────────────────────────────────────────────────────────────
        if new_status != previous_status and breach_reason:
            # Update coverage state
            coverage.previous_status = previous_status
            coverage.status = new_status
            coverage.last_breach_reason = breach_reason
            coverage.updated_at = timestamp
            
            # Track timing of transitions
            if new_status == CoverageStatus.WARNING and coverage.warning_issued_at is None:
                coverage.warning_issued_at = timestamp
            elif new_status == CoverageStatus.BREACH and coverage.breach_issued_at is None:
                coverage.breach_issued_at = timestamp
            elif new_status == CoverageStatus.VOID and coverage.void_issued_at is None:
                coverage.void_issued_at = timestamp
            
            # Create event
            severity_map = {
                CoverageStatus.WARNING: "MEDIUM",
                CoverageStatus.BREACH: "HIGH",
                CoverageStatus.VOID: "CRITICAL",
            }
            
            reason_msg_map = {
                BreachReason.WAR_RISK_ENTRY: f"Vessel entered {event_details.get('zone', 'war zone')} without surcharge",
                BreachReason.WAR_RISK_EXTENDED: f"Vessel exceeded {event_details.get('duration_hours', 24)}h in war zone {event_details.get('zone', '')}",
                BreachReason.ROUTE_DEVIATION_START: f"Vessel deviated {event_details.get('deviation_km', 0)}km from declared route",
                BreachReason.ROUTE_DEVIATION_EXTENDED: f"Vessel deviated {event_details.get('deviation_km', 0)}km for {event_details.get('duration_hours', 6)}h",
                BreachReason.AIS_LOSS_SHORT: "Temporary AIS signal loss detected",
                BreachReason.AIS_LOSS_EXTENDED: "Extended AIS transponder loss — coverage voided",
                BreachReason.AIS_SPOOFING: f"AIS anomaly detected: {event_details.get('anomaly', 'unusual movement')}",
                BreachReason.UNAUTHORIZED_PORT: f"Vessel entered unauthorized port: {event_details.get('port', 'unknown')}",
                BreachReason.UNAUTHORIZED_PORT_SANCTIONED: f"Vessel entered sanctioned port: {event_details.get('port', 'unknown')} — coverage VOID",
            }
            
            event = CoverageEvent(
                voyage_id=voyage_id,
                mmsi=mmsi,
                previous_status=previous_status,
                new_status=new_status,
                reason=breach_reason,
                severity=severity_map.get(new_status, "MEDIUM"),
                msg=reason_msg_map.get(breach_reason, "Policy compliance breach"),
                location={"lat": lat, "lon": lon},
                evidence=[
                    {
                        "timestamp": timestamp,
                        "lat": lat,
                        "lon": lon,
                        "speed_kn": speed_kn,
                        "violation_details": event_details,
                    }
                ],
            )
            
            return event
        
        # Update last known position
        self.vessel_last_positions[mmsi] = (lat, lon, timestamp)
        return None
    
    def detect_ais_loss(
        self,
        mmsi: str,
        voyage_id: str,
        current_time: str,
        known_ports: Optional[list[tuple[float, float]]] = None,
    ) -> Optional[CoverageEvent]:
        """
        Detect extended AIS loss. Called periodically when no pings received.
        Should be triggered by a timeout mechanism in the AIS ingestion system.
        """
        if not known_ports:
            known_ports = []
        
        if voyage_id not in self.coverage_states:
            return None
        
        coverage = self.coverage_states[voyage_id]
        
        # Get last known position
        last_pos = self.vessel_last_positions.get(mmsi)
        if not last_pos:
            return None
        
        lat, lon, last_ping_time = last_pos
        ais_clause = next((c for c in self.policies.get(mmsi, create_default_policy(mmsi)).clauses
                           if c.clause_type == "ais_loss"), None)
        
        if not ais_clause or not ais_clause.enabled:
            return None
        
        terms = ais_clause.terms
        max_loss_minutes = terms.get("max_loss_duration_minutes", 30)
        breach_minutes = terms.get("breach_duration_minutes", 120)
        acceptable_near_port = terms.get("acceptable_near_port", True)
        
        last_dt = datetime.fromisoformat(last_ping_time)
        current_dt = datetime.fromisoformat(current_time)
        silence_minutes = (current_dt - last_dt).total_seconds() / 60
        
        # Don't penalize if near port
        if acceptable_near_port and self._near_port(lat, lon, known_ports):
            return None
        
        if coverage.ais_loss_start_time is None and silence_minutes > max_loss_minutes:
            coverage.ais_loss_start_time = current_time
            
            # Issue WARNING
            if coverage.status == CoverageStatus.ACTIVE:
                coverage.previous_status = coverage.status
                coverage.status = CoverageStatus.WARNING
                coverage.last_breach_reason = BreachReason.AIS_LOSS_SHORT
                coverage.warning_issued_at = current_time
                
                event = CoverageEvent(
                    voyage_id=voyage_id,
                    mmsi=mmsi,
                    previous_status=CoverageStatus.ACTIVE,
                    new_status=CoverageStatus.WARNING,
                    reason=BreachReason.AIS_LOSS_SHORT,
                    severity="MEDIUM",
                    msg=f"AIS transponder silent for {round(silence_minutes)}min — coverage warning",
                    location={"lat": lat, "lon": lon},
                    evidence=[{"last_ping": last_ping_time, "silence_minutes": round(silence_minutes)}],
                )
                return event
        
        elif coverage.ais_loss_start_time and silence_minutes > breach_minutes:
            # Issue BREACH or VOID
            if coverage.status != CoverageStatus.VOID:
                coverage.previous_status = coverage.status
                coverage.status = CoverageStatus.VOID
                coverage.last_breach_reason = BreachReason.AIS_LOSS_EXTENDED
                coverage.void_issued_at = current_time
                
                event = CoverageEvent(
                    voyage_id=voyage_id,
                    mmsi=mmsi,
                    previous_status=coverage.previous_status,
                    new_status=CoverageStatus.VOID,
                    reason=BreachReason.AIS_LOSS_EXTENDED,
                    severity="CRITICAL",
                    msg=f"Extended AIS loss ({round(silence_minutes)}min) — coverage VOIDED",
                    location={"lat": lat, "lon": lon},
                    evidence=[{"last_ping": last_ping_time, "silence_minutes": round(silence_minutes)}],
                )
                return event
        
        return None
    
    def reset_all(self):
        """Reset all compliance state (for testing/demo)."""
        self.coverage_states.clear()
        self.vessel_ais_loss_tracker.clear()
        self.vessel_last_positions.clear()
