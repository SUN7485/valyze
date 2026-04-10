from datetime import datetime, timedelta

# Fields that should NEVER be overwritten if they came from easy_way_import
PROTECTED_FIELDS = {
    "credit_rating", "risk_level", "health_score",
    "paydex_score", "viability_score", "delinquency_score",
    "failure_score", "payment_score", "recommended_limit",
    "max_exposure", "recommended_credit_limit", "maximum_exposure",
    "rating_color", "risk_color", "financial_health",
    "payment_risk", "company_size", "annual_revenue",
    "final_credit_rating", "final_risk_level", "final_risk_color",
    # ADD: these were missing and getting overwritten
    "fin_currency", "currency", "currency_symbol",
    "credit_utilization", "payment_delay_status",
    "payment_delay_threshold", "legal_threshold",
    "financial_trend", "next_review_date",
    "viability_level", "viability_probability", "viability_meaning",
    "delinquency_level", "delinquency_probability", "delinquency_meaning",
}


def is_imported(field_obj) -> bool:
    """Returns True if this field was written by easy_way_import."""
    if field_obj is None:
        return False
    source = getattr(field_obj, "source", "") or ""
    return source == "easy_way_import"


def has_real_value(field_obj) -> bool:
    """
    Returns True if field has a meaningful non-empty value.
    Treats 0 as valid (so financial zeros are not overwritten).
    """
    if field_obj is None:
        return False
    v = getattr(field_obj, "value", None)
    if v is None:
        return False
    if isinstance(v, str):
        return v.strip() not in ("", "N/A", "null", "None")
    # numbers including 0 are valid
    return True


class DefaultsEngine:

    def fill_system_defaults(
        self, fields: dict, report_id: str = ""
    ) -> dict:
        """
        Fills system/config fields with smart defaults.
        NEVER overwrites fields that came from easy_way_import.
        NEVER overwrites fields that already have real values.
        """
        system_defaults: dict = {
            # Monitoring
            "payment_delay_status": {
                "value": "Normal",
                "confidence": "high",
                "source": "system",
            },
            "payment_delay_color": {
                "value": "#e67e22",
                "confidence": "high",
                "source": "system",
            },
            "utilization_color": {
                "value": "#e67e22",
                "confidence": "high",
                "source": "system",
            },
            "trend_color": {
                "value": "#27ae60",
                "confidence": "high",
                "source": "system",
            },
            # FIX: default is text not a number —
            # so _pct_display() in generate.py won't append %
            "credit_utilization": {
                "value": "Not yet established",
                "confidence": "medium",
                "source": "system",
            },
            "payment_delay_threshold": {
                "value": "30 days",
                "confidence": "high",
                "source": "system",
            },
            # FIX: removed currency-specific default
            # legal_threshold should not have SAR prefix by default
            "legal_threshold": {
                "value": "Any legal claim above 100,000",
                "confidence": "medium",
                "source": "system",
            },
            "next_review_date": {
                "value": (
                    datetime.now() + timedelta(days=90)
                ).strftime("%Y-%m-%d"),
                "confidence": "high",
                "source": "system",
            },
            "client_reference": {
                "value": (
                    f"CR-{report_id[:8].upper()}"
                    if report_id
                    else "CR-PENDING"
                ),
                "confidence": "high",
                "source": "system",
            },
            "analyst_id": {
                "value": "ANALYST-001",
                "confidence": "high",
                "source": "system",
            },
            "analyst_department": {
                "value": "Credit Analysis",
                "confidence": "high",
                "source": "system",
            },
            "analyst_email": {
                "value": "analyst@valyze.com",
                "confidence": "high",
                "source": "system",
            },
            "analyst_phone": {
                "value": "+971-4-XXX-XXXX",
                "confidence": "medium",
                "source": "system",
            },
            "qa_reviewer_name": {
                "value": "Pending Assignment",
                "confidence": "medium",
                "source": "system",
            },
            "qa_review_date": {
                "value": datetime.now().strftime("%Y-%m-%d"),
                "confidence": "high",
                "source": "system",
            },
            "escalation_contact": {
                "value": "Credit Manager",
                "confidence": "medium",
                "source": "system",
            },
        }

        # Dynamic: copy analyst_name → assigned_analyst
        analyst_field = fields.get("analyst_name")
        if analyst_field and has_real_value(analyst_field):
            system_defaults["assigned_analyst"] = {
                "value": getattr(analyst_field, "value", ""),
                "confidence": "high",
                "source": "system",
            }

        filled = 0
        skipped_imported = 0
        skipped_has_value = 0

        for field_name, default_data in system_defaults.items():
            existing = fields.get(field_name)

            # RULE 1: Never overwrite easy_way_import fields
            if is_imported(existing):
                skipped_imported += 1
                print(
                    f"[DEFAULTS] SKIP {field_name} "
                    f"— imported via easy_way_import "
                    f"(value={getattr(existing,'value','?')})"
                )
                continue

            # RULE 2: Never overwrite fields that already have values
            # (regardless of source)
            if has_real_value(existing):
                skipped_has_value += 1
                print(
                    f"[DEFAULTS] SKIP {field_name} "
                    f"— already has value: "
                    f"{getattr(existing,'value','?')}"
                )
                continue

            # Safe to write default
            if existing is not None:
                existing.value      = default_data["value"]
                existing.confidence = default_data["confidence"]
                existing.source     = default_data["source"]
            else:
                # Field doesn't exist at all — create it
                # But only for NON-protected fields
                if field_name not in PROTECTED_FIELDS:
                    from models.report_schema import FieldData
                    fields[field_name] = FieldData(
                        value=default_data["value"],
                        confidence=default_data["confidence"],
                        source=default_data["source"],
                        locked=False,
                    )
            filled += 1

        print(
            f"[DEFAULTS] Report {report_id}: "
            f"filled={filled} "
            f"skipped_imported={skipped_imported} "
            f"skipped_has_value={skipped_has_value}"
        )
        return fields