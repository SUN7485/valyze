from __future__ import annotations

"""
PDF Generator for Valyze Credit Reports.
"""

import re
from pathlib import Path
from typing import Dict, Any
from datetime import datetime

ICON_MAP = {
    "check-circle": "✅",
    "exclamation-triangle": "⚠️",
    "info-circle": "ℹ️",
    "times-circle": "❌",
}

OPERATIONS_FIELDS = [
    "registration_activities_description",
    "activities_full_description",
    "nace_codes",
    "nace_description",
    "hs_codes",
    "hs_description",
    "employee_count",
    "employee_location",
    "facilities_count",
    "main_facility_location",
    "markets_count",
    "markets_regions",
    "premises_type",
    "premises_size",
    "premises_owned_rental",
    "vehicles",
    "equipment",
    "brands",
]

SUPPLY_CHAIN_PURCHASING_FIELDS = [
    "main_suppliers",
    "local_purchasing_pct",
    "local_purchasing_detail",
    "import_purchasing_pct",
    "import_countries",
    "import_items",
    "supplier_payment_method",
    "supplier_payment_terms",
    "suppliers_number",
]

SUPPLY_CHAIN_SALES_FIELDS = [
    "key_customers",
    "local_sales_pct",
    "local_sales_detail",
    "export_sales_pct",
    "export_countries",
    "export_items",
    "customer_payment_method",
    "customer_payment_terms",
    "clients_number",
]

REGISTRATION_LICENSE_FIELDS = [
    "industrial_license_number",
    "import_license_number",
    "export_license_number",
    "lei_number",
]


