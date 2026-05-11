"""
Export Service - Multi-format export for credit reports.
Supports: JSON, XML, Excel (XLSX), CSV, Word (DOCX)
"""

from __future__ import annotations

import csv
import io
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from xml.etree.ElementTree import Element, SubElement, ElementTree, tostring


OUTPUT_DIR = Path("outputs")
OUTPUT_DIR.mkdir(exist_ok=True)


def _get_company_name(report: Dict[str, Any]) -> str:
    """Extract company name from report."""
    fields = report.get("fields", {})
    company_name = fields.get("company_name", {}).get("value")
    if not company_name:
        company_name = fields.get("legal_name", {}).get("value")
    return str(company_name or "Report").replace(" ", "_")[:30]


def _safe_value(val: Any) -> str:
    """Convert value to safe string, preserving numeric formatting."""
    if val is None:
        return ""
    if isinstance(val, dict):
        val = val.get("value", "")
    s = str(val).strip()
    # Keep numeric-looking strings as-is (prevents Excel scientific notation)
    # Matches integers or decimal numbers
    if s.replace('.', '', 1).replace('-', '', 1).isdigit():
        return s
    if s in ("N/A", "None"):
        return ""
    return s


def _get_field_value(fields: Dict, key: str) -> Any:
    """Get field value from fields dict."""
    field = fields.get(key)
    if field is None:
        return None
    if isinstance(field, dict):
        return field.get("value")
    return field


def _export_json(report: Dict[str, Any], report_id: str) -> Path:
    """Export report as JSON."""
    output_path = OUTPUT_DIR / f"{report_id}.json"

    # Convert report to clean JSON structure
    clean_report = {
        "report_id": report.get("report_id"),
        "status": report.get("status"),
        "created_at": report.get("created_at"),
        "updated_at": report.get("updated_at"),
        "fields": {},
        "arrays": {},
        "files": report.get("files", []),
        "extraction_stats": report.get("extraction_stats", {}),
    }

    # Clean fields
    fields = report.get("fields", {})
    for key, value in fields.items():
        if isinstance(value, dict):
            clean_report["fields"][key] = value.get("value")
        else:
            clean_report["fields"][key] = value

    # Clean arrays
    arrays = report.get("arrays", {})
    for key, value in arrays.items():
        if isinstance(value, list):
            clean_report["arrays"][key] = value
        else:
            clean_report["arrays"][key] = []

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(clean_report, f, indent=2, ensure_ascii=False)

    return output_path


def _export_xml(report: Dict[str, Any], report_id: str) -> Path:
    """Export report as XML and save to file."""
    output_path = OUTPUT_DIR / f"{report_id}.xml"

    root = Element("Report")
    root.set("report_id", str(report.get("report_id", "")))
    root.set("status", str(report.get("status", "")))
    root.set("created_at", str(report.get("created_at", "")))

    # Fields section
    fields_elem = SubElement(root, "Fields")
    fields = report.get("fields", {})
    for key, value in fields.items():
        field_elem = SubElement(fields_elem, "Field")
        field_elem.set("name", key)

        if isinstance(value, dict):
            val = value.get("value")
            conf = value.get("confidence", "")
            src = value.get("source", "")
            if val is not None:
                field_elem.set("value", str(val))
            if conf:
                field_elem.set("confidence", conf)
            if src:
                field_elem.set("source", src)
        else:
            if value is not None:
                field_elem.set("value", str(value))

    # Arrays section
    arrays_elem = SubElement(root, "Arrays")
    arrays = report.get("arrays", {})
    for array_name, items in arrays.items():
        array_elem = SubElement(arrays_elem, array_name)
        if isinstance(items, list):
            for idx, item in enumerate(items):
                item_elem = SubElement(array_elem, "Item")
                item_elem.set("index", str(idx))
                if isinstance(item, dict):
                    for k, v in item.items():
                        if v is not None:
                            sub_elem = SubElement(item_elem, k)
                            sub_elem.text = str(v)
                elif item is not None:
                    item_elem.text = str(item)

    # Files section
    files_elem = SubElement(root, "Files")
    for file_info in report.get("files", []):
        if isinstance(file_info, dict):
            file_elem = SubElement(files_elem, "File")
            for k, v in file_info.items():
                if v is not None:
                    file_elem.set(k, str(v))

    xml_str = tostring(root, encoding="unicode", method="xml")
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(xml_str)

    return output_path


