"""
Admin delivery API — the last gate before a report reaches a client.

Three jobs:
  1. Persist the AI QA verdict on the report so it is visible to everyone, not
     just the analyst whose browser ran the check.
  2. List reports that are finished and not yet delivered, with their QA state.
  3. Compute the invoice for one of those reports (from pricing_engine — never
     from an AI) and, behind an explicit flag, send the report to the client.

Three QA states, and they must never collapse into two:
    "pass"  — checked, clean
    "fail"  — checked, problems found
    None    — never checked. This is NOT a pass.

Requires migration 011_report_qa_verdict.sql. Until that is applied by hand in
the Supabase SQL editor, the QA columns do not exist; the endpoints below degrade
to "not checked" rather than raising.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import requests
from html import escape
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.auth import get_current_user, require_admin
from services.mailer import configured_transport, send_email, transport_status
from services.pricing_engine import calculate_invoice
from services.supabase_client import (
    get_base_url,
    get_client,
    get_headers,
    get_order,
    get_order_companies,
    get_report,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/delivery", tags=["delivery"])

# Sending a real report to a real client is off until an operator turns it on.
# A cheap misconfiguration here emails the wrong document to a paying customer.
SEND_ENABLED = os.getenv("DELIVERY_SEND_ENABLED", "").lower() in {"1", "true", "yes"}

VALID_VERDICTS = {"pass", "fail"}


class QAVerdictBody(BaseModel):
    verdict: str = Field(..., description="pass | fail")
    finding_count: int = Field(0, ge=0)
    critical_count: int = Field(0, ge=0)
    major_count: int = Field(0, ge=0)
    minor_count: int = Field(0, ge=0)
    findings: Optional[List[Dict[str, Any]]] = None


# What one finding costs a report's quality score. A critical error in a credit
# report can move a lending decision; a formatting slip cannot. Weighting them
# equally would let a tidy analyst with one critical outrank a thorough one with
# six cosmetic notes, which is exactly backwards.
SEVERITY_WEIGHT = {"critical": 5.0, "major": 2.0, "minor": 0.5}


def _patch_report(report_id: str, payload: Dict[str, Any]) -> bool:
    """PATCH a report row. Returns False when the QA columns are not there yet
    (migration 011 not applied) rather than blowing up the caller."""
    url = f"{get_base_url()}/reports?id=eq.{report_id}"
    try:
        resp = requests.patch(url, headers=get_headers(), json=payload, timeout=15)
    except requests.RequestException as exc:
        logger.error(f"[DELIVERY] PATCH report {report_id} failed to send: {exc}")
        return False

    if resp.status_code in (200, 204):
        return True

    # PostgREST says PGRST204 for an unknown column — that is the un-run migration,
    # not a bug in the caller. Name the remedy in the log so nobody debugs the code.
    if resp.status_code in (400, 404) and "PGRST2" in resp.text:
        logger.error(
            f"[DELIVERY] reports is missing the QA columns — apply "
            f"supabase/migrations/011_report_qa_verdict.sql in the Supabase SQL editor. "
            f"Upstream said: {resp.status_code}"
        )
        return False

    logger.error(f"[DELIVERY] PATCH report {report_id} rejected: {resp.status_code}")
    return False


@router.patch("/qa/{report_id}")
async def save_qa_verdict(
    report_id: str,
    body: QAVerdictBody,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Record the outcome of a QA run. Any analyst may do this."""
    if body.verdict not in VALID_VERDICTS:
        raise HTTPException(status_code=400, detail="verdict must be 'pass' or 'fail'")

    if get_report(report_id) is None:
        raise HTTPException(status_code=404, detail="Report not found")

    saved = _patch_report(report_id, {
        "qa_verdict": body.verdict,
        "qa_checked_at": datetime.now(timezone.utc).isoformat(),
        "qa_finding_count": body.finding_count,
        "qa_critical_count": body.critical_count,
        "qa_major_count": body.major_count,
        "qa_minor_count": body.minor_count,
        # Store the findings themselves so an admin can read the actual mistakes
        # on the review page instead of guessing from a count.
        "qa_findings": body.findings or [],
    })

    # A failure here is a missing migration, not a failed check — say so plainly
    # instead of pretending the verdict was stored.
    return {"saved": saved, "verdict": body.verdict}


