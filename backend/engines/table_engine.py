"""
Table Engine forValyze Credit report.

Identifies and extracts financial data, shareholders, banking
relationships, and branches from document tables.
"""

from __future__ import annotations

import re
from typing import Optional


# -- Arabic-Indic -> Western numeral conversion ----------------------------
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")
_ARABIC_DECIMAL = str.maketrans("٫", ".")  # Arabic decimal separator


def _to_western(text: str) -> str:
    """Convert Arabic-Indic, Persian, and Arabic decimal separator to Western."""
    return text.translate(_ARABIC_INDIC).translate(_PERSIAN_DIGITS).translate(_ARABIC_DECIMAL)


# -- Questionnaire detection -----------------------------------------------
QUESTIONNAIRE_LABELS = [
    'full legal name', 'legal name',
    'trading name', 'other trading',
    'registered address', 'operational address',
    'telephone', 'mobile', 'fax',
    'email', 'web page', 'website',
    'number of employees', 'employees',
    'company\'s activity', 'activity', 'activities',
    'import', 'export',
    'suppliers', 'customers',
    'premises', 'office', 'factory',
    'warehouse', 'showroom',
    'owned', 'rented', 'size',
    'banks', 'banking',
    'shareholders', 'partners',
    'capital', 'license',
]

def is_questionnaire_table(table_rows: list) -> bool:
    """
    Detect if table is a questionnaire (label/value)
    vs a real data table.
    """
    if not table_rows:
        return False
    
    # Check first 8 rows
    sample = table_rows[:8]
    
    label_hits = 0
    for row in sample:
        if not row:
            continue
        first = str(row[0]).lower().strip()
        for label in QUESTIONNAIRE_LABELS:
            if label in first:
                label_hits += 1
                break
    
    # If 3+ rows match questionnaire labels → it's a questionnaire
    return label_hits >= 3

def parse_questionnaire_into_fields(
    table_rows: list
) -> dict:
    """
    Parse questionnaire rows into structured fields.
    Returns dict ready to map to report.
    """
    import re
    result = {}
    
    FIELD_MAP = {
        'full legal name': 'company_name',
        'legal name': 'company_name',
        'trading name': 'trade_names',
        'other trading': 'trade_names',
        'registered address': 'registered_address',
        'operational address': 'company_address',
        'telephone': 'phone',
        'mobile': 'mobile_phone',
        'fax': 'fax',
        'email': 'email',
        'web page': 'website',
        'website': 'website',
        'number of employees': 'employee_count',
        'employees': 'employee_count',
        'activity': 'core_activities_description',
        'activities': 'core_activities_description',
        'capital': 'capital',
        'license': 'license_type',
        'banks': 'banking_raw',
        'suppliers': 'suppliers_raw',
        'customers': 'customers_raw',
        'size': 'facility_size',
        'premises': 'facility_type',
        'shareholders': 'shareholders_raw',
        'partners': 'shareholders_raw',
    }
    
    for row in table_rows:
        if not row or len(row) < 2:
            continue
        
        label = str(row[0]).lower().strip()
        value = str(row[1]).strip() if row[1] else ''
        
        # Skip empty values
        if not value or value in ['None', 'N/A', '-', '']:
            continue
        
        for key, field in FIELD_MAP.items():
            if key in label:
                result[field] = value
                print(f"[QUESTIONNAIRE] {field} = "
                      f"{value[:50]}")
                break
    
    return result

