"""
Company Intelligence — turns the accumulating pile of reports and order
companies into a queryable, de-duplicated view of *companies*.

The value: before an analyst spends an API call extracting "ACME Trading LLC",
this layer answers "we already have 3 reports on this company" — even when the
name was typed as "acme trading co." last time. All of it reads existing
columns (reports.company_name / cr_number / country, order_companies.*), so it
needs no schema migration and cannot break any existing write path.

Matching strategy (heuristic, v1):
- The registration/CR number is the strong key: same CR ⇒ same company,
  whatever the name says.
- Otherwise fall back to a normalized company name (legal suffixes stripped,
  case-folded, punctuation and Arabic orthography normalized) scoped by country.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

import requests

from services.supabase_client import get_base_url, get_headers, search_reports

# Tokens that carry no identifying information — dropped before comparing names.
# English + common MENA legal forms and generic descriptors.
_LEGAL_STOPWORDS = {
    "llc", "lc", "ltd", "limited", "co", "company", "corp", "corporation",
    "inc", "incorporated", "plc", "wll", "est", "establishment", "group",
    "holding", "holdings", "trading", "trade", "and", "the", "for", "of",
    # Arabic generic/legal tokens (after punctuation is stripped to letters)
    "شركة", "شركه", "ذمم", "ش", "ذ", "م", "مساهمة", "مساهمه", "القابضة", "القابضه",
}


def normalize_company_name(name: Optional[str]) -> str:
    """Collapse a company name to a comparison key.

    Lowercases, normalizes Arabic orthography (hamza forms → ا, ى → ي, ة → ه),
    turns punctuation into spaces, and drops legal-form / generic stopword
    tokens. "ACME Trading L.L.C." and "acme trading co" both → "acme".
    """
    if not name:
        return ""
    s = str(name).strip().lower()
    # Arabic orthography folding
    s = (
        s.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
        .replace("ى", "ي").replace("ة", "ه").replace("ؤ", "و").replace("ئ", "ي")
    )
    # Strip tashkeel (diacritics)
    s = re.sub(r"[ً-ْ]", "", s)
    # Join dotted abbreviations before tokenizing so "L.L.C." → "llc" (one token
    # the stopword list catches) rather than three stray letters "l l c".
    s = s.replace(".", "")
    # Anything that isn't a Unicode word char becomes a space (keeps Arabic letters)
    s = re.sub(r"[^\w\s]", " ", s, flags=re.UNICODE)
    tokens = [t for t in s.split() if t and t not in _LEGAL_STOPWORDS]
    return " ".join(tokens)


def normalize_cr(cr: Optional[str]) -> str:
    """Reduce a CR / registration number to bare alphanumerics, upper-cased."""
    if not cr:
        return ""
    return re.sub(r"[^A-Za-z0-9]", "", str(cr)).upper()


def _norm_country(country: Optional[str]) -> str:
    return (country or "").strip().lower()


def canonical_key(name: Optional[str], cr: Optional[str], country: Optional[str]) -> str:
    """Stable grouping key. CR wins when present; else normalized name+country."""
    ncr = normalize_cr(cr)
    if ncr:
        return f"cr:{ncr}"
    nname = normalize_company_name(name)
    if nname:
        return f"name:{nname}|{_norm_country(country)}"
    return ""


# ---------------------------------------------------------------------------
# Raw data access (fail-soft — a missing table or env must never 500 the API)
# ---------------------------------------------------------------------------

def _search_order_companies(
    q: str = "",
    company_name: Optional[str] = None,
    registration_no: Optional[str] = None,
    country: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    select = "id,order_id,company_name,country,registration_no,client_ref,status,created_at,updated_at"
    parts = [f"select={select}"]

    def _ilike(col: str, val: str) -> None:
        parts.append(f"{col}=ilike.%{requests.utils.quote(str(val).strip(), safe='')}%")

    if company_name:
        _ilike("company_name", company_name)
    if registration_no:
        _ilike("registration_no", registration_no)
    if country:
        _ilike("country", country)
    if q and q.strip():
        qq = requests.utils.quote(q.strip(), safe="")
        parts.append(f"or=(company_name.ilike.%{qq}%,registration_no.ilike.%{qq}%)")
    parts.append("order=updated_at.desc.nullslast")
    parts.append(f"limit={int(limit)}")

    url = f"{get_base_url()}/order_companies?{'&'.join(parts)}"
    try:
        resp = requests.get(url, headers=get_headers(), timeout=30)
        if resp.status_code >= 400:
            return []
        return resp.json() or []
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def _report_row(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source": "report",
        "id": r.get("id"),
        "company_name": r.get("company_name") or r.get("legal_name"),
        "cr_number": r.get("cr_number"),
        "country": r.get("country"),
        "status": r.get("status"),
        "updated_at": r.get("updated_at") or r.get("created_at"),
    }


def _order_row(c: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "source": "order",
        "id": c.get("id"),
        "order_id": c.get("order_id"),
        "company_name": c.get("company_name"),
        "cr_number": c.get("registration_no"),
        "country": c.get("country"),
        "status": c.get("status"),
        "updated_at": c.get("updated_at") or c.get("created_at"),
    }


def _last_seen(rows: List[Dict[str, Any]]) -> Optional[str]:
    stamps = [r.get("updated_at") for r in rows if r.get("updated_at")]
    return max(stamps) if stamps else None


def _first_seen(rows: List[Dict[str, Any]]) -> Optional[str]:
    stamps = [r.get("updated_at") for r in rows if r.get("updated_at")]
    return min(stamps) if stamps else None


def _dedup(values: List[Optional[str]]) -> List[str]:
    seen: List[str] = []
    for v in values:
        v = (v or "").strip()
        if v and v not in seen:
            seen.append(v)
    return seen


def find_company_dossier(
    company_name: Optional[str] = None,
    cr_number: Optional[str] = None,
    country: Optional[str] = None,
) -> Dict[str, Any]:
    """Everything we know about one company, across reports and orders.

    Callers pass whatever identity they have (a name being typed into the
    extractor, a CR from a portal order). Returns the matched dossier or an
    empty, unmatched shell.
    """
    reports: List[Dict[str, Any]] = []
    orders: List[Dict[str, Any]] = []
    try:
        if cr_number:
            reports = search_reports(cr_number=cr_number, limit=100)
        if not reports and company_name:
            reports = search_reports(company_name=company_name, country=country, limit=100)
    except Exception:
        reports = []

    orders = _search_order_companies(
        company_name=company_name,
        registration_no=cr_number,
        country=country,
        limit=100,
    )

    target_key = canonical_key(company_name, cr_number, country)
    rows = [_report_row(r) for r in reports] + [_order_row(c) for c in orders]

    # Keep only rows that resolve to the same canonical identity as the query
    # (the ilike search is deliberately broad; this tightens it to one company).
    matched = [
        row for row in rows
        if canonical_key(row.get("company_name"), row.get("cr_number"), row.get("country")) == target_key
    ] if target_key else rows

    if not matched:
        return {
            "matched": False,
            "query": {"company_name": company_name, "cr_number": cr_number, "country": country},
            "canonical_name": (company_name or "").strip(),
            "report_count": 0,
            "order_count": 0,
            "reports": [],
            "orders": [],
        }

    report_rows = [r for r in matched if r["source"] == "report"]
    order_rows = [r for r in matched if r["source"] == "order"]
    names = _dedup([r.get("company_name") for r in matched])

    return {
        "matched": True,
        "query": {"company_name": company_name, "cr_number": cr_number, "country": country},
        "key": target_key,
        "canonical_name": names[0] if names else (company_name or "").strip(),
        "aliases": names,
        "identifiers": {
            "cr_numbers": _dedup([r.get("cr_number") for r in matched]),
            "countries": _dedup([r.get("country") for r in matched]),
        },
        "report_count": len(report_rows),
        "order_count": len(order_rows),
        "first_seen": _first_seen(matched),
        "last_seen": _last_seen(matched),
        "reports": sorted(report_rows, key=lambda r: r.get("updated_at") or "", reverse=True),
        "orders": sorted(order_rows, key=lambda r: r.get("updated_at") or "", reverse=True),
    }


def search_companies(q: str, limit: int = 40) -> List[Dict[str, Any]]:
    """De-duplicated company search across reports and orders.

    Returns one row per distinct company (grouped by canonical identity), newest
    activity first — the browsable face of the accumulated dataset.
    """
    q = (q or "").strip()
    reports: List[Dict[str, Any]] = []
    try:
        reports = search_reports(query=q, limit=200) if q else search_reports(limit=200)
    except Exception:
        reports = []
    orders = _search_order_companies(q=q, limit=200)

    rows = [_report_row(r) for r in reports] + [_order_row(c) for c in orders]

    groups: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        key = canonical_key(row.get("company_name"), row.get("cr_number"), row.get("country"))
        if not key:
            continue
        g = groups.setdefault(key, {"key": key, "_rows": []})
        g["_rows"].append(row)

    results: List[Dict[str, Any]] = []
    for g in groups.values():
        grows = g["_rows"]
        names = _dedup([r.get("company_name") for r in grows])
        report_rows = [r for r in grows if r["source"] == "report"]
        order_rows = [r for r in grows if r["source"] == "order"]
        results.append({
            "key": g["key"],
            "canonical_name": names[0] if names else "Unknown",
            "aliases": names[1:],
            "cr_numbers": _dedup([r.get("cr_number") for r in grows]),
            "countries": _dedup([r.get("country") for r in grows]),
            "report_count": len(report_rows),
            "order_count": len(order_rows),
            "last_seen": _last_seen(grows),
            "sample_report_id": report_rows[0]["id"] if report_rows else None,
        })

    results.sort(key=lambda r: r.get("last_seen") or "", reverse=True)
    return results[: int(limit)]
