"""
Pattern Engine forValyze Credit report.

Extracts structured fields from text using regex patterns.
Handles both Arabic and English document formats.
"""

from __future__ import annotations

import re
from typing import Optional
from datetime import datetime


# -- Arabic-Indic -> Western numeral conversion ----------------------------
_ARABIC_INDIC = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
_PERSIAN_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")


def _to_western(text: str) -> str:
    """Convert Arabic-Indic and Persian digits to Western numerals."""
    return text.translate(_ARABIC_INDIC).translate(_PERSIAN_DIGITS)


def normalize_arabic_numbers(text: str) -> str:
    """
    Convert Arabic-Indic numerals to Western numerals.
    ٠١٢٣٤٥٦٧٨٩ → 0123456789
    """
    arabic_indic = '٠١٢٣٤٥٦٧٨٩'
    western = '0123456789'
    
    translation = str.maketrans(arabic_indic, western)
    return text.translate(translation)


# Arabic financial pattern mapping for bidirectional matching
ARABIC_FINANCIAL_MAP = {
    # Revenue variations
    r'الإيرادات|إيرادات|المبيعات': 'revenue',
    
    # COGS variations  
    r'تكلفة المبيعات|تكلفة الإيرادات|ت\.الحصول': 'cogs',
    
    # Gross profit
    r'مجمل الربح|إجمالي الربح|مجمل ربح': 'gross_profit',
    
    # Net profit
    r'صافي الربح|صافى الربح|صافي الدخل': 'net_income',
    
    # Total assets
    r'إجمالي الأصول|مجموع الأصول': 'total_assets',
    
    # Equity
    r'حقوق الملكية|إجمالي حقوق الملكية': 'equity',
}

def extract_arabic_financial_values(text: str) -> dict:
    """Extract Arabic financial values using bidirectional pattern matching."""
    import re
    
    # Normalize numbers first
    text = normalize_arabic_numbers(text)
    
    results = {}
    number_pattern = r'[\d,]+\.?\d*'
    
    for arabic_pattern, field_name in ARABIC_FINANCIAL_MAP.items():
        # Try label BEFORE number (normal order)
        pattern1 = f'({arabic_pattern})' + r'\D{0,20}?(' + number_pattern + r')'
        
        # Try number BEFORE label (reversed - common in RTL extraction)
        pattern2 = r'(' + number_pattern + r')' + r'\D{0,20}?' + f'({arabic_pattern})'
        
        match = re.search(pattern1, text, re.UNICODE)
        if match:
            try:
                val = float(match.group(2).replace(',', ''))
                if val > 0:
                    results[field_name] = val
                    continue
            except:
                pass
        
        match = re.search(pattern2, text, re.UNICODE)
        if match:
            try:
                val = float(match.group(1).replace(',', ''))
                if val > 0:
                    results[field_name] = val
            except:
                pass
    
    return results


