"""
Company Intelligence API — the browsable, de-duplicated view of every company
Valyze has ever produced a report or taken an order for.

Read-only over existing data (no schema migration). Registered behind the same
auth as the rest of the report data layer.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from api.auth import get_current_user
from services.company_intel import find_company_dossier, search_companies

router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("/search")
async def companies_search(
    q: str = Query("", description="Free-text company search"),
    limit: int = Query(40, ge=1, le=200),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """De-duplicated company list. One row per distinct company."""
    return {"companies": search_companies(q, limit=limit)}


@router.get("/lookup")
async def companies_lookup(
    company_name: Optional[str] = Query(None),
    cr_number: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """"Do we already have this company?" — the pre-extraction check.

    Returns the full dossier (all reports + orders) for the matched company, or
    an unmatched shell if it's new to us.
    """
    if not (company_name or cr_number):
        raise HTTPException(status_code=400, detail="Provide company_name or cr_number")
    return find_company_dossier(company_name=company_name, cr_number=cr_number, country=country)