def _qa_state(report: Dict[str, Any]) -> Dict[str, Any]:
    verdict = report.get("qa_verdict")
    return {
        "verdict": verdict if verdict in VALID_VERDICTS else None,
        "checked_at": report.get("qa_checked_at"),
        "finding_count": report.get("qa_finding_count"),
        "label": {"pass": "Passed", "fail": "Failed"}.get(verdict, "Not checked"),
    }


@router.get("/queue")
async def delivery_queue(user: Dict[str, Any] = Depends(get_current_user)):
    """Reports that are finished and not yet sent to the client. Admin only."""
    require_admin(user)

    report_fields = (
        "id,company_name,cr_number,country,analyst,status,updated_at,client_reference,"
        "qa_verdict,qa_checked_at,qa_finding_count,delivered_at"
    )

    def _get(url: str, what: str) -> List[Dict[str, Any]]:
        try:
            resp = requests.get(url, headers=get_headers(), timeout=20)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as exc:
            logger.error(f"[DELIVERY] {what} fetch failed: {exc}")
            raise HTTPException(status_code=500, detail="Could not load the delivery queue")

    # A report is deliverable when the ANALYST says so (order_companies.status ==
    # 'completed', set by complete_company_work) — that is the human signal, and
    # it is the table the send path already walks for the client's address.
    # We also accept reports whose own status is terminal, to cover reports
    # created outside the order flow.
    #
    # NOTE: reports.status is "complete", NOT "completed" (see generate.py) while
    # order_companies.status IS "completed". Filtering reports on "completed"
    # matches nothing — that mismatch made this queue permanently empty.
    TERMINAL_REPORT_STATUSES = ("complete", "completed")

    by_id: Dict[str, Dict[str, Any]] = {}

    linked = _get(
        f"{get_base_url()}/order_companies"
        "?select=report_id,analyst_assigned,updated_at"
        "&status=eq.completed&report_id=not.is.null&limit=500",
        "order_companies",
    )
    linked_ids = [r["report_id"] for r in linked if r.get("report_id")]
    if linked_ids:
        ids = ",".join(quote(str(i), safe="") for i in linked_ids)
        for r in _get(
            f"{get_base_url()}/reports?select={report_fields}&id=in.({ids})&limit=500",
            "reports by order",
        ):
            by_id[r["id"]] = r

    for r in _get(
        f"{get_base_url()}/reports?select={report_fields}"
        f"&status=in.({','.join(TERMINAL_REPORT_STATUSES)})"
        "&order=updated_at.desc&limit=500",
        "reports by status",
    ):
        by_id.setdefault(r["id"], r)

    items: List[Dict[str, Any]] = []
    delivered = 0
    for r in by_id.values():
        if r.get("delivered_at"):
            delivered += 1
            continue
        qa = _qa_state(r)
        items.append({
            "report_id": r.get("id"),
            "company_name": r.get("company_name"),
            "cr_number": r.get("cr_number"),
            "country": r.get("country"),
            "analyst": r.get("analyst"),
            "client_reference": r.get("client_reference"),
            "completed_at": r.get("updated_at"),
            "qa": qa,
            # A report that has not passed QA may not be sent. "Not checked" is
            # not a pass — both None and "fail" block here.
            "sendable": qa["verdict"] == "pass",
        })

    items.sort(key=lambda x: x.get("completed_at") or "", reverse=True)

    return {
        "items": items,
        "send_enabled": SEND_ENABLED,
        "mail": transport_status(),
        # So an empty queue is explainable instead of mysterious.
        "diagnostics": {
            "completed_order_companies": len(linked),
            "candidate_reports": len(by_id),
            "already_delivered": delivered,
        },
    }


