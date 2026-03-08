"""
Policy Compliance Models — Coverage lifecycle, policy rules, and compliance events.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
import uuid

from pydantic import BaseModel, Field


class CoverageStatus(str, Enum):
    """Coverage state machine."""
    ACTIVE = "ACTIVE"
    WARNING = "WARNING"
    BREACH = "BREACH"
    VOID = "VOID"


class BreachReason(str, Enum):
    """Enumeration of covered breach scenarios."""
    WAR_RISK_ENTRY = "war_risk_entry"
    WAR_RISK_EXTENDED = "war_risk_extended"
    ROUTE_DEVIATION_START = "route_deviation_start"
    ROUTE_DEVIATION_EXTENDED = "route_deviation_extended"
    AIS_LOSS_SHORT = "ais_loss_short"
    AIS_LOSS_EXTENDED = "ais_loss_extended"
    AIS_SPOOFING = "ais_spoofing"
    UNAUTHORIZED_PORT = "unauthorized_port"
    UNAUTHORIZED_PORT_SANCTIONED = "unauthorized_port_sanctioned"
    UNDEFINED = "undefined"


class PolicyClause(BaseModel):
    """Represents an underwritten insurance clause for vessel voyages."""
    clause_id: str = Field(default_factory=lambda: f"clause_{uuid.uuid4().hex[:12]}")
    policy_id: str  # Parent policy
    clause_type: str  # "war_risk" | "route_deviation" | "ais_loss" | "port_restriction"
    enabled: bool = True
    description: str = ""
    terms: dict = Field(default_factory=dict)  # Clause-specific parameters


class MarinePolicy(BaseModel):
    """Insurance policy for maritime voyages."""
    policy_id: str = Field(default_factory=lambda: f"policy_{uuid.uuid4().hex[:12]}")
    underwriter: str = ""
    vessel_mmsi: str = ""
    effective_from: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    effective_to: str = ""
    cargo_value_usd: float = 0.0
    premium_usd: float = 0.0
    clauses: list[PolicyClause] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class VoyageCoverageState(BaseModel):
    """Tracks the current coverage lifecycle state for an active voyage."""
    coverage_id: str = Field(default_factory=lambda: f"coverage_{uuid.uuid4().hex[:12]}")
    voyage_id: str
    mmsi: str
    policy_id: str = ""
    status: CoverageStatus = CoverageStatus.ACTIVE
    previous_status: Optional[CoverageStatus] = None
    last_breach_reason: Optional[BreachReason] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    
    # Breach tracking
    war_risk_entry_time: Optional[str] = None  # When vessel entered war zone
    war_risk_zone_name: Optional[str] = None
    deviation_start_time: Optional[str] = None  # When deviation began
    deviation_max_distance_km: float = 0.0
    ais_loss_start_time: Optional[str] = None  # When AIS signals stopped
    unauthorized_ports_visited: list[str] = Field(default_factory=list)
    
    # Escalation tracking
    warning_issued_at: Optional[str] = None
    breach_issued_at: Optional[str] = None
    void_issued_at: Optional[str] = None


class CoverageEvent(BaseModel):
    """Event emitted when coverage status changes."""
    event_id: str = Field(default_factory=lambda: f"coverage_event_{uuid.uuid4().hex[:12]}")
    voyage_id: str
    mmsi: str
    previous_status: CoverageStatus
    new_status: CoverageStatus
    reason: BreachReason
    severity: str = "MEDIUM"  # CRITICAL|HIGH|MEDIUM|LOW
    msg: str
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    location: dict = Field(default_factory=dict)  # {"lat": ..., "lon": ...}
    evidence: list[dict] = Field(default_factory=list)
    
    def to_alert(self) -> dict:
        """Convert to AIS alert format for backward compatibility."""
        severity_map = {
            CoverageStatus.WARNING: "MEDIUM",
            CoverageStatus.BREACH: "HIGH",
            CoverageStatus.VOID: "CRITICAL",
        }
        return {
            "alert_id": self.event_id,
            "type": "policy_compliance",
            "mmsi": self.mmsi,
            "voyage_id": self.voyage_id,
            "severity": severity_map.get(self.new_status, "MEDIUM"),
            "msg": self.msg,
            "timestamp": self.timestamp,
            "location": self.location,
            "evidence": self.evidence,
            "coverage_status": self.new_status,
            "previous_coverage_status": self.previous_status,
        }


# ── Default Policy Template ──────────────────────────────────────────────
def create_default_policy(mmsi: str, vessel_name: str = "", cargo_value_usd: float = 0.0) -> MarinePolicy:
    """Create a default marine insurance policy with standard clauses."""
    policy = MarinePolicy(
        vessel_mmsi=mmsi,
        cargo_value_usd=cargo_value_usd,
        premium_usd=round(cargo_value_usd * 0.002) if cargo_value_usd else 5000,
    )
    
    # Default clause 1: War risk (high-risk zones require additional premium)
    policy.clauses.append(PolicyClause(
        policy_id=policy.policy_id,
        clause_type="war_risk",
        description="War risk surcharge required for Strait of Hormuz, Red Sea, Gulf of Guinea, etc.",
        terms={
            "zones": ["Strait of Hormuz", "Red Sea / Bab el-Mandeb", "Gulf of Aden", "Gulf of Guinea"],
            "surcharge_percent": 2.5,
            "max_zone_residence_hours": 24,
            "void_on_extended_stay": True,
        },
    ))
    
    # Default clause 2: Route deviation
    policy.clauses.append(PolicyClause(
        policy_id=policy.policy_id,
        clause_type="route_deviation",
        description="Coverage void if vessel deviates >150km from declared route for >6 hours.",
        terms={
            "max_deviation_km": 150,
            "tolerance_duration_hours": 6,
            "warning_threshold_km": 50,
        },
    ))
    
    # Default clause 3: AIS loss
    policy.clauses.append(PolicyClause(
        policy_id=policy.policy_id,
        clause_type="ais_loss",
        description="AIS transponder required. Extended loss outside port voids coverage.",
        terms={
            "max_loss_duration_minutes": 30,
            "breach_duration_minutes": 120,
            "acceptable_near_port": True,
        },
    ))
    
    # Default clause 4: Unauthorized port entry
    policy.clauses.append(PolicyClause(
        policy_id=policy.policy_id,
        clause_type="port_restriction",
        description="Undeclared port entry may void coverage, especially sanctioned ports.",
        terms={
            "allow_undeclared_anchorage": True,
            "sanctioned_ports": [],  # Would be populated from external data
        },
    ))
    
    return policy