def generate_xml_string(report: Dict[str, Any]) -> str:
    """Generate XML string from report without saving to file."""
    root = Element("Report")
    root.set("report_id", str(report.get("report_id", "")))
    root.set("status", str(report.get("status", "")))
    root.set("created_at", str(report.get("created_at", "")))

    # Fields section
    fields_elem = SubElement(root, "Fields")
    fields = report.get("fields", {})
    for key, value in fields.items():
        field_elem = SubElement(fields_elem, "Field")
        field_elem.set("name", key)

        if isinstance(value, dict):
            val = value.get("value")
            conf = value.get("confidence", "")
            src = value.get("source", "")
            if val is not None:
                field_elem.set("value", str(val))
            if conf:
                field_elem.set("confidence", conf)
            if src:
                field_elem.set("source", src)
        else:
            if value is not None:
                field_elem.set("value", str(value))

    # Arrays section
    arrays_elem = SubElement(root, "Arrays")
    arrays = report.get("arrays", {})
    for array_name, items in arrays.items():
        array_elem = SubElement(arrays_elem, array_name)
        if isinstance(items, list):
            for idx, item in enumerate(items):
                item_elem = SubElement(array_elem, "Item")
                item_elem.set("index", str(idx))
                if isinstance(item, dict):
                    for k, v in item.items():
                        if v is not None:
                            sub_elem = SubElement(item_elem, k)
                            sub_elem.text = str(v)
                elif item is not None:
                    item_elem.text = str(item)

    # Files section
    files_elem = SubElement(root, "Files")
    for file_info in report.get("files", []):
        if isinstance(file_info, dict):
            file_elem = SubElement(files_elem, "File")
            for k, v in file_info.items():
                if v is not None:
                    file_elem.set(k, str(v))

    xml_str = tostring(root, encoding="unicode", method="xml")
    xml_str = '<?xml version="1.0" encoding="UTF-8"?>\n' + xml_str
    return xml_str