class PatternEngine:
    """Extracts structured fields via regex from document text."""

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    def extract_all(self, text: str) -> dict:
        """
        Run all pattern extractors and return a dict of field results.

        Each field has: value, confidence, source.
        """
        text_w = _to_western(text)  # normalised copy for number patterns

        extractors = {
            "cr_number": self.extract_cr_number,
            "unified_number": self.extract_unified_number,
            "phone": self.extract_phone,
            "fax": self.extract_fax,
            "email": self.extract_email,
            "website": self.extract_website,
            "issue_date": self.extract_issue_date,
            "expiry_date": self.extract_expiry_date,
            "incorporation_date": self.extract_incorporation_date,
            "license_expiry": self.extract_license_expiry,
            "registration_number": self.extract_registration_number,
            "investment_license_no": self.extract_investment_license_no,
        }

        results: dict = {}
        for field_name, extractor_fn in extractors.items():
            try:
                # Use western-normalised text for number fields
                if field_name in (
                    "cr_number", "unified_number", "phone", "fax",
                    "registration_number", "investment_license_no",
                ):
                    value = extractor_fn(text_w)
                else:
                    value = extractor_fn(text)

                if value:
                    # Clean and validate date fields
                    if field_name in ["issue_date", "expiry_date", "license_expiry", 
                                    "incorporation_date", "next_review_date"]:
                        value = self.clean_date(value)
                    else:
                        value = self.clean_extracted_value(value)
                    
                    if value:  # Only add if value is not empty
                        results[field_name] = {
                            "value": value,
                            "confidence": "high",
                            "source": "pattern",
                        }
                        print(f"[PATTERN] Found {field_name}: {value}")
                else:
                    results[field_name] = {
                        "value": None,
                        "confidence": "missing",
                        "source": "pattern",
                    }
            except Exception as e:
                print(f"[PATTERN] Error extracting {field_name}: {e}")
                results[field_name] = {
                    "value": None,
                    "confidence": "missing",
                    "source": "pattern",
                }

        return results

    # ------------------------------------------------------------------
    # Individual field extractors
    # ------------------------------------------------------------------

    def extract_cr_number(self, text: str) -> Optional[str]:
        """Saudi CR number: 10 digits starting with 1 or 2."""
        patterns = [
            # English patterns
            r"(?:CR\s*(?:No|Number)?[.:\s]*)\s*([12]\d{9})",
            r"(?:C\.R\.?\s*(?:No|Number)?[.:\s]*)\s*([12]\d{9})",
            r"(?:Commercial\s*Registration\s*(?:No|Number)?[.:\s]*)\s*([12]\d{9})",
            r"(?:Commercial\s*Reg\.?\s*(?:No|Number)?[.:\s]*)\s*([12]\d{9})",
            
            # Arabic patterns
            r"سجل\s*تجاري[:\s]*([12]\d{9})",
            r"رقم\s*السجل\s*التجاري[:\s]*([12]\d{9})",
            r"السجل\s*التجاري\s*رقم[:\s]*([12]\d{9})",
            r"الرقم\s*التجاري[:\s]*([12]\d{9})",
            r"رقم\s*التسجيل\s*التجاري[:\s]*([12]\d{9})",
            r"التسجيل\s*التجاري[:\s]*([12]\d{9})",
            
            # Common variations
            r"CR\s-]*([12]\d{3}[\s-]*\d{3}[\s-]*\d{3})",
            r"س\.ت[:\s]*([12]\d{9})",
            r"س\s*ت[:\s]*([12]\d{9})",
            
            # Standalone patterns
            r"\b(10\d{8})\b",
            r"\b(20\d{8})\b",
            r"\b([12]\d{3}[\s.-]\d{3}[\s.-]\d{3})\b",
        ]
        return self._first_match(text, patterns)

    def extract_unified_number(self, text: str) -> Optional[str]:
        """Saudi Unified Number: 10 digits starting with 7."""
        patterns = [
            r"(?:Unified\s*(?:No|Number)?[.:\s]*)\s*(7\d{9})",
            r"الرقم\s*الموحد[:\s]*(7\d{9})",
            r"\b(7\d{9})\b",
        ]
        return self._first_match(text, patterns)

    def extract_phone(self, text: str) -> Optional[str]:
        """Extract phone number (Saudi formats)."""
        patterns = [
            r"(?:(?:Tel|Phone|Mobile|هاتف|تليفون|جوال)[:\s]*)"
            r"(\+?966[\s-]?\d[\s-]?\d{3}[\s-]?\d{4})",
            r"(?:(?:Tel|Phone|Mobile|هاتف|تليفون|جوال)[:\s]*)"
            r"(0?5\d[\s-]?\d{3}[\s-]?\d{4})",
            r"(?:(?:Tel|Phone|Mobile|هاتف|تليفون|جوال)[:\s]*)"
            r"(01[1-9][\s-]?\d{3}[\s-]?\d{4})",
            r"(\+966\d{9})",
            r"\b(05\d{8})\b",
        ]
        return self._first_match(text, patterns)

    def extract_fax(self, text: str) -> Optional[str]:
        """Extract fax number."""
        patterns = [
            r"(?:(?:Fax|FAX|فاكس)[:\s]*)"
            r"(\+?966[\s-]?\d[\s-]?\d{3}[\s-]?\d{4})",
            r"(?:(?:Fax|FAX|فاكس)[:\s]*)"
            r"(01[1-9][\s-]?\d{3}[\s-]?\d{4})",
            r"(?:(?:Fax|FAX|فاكس)[:\s]*)"
            r"(\d[\s-]?\d{3}[\s-]?\d{4})",
        ]
        return self._first_match(text, patterns)

    def extract_email(self, text: str) -> Optional[str]:
        """Extract email address."""
        pattern = r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
        m = re.search(pattern, text)
        return m.group(0) if m else None

    def extract_website(self, text: str) -> Optional[str]:
        """Extract website URL."""
        patterns = [
            r"(https?://[^\s<>\"']+)",
            r"(www\.[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}(?:/[^\s<>\"']*)?)",
        ]
        return self._first_match(text, patterns)

    def extract_date(self, text: str, context_keywords: list) -> Optional[str]:
        """
        Find a date near the given context keywords.

        Searches for the keyword, then looks for a date pattern within
        200 characters after it.
        """
        # Build combined keyword pattern
        for kw in context_keywords:
            try:
                # Find keyword position
                kw_pattern = re.compile(re.escape(kw), re.IGNORECASE)
                m = kw_pattern.search(text)
                if not m:
                    continue

                # Look in the 200 chars following the keyword
                snippet = text[m.start():m.start() + 200]
                snippet = _to_western(snippet)

                # Try date patterns
                date_patterns = [
                    r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})",       # YYYY-MM-DD or YYYY/MM/DD
                    r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})",       # DD/MM/YYYY or MM/DD/YYYY
                    r"(\d{1,2}[-/]\d{1,2}[-/]\d{2})",       # DD/MM/YY
                    r"(\d{4}/\d{2}/\d{2})",                  # Hijri: 1445/06/15
                    r"(\d{1,2}\s+(?:January|February|March|April|May|June|"
                    r"July|August|September|October|November|December)"
                    r"\s+\d{4})",                            # 15 January 2024
                    r"(\d{1,2}\s+(?:يناير|فبراير|مارس|أبريل|مايو|يونيو|"
                    r"يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)"
                    r"\s+\d{4})",                            # Arabic month names
                ]
                for dp in date_patterns:
                    dm = re.search(dp, snippet, re.IGNORECASE)
                    if dm:
                        return dm.group(1)
            except Exception:
                continue

        # Fallback: try to find any date in full text near a keyword
        return None

    def extract_issue_date(self, text: str) -> Optional[str]:
        """Extract issue date."""
        keywords = [
            "issue date", "issued", "date of issue",
            "تاريخ الإصدار", "تاريخ الإنشاء", "تاريخ",
        ]
        return self.extract_date(text, keywords)

    def extract_expiry_date(self, text: str) -> Optional[str]:
        """Extract expiry date."""
        keywords = [
            "expiry", "expires", "expiration", "valid until",
            "تاريخ الانتهاء", "ينتهي", "صالح حتى",
        ]
        return self.extract_date(text, keywords)

    def extract_incorporation_date(self, text: str) -> Optional[str]:
        """Extract incorporation/establishment date."""
        keywords = [
            "incorporation", "established", "founded", "inception",
            "تأسست", "تأسيس", "تاريخ التأسيس",
        ]
        return self.extract_date(text, keywords)

    def extract_license_expiry(self, text: str) -> Optional[str]:
        """Extract license expiry date."""
        keywords = [
            "license expiry", "license expires", "licence expiry",
            "انتهاء الرخصة", "انتهاء الترخيص",
        ]
        return self.extract_date(text, keywords)

    def extract_registration_number(self, text: str) -> Optional[str]:
        """Extract general registration number."""
        patterns = [
            r"(?:(?:Registration|Reg)\s*(?:No|Number)?[.:\s]*)\s*(\d{5,15})",
            r"(?:تسجيل|رقم\s*التسجيل)[:\s]*(\d{5,15})",
        ]
        return self._first_match(text, patterns)

    def extract_investment_license_no(self, text: str) -> Optional[str]:
        """Extract investment license number."""
        patterns = [
            r"(?:(?:Investment\s*)?License\s*(?:No|Number)?[.:\s]*)\s*"
            r"([A-Za-z0-9\-/]+\d+[A-Za-z0-9\-/]*)",
            r"(?:ترخيص\s*استثمار|رقم\s*الترخيص)[:\s]*([A-Za-z0-9\-/]+)",
        ]
        return self._first_match(text, patterns)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def clean_extracted_value(self, value: str) -> str:
        """Clean extracted string: strip whitespace, newlines, noise."""
        value = value.strip()
        value = re.sub(r"\s+", " ", value)  # collapse multiple whitespace
        value = value.replace("\n", " ").replace("\r", "")
        return value

    def clean_date(self, date_str: str) -> str:
        """Clean and validate a date string."""
        if not date_str:
            return ""
        
        # Try common formats
        formats = [
            "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y",
            "%Y-%m-%d", "%d-%m-%Y",
            "%d %B %Y", "%B %d, %Y",
            # Arabic/hijri patterns handled separately
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                # Sanity check: year must be between 1900 and 2100
                if 1900 <= dt.year <= 2100:
                    return dt.strftime("%Y/%m/%d")
            except ValueError:
                continue
        
        # If nothing worked and it looks garbage, return empty
        # Garbage pattern: year < 1900 or > 2100
        year_match = re.search(r'\b(\d{2,4})\b', date_str)
        if year_match:
            year = int(year_match.group(1))
            if year < 1900 or year > 2100:
                return ""  # Invalid date
        
        return date_str  # Return as-is if we can't parse

    def _first_match(self, text: str, patterns: list[str]) -> Optional[str]:
        """Return the first capture group from the first matching pattern."""
        for pattern in patterns:
            try:
                m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
                if m:
                    return m.group(1)
            except Exception:
                continue
        return None