class PDFGenerator:
    def __init__(self):
        self.template_path = Path("templates/template.html")
        self.output_dir = Path("outputs")
        self.output_dir.mkdir(exist_ok=True)

    # -----------------------------------------------------------------
    # HELPERS
    # -----------------------------------------------------------------

    def _get(self, fields: dict, key: str, default="N/A") -> Any:
        field = fields.get(key, {})
        if isinstance(field, dict):
            val = field.get("value")
        elif hasattr(field, "value"):
            val = field.value
        else:
            val = field
        if val is None or val == "":
            return default
        return val

    def _get_arr(self, arrays: dict, key: str) -> list:
        arr = arrays.get(key, [])
        return arr if isinstance(arr, list) else []

    def _boolify(self, v: Any, default: bool = False) -> bool:
        if v is None:
            return default
        if isinstance(v, bool):
            return v
        if isinstance(v, (int, float)):
            return v != 0
        if isinstance(v, str):
            s = v.strip().lower()
            if s in ("true", "1", "yes", "y", "on"):
                return True
            if s in ("false", "0", "no", "n", "off", ""):
                return False
            return default
        return bool(v)

    def _iconize(self, v: Any) -> Any:
        if isinstance(v, str):
            return ICON_MAP.get(v, v)
        return v

    def _has_field_data(self, fields: dict, field_list: list) -> bool:
        """Check if any field in the list has actual data (not N/A or empty)"""
        for key in field_list:
            val = fields.get(key)
            if val is None:
                continue
            if hasattr(val, "value"):
                val = val.value
            elif isinstance(val, dict):
                val = val.get("value")
            if val and str(val).strip() and str(val).strip().upper() not in ("N/A", ""):
                return True
        return False

    def _clean_pct(self, val: Any) -> str:
        """
        Remove duplicate % signs.
        '100%%' -> '100%'
        '85%%'  -> '85%'
        'New relationship - to be monitored' -> unchanged
        """
        if val is None:
            return "N/A"
        s = str(val)
        # Remove all % then add one back only if it was a number
        stripped = s.replace("%", "").strip()
        try:
            float(stripped)
            # It was a number - add single %
            return stripped + "%"
        except ValueError:
            # It was text - return as-is without any %
            return s.replace("%%", "%")

    def _pct_display(self, val: Any) -> str:
        """
        For display fields that should show % once.
        Handles: '100', '100%', '100%%', 'N/A', 'text value'
        """
        if val is None or val == "N/A" or val == "":
            return "N/A"
        s = str(val).strip()
        # Remove all % signs first
        clean = s.replace("%", "").strip()
        # If it's a number, add % back once
        try:
            float(clean)
            return clean + "%"
        except ValueError:
            # It's text - return without adding %
            return s.replace("%%", "%")

    def _hex_to_css_class(self, color: Any) -> str:
        """
        Convert hex color values to CSS class names for template rendering.
        Maps hex colors to: 'green', 'yellow', 'red'
        Also passes through existing CSS class names unchanged.
        """
        if color is None or color == "" or color == "N/A":
            return "yellow"
        c = str(color).strip().lower()
        # Already a CSS class name
        if c in (
            "green",
            "yellow",
            "red",
            "orange",
            "blue",
            "info",
            "success",
            "warning",
            "danger",
        ):
            return c
        # Hex color mapping
        green_hexes = {
            "#27ae60",
            "#2ecc71",
            "#28a745",
            "#20c997",
            "#00b894",
            "#00cec9",
            "#55efc4",
        }
        yellow_hexes = {
            "#f39c12",
            "#e67e22",
            "#ffa500",
            "#fdcb6e",
            "#ffeaa7",
            "#fab1a0",
            "#ff7675",
        }
        red_hexes = {"#e74c3c", "#c0392b", "#dc3545", "#d63031", "#ff6b6b", "#ee5a24"}
        if c in green_hexes:
            return "green"
        if c in red_hexes:
            return "red"
        if c in yellow_hexes:
            return "yellow"
        # Fuzzy match by first 4 chars
        if (
            c.startswith("#27a")
            or c.startswith("#2ec")
            or c.startswith("#28a")
            or c.startswith("#20c")
            or c.startswith("#00b")
            or c.startswith("#00c")
            or c.startswith("#55e")
        ):
            return "green"
        if (
            c.startswith("#e74")
            or c.startswith("#c03")
            or c.startswith("#dc3")
            or c.startswith("#d63")
            or c.startswith("#ff6")
            or c.startswith("#ee5")
        ):
            return "red"
        if (
            c.startswith("#f39")
            or c.startswith("#e67")
            or c.startswith("#ffa")
            or c.startswith("#fdc")
            or c.startswith("#ffe")
            or c.startswith("#fab")
            or c.startswith("#ff7")
        ):
            return "yellow"
        return "yellow"

    def _hex_to_css_class(self, color: Any) -> str:
        """
        Convert hex color values to CSS class names for template rendering.
        Maps hex colors to: 'green', 'yellow', 'red'
        Also passes through existing CSS class names unchanged.
        """
        if color is None or color == "" or color == "N/A":
            return "yellow"
        c = str(color).strip().lower()
        # Already a CSS class name
        if c in (
            "green",
            "yellow",
            "red",
            "orange",
            "blue",
            "info",
            "success",
            "warning",
            "danger",
        ):
            return c
        # Hex color mapping
        green_hexes = {
            "#27ae60",
            "#2ecc71",
            "#28a745",
            "#20c997",
            "#00b894",
            "#00cec9",
            "#55efc4",
        }
        yellow_hexes = {
            "#f39c12",
            "#e67e22",
            "#ffa500",
            "#fdcb6e",
            "#ffeaa7",
            "#fab1a0",
            "#ff7675",
        }
        red_hexes = {"#e74c3c", "#c0392b", "#dc3545", "#d63031", "#ff6b6b", "#ee5a24"}
        if c in green_hexes:
            return "green"
        if c in red_hexes:
            return "red"
        if c in yellow_hexes:
            return "yellow"
        # Fuzzy match by first 4 chars
        if (
            c.startswith("#27a")
            or c.startswith("#2ec")
            or c.startswith("#28a")
            or c.startswith("#20c")
            or c.startswith("#00b")
            or c.startswith("#00c")
            or c.startswith("#55e")
        ):
            return "green"
        if (
            c.startswith("#e74")
            or c.startswith("#c03")
            or c.startswith("#dc3")
            or c.startswith("#d63")
            or c.startswith("#ff6")
            or c.startswith("#ee5")
        ):
            return "red"
        if (
            c.startswith("#f39")
            or c.startswith("#e67")
            or c.startswith("#ffa")
            or c.startswith("#fdc")
            or c.startswith("#ffe")
            or c.startswith("#fab")
            or c.startswith("#ff7")
        ):
            return "yellow"
        return "yellow"

    def _status_to_label(self, status: Any) -> str:
        """
        Convert status values to proper display labels.
        Maps: 'low' -> 'Low', 'medium' -> 'Medium', 'high' -> 'High',
              'success' -> 'Low', 'warning' -> 'Warning', 'danger' -> 'High'
        """
        if status is None or status == "N/A" or status == "":
            return "N/A"
        s = str(status).strip().lower()
        status_map = {
            "low": "Low",
            "medium": "Medium",
            "high": "High",
            "success": "Low",
            "warning": "Warning",
            "danger": "High",
        }
        return status_map.get(s, s.capitalize() if s else "N/A")

    def _get_legal_badge(self, status: Any) -> str:
        """
        Determine badge class based on legal status value.
        Returns 'neutral' for not disclosed/N/A, otherwise maps to risk levels.
        """
        if status is None or status == "N/A" or status == "":
            return "neutral"
        s = str(status).strip().lower()
        # Cases with no issues
        if any(
            x in s
            for x in ["no active", "no liens", "no judgments", "clear", "compliant"]
        ):
            return "low"
        # Cases with issues
        if any(x in s for x in ["pending", "active", "filed", "recorded"]):
            return "medium"
        if any(x in s for x in ["failed", "default", "violation"]):
            return "high"
        return "neutral"

    # -----------------------------------------------------------------
    # FLATTEN NESTED JSON
    # -----------------------------------------------------------------

    def _flatten_nested_json_to_fields_arrays(
        self, data: Dict[str, Any]
    ) -> tuple[dict, dict]:
        fields: dict = {}
        arrays: dict = {}

        ARRAY_KEYS = {
            "shareholders",
            "branches",
            "banking_relationships",
            "news_events",
            "recommendations",
            "risk_mitigations",
            "monitoring_triggers",
            "alerts",
            "regional_affiliates",
            "legal_details",
            "strengths",
            "weaknesses",
            "opportunities",
            "threats",
            "management_team",
            "board_members",
            "extra_reg_fields",
            "phone_numbers",
        }

        def put(k: str, v: Any):
            fields[k] = {"value": v}

        def recurse(d: Any, parent_key: str = ""):
            if not isinstance(d, dict):
                return
            for k, v in d.items():
                if k in ARRAY_KEYS:
                    arrays[k] = v
                    continue
                if parent_key == "financial_data" and k.startswith("year_"):
                    yr = k.split("_")[-1]
                    if isinstance(v, dict):
                        alias_map = {
                            "cost_of_sales": "cogs",
                            "operating_expenses": "opex",
                            "shareholders_equity": "equity",
                            "accounts_receivable": "ar",
                            "long_term_debt": "ltd",
                        }
                        for subk, subv in v.items():
                            put(f"{alias_map.get(subk, subk)}_{yr}", subv)
                    continue
                if isinstance(v, dict):
                    if "value" in v and len(v) <= 4:
                        put(k, v.get("value"))
                    else:
                        recurse(v, k)
                elif isinstance(v, list):
                    if k in ARRAY_KEYS:
                        arrays[k] = v
                    else:
                        put(k, v)
                else:
                    put(k, v)

        recurse(data)
        return fields, arrays

    # -----------------------------------------------------------------
    # BUILD CONTEXT
    # -----------------------------------------------------------------

    def _build_context(self, report_data: Dict[str, Any]) -> Dict[str, Any]:
        # Detect nested JSON vs flat fields/arrays structure
        if "fields" not in report_data and "arrays" not in report_data:
            # If no top-level fields/arrays, assume it's nested JSON to flatten
            fields, arrays = self._flatten_nested_json_to_fields_arrays(report_data)
        else:
            fields = report_data.get("fields", {}) or {}
            arrays = report_data.get("arrays", {}) or {}

        # -- field getter -------------------------------------------------
        def gf(key: str, default="N/A", hide_empty=False):
            """Get field value. If hide_empty=True, returns '' instead of default for empty values."""
            f = fields.get(key)
            if f is None:
                return "" if hide_empty else default
            if hasattr(f, "value"):
                v = f.value
            elif isinstance(f, dict):
                v = f.get("value")
            else:
                v = f

            is_empty = (
                v is None or str(v).strip() == "" or str(v).strip().upper() == "N/A"
            )
            if is_empty:
                return "" if hide_empty else default
            return v

        # -- array getter -------------------------------------------------
        def ga(key: str):
            arr = arrays.get(key, [])
            return arr if isinstance(arr, list) else []

        # -- normalize alert icons ----------------------------------------
        def normalize_alerts(alerts: list) -> list:
            valid_classes = {"success", "warning", "danger", "info"}
            out = []
            for a in alerts or []:
                if isinstance(a, dict):
                    aa = dict(a)
                    aa["alert_icon"] = self._iconize(aa.get("alert_icon"))
                    # alert_type is used as CSS class in template
                    alert_type = aa.get("alert_type", "info")
                    if alert_type not in valid_classes:
                        # Try to derive CSS class from alert_icon field
                        icon = str(aa.get("alert_icon", "")).lower().strip()
                        if icon in valid_classes:
                            alert_type = icon
                        else:
                            # Fallback: map common descriptive types
                            type_map = {
                                "low": "success",
                                "medium": "warning",
                                "high": "danger",
                            }
                            alert_type = type_map.get(str(alert_type).lower(), "info")
                    aa["alert_type"] = alert_type
                    out.append(aa)
                else:
                    out.append(a)
            return out

        # -- normalize shareholders ---------------------------------------
        def normalize_shareholders(shareholders: list) -> list:
            out = []
            for s in shareholders or []:
                if isinstance(s, dict):
                    ss = dict(s)
                    # Fix: use position if title is missing
                    if not ss.get("title"):
                        ss["title"] = ss.get("position", "N/A")
                    # Fix: clean double %%
                    if ss.get("percentage"):
                        ss["percentage"] = self._pct_display(ss["percentage"])
                    out.append(ss)
                else:
                    out.append(s)
            return out

        # -- currency -----------------------------------------------------
        # FIX: read fin_currency first, then currency, default AED
        fin_currency = gf("fin_currency", gf("currency", "AED"))
        currency_symbol_map = {
            "AED": "AED",
            "SAR": "SAR",
            "USD": "USD",
            "KWD": "KWD",
            "QAR": "QAR",
            "BHD": "BHD",
            "OMR": "OMR",
            "EGP": "EGP",
            "JOD": "JOD",
        }
        currency_symbol = currency_symbol_map.get(
            str(fin_currency).upper(), fin_currency
        )

        # -- boolean flags ------------------------------------------------
        show_uae = self._boolify(gf("show_uae_fields", False), False)
        show_saudi = self._boolify(gf("show_saudi_fields", False), False)
        show_egypt = self._boolify(gf("show_egypt_fields", False), False)

        # -- auto-show flags for sections ----------------------------------
        has_ops = self._has_field_data(fields, OPERATIONS_FIELDS)
        has_purchasing = self._has_field_data(fields, SUPPLY_CHAIN_PURCHASING_FIELDS)
        has_sales = self._has_field_data(fields, SUPPLY_CHAIN_SALES_FIELDS)
        has_licenses = self._has_field_data(fields, REGISTRATION_LICENSE_FIELDS)

        # Show registration section when Egypt is selected (even if no license numbers yet)
        show_registration = show_egypt

        # Show physical assets if there's any operations data (including the new asset fields)
        show_physical_assets = has_ops or self._has_field_data(
            fields,
            [
                "premises_type",
                "premises_size",
                "premises_owned_rental",
                "vehicles",
                "equipment",
                "brands",
            ],
        )

        # Show supply chain sections if there's any purchasing/sales data OR the new number fields
        has_purchasing_data = has_purchasing or self._has_field_data(
            fields, ["suppliers_number"]
        )
        has_sales_data = has_sales or self._has_field_data(fields, ["clients_number"])

        # -- management team (flat field OR arrays) -----------------------
        mgmt = ga("management_team")
        if not mgmt:
            mgmt_field = gf("management_team", [])
            if isinstance(mgmt_field, list):
                mgmt = mgmt_field

        # -- credit utilization -- never append % to text -----------------
        raw_util = gf("credit_utilization", "N/A")
        util_display = self._pct_display(raw_util)

        # -- growth rate -- do NOT double-append "% annually" -------------
        raw_growth = gf("industry_growth_rate", "N/A")
        growth_display = str(raw_growth)  # use exactly as stored

        ctx: Dict[str, Any] = {
            # -- REPORT META ----------------------------------------------
            "report_id": gf("report_id", report_data.get("report_id", "N/A")),
            "report_date": gf("report_date", datetime.now().strftime("%B %d, %Y")),
            "current_year": gf("current_year", str(datetime.now().year)),
            "client_name": gf("client_name"),
            "client_reference": gf("client_reference"),
            "analyst_name": gf("analyst_name"),
            "analyst_id": gf("analyst_id"),
            "analyst_department": gf("analyst_department"),
            "analyst_email": gf("analyst_email"),
            "analyst_phone": gf("analyst_phone"),
            "qa_reviewer_name": gf("qa_reviewer_name"),
            "qa_review_date": gf("qa_review_date"),
            "order_comment": gf("order_comment"),
            # -- COMPANY IDENTITY -----------------------------------------
            "company_name": gf("company_name", gf("legal_name", "Unknown")),
            "legal_name": gf("legal_name", gf("company_name", "Unknown")),
            "trade_names": gf("trade_names"),
            "cr_number": gf("cr_number"),
            "registration_number": gf("cr_number"),
            "unified_number": gf("unified_number"),
            "investment_license_no": gf("investment_license_no"),
            "license_type": gf("license_type"),
            "issue_date": gf("issue_date"),
            "expiry_date": gf("expiry_date"),
            "capital": gf("capital"),
            "company_type": gf("company_type"),
            "company_duration": gf("company_duration"),
            "company_status": gf("company_status"),
            "company_status_badge": gf("company_status_badge", "low"),
            "status_badge": gf("status_badge", "low"),
            "incorporation_date": gf("incorporation_date"),
            "incorporation_state": gf("incorporation_state"),
            "country": gf("country"),
            "city": gf("city"),
            "company_address": gf("company_address"),
            "headquarters_address": gf("headquarters_address"),
            "phone": gf("phone"),
            "fax": gf("fax"),
            "email": gf("email"),
            "website": gf("website"),
            "auditor_name": gf("auditor_name"),
            "sic_codes": gf("sic_codes"),
            "industry": gf("industry"),
            "employee_count": gf("employee_count", "N/A", True),
            # -- CURRENCY (FIXED) -----------------------------------------
            "currency": fin_currency,
            "fin_currency": fin_currency,
            "currency_symbol": currency_symbol,
            # -- FINANCIAL STATEMENT META ---------------------------------
            "fin_unit_scale": gf("fin_unit_scale"),
            "fin_statement_type": gf("fin_statement_type"),
            "fin_period_end": gf("fin_period_end"),
            "fin_scope": gf("fin_scope"),
            "fin_ratio_basis": gf("fin_ratio_basis"),
            # -- UAE / KSA / EGYPT FIELDS ---------------------------------
            "show_uae_fields": show_uae,
            "show_saudi_fields": show_saudi,
            "show_egypt_fields": show_egypt,
            "trn_vat": gf("trn_vat"),
            "vat_registration_number": gf("vat_registration_number"),
            "ded_number": gf("ded_number"),
            "freezone_license": gf("freezone_license"),
            "trade_license_number": gf("trade_license_number"),
            "tax_registration_number": gf("tax_registration_number"),
            "tax_card_number": gf("tax_card_number"),
            "social_insurance_number": gf("social_insurance_number"),
            "gafi_registration": gf("gafi_registration"),
            "gosi_registration": gf("gosi_registration"),
            "nitaqat_band": gf("nitaqat_band"),
            "municipality_license": gf("municipality_license"),
            "zakat_certificate": gf("zakat_certificate"),
            "zakat_number": gf("zakat_number"),
            "zakat_status": gf("zakat_status", "N/A"),
            "zakat_alert": gf("zakat_alert", "warning"),
            "zakat_certificate": gf("zakat_certificate"),
            "zakat_number": gf("zakat_number"),
            "zakat_status": gf("zakat_status", "N/A"),
            "zakat_alert": gf("zakat_alert", "warning"),
            # -- EXECUTIVE SUMMARY ----------------------------------------
            "executive_summary_text": gf(
                "executive_summary_text", gf("executive_summary")
            ),
            "company_history_text": gf("company_history_text", gf("company_history")),
            "exec_current_ratio": gf("exec_current_ratio"),
            "exec_equity_ratio": gf("exec_equity_ratio"),
            "exec_profitability": gf("exec_profitability"),
            # -- OWNERSHIP ------------------------------------------------
            "parent_company": gf("parent_company"),
            "subsidiaries": gf("subsidiaries"),
            "affiliates": gf("affiliates"),
            "ultimate_beneficial_owner": gf("ultimate_beneficial_owner"),
            "group_hq_name": gf("group_hq_name"),
            "group_hq_location": gf("group_hq_location"),
            "show_related_concerns": self._boolify(
                gf("show_related_concerns", True), True
            ),
            "show_board_of_directors": self._boolify(
                gf("show_board_of_directors", False), False
            ),
            # -- OPERATIONS -----------------------------------------------
            "registration_activities_description": gf(
                "registration_activities_description", gf("core_activities_description")
            ),
            "activities_full_description": gf("activities_full_description"),
            "nace_codes": gf("nace_codes", "N/A", True),
            "nace_description": gf("nace_description"),
            "hs_codes": gf("hs_codes", "N/A", True),
            "hs_description": gf("hs_description"),
            "employee_location": gf("employee_location"),
            "facilities_count": gf("facilities_count", "N/A", True),
            "main_facility_location": gf("main_facility_location"),
            "markets_count": gf("markets_count", "N/A", True),
            "markets_regions": gf("markets_regions"),
            "main_suppliers": gf("main_suppliers", "N/A", True),
            "key_customers": gf("key_customers", "N/A", True),
            "supplier_payment_terms": gf("supplier_payment_terms"),
            "customer_payment_terms": gf("customer_payment_terms"),
            # FIX: supply chain % fields
            "local_purchasing_pct": self._pct_display(gf("local_purchasing_pct")),
            "local_purchasing_detail": gf("local_purchasing_detail", "N/A", True),
            "import_purchasing_pct": self._pct_display(gf("import_purchasing_pct")),
            "import_countries": gf("import_countries", "N/A", True),
            "import_items": gf("import_items", "N/A", True),
            "supplier_payment_method": gf("supplier_payment_method"),
            "local_sales_pct": self._pct_display(gf("local_sales_pct")),
            "local_sales_detail": gf("local_sales_detail", "N/A", True),
            "export_sales_pct": self._pct_display(gf("export_sales_pct")),
            "export_countries": gf("export_countries", "N/A", True),
            "export_items": gf("export_items", "N/A", True),
            "customer_payment_method": gf("customer_payment_method"),
            # -- AUTO-SHOW FLAGS --------------------------------------------
            "show_operations": has_ops,
            "show_supply_chain_purchasing": has_purchasing_data,
            "show_supply_chain_sales": has_sales_data,
            "show_registration_licenses": show_registration,
            "show_physical_assets": self._has_field_data(
                fields,
                [
                    "premises_type",
                    "premises_size",
                    "premises_owned_rental",
                    "vehicles",
                    "equipment",
                    "brands",
                ],
            ),
            "premises_type": gf("premises_type", "N/A", True),
            "premises_size": gf("premises_size", "N/A", True),
            "premises_owned_rental": gf("premises_owned_rental", "N/A", True),
            "vehicles": gf("vehicles", "N/A", True),
            "equipment": gf("equipment", "N/A", True),
            "brands": gf("brands", "N/A", True),
            "suppliers_number": gf("suppliers_number", "N/A", True),
            "clients_number": gf("clients_number", "N/A", True),
            "industrial_license_number": gf("industrial_license_number", "N/A", True),
            "import_license_number": gf("import_license_number", "N/A", True),
            "export_license_number": gf("export_license_number", "N/A", True),
            "lei_number": gf("lei_number", "N/A", True),
            # -- BANKING --------------------------------------------------
            "primary_bank": gf("primary_bank"),
            "total_banks": gf("total_banks"),
            "group_treasury_support": gf("group_treasury_support"),
            "banking_notes": gf("banking_notes"),
            # -- FINANCIAL DATA YEARS -------------------------------------
            "year_1": gf("year_1"),
            "year_2": gf("year_2"),
            "year_3": gf("year_3"),
            # Income Statement
            "revenue_1": gf("revenue_1", 0),
            "revenue_2": gf("revenue_2", 0),
            "revenue_3": gf("revenue_3", 0),
            "revenue_trend": gf("revenue_trend"),
            "cogs_1": gf("cogs_1", 0),
            "cogs_2": gf("cogs_2", 0),
            "cogs_3": gf("cogs_3", 0),
            "cogs_trend": gf("cogs_trend"),
            "gross_profit_1": gf("gross_profit_1", 0),
            "gross_profit_2": gf("gross_profit_2", 0),
            "gross_profit_3": gf("gross_profit_3", 0),
            "gross_profit_trend": gf("gross_profit_trend"),
            "opex_1": gf("opex_1", 0),
            "opex_2": gf("opex_2", 0),
            "opex_3": gf("opex_3", 0),
            "opex_trend": gf("opex_trend"),
            "ebitda_1": gf("ebitda_1", 0),
            "ebitda_2": gf("ebitda_2", 0),
            "ebitda_3": gf("ebitda_3", 0),
            "ebitda_trend": gf("ebitda_trend"),
            "net_income_1": gf("net_income_1", 0),
            "net_income_2": gf("net_income_2", 0),
            "net_income_3": gf("net_income_3", 0),
            "net_income_trend": gf("net_income_trend"),
            # Cash Flow
            "cash_flow_operating_1": gf("cash_flow_operating_1", gf("cfo_1", 0)),
            "cash_flow_operating_2": gf("cash_flow_operating_2", gf("cfo_2", 0)),
            "cash_flow_operating_3": gf("cash_flow_operating_3", gf("cfo_3", 0)),
            "cash_flow_operating_trend": gf("cash_flow_operating_trend"),
            "cash_flow_investing_1": gf("cash_flow_investing_1", gf("cfi_1", 0)),
            "cash_flow_investing_2": gf("cash_flow_investing_2", gf("cfi_2", 0)),
            "cash_flow_investing_3": gf("cash_flow_investing_3", gf("cfi_3", 0)),
            "cash_flow_investing_trend": gf("cash_flow_investing_trend"),
            "cash_flow_financing_1": gf("cash_flow_financing_1", gf("cff_1", 0)),
            "cash_flow_financing_2": gf("cash_flow_financing_2", gf("cff_2", 0)),
            "cash_flow_financing_3": gf("cash_flow_financing_3", gf("cff_3", 0)),
            "cash_flow_financing_trend": gf("cash_flow_financing_trend"),
            "cash_end_1": gf("cash_end_1", 0),
            "cash_end_2": gf("cash_end_2", 0),
            "cash_end_3": gf("cash_end_3", 0),
            "cash_end_trend": gf("cash_end_trend", gf("cash_flow_end_trend")),
            # Balance Sheet — Assets
            "cash_1": gf("cash_1", 0),
            "cash_2": gf("cash_2", 0),
            "cash_3": gf("cash_3", 0),
            "cash_trend": gf("cash_trend"),
            # FIX: ar_1/ar_2/ar_3 mapped correctly
            "ar_1": gf("ar_1", 0),
            "ar_2": gf("ar_2", 0),
            "ar_3": gf("ar_3", 0),
            "ar_trend": gf("ar_trend"),
            "inventory_1": gf("inventory_1", 0),
            "inventory_2": gf("inventory_2", 0),
            "inventory_3": gf("inventory_3", 0),
            "inventory_trend": gf("inventory_trend"),
            "current_assets_1": gf("current_assets_1", 0),
            "current_assets_2": gf("current_assets_2", 0),
            "current_assets_3": gf("current_assets_3", 0),
            "current_assets_trend": gf("current_assets_trend"),
            "total_assets_1": gf("total_assets_1", 0),
            "total_assets_2": gf("total_assets_2", 0),
            "total_assets_3": gf("total_assets_3", 0),
            "total_assets_trend": gf("total_assets_trend"),
            # Balance Sheet — Liabilities
            "current_liabilities_1": gf("current_liabilities_1", 0),
            "current_liabilities_2": gf("current_liabilities_2", 0),
            "current_liabilities_3": gf("current_liabilities_3", 0),
            "current_liabilities_trend": gf("current_liabilities_trend"),
            # FIX: ltd_1/ltd_2/ltd_3 mapped correctly
            "ltd_1": gf("ltd_1", 0),
            "ltd_2": gf("ltd_2", 0),
            "ltd_3": gf("ltd_3", 0),
            "ltd_trend": gf("ltd_trend"),
            "total_liabilities_1": gf("total_liabilities_1", 0),
            "total_liabilities_2": gf("total_liabilities_2", 0),
            "total_liabilities_3": gf("total_liabilities_3", 0),
            "total_liabilities_trend": gf("total_liabilities_trend"),
            # Balance Sheet — Equity
            "equity_1": gf("equity_1", gf("shareholders_equity_1", 0)),
            "equity_2": gf("equity_2", gf("shareholders_equity_2", 0)),
            "equity_3": gf("equity_3", gf("shareholders_equity_3", 0)),
            "equity_trend": gf("equity_trend"),
            # -- FINANCIAL RATIOS -----------------------------------------
            **{
                f"{base}{suffix}": (
                    self._status_to_label(gf(f"{base}_status"))
                    if suffix == "_label" and gf(f"{base}_status") not in ("N/A", "")
                    else gf(f"{base}{suffix}")
                )
                for base in [
                    "current_ratio",
                    "quick_ratio",
                    "cash_ratio",
                    "gross_margin",
                    "ebitda_margin",
                    "net_margin",
                    "roa",
                    "roe",
                    "debt_equity",
                    "debt_assets",
                    "equity_ratio",
                    "interest_coverage",
                    "asset_turnover",
                    "dio",
                    "dso",
                    "dpo",
                    "ccc",
                    "ebit_margin",
                    "debt_to_equity",
                ]
                for suffix in [
                    "",
                    "_prev",
                    "_industry",
                    "_status",
                    "_label",
                    "_interpretation",
                ]
            },
            # -- RISK / SCORES ---------------------------------------------
            "credit_rating": gf("final_credit_rating", gf("credit_rating")),
            "final_credit_rating": gf("final_credit_rating", gf("credit_rating")),
            "risk_level": gf("final_risk_level", gf("risk_level")),
            "final_risk_level": gf("final_risk_level", gf("risk_level")),
            "rating_color": self._hex_to_css_class(gf("rating_color", "yellow")),
            "risk_color": self._hex_to_css_class(
                gf("final_risk_color", gf("risk_color", "yellow"))
            ),
            "final_risk_color": self._hex_to_css_class(
                gf("final_risk_color", gf("risk_color", "yellow"))
            ),
            "health_score": gf("health_score", 0),
            "viability_score": gf("viability_score", 0),
            "payment_score": gf("payment_score", 0),
            "delinquency_score": gf("delinquency_score", 0),
            "failure_score": gf("failure_score", 0),
            "paydex_score": gf("paydex_score", 0),
            "company_size": gf("company_size"),
            "company_size_explanation": gf("company_size_explanation"),
            "payment_risk": gf("payment_risk"),
            "annual_revenue": gf("annual_revenue"),
            "annual_turnover": gf("annual_turnover", gf("annual_revenue")),
            "financial_health": gf("financial_health"),  # FIX: was missing
            # FIX: risk score detail fields
            "viability_level": gf("viability_level"),
            "viability_probability": self._pct_display(gf("viability_probability")),
            "viability_meaning": gf("viability_meaning"),
            "delinquency_level": gf("delinquency_level"),
            "delinquency_probability": self._pct_display(gf("delinquency_probability")),
            "delinquency_meaning": gf("delinquency_meaning"),
            "failure_color": self._hex_to_css_class(gf("failure_color", "green")),
            "payment_color": self._hex_to_css_class(gf("payment_color", "green")),
            "viability_color": self._hex_to_css_class(gf("viability_color", "green")),
            "delinquency_color": self._hex_to_css_class(
                gf("delinquency_color", "green")
            ),
            "viability_badge": gf("viability_badge", "low"),
            "delinquency_badge": gf("delinquency_badge", "low"),
            # -- CREDIT RECOMMENDATION ------------------------------------
            "recommended_limit": gf(
                "recommended_limit", gf("recommended_credit_limit")
            ),
            "recommended_credit_limit": gf(
                "recommended_credit_limit", gf("recommended_limit")
            ),
            "max_exposure": gf("max_exposure", gf("maximum_exposure")),
            "maximum_exposure": gf("maximum_exposure", gf("max_exposure")),
            "recommended_payment_terms": gf("recommended_payment_terms"),
            "review_frequency": gf("review_frequency"),
            "credit_opinion_text": gf("credit_opinion_text", gf("credit_opinion")),
            # -- PAYMENT BEHAVIOR -----------------------------------------
            "avg_dbt": gf("avg_dbt"),
            "pct_on_time": self._pct_display(gf("pct_on_time")),
            "highest_past_due": gf("highest_past_due"),
            "prompt_pct": self._pct_display(gf("prompt_pct")),
            "prompt_amount": gf("prompt_amount"),
            "slow_30_pct": self._pct_display(gf("slow_30_pct")),
            "slow_30_amount": gf("slow_30_amount"),
            "slow_60_pct": self._pct_display(gf("slow_60_pct")),
            "slow_60_amount": gf("slow_60_amount"),
            "slow_90plus_pct": self._pct_display(gf("slow_90plus_pct")),
            "slow_90plus_amount": gf("slow_90plus_amount"),
            # -- LEGAL STATUS ---------------------------------------------
            "lawsuit_count": gf("lawsuit_count", 0),
            "lawsuit_amount": gf("lawsuit_amount", 0),
            "lawsuit_last_date": gf("lawsuit_last_date"),
            "lawsuit_status": gf("lawsuit_status", "No active lawsuits"),
            "lawsuit_badge": self._get_legal_badge(
                gf("lawsuit_status", "No active lawsuits")
            ),
            "lien_count": gf("lien_count", 0),
            "lien_amount": gf("lien_amount", 0),
            "lien_last_date": gf("lien_last_date"),
            "lien_status": gf("lien_status", "No liens reported"),
            "lien_badge": self._get_legal_badge(gf("lien_status", "No liens reported")),
            "judgment_count": gf("judgment_count", 0),
            "judgment_amount": gf("judgment_amount", 0),
            "judgment_last_date": gf("judgment_last_date"),
            "judgment_status": gf("judgment_status", "No judgments"),
            "judgment_badge": self._get_legal_badge(
                gf("judgment_status", "No judgments")
            ),
            "license_alert": gf("license_alert", "success"),
            "license_icon": self._iconize(gf("license_icon", "✅")),
            "license_status": gf("license_status"),
            "license_expiry": gf("license_expiry", gf("expiry_date")),
            "tax_alert": gf("tax_alert", "success"),
            "tax_icon": self._iconize(gf("tax_icon", "✅")),
            "tax_status": gf("tax_status"),
            # -- INDUSTRY -------------------------------------------------
            "industry_name": gf("industry_name"),
            "market_size": gf("market_size"),
            "industry_growth_rate": growth_display,  # FIX: no auto-append
            "competitive_position": gf("competitive_position"),
            "sector_country_label": gf("sector_country_label"),
            "sector_year": gf("sector_year"),
            "sector_market_size": gf("sector_market_size"),
            "sector_market_size_comment": gf("sector_market_size_comment"),
            "sector_forecast_period": gf("sector_forecast_period"),
            "sector_growth_forecast": gf("sector_growth_forecast"),
            "sector_growth_comment": gf("sector_growth_comment"),
            "sector_local_share": gf("sector_local_share"),
            "sector_local_comment": gf("sector_local_comment"),
            "sector_trade_flow": gf("sector_trade_flow"),
            "sector_trade_comment": gf("sector_trade_comment"),
            "sector_risks": gf("sector_risks"),
            "sector_drivers": gf("sector_drivers"),
            "sector_major_players": gf("sector_major_players"),
            "sector_summary_text": gf("sector_summary_text"),
            # -- MONITORING -----------------------------------------------
            "payment_delay_status": gf("payment_delay_status"),
            "payment_delay_color": gf("payment_delay_color", "green"),
            "credit_utilization": util_display,
            "utilization_color": gf("utilization_color", "#1a5f7a"),
            "financial_trend": gf("financial_trend"),
            "trend_color": gf("trend_color", "#1a5f7a"),
            "legal_threshold": gf("legal_threshold"),
            "payment_delay_threshold": gf("payment_delay_threshold"),
            "next_review_date": gf("next_review_date"),
            "assigned_analyst": gf("assigned_analyst"),
            "escalation_contact": gf("escalation_contact"),
            # -- APPENDICES -----------------------------------------------
            "data_quality_rating": gf("data_quality_rating"),
            "data_limitations": gf("data_limitations"),
            "data_source_analyst_comment": gf("data_source_analyst_comment"),
            "fields_populated": gf("fields_populated"),
            "total_fields": gf("total_fields"),
            "confidence_score": gf("confidence_score"),
            "primary_data_source": gf("primary_data_source"),
            "extraction_notes": gf("extraction_notes"),
            # -- MANAGEMENT -----------------------------------------------
            "management_team": mgmt,
            # -- ARRAYS ---------------------------------------------------
            "shareholders": normalize_shareholders(ga("shareholders")),
            "branches": ga("branches"),
            "regional_affiliates": ga("regional_affiliates"),
            "banking_relationships": ga("banking_relationships"),
            "news_events": ga("news_events"),
            "recommendations": ga("recommendations"),
            "risk_mitigations": ga("risk_mitigations"),
            "monitoring_triggers": ga("monitoring_triggers"),
            "alerts": normalize_alerts(ga("alerts")),
            "legal_details": ga("legal_details"),
            "strengths": ga("strengths"),
            "weaknesses": ga("weaknesses"),
            "opportunities": ga("opportunities"),
            "threats": ga("threats"),
            "phone_numbers": ga("phone_numbers"),
            # Add explicit length values for mustache .length support
            "strengths_length": len(ga("strengths")),
            "weaknesses_length": len(ga("weaknesses")),
            "opportunities_length": len(ga("opportunities")),
            "threats_length": len(ga("threats")),
            "board_members": ga("board_members"),
            "extra_reg_fields": ga("extra_reg_fields"),
        }

        # Exclude pages
        for i in range(1, 20):
            pk = f"exclude_page_{i}"
            ctx[pk] = self._boolify(gf(pk, False), False)

        return ctx

    # -----------------------------------------------------------------
    # MUSTACHE RENDERER
    # -----------------------------------------------------------------

    def _render_mustache(self, template: str, ctx: dict) -> str:
        def process_sections(tmpl: str, context: dict) -> str:
            pattern = re.compile(r"\{\{#([\w.]+)\}\}(.*?)\{\{/\1\}\}", re.DOTALL)

            def replace_section(m):
                key = m.group(1)
                inner = m.group(2)

                # Handle .length property access (e.g., "strengths.length")
                if key.endswith(".length"):
                    base_key = key[:-7]  # Remove ".length" from end
                    val = context.get(base_key)
                    if isinstance(val, list) and len(val) > 0:
                        # Render the section ONLY ONCE if the list has items
                        rendered = process_sections(inner, context)
                        rendered = process_inverted(rendered, context)
                        rendered = replace_variables(rendered, context)
                        return rendered
                    else:
                        return ""

                val = context.get(key)

                if isinstance(val, list) and len(val) > 0:
                    result = ""
                    for item in val:
                        if isinstance(item, dict):
                            item_ctx = {**context, **item}
                        elif isinstance(item, str):
                            item_ctx = {**context, ".": item, "name": item}
                        else:
                            item_ctx = context
                        rendered = process_sections(inner, item_ctx)
                        rendered = process_inverted(rendered, item_ctx)
                        rendered = replace_variables(rendered, item_ctx)
                        result += rendered
                    return result
                elif val and not isinstance(val, list):
                    rendered = process_sections(inner, context)
                    rendered = process_inverted(rendered, context)
                    rendered = replace_variables(rendered, context)
                    return rendered
                return ""

            prev = None
            while prev != tmpl:
                prev = tmpl
                tmpl = pattern.sub(replace_section, tmpl)
            return tmpl

        def process_inverted(tmpl: str, context: dict) -> str:
            pattern = re.compile(r"\{\{\^([\w.]+)\}\}(.*?)\{\{/\1\}\}", re.DOTALL)

            def replace_inverted(m):
                key = m.group(1)
                inner = m.group(2)

                # Handle .length property access (e.g., "strengths.length")
                if key.endswith(".length"):
                    base_key = key[:-7]  # Remove ".length" from end
                    val = context.get(base_key)
                    is_empty = not (isinstance(val, list) and len(val) > 0)
                    if is_empty:
                        rendered = process_sections(inner, context)
                        rendered = replace_variables(rendered, context)
                        return rendered
                    return ""

                val = context.get(key)
                is_empty = (
                    val is None
                    or val == ""
                    or val == "N/A"
                    or (isinstance(val, list) and len(val) == 0)
                )
                if is_empty:
                    rendered = process_sections(inner, context)
                    rendered = replace_variables(rendered, context)
                    return rendered
                return ""

            return pattern.sub(replace_inverted, tmpl)

        def replace_variables(tmpl: str, context: dict) -> str:
            def replacer(m):
                key = m.group(1).strip()
                if key == ".":
                    return str(context.get(".", ""))
                val = context.get(key)
                if val is None:
                    return "N/A"
                if isinstance(val, list):
                    return ""
                if isinstance(val, bool):
                    return str(val).lower()
                return str(val)

            return re.sub(r"\{\{([^#^/!>].*?)\}\}", replacer, tmpl)

        result = process_sections(template, ctx)
        result = process_inverted(result, ctx)
        result = replace_variables(result, ctx)
        result = re.sub(r"\{\{[^}]*\}\}", "", result)
        return result

    # -----------------------------------------------------------------
    # -----------------------------------------------------------------
    # RENDER HTML
    # -----------------------------------------------------------------

    def _prune_empty_html_nodes(self, html_content: str) -> str:
        """Surgically strip elements evaluating to N/A using lxml."""
        try:
            import lxml.html

            tree = lxml.html.fromstring(html_content)

            # Find all nodes containing exactly "N/A"
            for node in tree.xpath(
                "//*[normalize-space(text())='N/A' or normalize-space(text())='n/a']"
            ):
                classes = set(node.attrib.get("class", "").split())

                # Check if it's a value container
                if node.tag == "td" or any(
                    c in classes
                    for c in [
                        "info-value",
                        "metric-value",
                        "reg-value",
                        "sc-value",
                        "value",
                    ]
                ):
                    # Traverse upwards to find the row wrapper
                    container = node.getparent()
                    valid_container = False
                    while container is not None and container.tag != "body":
                        c_classes = set(container.attrib.get("class", "").split())
                        if container.tag == "tr" or any(
                            c in c_classes
                            for c in [
                                "info-row",
                                "metric-box",
                                "reg-row",
                                "sc-row",
                                "summary-item",
                            ]
                        ):
                            valid_container = True
                            break
                        container = container.getparent()

                    if (
                        container is not None
                        and valid_container
                        and container.getparent() is not None
                    ):
                        container.getparent().remove(container)

            # Structural deletion passes (wrapper and subsection deletion) have been reverted
            # to guarantee that valid text-only sections (like the Alerts or Disclaimers) are not deleted.

            return lxml.html.tostring(tree, encoding="unicode", method="html")
        except ImportError:
            print("[PDF] lxml not installed, skipping server-side pruning")
            return html_content
        except Exception as e:
            print(f"[PDF] LXML Pruning Error: {e}")
            import traceback

            traceback.print_exc()
            return html_content

    def _render_html(self, report_data: Dict[str, Any]) -> str:
        ctx = self._build_context(report_data)
        try:
            import chevron

            if self.template_path.exists():
                template_str = self.template_path.read_text(encoding="utf-8")
                result = chevron.render(template_str, dict(ctx))
                print("[PDF] Rendered via chevron OK")
                # Temporarily disabled - causing issues
                # return self._prune_empty_html_nodes(result)
                return result
        except ImportError:
            pass
        except Exception as e:
            print(f"[PDF] chevron error: {e}, falling back")

        try:
            if self.template_path.exists():
                template_str = self.template_path.read_text(encoding="utf-8")
                result = self._render_mustache(template_str, ctx)
                print("[PDF] Rendered via custom Mustache OK")
                # Temporarily disabled - causing issues
                # return self._prune_empty_html_nodes(result)
                return result
        except Exception as e:
            print(f"[PDF] Render error: {e}")
            import traceback

            traceback.print_exc()

        return self._emergency_html(ctx)

    def _emergency_html(self, ctx: dict) -> str:
        return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial;padding:40px">
