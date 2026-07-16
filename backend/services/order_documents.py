"""
Order document rendering — one Unicode-safe HTML renderer for an order's
details, shared by the analyst API and the client portal.

Pure string building, ZERO third-party deps: serverless-safe, and it renders
any language faithfully (Arabic company names, RTL, etc.) because the browser
does the font work when producing the PDF.

- HTML -> returned inline; the frontends open it in a window and use the
          browser's native "Save as PDF" (window.print) for the PDF download.
- .doc -> the SAME html served with a Word MIME type; Word opens HTML-based
          .doc files perfectly, so no python-docx layout code is needed.
"""
from __future__ import annotations

from html import escape
from typing import Any, Dict, List

WORD_MIME = "application/msword"


def _row(label: str, value: Any) -> str:
    if value in (None, "", "N/A"):
        return ""
    return (
        f'<tr><td class="k">{escape(str(label))}</td>'
        f'<td class="v">{escape(str(value))}</td></tr>'
    )


def build_order_html(detail: Dict[str, Any]) -> str:
    client = detail.get("client") or {}
    companies: List[Dict[str, Any]] = detail.get("companies") or []
    files: List[Dict[str, Any]] = detail.get("files") or []
    order_no = detail.get("order_number") or detail.get("id") or "Order"

    company_rows = ""
    for i, c in enumerate(companies, 1):
        company_rows += (
            '<div class="company">'
            f"<h3>{i}. {escape(str(c.get('company_name') or 'Company'))}</h3>"
            '<table class="kv">'
            + _row("Country", c.get("country"))
            + _row("Registration No", c.get("registration_no"))
            + _row("Client Ref", c.get("client_ref"))
            + _row("Status", c.get("status"))
            + _row("Analyst", c.get("analyst_assigned"))
            + "</table></div>"
        )

    file_items = ""
    for f in files:
        size = f.get("file_size") or 0
        size_kb = f"{size / 1024:.0f} KB" if size else ""
        file_items += (
            f'<li>{escape(str(f.get("filename") or "file"))} '
            f'<span class="muted">{escape(str(f.get("file_type") or ""))} {size_kb}</span></li>'
        )
    files_block = (
        f'<h2>Attached files ({len(files)})</h2><ul class="files">{file_items}</ul>'
        if files
        else ""
    )

    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Order {escape(str(order_no))}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#0f172a; margin:0; padding:32px; }}
  .wrap {{ max-width:800px; margin:0 auto; }}
  .head {{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #4f46e5; padding-bottom:16px; margin-bottom:24px; }}
  .brand {{ font-weight:800; font-size:22px; letter-spacing:2px; color:#4f46e5; }}
  h1 {{ font-size:20px; margin:0 0 4px; }}
  h2 {{ font-size:15px; text-transform:uppercase; letter-spacing:.5px; color:#475569; margin:28px 0 10px; border-bottom:1px solid #e2e8f0; padding-bottom:6px; }}
  h3 {{ font-size:14px; margin:0 0 8px; }}
  table.kv {{ width:100%; border-collapse:collapse; }}
  table.kv td {{ padding:6px 8px; border-bottom:1px solid #f1f5f9; font-size:13px; vertical-align:top; }}
  td.k {{ color:#64748b; width:190px; }}
  td.v {{ color:#0f172a; }}
  .company {{ background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:12px; }}
  ul.files {{ margin:0; padding-left:18px; font-size:13px; }}
  .muted {{ color:#94a3b8; font-size:12px; }}
  @media print {{ body {{ padding:0; }} .company {{ break-inside:avoid; }} }}
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <div><h1>Credit Report Order</h1><div class="muted">Order {escape(str(order_no))}</div></div>
    <div class="brand">VALYZE</div>
  </div>
  <h2>Order</h2>
  <table class="kv">
    {_row('Order Number', detail.get('order_number'))}
    {_row('Status', detail.get('status'))}
    {_row('Service Level', detail.get('service_level'))}
    {_row('Report Type', detail.get('report_type'))}
    {_row('Due Date', detail.get('due_date'))}
    {_row('Date Received', detail.get('date_received'))}
    {_row('Client Ref', detail.get('client_ref'))}
    {_row('Companies', detail.get('company_count'))}
    {_row('Notes', detail.get('notes'))}
  </table>
  <h2>Client</h2>
  <table class="kv">
    {_row('Name', client.get('client_name'))}
    {_row('Valyze ID', client.get('valyze_id'))}
    {_row('Email', client.get('email'))}
  </table>
  <h2>Companies ({len(companies)})</h2>
  {company_rows or '<div class="muted">No companies.</div>'}
  {files_block}
</div>
</body>
</html>"""