def apply_questionnaire_fields(
    report: dict, 
    q_data: dict
) -> dict:
    """
    Map questionnaire parsed fields to report structure.
    Specifically handles banks, customers, suppliers.
    """
    import re
    
    # Parse banking partners from raw text
    # Input: "NATIONAL BANK OF FUJAIRAH, ADCB BANK, MCB"
    banking_raw = q_data.get('banking_raw', '')
    if banking_raw:
        # Split on commas, dots, newlines
        parts = re.split(r'[,\n;]', banking_raw)
        banks = []
        for part in parts:
            part = part.strip()
            # Must look like a bank name (not a label)
            if (len(part) > 3 and 
                part.lower() not in QUESTIONNAIRE_LABELS):
                banks.append(part)
        
        if banks:
            report['banking_relationships'] = [
                {
                    'bank_name': bank,
                    'facility_type': 'N/A',
                    'facility_usage': 'N/A'
                }
                for bank in banks[:10]
            ]
            report['total_banks'] = str(len(banks))
            report['primary_bank'] = banks[0]
            print(f"[QUESTIONNAIRE] Banks: {banks}")
    
    # Parse customers
    customers_raw = q_data.get('customers_raw', '')
    if customers_raw:
        customers = [
            c.strip()
            for c in re.split(r'[,\n]', customers_raw)
            if c.strip() and len(c.strip()) > 3
        ]
        if customers:
            report['key_customers'] = ', '.join(
                customers[:8]
            )
            print(f"[QUESTIONNAIRE] Customers: {customers}")
    
    # Parse suppliers
    suppliers_raw = q_data.get('suppliers_raw', '')
    if suppliers_raw:
        suppliers = [
            s.strip()
            for s in re.split(r'[,\n/]', suppliers_raw)
            if s.strip() and len(s.strip()) > 3
        ]
        if suppliers:
            report['main_suppliers'] = ', '.join(
                suppliers[:5]
            )
            print(f"[QUESTIONNAIRE] Suppliers: {suppliers}")
    
    # Direct field mapping
    direct = {
        'company_name': 'company_name',
        'trade_names': 'trade_names',
        'company_address': 'company_address',
        'registered_address': 'registered_address',
        'phone': 'phone',
        'mobile_phone': 'mobile_phone',
        'fax': 'fax',
        'email': 'email',
        'website': 'website',
        'employee_count': 'employee_count',
        'capital': 'capital',
        'facility_size': 'facility_size',
        'facility_type': 'facility_type',
        'core_activities_description': 
            'core_activities_description',
    }
    
    for q_key, r_key in direct.items():
        val = q_data.get(q_key)
        if val and not report.get(r_key):
            report[r_key] = val
    
    return report

# -- Keyword sets for table identification ----------------------------------
_INCOME_KEYWORDS = {
    "revenue", "sales", "turnover", "income", "profit", "loss",
    "expenses", "ebitda", "cogs", "cost of goods", "cost of sales",
    "operating", "gross profit", "net income", "net profit",
    "إيرادات", "مبيعات", "أرباح", "خسائر", "المصروفات",
    "صافي الربح", "تكلفة المبيعات", "ربح إجمالي",
}

_BALANCE_KEYWORDS = {
    "assets", "liabilities", "equity", "cash", "debt",
    "receivables", "current assets", "total assets",
    "current liabilities", "total liabilities",
    "أصول", "خصوم", "حقوق الملكية", "نقد", "ديون",
    "أصول متداولة", "إجمالي الأصول",
}

_SHAREHOLDER_KEYWORDS = {
    "shareholder", "owner", "partner", "holding", "stake",
    "مساهم", "ملاك", "حصة", "نسبة", "شريك",
}

_BANKING_KEYWORDS = {
    "bank", "facility", "credit", "limit", "loan",
    "بنك", "تسهيلات", "ائتمان", "قرض",
}

_BRANCH_KEYWORDS = {
    "branch", "outlet", "office", "location",
    "فرع", "مكتب", "موقع",
}


# -- Row matchers for financial statements ---------------------------------
def _normalize(text: str) -> str:
    """Lower-case, strip, collapse whitespace, normalise alef."""
    t = text.lower().strip()
    t = re.sub(r"\s+", " ", t)
    # Normalise Arabic alef variants
    t = re.sub(r"[أإآ]", "ا", t)
    return t


def _row_matches(label: str, keywords: list[str]) -> bool:
    norm = _normalize(label)
    for kw in keywords:
        if _normalize(kw) in norm:
            return True
    return False


# -- Revenue / income row keywords -----------------------------------------
_REVENUE_KW = ["revenue", "sales", "turnover", "net sales",
               "إيرادات", "مبيعات", "صافي المبيعات"]
_COGS_KW = ["cost of goods", "cost of sales", "cogs", "cost of revenue",
            "تكلفة المبيعات", "تكلفة الإيرادات"]
_GROSS_PROFIT_KW = ["gross profit", "gross margin", "ربح إجمالي",
                    "مجمل الربح", "إجمالي الربح"]
_OPEX_KW = ["operating expenses", "opex", "general and admin",
            "selling general", "مصروفات تشغيلية", "المصروفات"]
_EBITDA_KW = ["ebitda", "operating income", "operating profit",
              "ربح تشغيلي", "دخل تشغيلي"]
_NET_INCOME_KW = ["net income", "net profit", "net loss", "profit for the year",
                  "صافي الربح", "صافي الدخل", "صافي الخسارة"]