def _order_for_report(
    report_id: str, order_id: Optional[str] = None
) -> tuple[str, Dict[str, Any], Dict[str, Any]]:
    """Walk from a report back to its order and client via order_companies.
    Raises the 404 itself so every caller reports the same thing."""
    resolved = order_id
    if not resolved:
        url = f"{get_base_url()}/order_companies?select=order_id&report_id=eq.{report_id}&limit=1"
        try:
            resp = requests.get(url, headers=get_headers(), timeout=15)
            resp.raise_for_status()
            rows = resp.json()
            resolved = rows[0].get("order_id") if rows else None
        except requests.RequestException as exc:
            logger.error(f"[DELIVERY] order lookup for report {report_id} failed: {exc}")
            resolved = None

    if not resolved:
        raise HTTPException(status_code=404, detail="No order is linked to this report")

    order = get_order(resolved)
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")

    return resolved, order, get_client(order.get("client_id", "")) or {}


def _quality_score(reports: int, critical: int, major: int, minor: int) -> Optional[float]:
    """100 minus the weighted defect load per report, floored at 0.

    Deliberately NOT a pass-rate: a pass rate hides how badly a report failed, and
    it treats "never checked" as either a pass or a hole depending on the
    denominator. This scores only reports that were actually reviewed, so an
    unreviewed analyst scores None rather than a flattering 100.
    """
    if reports <= 0:
        return None
    weighted = (
        critical * SEVERITY_WEIGHT["critical"]
        + major * SEVERITY_WEIGHT["major"]
        + minor * SEVERITY_WEIGHT["minor"]
    )
    return round(max(0.0, 100.0 - (weighted / reports) * 10.0), 1)


@router.get("/kpi")
async def team_kpi(days: int = 30, user: Dict[str, Any] = Depends(get_current_user)):
    """Team performance over a rolling window, per analyst. Admin only.

    Every number here is counted from report rows — nothing is estimated and no
    model is consulted. Reports that were never QA'd are reported separately
    rather than folded into either the pass or the fail column.
    """
    require_admin(user)

    days = max(1, min(int(days or 30), 365))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # An ISO timestamp ends in "+00:00", and a bare "+" in a query string decodes
    # to a SPACE — PostgREST then rejects the whole filter. Always percent-encode
    # a timestamp before putting it in a URL.
    url = (
        f"{get_base_url()}/reports"
        "?select=id,company_name,analyst,status,created_at,updated_at,"
        "qa_verdict,qa_checked_at,qa_finding_count,qa_critical_count,qa_major_count,qa_minor_count"
        f"&updated_at=gte.{quote(since, safe='')}&order=updated_at.desc&limit=2000"
    )
    try:
        resp = requests.get(url, headers=get_headers(), timeout=25)
        resp.raise_for_status()
        rows = resp.json()
    except requests.RequestException as exc:
        logger.error(f"[DELIVERY] KPI fetch failed: {exc}")
        raise HTTPException(status_code=500, detail="Could not load team metrics")

    def blank(name: str) -> Dict[str, Any]:
        return {
            "analyst": name,
            "reports": 0, "completed": 0,
            "qa_checked": 0, "qa_passed": 0, "qa_failed": 0, "qa_unchecked": 0,
            "critical": 0, "major": 0, "minor": 0, "findings": 0,
        }

    by_analyst: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        name = (r.get("analyst") or "").strip() or "Unassigned"
        a = by_analyst.setdefault(name, blank(name))
        a["reports"] += 1
        if r.get("status") == "completed":
            a["completed"] += 1

        verdict = r.get("qa_verdict")
        if verdict in VALID_VERDICTS:
            a["qa_checked"] += 1
            a["qa_passed" if verdict == "pass" else "qa_failed"] += 1
            a["critical"] += int(r.get("qa_critical_count") or 0)
            a["major"] += int(r.get("qa_major_count") or 0)
            a["minor"] += int(r.get("qa_minor_count") or 0)
            a["findings"] += int(r.get("qa_finding_count") or 0)
        else:
            a["qa_unchecked"] += 1

    analysts: List[Dict[str, Any]] = []
    for a in by_analyst.values():
        a["quality_score"] = _quality_score(a["qa_checked"], a["critical"], a["major"], a["minor"])
        a["pass_rate"] = (
            round(a["qa_passed"] / a["qa_checked"] * 100, 1) if a["qa_checked"] else None
        )
        a["findings_per_report"] = (
            round(a["findings"] / a["qa_checked"], 2) if a["qa_checked"] else None
        )
        analysts.append(a)

    # Unscored analysts sort last — a None score is "no evidence", not "perfect".
    analysts.sort(key=lambda x: (x["quality_score"] is None, -(x["quality_score"] or 0), -x["reports"]))

    team = {
        "reports": sum(a["reports"] for a in analysts),
        "completed": sum(a["completed"] for a in analysts),
        "qa_checked": sum(a["qa_checked"] for a in analysts),
        "qa_passed": sum(a["qa_passed"] for a in analysts),
        "qa_failed": sum(a["qa_failed"] for a in analysts),
        "qa_unchecked": sum(a["qa_unchecked"] for a in analysts),
        "critical": sum(a["critical"] for a in analysts),
        "major": sum(a["major"] for a in analysts),
        "minor": sum(a["minor"] for a in analysts),
    }
    team["findings"] = team["critical"] + team["major"] + team["minor"]
    team["quality_score"] = _quality_score(
        team["qa_checked"], team["critical"], team["major"], team["minor"]
    )
    team["pass_rate"] = (
        round(team["qa_passed"] / team["qa_checked"] * 100, 1) if team["qa_checked"] else None
    )
    # Honest coverage figure: how much of the work the QA numbers actually describe.
    team["qa_coverage"] = (
        round(team["qa_checked"] / team["reports"] * 100, 1) if team["reports"] else None
    )

    return {
        "days": days,
        "since": since,
        "team": team,
        "analysts": analysts,
        "severity_weights": SEVERITY_WEIGHT,
    }