def _export_excel(report: Dict[str, Any], report_id: str) -> Path:
    """Export report as Excel workbook with ALL data."""
    output_path = OUTPUT_DIR / f"{report_id}.xlsx"

    wb = Workbook()
    wb.remove(wb.active)

    # Styles
    header_font = Font(bold=True, size=12)
    header_fill = PatternFill(
        start_color="4472C4", end_color="4472C4", fill_type="solid"
    )
    header_font_white = Font(bold=True, size=12, color="FFFFFF")

    fields = report.get("fields", {})
    arrays = report.get("arrays", {})
    files = report.get("files", [])
    extraction_stats = report.get("extraction_stats", {})

    # Sheet 1: Summary - Core company info + 3-year financial highlights
    ws_summary = wb.create_sheet("Summary", 0)
    ws_summary.append(["Category", "Field", "Value"])
    ws_summary["A1"].font = header_font_white
    ws_summary["B1"].font = header_font_white
    ws_summary["C1"].font = header_font_white
    ws_summary["A1"].fill = header_fill
    ws_summary["B1"].fill = header_fill
    ws_summary["C1"].fill = header_fill

    # Core company info
    core_fields = [
        ("Company", "company_name"),
        ("Company", "legal_name"),
        ("Company", "cr_number"),
        ("Company", "unified_number"),
        ("Company", "company_type"),
        ("Company", "company_status"),
        ("Company", "industry"),
        ("Company", "employee_count"),
        ("Company", "capital"),
        ("Company", "incorporation_date"),
        ("Location", "country"),
        ("Location", "city"),
        ("Location", "company_address"),
        ("Tax", "tax_registration_number"),
        ("Tax", "vat_registration_number"),
        ("License", "license_type"),
        ("License", "issue_date"),
        ("License", "expiry_date"),
    ]

    for cat, key in core_fields:
        val = _get_field_value(fields, key)
        if val:
            ws_summary.append([cat, key.replace("_", " ").title(), _safe_value(val)])

    # 3-year financial highlights
    year_1 = _get_field_value(fields, "year_1") or "Year 1"
    year_2 = _get_field_value(fields, "year_2") or "Year 2"
    year_3 = _get_field_value(fields, "year_3") or "Year 3"

    ws_summary.append(["", "", ""])
    ws_summary.append(["Financial", "Metric", ""])
    ws_summary.append(["Financial", "Item", str(year_1), str(year_2), str(year_3)])

    fin_items = [
        ("Revenue", "revenue"),
        ("COGS", "cogs"),
        ("Gross Profit", "gross_profit"),
        ("EBITDA", "ebitda"),
        ("Net Income", "net_income"),
        ("Total Assets", "total_assets"),
        ("Total Equity", "equity"),
        ("Cash", "cash"),
    ]

    for item_name, field_base in fin_items:
        vals = []
        for year_suffix in [1, 2, 3]:
            key = f"{field_base}_{year_suffix}"
            val = _get_field_value(fields, key)
            vals.append(_safe_value(val) if val else "")
        if any(vals):
            ws_summary.append(["Financial", item_name, vals[0], vals[1], vals[2]])

    for cell in ws_summary[1]:
        cell.font = header_font

    # Sheet 2: ALL Fields (every single field)
    ws_fields = wb.create_sheet("All Fields", 1)
    ws_fields.append(["Field Name", "Value", "Confidence", "Source"])
    ws_fields["A1"].font = header_font_white
    ws_fields["B1"].font = header_font_white
    ws_fields["C1"].font = header_font_white
    ws_fields["D1"].font = header_font_white
    ws_fields["A1"].fill = header_fill
    ws_fields["B1"].fill = header_fill
    ws_fields["C1"].fill = header_fill
    ws_fields["D1"].fill = header_fill

    for key, value in sorted(fields.items()):
        if isinstance(value, dict):
            val = value.get("value", "")
            conf = value.get("confidence", "")
            src = value.get("source", "")
            ws_fields.append([key, _safe_value(val), conf, src])
        else:
            ws_fields.append([key, _safe_value(value), "", ""])

    for cell in ws_fields[1]:
        cell.font = header_font

    # Sheet 3: Shareholders
    ws_shares = wb.create_sheet("Shareholders", 2)
    ws_shares.append(["Name", "Percentage", "Nationality", "Type", "Ownership %"])
    ws_shares["A1"].font = header_font_white
    ws_shares["B1"].font = header_font_white
    ws_shares["C1"].font = header_font_white
    ws_shares["D1"].font = header_font_white
    ws_shares["E1"].font = header_font_white
    for cell in ws_shares[1]:
        cell.fill = header_fill

    shareholders = arrays.get("shareholders", [])
    for sh in shareholders:
        if isinstance(sh, dict):
            ws_shares.append(
                [
                    sh.get("name", ""),
                    _safe_value(sh.get("percentage") or sh.get("ownership_percentage")),
                    sh.get("nationality", ""),
                    sh.get("type", ""),
                    _safe_value(sh.get("ownership_percentage") or sh.get("percentage")),
                ]
            )

    for cell in ws_shares[1]:
        cell.font = header_font

    # Sheet 4: Branches
    ws_branches = wb.create_sheet("Branches", 3)
    ws_branches.append(["Branch Name", "City", "Status", "CR Number"])
    ws_branches["A1"].font = header_font_white
    ws_branches["B1"].font = header_font_white
    ws_branches["C1"].font = header_font_white
    ws_branches["D1"].font = header_font_white
    for cell in ws_branches[1]:
        cell.fill = header_fill

    branches = arrays.get("branches", [])
    for br in branches:
        if isinstance(br, dict):
            ws_branches.append(
                [
                    br.get("branch_name", ""),
                    br.get("branch_city", ""),
                    br.get("branch_status", ""),
                    br.get("branch_cr_no", ""),
                ]
            )

    for cell in ws_branches[1]:
        cell.font = header_font

    # Sheet 5: Banking
    ws_banking = wb.create_sheet("Banking", 4)
    ws_banking.append(["Bank Name", "Facility Type", "Facility Usage"])
    ws_banking["A1"].font = header_font_white
    ws_banking["B1"].font = header_font_white
    ws_banking["C1"].font = header_font_white
    for cell in ws_banking[1]:
        cell.fill = header_fill

    banking = arrays.get("banking_relationships", [])
    for b in banking:
        if isinstance(b, dict):
            ws_banking.append(
                [
                    b.get("bank_name", ""),
                    b.get("facility_type", ""),
                    b.get("facility_usage", ""),
                ]
            )

    for cell in ws_banking[1]:
        cell.font = header_font

    # Sheet 6: Management Team
    ws_mgmt = wb.create_sheet("Management Team", 5)
    ws_mgmt.append(["Name", "Title", "Department", "Contact Email"])
    ws_mgmt["A1"].font = header_font_white
    ws_mgmt["B1"].font = header_font_white
    ws_mgmt["C1"].font = header_font_white
    ws_mgmt["D1"].font = header_font_white
    for cell in ws_mgmt[1]:
        cell.fill = header_fill

    mgmt = arrays.get("management_team", [])
    for m in mgmt:
        if isinstance(m, dict):
            ws_mgmt.append(
                [
                    m.get("name", ""),
                    m.get("title", ""),
                    m.get("department", ""),
                    m.get("contact_email", ""),
                ]
            )

    for cell in ws_mgmt[1]:
        cell.font = header_font

    # Sheet 7: News & Events
    ws_news = wb.create_sheet("News & Events", 6)
    ws_news.append(["Date", "Title", "Description", "Source"])
    ws_news["A1"].font = header_font_white
    ws_news["B1"].font = header_font_white
    ws_news["C1"].font = header_font_white
    ws_news["D1"].font = header_font_white
    for cell in ws_news[1]:
        cell.fill = header_fill

    news = arrays.get("news_events", [])
    for n in news:
        if isinstance(n, dict):
            ws_news.append(
                [
                    n.get("date", ""),
                    n.get("title", ""),
                    n.get("description", ""),
                    n.get("source", ""),
                ]
            )

    for cell in ws_news[1]:
        cell.font = header_font

    # Sheet 8: Recommendations
    ws_rec = wb.create_sheet("Recommendations", 7)
    ws_rec.append(["Type", "Description", "Priority"])
    ws_rec["A1"].font = header_font_white
    ws_rec["B1"].font = header_font_white
    ws_rec["C1"].font = header_font_white
    for cell in ws_rec[1]:
        cell.fill = header_fill

    recs = arrays.get("recommendations", [])
    for r in recs:
        if isinstance(r, dict):
            ws_rec.append(
                [
                    r.get("type", ""),
                    r.get("description", ""),
                    r.get("priority", ""),
                ]
            )

    for cell in ws_rec[1]:
        cell.font = header_font

    # Sheet 9: Risk Mitigations
    ws_risk = wb.create_sheet("Risk Mitigations", 8)
    ws_risk.append(["Risk", "Mitigation", "Status"])
    ws_risk["A1"].font = header_font_white
    ws_risk["B1"].font = header_font_white
    ws_risk["C1"].font = header_font_white
    for cell in ws_risk[1]:
        cell.fill = header_fill

    risks = arrays.get("risk_mitigations", [])
    for r in risks:
        if isinstance(r, dict):
            ws_risk.append(
                [
                    r.get("risk", ""),
                    r.get("mitigation", ""),
                    r.get("status", ""),
                ]
            )

    for cell in ws_risk[1]:
        cell.font = header_font

    # Sheet 10: Files
    ws_files = wb.create_sheet("Files", 9)
    ws_files.append(["Filename", "Type", "Size", "Uploaded"])
    ws_files["A1"].font = header_font_white
    ws_files["B1"].font = header_font_white
    ws_files["C1"].font = header_font_white
    ws_files["D1"].font = header_font_white
    for cell in ws_files[1]:
        cell.fill = header_fill

    for f in files:
        if isinstance(f, dict):
            ws_files.append(
                [
                    f.get("filename", ""),
                    f.get("type", ""),
                    f.get("size", ""),
                    f.get("uploaded_at", ""),
                ]
            )

    for cell in ws_files[1]:
        cell.font = header_font

    # Auto-adjust column widths
    for sheet in wb.worksheets:
        for column in sheet.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            sheet.column_dimensions[column_letter].width = adjusted_width

    wb.save(output_path)
    return output_path