# -- Balance sheet row keywords --------------------------------------------
_CASH_KW = ["cash", "cash equivalents", "cash and cash equivalents",
            "نقد", "نقد وما في حكمه"]
_CURRENT_ASSETS_KW = ["current assets", "total current assets",
                      "أصول متداولة", "إجمالي الأصول المتداولة"]
_TOTAL_ASSETS_KW = ["total assets", "إجمالي الأصول"]
_CURRENT_LIAB_KW = ["current liabilities", "total current liabilities",
                    "خصوم متداولة", "إجمالي الخصوم المتداولة"]
_TOTAL_LIAB_KW = ["total liabilities", "إجمالي الخصوم"]
_EQUITY_KW = ["equity", "shareholders equity", "shareholders' equity",
              "total equity", "حقوق الملكية", "إجمالي حقوق الملكية"]


class TableEngine:
    """Identifies and extracts data from document tables."""

    # ------------------------------------------------------------------
    # Number cleaning
    # ------------------------------------------------------------------

    @staticmethod
    def convert_arabic_numerals(text: str) -> str:
        """Convert Arabic-Indic and Persian numerals to Western."""
        return _to_western(text)

    @staticmethod
    def clean_number(value: str) -> Optional[float]:
        """
        Parse a numeric string into a float.

        Handles commas, parentheses (negative), M/B/K suffixes,
        currency prefixes (SAR, USD, AED), Arabic-Indic digits.
        """
        if value is None:
            return None

        s = str(value).strip()
        if not s:
            return None

        # Convert Arabic-Indic
        s = _to_western(s)

        # Remove currency symbols
        s = re.sub(r"(?:SAR|USD|AED|BHD|QAR|OMR|KWD|EUR|GBP|ر\.س|ريال)\s*",
                   "", s, flags=re.IGNORECASE)

        # Check for parentheses → negative
        negative = False
        if s.startswith("(") and s.endswith(")"):
            negative = True
            s = s[1:-1].strip()

        # Check for minus
        if s.startswith("-"):
            negative = True
            s = s[1:].strip()

        # Handle suffixes
        multiplier = 1.0
        s_upper = s.rstrip().upper()
        if s_upper.endswith("B"):
            multiplier = 1_000_000_000
            s = s[:-1]
        elif s_upper.endswith("M"):
            multiplier = 1_000_000
            s = s[:-1]
        elif s_upper.endswith("K"):
            multiplier = 1_000
            s = s[:-1]

        # Remove commas and spaces within numbers
        s = s.replace(",", "").replace("٬", "").replace(" ", "")

        # Handle Arabic decimal separator
        # Some Arabic numbers use ٫ (U+066B) as decimal separator
        s = s.replace("٫", ".")

        # Try to parse
        try:
            result = float(s) * multiplier
            return -result if negative else result
        except (ValueError, OverflowError):
            return None

    # ------------------------------------------------------------------
    # Table identification
    # ------------------------------------------------------------------

    def identify_financial_table(self, table: dict) -> str:
        """
        Classify a table as income_statement, balance_sheet,
        shareholders, banking, branches, general, or unknown.
        """
        # Combine headers + first column values for keyword matching
        text_parts: list[str] = []
        for h in table.get("headers", []):
            text_parts.append(str(h).lower())
        for row in table.get("rows", [])[:10]:
            if row:
                text_parts.append(str(row[0]).lower())

        combined = " ".join(text_parts)

        # Score each category
        scores: dict[str, int] = {
            "income_statement": 0,
            "balance_sheet": 0,
            "shareholders": 0,
            "banking": 0,
            "branches": 0,
        }

        for kw in _INCOME_KEYWORDS:
            if kw in combined:
                scores["income_statement"] += 1
        for kw in _BALANCE_KEYWORDS:
            if kw in combined:
                scores["balance_sheet"] += 1
        for kw in _SHAREHOLDER_KEYWORDS:
            if kw in combined:
                scores["shareholders"] += 1
        for kw in _BANKING_KEYWORDS:
            if kw in combined:
                scores["banking"] += 1
        for kw in _BRANCH_KEYWORDS:
            if kw in combined:
                scores["branches"] += 1

        best = max(scores, key=scores.get)  # type: ignore[arg-type]
        if scores[best] >= 2:
            return best
        elif scores[best] == 1:
            return best
        return "unknown"

    # ------------------------------------------------------------------
    # Year detection
    # ------------------------------------------------------------------

    @staticmethod
    def _detect_years(table: dict) -> list[str]:
        """Find 4-digit years (2000-2030) in headers or first row."""
        candidates: list[str] = []
        search_rows = [table.get("headers", [])]
        if table.get("rows"):
            search_rows.append(table["rows"][0])

        for row in search_rows:
            for cell in row:
                cell_str = _to_western(str(cell))
                # Match FY2023, 2023E, 2023A, plain 2023
                matches = re.findall(r"(?:FY)?(\d{4})[EA]?", cell_str)
                for m in matches:
                    if 2000 <= int(m) <= 2030 and m not in candidates:
                        candidates.append(m)

        # Sort descending (most recent first)
        candidates.sort(reverse=True)
        return candidates[:3]

    # ------------------------------------------------------------------
    # Row value extraction helper
    # ------------------------------------------------------------------

    def _extract_row_values(
        self, table: dict, keywords: list[str], years: list[str]
    ) -> list[Optional[float]]:
        """
        Find a row matching *keywords* and return up to len(years) numeric
        values aligned with the detected year columns.
        """
        headers = table.get("headers", [])
        rows = table.get("rows", [])

        # Find column indices for years
        year_cols: list[int] = []
        for y in years:
            for ci, h in enumerate(headers):
                h_str = _to_western(str(h))
                if y in h_str and ci not in year_cols:
                    year_cols.append(ci)
                    break

        # If no year columns found in headers, try positional (skip label col)
        if not year_cols:
            n_cols = len(headers)
            if n_cols >= 2:
                year_cols = list(range(1, min(1 + len(years), n_cols)))

        # Search rows
        for row in rows:
            if not row:
                continue
            label = str(row[0])
            if _row_matches(label, keywords):
                values: list[Optional[float]] = []
                for ci in year_cols:
                    if ci < len(row):
                        values.append(self.clean_number(str(row[ci])))
                    else:
                        values.append(None)
                return values

        return [None] * len(years)

    # ------------------------------------------------------------------
    # Income statement extraction
    # ------------------------------------------------------------------

    def extract_income_statement(self, table: dict) -> dict:
        """Extract income statement line items from a table."""
        years = self._detect_years(table)
        if not years:
            years = ["", "", ""]

        return {
            "years": years,
            "revenue": self._extract_row_values(table, _REVENUE_KW, years),
            "cogs": self._extract_row_values(table, _COGS_KW, years),
            "gross_profit": self._extract_row_values(table, _GROSS_PROFIT_KW, years),
            "opex": self._extract_row_values(table, _OPEX_KW, years),
            "ebitda": self._extract_row_values(table, _EBITDA_KW, years),
            "net_income": self._extract_row_values(table, _NET_INCOME_KW, years),
        }

    # ------------------------------------------------------------------
    # Balance sheet extraction
    # ------------------------------------------------------------------

    def extract_balance_sheet(self, table: dict) -> dict:
        """Extract balance sheet line items from a table."""
        years = self._detect_years(table)
        if not years:
            years = ["", "", ""]

        return {
            "years": years,
            "cash": self._extract_row_values(table, _CASH_KW, years),
            "current_assets": self._extract_row_values(table, _CURRENT_ASSETS_KW, years),
            "total_assets": self._extract_row_values(table, _TOTAL_ASSETS_KW, years),
            "current_liabilities": self._extract_row_values(table, _CURRENT_LIAB_KW, years),
            "total_liabilities": self._extract_row_values(table, _TOTAL_LIAB_KW, years),
            "equity": self._extract_row_values(table, _EQUITY_KW, years),
        }

    # ------------------------------------------------------------------
    # Shareholders extraction
    # ------------------------------------------------------------------

    def extract_shareholders(self, table: dict) -> list:
        """Extract shareholder info from a table."""
        shareholders: list[dict] = []
        headers = [_normalize(str(h)) for h in table.get("headers", [])]
        rows = table.get("rows", [])

        # Find column indices
        name_col = self._find_col(headers, ["name", "shareholder", "اسم", "مساهم"])
        pct_col = self._find_col(headers, ["percentage", "share", "holding", "%", "نسبة", "حصة"])
        nat_col = self._find_col(headers, ["nationality", "جنسية"])
        type_col = self._find_col(headers, ["type", "category", "نوع", "فئة"])

        for row in rows:
            if not row:
                continue
            try:
                name = str(row[name_col]).strip() if name_col is not None and name_col < len(row) else str(row[0]).strip()
                pct_str = str(row[pct_col]).strip() if pct_col is not None and pct_col < len(row) else "0"
                pct = self.clean_number(pct_str) or 0.0
                nationality = str(row[nat_col]).strip() if nat_col is not None and nat_col < len(row) else ""
                sh_type = str(row[type_col]).strip() if type_col is not None and type_col < len(row) else "Individual"

                if name and name != "":
                    shareholders.append({
                        "name": name,
                        "percentage": pct,
                        "nationality": nationality,
                        "type": sh_type,
                    })
            except Exception:
                continue

        return shareholders

    # ------------------------------------------------------------------
    # Banking relationships extraction
    # ------------------------------------------------------------------

    def extract_banking_relationships(self, table: dict) -> list:
        """Extract banking relationships from a table."""
        relationships: list[dict] = []
        headers = [_normalize(str(h)) for h in table.get("headers", [])]
        rows = table.get("rows", [])

        name_col = self._find_col(headers, ["bank", "بنك", "name", "اسم"])
        type_col = self._find_col(headers, ["facility", "type", "تسهيلات", "نوع"])
        usage_col = self._find_col(headers, ["usage", "purpose", "استخدام", "غرض"])

        for row in rows:
            if not row:
                continue
            try:
                bank = str(row[name_col]).strip() if name_col is not None and name_col < len(row) else str(row[0]).strip()
                ftype = str(row[type_col]).strip() if type_col is not None and type_col < len(row) else None
                usage = str(row[usage_col]).strip() if usage_col is not None and usage_col < len(row) else None

                if bank:
                    relationships.append({
                        "bank_name": bank,
                        "facility_type": ftype,
                        "facility_usage": usage,
                    })
            except Exception:
                continue

        return relationships

    # ------------------------------------------------------------------
    # Branches extraction
    # ------------------------------------------------------------------

    def extract_branches(self, table: dict) -> list:
        """Extract branch information from a table."""
        branches: list[dict] = []
        headers = [_normalize(str(h)) for h in table.get("headers", [])]
        rows = table.get("rows", [])

        name_col = self._find_col(headers, ["branch", "name", "فرع", "اسم"])
        cr_col = self._find_col(headers, ["cr", "سجل", "registration"])
        city_col = self._find_col(headers, ["city", "مدينة", "location", "موقع"])
        status_col = self._find_col(headers, ["status", "حالة"])

        for row in rows:
            if not row:
                continue
            try:
                name = str(row[name_col]).strip() if name_col is not None and name_col < len(row) else str(row[0]).strip()
                cr = str(row[cr_col]).strip() if cr_col is not None and cr_col < len(row) else None
                city = str(row[city_col]).strip() if city_col is not None and city_col < len(row) else None
                status = str(row[status_col]).strip() if status_col is not None and status_col < len(row) else "Active"

                if name:
                    branches.append({
                        "branch_name": name,
                        "branch_unified_no": None,
                        "branch_cr_no": cr,
                        "branch_city": city,
                        "branch_function": None,
                        "branch_status": status,
                        "branch_status_badge": "low" if status.lower() == "active" else "medium",
                    })
            except Exception:
                continue

        return branches

    # ------------------------------------------------------------------
    # Master extraction method
    # ------------------------------------------------------------------

    def extract_financial_data(self, tables: list) -> dict:
        """
        Process all tables and extract financial data + array data.

        Returns a combined dict with income_statement, balance_sheet,
        capital, shareholders, banking_relationships, branches, and
        confidence level.
        """
        result: dict = {
            "income_statement": {},
            "balance_sheet": {},
            "capital": None,
            "shareholders": [],
            "banking_relationships": [],
            "branches": [],
            "confidence": "missing",
        }

        if not tables:
            return result

        print(f"[TABLE] Analysing {len(tables)} tables...")

        for i, table in enumerate(tables):
            # First check if this is a questionnaire table
            table_rows = table.get("rows", [])
            if is_questionnaire_table(table_rows):
                print(f"[TABLE] Table {i + 1}: Detected questionnaire table")
                try:
                    q_fields = parse_questionnaire_into_fields(table_rows)
                    if q_fields:
                        result["_questionnaire"] = q_fields
                        print(f"[TABLE] Questionnaire extracted {len(q_fields)} fields")
                    continue  # Skip normal processing for questionnaire
                except Exception as e:
                    print(f"[TABLE] Questionnaire processing error: {e}")
                    continue
            
            # Normal table processing
            table_type = self.identify_financial_table(table)
            print(f"[TABLE] Table {i + 1}: identified as '{table_type}'")

            try:
                if table_type == "income_statement":
                    is_data = self.extract_income_statement(table)
                    if not result["income_statement"] or self._has_data(is_data):
                        result["income_statement"] = is_data
                        result["confidence"] = "high"

                elif table_type == "balance_sheet":
                    bs_data = self.extract_balance_sheet(table)
                    if not result["balance_sheet"] or self._has_data(bs_data):
                        result["balance_sheet"] = bs_data
                        result["confidence"] = "high"

                elif table_type == "shareholders":
                    sh = self.extract_shareholders(table)
                    if sh:
                        result["shareholders"] = sh
                        print(f"[TABLE] Found {len(sh)} shareholders")

                elif table_type == "banking":
                    bk = self.extract_banking_relationships(table)
                    if bk:
                        result["banking_relationships"] = bk
                        print(f"[TABLE] Found {len(bk)} banking relationships")

                elif table_type == "branches":
                    br = self.extract_branches(table)
                    if br:
                        result["branches"] = br
                        print(f"[TABLE] Found {len(br)} branches")

            except Exception as e:
                print(f"[TABLE] Error processing table {i + 1}: {e}")

        return result

    # ------------------------------------------------------------------
    # Map to report field names
    # ------------------------------------------------------------------

    def map_to_report_fields(self, financial_data: dict) -> dict:
        """
        Convert extracted financial data to report field names.

        Years are sorted descending: year_1 = most recent.
        """
        fields: dict = {}

        # Income statement
        is_data = financial_data.get("income_statement", {})
        is_years = is_data.get("years", [])
        
        # Balance sheet
        bs_data = financial_data.get("balance_sheet", {})
        bs_years = bs_data.get("years", [])

        # Use income statement years if available, otherwise balance sheet years
        years = is_years if is_years else bs_years

        # Map years (most recent = year_1)
        if len(years) >= 1:
            fields["year_1"] = {
                "value": str(years[0]),
                "confidence": "high",
                "source": "table",
            }
        if len(years) >= 2:
            fields["year_2"] = {
                "value": str(years[1]),
                "confidence": "high",
                "source": "table",
            }
        if len(years) >= 3:
            fields["year_3"] = {
                "value": str(years[2]),
                "confidence": "high",
                "source": "table",
            }

        # Map financial line items
        line_items = {
            "revenue": "revenue",
            "cogs": "cogs",
            "gross_profit": "gross_profit",
            "opex": "opex",
            "ebitda": "ebitda",
            "net_income": "net_income",
        }

        for data_key, field_prefix in line_items.items():
            values = is_data.get(data_key, [])
            for i, val in enumerate(values[:3]):
                if val is not None:
                    field_name = f"{field_prefix}_{i+1}"
                    fields[field_name] = {
                        "value": str(val),
                        "confidence": "high",
                        "source": "table",
                    }

        # Balance Sheet
        bs_items = {
            "cash": "cash",
            "current_assets": "current_assets",
            "total_assets": "total_assets",
            "current_liabilities": "current_liabilities",
            "total_liabilities": "total_liabilities",
            "equity": "equity",
        }

        for data_key, field_prefix in bs_items.items():
            values = bs_data.get(data_key, [])
            for i, val in enumerate(values[:3]):
                if val is not None:
                    field_name = f"{field_prefix}_{i+1}"
                    fields[field_name] = {
                        "value": str(val),
                        "confidence": "high",
                        "source": "table",
                    }

        # Capital
        capital = financial_data.get("capital")
        if capital:
            fields["capital"] = {
                "value": str(capital),
                "confidence": "high",
                "source": "table",
            }

        print(f"[TABLE] Mapped {len(fields)} financial fields")
        return fields

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _find_col(headers: list[str], keywords: list[str]) -> Optional[int]:
        """Find the column index whose header best matches given keywords."""
        for ci, h in enumerate(headers):
            for kw in keywords:
                if kw in h:
                    return ci
        return None

    @staticmethod
    def _has_data(data: dict) -> bool:
        """Check if a financial data dict has at least one non-None value."""
        for key, vals in data.items():
            if key == "years":
                continue
            if isinstance(vals, list):
                if any(v is not None for v in vals):
                    return True
        return False