@router.get("/{report_id}/review")
async def delivery_review(report_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    """Everything an admin needs to decide whether to send one report:
    the QA outcome with its actual findings, and the invoice. Admin only."""
    require_admin(user)

    report = get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    qa = _qa_state(report)
    qa["findings"] = report.get("qa_findings") or []
    qa["critical"] = int(report.get("qa_critical_count") or 0)
    qa["major"] = int(report.get("qa_major_count") or 0)
    qa["minor"] = int(report.get("qa_minor_count") or 0)

    return {
        "report_id": report_id,
        "company_name": report.get("company_name"),
        "cr_number": report.get("cr_number"),
        "country": report.get("country"),
        "analyst": report.get("analyst"),
        "delivered_at": report.get("delivered_at"),
        "qa": qa,
        "sendable": qa["verdict"] == "pass",
        "send_enabled": SEND_ENABLED,
        "mail": transport_status(),
    }


@router.get("/{report_id}/invoice")
async def delivery_invoice(
    report_id: str,
    order_id: Optional[str] = None,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """The invoice for the order this report belongs to.

    Every number comes from pricing_engine.calculate_invoice. Nothing here is
    produced, adjusted or rounded by a model.
    """
    require_admin(user)

    report = get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    resolved_order_id, order, client = _order_for_report(report_id, order_id)
    companies = get_order_companies(resolved_order_id)

    invoice = calculate_invoice(order, client)

    return {
        "order_id": resolved_order_id,
        "order_number": order.get("order_number"),
        "service_level": order.get("service_level"),
        "report_type": order.get("report_type"),
        "company_count": len(companies),
        "client": {
            "client_name": client.get("client_name"),
            "valyze_id": client.get("valyze_id"),
            "email": client.get("email"),
        },
        "invoice": invoice,
    }


@router.post("/{report_id}/send")
async def send_report(
    report_id: str,
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Deliver a report to its client.

    Disabled unless DELIVERY_SEND_ENABLED is explicitly set. The email transport
    is deliberately NOT implemented here — wire it to the provider this project
    actually uses, verify it against a test address, and only then turn the flag
    on. Shipping a guessed provider would either fail silently or mail the wrong
    document to a paying customer.
    """
    require_admin(user)

    if not SEND_ENABLED:
        raise HTTPException(
            status_code=503,
            detail=(
                "Delivery sending is disabled. Set DELIVERY_SEND_ENABLED=true once you have "
                "configured a mail transport and sent yourself a test."
            ),
        )

    report = get_report(report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if _qa_state(report)["verdict"] != "pass":
        raise HTTPException(
            status_code=400,
            detail="This report has not passed QA. Run the QA check and resolve the findings first.",
        )

    if configured_transport() is None:
        raise HTTPException(status_code=503, detail=transport_status()["hint"])

    order_id, order, client = _order_for_report(report_id)
    recipient = (client.get("email") or "").strip()
    if not recipient:
        raise HTTPException(
            status_code=400,
            detail="This client has no email address on file. Add one before sending.",
        )

    company = report.get("company_name") or "your company"
    subject = f"Valyze Credit Report — {company}"
    html = (
        f"<p>Dear {escape(str(client.get('client_name') or 'client'))},</p>"
        f"<p>Your Valyze credit report for <strong>{escape(str(company))}</strong> is attached.</p>"
        f"<p>Order: {escape(str(order.get('order_number') or '—'))}</p>"
        "<p>Thank you for working with Valyze.</p>"
    )

    try:
        transport = send_email(to=[recipient], subject=subject, html=html)
    except RuntimeError as exc:
        # These messages are written to be safe to show a user — they name the
        # remedy (app password, blocked SMTP port) and never echo upstream detail.
        raise HTTPException(status_code=502, detail=str(exc))

    marked = _patch_report(report_id, {"delivered_at": datetime.now(timezone.utc).isoformat()})
    if not marked:
        logger.error(
            f"[DELIVERY] Report {report_id} was EMAILED but delivered_at could not be set — "
            f"it will reappear in the queue. Apply migration 011."
        )

    return {
        "sent": True,
        "transport": transport,
        "to": recipient,
        # Never silently imply the queue updated when it did not — a re-send
        # would email the client twice.
        "marked_delivered": marked,
    }


@router.get("/diagnose")
async def diagnose(user: Dict[str, Any] = Depends(get_current_user)):
    """Why is a page empty? Counts only — no report content.

    Answers the three questions an empty Delivery or Team page raises: are there
    reports at all, what statuses do they carry, and did migration 011 actually
    apply.
    """
    require_admin(user)

    out: Dict[str, Any] = {}

    try:
        resp = requests.get(
            f"{get_base_url()}/reports?select=status,updated_at,analyst&limit=2000",
            headers=get_headers(), timeout=25,
        )
        resp.raise_for_status()
        rows = resp.json()
    except requests.RequestException as exc:
        logger.error(f"[DELIVERY] diagnose failed: {exc}")
        raise HTTPException(status_code=500, detail="Could not read the reports table")

    statuses: Dict[str, int] = {}
    for r in rows:
        key = str(r.get("status") or "(null)")
        statuses[key] = statuses.get(key, 0) + 1

    now = datetime.now(timezone.utc)
    def newer_than(days: int) -> int:
        cutoff = (now - timedelta(days=days)).isoformat()
        return sum(1 for r in rows if (r.get("updated_at") or "") >= cutoff)

    out["reports_total"] = len(rows)
    out["reports_by_status"] = statuses
    out["updated_last_7d"] = newer_than(7)
    out["updated_last_30d"] = newer_than(30)
    out["updated_last_90d"] = newer_than(90)
    out["reports_with_analyst"] = sum(1 for r in rows if (r.get("analyst") or "").strip())

    # Did migration 011 land? Ask for one QA column and see if PostgREST knows it.
    try:
        probe = requests.get(
            f"{get_base_url()}/reports?select=qa_verdict&limit=1",
            headers=get_headers(), timeout=15,
        )
        out["migration_011_applied"] = probe.status_code == 200
    except requests.RequestException:
        out["migration_011_applied"] = None

    try:
        oc = requests.get(
            f"{get_base_url()}/order_companies?select=status&limit=2000",
            headers=get_headers(), timeout=25,
        )
        oc.raise_for_status()
        oc_status: Dict[str, int] = {}
        for r in oc.json():
            key = str(r.get("status") or "(null)")
            oc_status[key] = oc_status.get(key, 0) + 1
        out["order_companies_by_status"] = oc_status
    except requests.RequestException:
        out["order_companies_by_status"] = None

    out["mail"] = transport_status()
    out["send_enabled"] = SEND_ENABLED
    return out


@router.get("/mail-status")
async def mail_status(user: Dict[str, Any] = Depends(get_current_user)):
    """Is a mail transport configured? Reports presence of each env var only —
    never a value."""
    require_admin(user)
    return {**transport_status(), "send_enabled": SEND_ENABLED}