def _export_csv(report: Dict[str, Any], report_id: str) -> Path:
    """Export report as CSV with ALL data."""
    output_path = OUTPUT_DIR / f"{report_id}.csv"

    fields = report.get("fields", {})
    arrays = report.get("arrays", {})

    rows = []

    # Section 1: ALL Fields (sorted)
    rows.append(["SECTION 1: ALL FIELDS", ""])
    rows.append(["Field Name", "Value"])

    for key in sorted(fields.keys()):
        val = _get_field_value(fields, key)
        rows.append([key.replace("_", " ").title(), _safe_value(val) if val else ""])

    rows.append(["", ""])

    # Section 2: Financial Data - 3 Years
    year_1 = _get_field_value(fields, "year_1") or "Year 1"
    year_2 = _get_field_value(fields, "year_2") or "Year 2"
    year_3 = _get_field_value(fields, "year_3") or "Year 3"

    rows.append(["SECTION 2: FINANCIAL DATA (3-YEAR)", "", "", ""])
    rows.append(["Item", str(year_1), str(year_2), str(year_3)])

    financial_items = [
        ("Revenue", "revenue"),
        ("COGS", "cogs"),
        ("Gross Profit", "gross_profit"),
        ("EBITDA", "ebitda"),
        ("Net Income", "net_income"),
        ("Total Assets", "total_assets"),
        ("Total Equity", "equity"),
        ("Cash", "cash"),
        ("Current Ratio", "current_ratio"),
        ("Quick Ratio", "quick_ratio"),
        ("Debt Equity", "debt_equity"),
        ("Gross Margin", "gross_margin"),
    ]

    for item_name, field_base in financial_items:
        vals = []
        for year_suffix in [1, 2, 3]:
            key = f"{field_base}_{year_suffix}"
            val = _get_field_value(fields, key)
            vals.append(_safe_value(val) if val else "")
        rows.append([item_name] + vals)

    rows.append(["", "", "", ""])

    # Section 3: Balance Sheet
    rows.append(["SECTION 3: BALANCE SHEET", "", "", ""])
    rows.append(["Item", str(year_1), str(year_2), str(year_3)])

    bs_items = [
        ("Current Assets", "current_assets"),
        ("Non-Current Assets", "non_current_assets"),
        ("Total Assets", "total_assets"),
        ("Current Liabilities", "current_liabilities"),
        ("Non-Current Liabilities", "non_current_liabilities"),
        ("Total Equity", "equity"),
        ("Retained Earnings", "retained_earnings"),
    ]

    for item_name, field_base in bs_items:
        vals = []
        for year_suffix in [1, 2, 3]:
            key = f"{field_base}_{year_suffix}"
            val = _get_field_value(fields, key)
            vals.append(_safe_value(val) if val else "")
        rows.append([item_name] + vals)

    rows.append(["", "", "", ""])

    # Section 4: Shareholders
    shareholders = arrays.get("shareholders", [])
    if shareholders:
        rows.append(["SECTION 4: SHAREHOLDERS", "", "", ""])
        rows.append(["Name", "Percentage", "Nationality", "Type"])
        for sh in shareholders:
            if isinstance(sh, dict):
                rows.append([
                    sh.get("name", ""),
                    _safe_value(sh.get("percentage") or sh.get("ownership_percentage")),
                    sh.get("nationality", ""),
                    sh.get("type", ""),
                ])
        rows.append(["", "", "", ""])

    # Section 5: Branches
    branches = arrays.get("branches", [])
    if branches:
        rows.append(["SECTION 5: BRANCHES", "", "", ""])
        rows.append(["Branch Name", "City", "Status", "CR Number"])
        for br in branches:
            if isinstance(br, dict):
                rows.append([
                    br.get("branch_name", ""),
                    br.get("branch_city", ""),
                    br.get("branch_status", ""),
                    br.get("branch_cr_no", ""),
                ])
        rows.append(["", "", "", ""])

    # Section 6: Banking
    banking = arrays.get("banking_relationships", [])
    if banking:
        rows.append(["SECTION 6: BANKING RELATIONSHIPS", "", "", ""])
        rows.append(["Bank Name", "Facility Type", "Facility Usage", ""])
        for b in banking:
            if isinstance(b, dict):
                rows.append([
                    b.get("bank_name", ""),
                    b.get("facility_type", ""),
                    b.get("facility_usage", ""),
                    "",
                ])
        rows.append(["", "", "", ""])

    # Section 7: Management Team
    mgmt = arrays.get("management_team", [])
    if mgmt:
        rows.append(["SECTION 7: MANAGEMENT TEAM", "", "", ""])
        rows.append(["Name", "Title", "Department", "Email"])
        for m in mgmt:
            if isinstance(m, dict):
                rows.append([
                    m.get("name", ""),
                    m.get("title", ""),
                    m.get("department", ""),
                    m.get("contact_email", ""),
                ])

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    return output_path


