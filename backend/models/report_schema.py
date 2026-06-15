"""
Pydantic models for theValyze Credit report report system.

Defines every data structure used in report creation, editing,
and serialisation, plus the build_empty_report() helper.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from models.field_meta import FIELD_REGISTRY


# ---------------------------------------------------------------------------
# Field data
# ---------------------------------------------------------------------------


class FieldData(BaseModel):
    value: Optional[Any] = None
    confidence: str = "missing"
    source: str = "system"
    locked: bool = False


# ---------------------------------------------------------------------------
# Array item models
# ---------------------------------------------------------------------------


# In report_schema.py - replace Shareholder class
class Shareholder(BaseModel):
    name: str
    percentage: Optional[Any] = None  # allow "100%", 100, "100"
    nationality: str = "N/A"
    type: str = "Individual"
    ownership_percentage: Optional[Any] = None  # alias
    position: Optional[str] = None  # title/position


class Branch(BaseModel):
    branch_name: str
    branch_unified_no: Optional[str] = None
    branch_cr_no: Optional[str] = None
    branch_city: Optional[str] = None
    branch_function: Optional[str] = None
    branch_status: str = "Active"
    branch_status_badge: str = "low"


class BankingRelationship(BaseModel):
    bank_name: str
    facility_type: Optional[str] = None
    facility_usage: Optional[str] = None


class NewsEvent(BaseModel):
    event_date: str
    event_title: str
    event_summary: str
    event_sentiment: str = "info"
    event_sentiment_label: str = "Neutral"


class Recommendation(BaseModel):
    rec_area: str
    rec_detail: str
    rec_priority: str = "Medium"
    rec_priority_badge: str = "medium"


class RiskMitigation(BaseModel):
    mitigation_title: Optional[str] = None
    mitigation_detail: Optional[str] = None
    strategy: Optional[str] = None
    expected_outcome: Optional[str] = None

    def model_post_init(self, __context):
        # Map strategy/expected_outcome to mitigation_title/detail if present
        if self.strategy and not self.mitigation_title:
            self.mitigation_title = self.strategy
        if self.expected_outcome and not self.mitigation_detail:
            self.mitigation_detail = self.expected_outcome


class MonitoringTrigger(BaseModel):
    trigger_event: str
    trigger_action: str


class Alert(BaseModel):
    alert_type: str = "info"
    alert_icon: str = "ℹ️"
    alert_message: str


class LegalDetail(BaseModel):
    event_type: str
    event_date: str
    event_amount: Optional[str] = None
    event_description: str


class RegionalAffiliate(BaseModel):
    affiliate_name: str


class PhoneNumber(BaseModel):
    country_flag: Optional[str] = None
    country_code: Optional[str] = None
    phone_number: str
    national_id: Optional[str] = None
    number_type: str = "Phone"
    contact_person: Optional[str] = None
    comments: Optional[str] = None
    is_primary: bool = False


class ManagementTeamMember(BaseModel):
    name: str
    title: Optional[str] = None
    department: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    bio: Optional[str] = None


# ---------------------------------------------------------------------------
# Container for all arrays
# ---------------------------------------------------------------------------


class ReportArrays(BaseModel):
    shareholders: List[Shareholder] = Field(default_factory=list)
    branches: List[Branch] = Field(default_factory=list)
    banking_relationships: List[BankingRelationship] = Field(default_factory=list)
    news_events: List[NewsEvent] = Field(default_factory=list)
    recommendations: List[Recommendation] = Field(default_factory=list)
    risk_mitigations: List[RiskMitigation] = Field(default_factory=list)
    monitoring_triggers: List[MonitoringTrigger] = Field(default_factory=list)
    alerts: List[Alert] = Field(default_factory=list)
    regional_affiliates: List[RegionalAffiliate] = Field(default_factory=list)
    legal_details: List[LegalDetail] = Field(default_factory=list)
    strengths: List[str] = Field(default_factory=list)
    weaknesses: List[str] = Field(default_factory=list)
    opportunities: List[str] = Field(default_factory=list)
    threats: List[str] = Field(default_factory=list)
    management_team: List[ManagementTeamMember] = Field(default_factory=list)
    phone_numbers: List[PhoneNumber] = Field(default_factory=list)
    board_members: List[Dict[str, Any]] = Field(default_factory=list)
    extra_reg_fields: List[Dict[str, Any]] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# File / extraction metadata
# ---------------------------------------------------------------------------


class FileInfo(BaseModel):
    filename: str
    file_type: str
    pages: Optional[int] = None
    language: Optional[str] = None
    processed: bool = False


class ExtractionStats(BaseModel):
    total_fields: int = 0
    high_confidence: int = 0
    medium_confidence: int = 0
    missing: int = 0
    calculated: int = 0


# ---------------------------------------------------------------------------
# Full report
# ---------------------------------------------------------------------------


class FullReport(BaseModel):
    report_id: str
    status: str
    created_at: str
    updated_at: str
    fields: Dict[str, FieldData]
    arrays: ReportArrays
    files: List[FileInfo] = Field(default_factory=list)
    extraction_stats: ExtractionStats = Field(default_factory=ExtractionStats)


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class UpdateFieldRequest(BaseModel):
    field_name: str = Field(
        ..., min_length=1, max_length=100, pattern=r"^[a-z_][a-z0-9_]*$"
    )
    value: Any
    source: str = "user"
    last_known_updated_at: Optional[str] = None


class UpdateFieldsBulkRequest(BaseModel):
    fields: Dict[str, Any] = Field(..., max_length=100)
    last_known_updated_at: Optional[str] = None


class UpdateArrayRequest(BaseModel):
    array_name: str = Field(..., pattern=r"^[a-z_][a-z0-9_]*$")
    data: List[Any]
    last_known_updated_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Helper: build empty report
# ---------------------------------------------------------------------------


def build_empty_report(report_id: str) -> FullReport:
    """Return a FullReport with every field initialised from FIELD_REGISTRY."""
    now = datetime.now(timezone.utc).isoformat()

    fields: Dict[str, FieldData] = {}
    for field_name, meta in FIELD_REGISTRY.items():
        fields[field_name] = FieldData(
            value=None,
            confidence="missing",
            source=meta["source"],
            locked=meta.get("locked", False),
        )

    # Count stats
    total = len(fields)
    stats = ExtractionStats(
        total_fields=total,
        high_confidence=0,
        medium_confidence=0,
        missing=total,
        calculated=0,
    )

    return FullReport(
        report_id=report_id,
        status="uploading",
        created_at=now,
        updated_at=now,
        fields=fields,
        arrays=ReportArrays(),
        files=[],
        extraction_stats=stats,
    )