<h1>Valyze Credit Report (fallback)</h1>
<p>Company: {ctx.get("legal_name", "N/A")}</p>
<p>Credit Rating: {ctx.get("credit_rating", "N/A")}</p>
<p>Risk Level: {ctx.get("risk_level", "N/A")}</p>
<p>Currency: {ctx.get("fin_currency", "N/A")}</p>
</body></html>"""

    # -----------------------------------------------------------------
    # PUBLIC API
    # -----------------------------------------------------------------

    async def generate_pdf(
        self, report_data: Dict[str, Any], report_id: str
    ) -> Dict[str, Any]:
        try:
            from playwright.async_api import async_playwright

            html_content = self._render_html(report_data)
            output_path = self.output_dir / f"{report_id}.pdf"

            async with async_playwright() as p:
                browser = await p.chromium.launch()
                page = await browser.new_page()
                await page.set_content(html_content, wait_until="networkidle")

                fields = report_data.get("fields", {}) or {}

                def get_bool_field(key):
                    f = fields.get(key)
                    if not f:
                        return False
                    if isinstance(f, dict):
                        return bool(f.get("value"))
                    return bool(getattr(f, "value", False))

                exclude_list = [
                    get_bool_field(f"exclude_page_{i}") for i in range(1, 20)
                ]

                js_script = f"""
                () => {{
                    const hiddenToken = "__HIDDEN__";
                    const walkDOM = (node) => {{
                        if (node.nodeType === 3 &&
                            node.nodeValue.includes(hiddenToken)) {{
                            let p = node.parentElement;
                            let container = p;
                            while (p && p.tagName !== 'BODY' &&
                                   !p.classList.contains('page')) {{
                                if (p.classList.contains('card') ||
                                    p.classList.contains('metric-box') ||
                                    p.tagName === 'TR' ||
                                    p.classList.contains('summary-item')) {{
                                    container = p; break;
                                }}
                                p = p.parentElement;
                            }}
                            if (container) container.style.display = 'none';
                        }} else {{
                            for (let i = 0; i < node.childNodes.length; i++)
                                walkDOM(node.childNodes[i]);
                        }}
                    }};
                    walkDOM(document.body);
                    const excludeList = {str(exclude_list).lower()};
                    const pages = document.querySelectorAll('.page');
                    Array.from(pages).forEach((p, idx) => {{
                        if (excludeList[idx]) p.style.display = 'none';
                    }});
                }}
                """
                await page.evaluate(js_script)
                await page.pdf(
                    path=str(output_path),
                    format="A4",
                    print_background=True,
                    margin={
                        "top": "10mm",
                        "bottom": "10mm",
                        "left": "10mm",
                        "right": "10mm",
                    },
                )
                await browser.close()

            file_size_kb = round(output_path.stat().st_size / 1024, 1)
            print(f"[PDF] OK {output_path} ({file_size_kb} KB)")
            return {
                "success": True,
                "pdf_path": str(output_path),
                "file_size_kb": file_size_kb,
            }

        except Exception as e:
            print(f"[PDF] ERROR {e}")
            import traceback

            traceback.print_exc()
            return {"success": False, "error": str(e)}

    def get_html_preview(self, report_data: Dict[str, Any]) -> str:
        return self._render_html(report_data)