def _export_word(report: Dict[str, Any], report_id: str) -> Path:
    """Export report as Word document."""
    try:
        from docx import Document
        from docx.shared import Inches, Pt
        from docx.enum.table import WD_TABLE_ALIGNMENT
        from docx.enum.text import WD_ALIGN_PARAGRAPH
    except ImportError:
        # python-docx not installed, create simple text file
        output_path = OUTPUT_DIR / f"{report_id}.txt"
        company_name = _get_company_name(report)

        with open(output_path, "w", encoding="utf-8") as f:
            f.write(f"CREDIT REPORT: {company_name}\n")
            f.write("=" * 50 + "\n\n")

            fields = report.get("fields", {})
            for key, value in fields.items():
                val = _get_field_value(fields, key)
                if val:
                    f.write(f"{key.replace('_', ' ').title()}: {_safe_value(val)}\n")

            f.write("\n" + "=" * 50 + "\n")
            f.write("SHAREHOLDERS\n")
            f.write("=" * 50 + "\n")
            for sh in report.get("arrays", {}).get("shareholders", []):
                if isinstance(sh, dict):
                    f.write(
                        f"- {sh.get('name')}: {sh.get('percentage') or sh.get('ownership_percentage')}\n"
                    )

        return output_path

    output_path = OUTPUT_DIR / f"{report_id}.docx"
    doc = Document()

    # Title
    company_name = _get_company_name(report)
    title = doc.add_heading(f"CREDIT REPORT: {company_name}", 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # Summary section - ALL fields
    doc.add_heading("Company Information - ALL Fields", level=1)
    fields = report.get("fields", {})

    # ALL fields from the report
    all_field_keys = sorted(fields.keys())

    table = doc.add_table(rows=1, cols=2)
    table.style = "Light Grid Accent 1"

    # Header row
    header_row = table.rows[0]
    header_row.cells[0].text = "Field"
    header_row.cells[0].paragraphs[0].runs[0].bold = True
    header_row.cells[1].text = "Value"
    header_row.cells[1].paragraphs[0].runs[0].bold = True

    for key in all_field_keys:
        val = _get_field_value(fields, key)
        row = table.add_row()
        row.cells[0].text = key.replace("_", " ").title()
        row.cells[1].text = _safe_value(val) if val else ""

    # Financial Summary with Years - ALL financial data
    doc.add_heading("Financial Summary - ALL Data", level=1)

    # Get years
    year_1 = _get_field_value(fields, "year_1") or "Year 1"
    year_2 = _get_field_value(fields, "year_2") or "Year 2"
    year_3 = _get_field_value(fields, "year_3") or "Year 3"

    # ALL financial items
    financial_items = [
        ("Revenue", "revenue"),
        ("COGS", "cogs"),
        ("Gross Profit", "gross_profit"),
        ("EBITDA", "ebitda"),
        ("Net Income", "net_income"),
        ("Total Assets", "total_assets"),
        ("Total Equity", "equity"),
        ("Cash", "cash"),
        ("Current Ratio", "current_ratio"),
        ("Quick Ratio", "quick_ratio"),
        ("Debt Equity", "debt_equity"),
        ("Gross Margin", "gross_margin"),
    ]

    fin_table = doc.add_table(rows=1, cols=4)
    fin_table.style = "Light Grid Accent 1"

    # Header
    hdr = fin_table.rows[0]
    hdr.cells[0].text = "Item"
    hdr.cells[1].text = str(year_1)
    hdr.cells[2].text = str(year_2)
    hdr.cells[3].text = str(year_3)
    for cell in hdr.cells:
        cell.paragraphs[0].runs[0].bold = True

    for item_name, field_base in financial_items:
        vals = []
        for year_suffix in [1, 2, 3]:
            key = f"{field_base}_{year_suffix}"
            val = _get_field_value(fields, key)
            vals.append(_safe_value(val) if val else "")
        # Include even if empty to show all fields
        row = fin_table.add_row()
        row.cells[0].text = item_name
        row.cells[1].text = vals[0]
        row.cells[2].text = vals[1]
        row.cells[3].text = vals[2]

    # Balance Sheet items
    doc.add_heading("Balance Sheet Items", level=1)
    bs_items = [
        ("Current Assets", "current_assets"),
        ("Non-Current Assets", "non_current_assets"),
        ("Current Liabilities", "current_liabilities"),
        ("Non-Current Liabilities", "non_current_liabilities"),
        ("Total Assets", "total_assets"),
        ("Total Liabilities", "total_liabilities"),
        ("Total Equity", "equity"),
        ("Retained Earnings", "retained_earnings"),
    ]

    bs_table = doc.add_table(rows=1, cols=4)
    bs_table.style = "Light Grid Accent 1"
    hdr = bs_table.rows[0]
    hdr.cells[0].text = "Item"
    hdr.cells[1].text = str(year_1)
    hdr.cells[2].text = str(year_2)
    hdr.cells[3].text = str(year_3)
    for cell in hdr.cells:
        cell.paragraphs[0].runs[0].bold = True

    for item_name, field_base in bs_items:
        vals = []
        for year_suffix in [1, 2, 3]:
            key = f"{field_base}_{year_suffix}"
            val = _get_field_value(fields, key)
            vals.append(_safe_value(val) if val else "")
        row = bs_table.add_row()
        row.cells[0].text = item_name
        row.cells[1].text = vals[0]
        row.cells[2].text = vals[1]
        row.cells[3].text = vals[2]

    # Shareholders
    shareholders = report.get("arrays", {}).get("shareholders", [])
    if shareholders:
        doc.add_heading("Shareholders", level=1)
        table = doc.add_table(rows=1, cols=3)
        table.style = "Light Grid Accent 1"
        table.rows[0].cells[0].text = "Name"
        table.rows[0].cells[1].text = "Percentage"
        table.rows[0].cells[2].text = "Nationality"

        for sh in shareholders:
            if isinstance(sh, dict):
                row = table.add_row()
                row.cells[0].text = sh.get("name", "")
                row.cells[1].text = _safe_value(
                    sh.get("percentage") or sh.get("ownership_percentage")
                )
                row.cells[2].text = sh.get("nationality", "")

    # Branches
    branches = report.get("arrays", {}).get("branches", [])
    if branches:
        doc.add_heading("Branches", level=1)
        table = doc.add_table(rows=1, cols=3)
        table.style = "Light Grid Accent 1"
        table.rows[0].cells[0].text = "Branch Name"
        table.rows[0].cells[1].text = "City"
        table.rows[0].cells[2].text = "Status"

        for br in branches:
            if isinstance(br, dict):
                row = table.add_row()
                row.cells[0].text = br.get("branch_name", "")
                row.cells[1].text = br.get("branch_city", "")
                row.cells[2].text = br.get("branch_status", "")

    # Banking Relationships
    banking = report.get("arrays", {}).get("banking_relationships", [])
    if banking:
        doc.add_heading("Banking Relationships", level=1)
        table = doc.add_table(rows=1, cols=3)
        table.style = "Light Grid Accent 1"
        table.rows[0].cells[0].text = "Bank Name"
        table.rows[0].cells[1].text = "Facility Type"
        table.rows[0].cells[2].text = "Facility Usage"

        for b in banking:
            if isinstance(b, dict):
                row = table.add_row()
                row.cells[0].text = b.get("bank_name", "")
                row.cells[1].text = b.get("facility_type", "")
                row.cells[2].text = b.get("facility_usage", "")

    # Management Team
    team = report.get("arrays", {}).get("management_team", [])
    if team:
        doc.add_heading("Management Team", level=1)
        table = doc.add_table(rows=1, cols=3)
        table.style = "Light Grid Accent 1"
        table.rows[0].cells[0].text = "Name"
        table.rows[0].cells[1].text = "Title"
        table.rows[0].cells[2].text = "Department"

        for m in team:
            if isinstance(m, dict):
                row = table.add_row()
                row.cells[0].text = m.get("name", "")
                row.cells[1].text = m.get("title", "")
                row.cells[2].text = m.get("department", "")

    doc.save(output_path)
    return output_path


# ---------------------------------------------------------------------------
# Main export functions
# ---------------------------------------------------------------------------


def export_json(report: Dict[str, Any], report_id: str) -> Dict[str, Any]:
    """Export report as JSON."""
    try:
        output_path = _export_json(report, report_id)
        return {
            "success": True,
            "format": "json",
            "file_path": str(output_path),
            "file_size_kb": round(output_path.stat().st_size / 1024, 1),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def export_xml(report: Dict[str, Any], report_id: str) -> Dict[str, Any]:
    """Export report as XML. Returns file_path and xml content."""
    try:
        xml_content = generate_xml_string(report)
        output_path = _export_xml(report, report_id)
        return {
            "success": True,
            "format": "xml",
            "file_path": str(output_path),
            "xml": xml_content,
            "file_size_kb": round(output_path.stat().st_size / 1024, 1),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def export_excel(report: Dict[str, Any], report_id: str) -> Dict[str, Any]:
    """Export report as Excel."""
    try:
        output_path = _export_excel(report, report_id)
        return {
            "success": True,
            "format": "xlsx",
            "file_path": str(output_path),
            "file_size_kb": round(output_path.stat().st_size / 1024, 1),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def export_csv(report: Dict[str, Any], report_id: str) -> Dict[str, Any]:
    """Export report as CSV."""
    try:
        output_path = _export_csv(report, report_id)
        return {
            "success": True,
            "format": "csv",
            "file_path": str(output_path),
            "file_size_kb": round(output_path.stat().st_size / 1024, 1),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def export_word(report: Dict[str, Any], report_id: str) -> Dict[str, Any]:
    """Export report as Word."""
    try:
        output_path = _export_word(report, report_id)
        return {
            "success": True,
            "format": "docx",
            "file_path": str(output_path),
            "file_size_kb": round(output_path.stat().st_size / 1024, 1),
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_filename(report: Dict[str, Any], format: str) -> str:
    """Generate safe filename for report."""
    company_name = _get_company_name(report)
    return f"CreditReport_{company_name}.{format}"


def check_export_files(report_id: str) -> Dict[str, Any]:
    """Check which export files exist."""
    formats = ["json", "xml", "xlsx", "csv", "docx", "pdf"]
    result = {}

    for fmt in formats:
        path = OUTPUT_DIR / f"{report_id}.{fmt}"
        if path.exists():
            result[fmt] = {
                "exists": True,
                "size_kb": round(path.stat().st_size / 1024, 1),
            }
        else:
            result[fmt] = {"exists": False}

    return result
