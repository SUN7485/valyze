"""PDF HTML rendering: values are escaped and style-bound fields are sanitised,
in both the chevron path and the fallback renderer."""

from __future__ import annotations

import re
import sys

import pytest

from models.report_schema import FieldData, build_empty_report
from pdf_generator import PDFGenerator, _safe_css_color, _score_pct

SCRIPT = "<script>alert(1)</script>"
EVIL_COLOR = "red;background:url(//x)"

MINI_TEMPLATE = """<html><body>
<h1 data-field="company_name">{{company_name}}</h1>
<div class="metric-value" style="color:{{payment_delay_color}};font-size:13pt;">{{payment_delay_status}}</div>
<div class="metric-value" style="color:{{utilization_color}};">u</div>
<div class="metric-value" style="color:{{trend_color}};">t</div>
<div class="score-fill" style="width:{{viability_score_pct}}%">{{viability_score}}</div>
<ul>{{#strengths}}<li>{{.}}</li>{{/strengths}}</ul>
</body></html>
"""


def _report_dict():
    report = build_empty_report("r1")
    values = {
        "company_name": SCRIPT,
        "legal_name": SCRIPT,
        "payment_delay_status": "{{credit_rating}}",
        "payment_delay_color": EVIL_COLOR,
        "utilization_color": "expression(alert(1))",
        "trend_color": "#abc",
        "viability_score": "50%;background:url(//x)",
        "credit_rating": "AAA",
    }
    for key, value in values.items():
        report.fields[key] = FieldData(value=value, confidence="high")
    report.arrays.strengths = [SCRIPT]
    return report.model_dump()


def _assert_neutralised(html_out: str):
    assert "<script>" not in html_out
    assert "&lt;script&gt;" in html_out
    # Hostile text may still be shown as text, but never inside a style attribute.
    styles = re.findall(r'style="([^"]*)"', html_out)
    assert styles
    for style in styles:
        assert "url(" not in style and "expression(" not in style, style


@pytest.fixture
def mini_generator(tmp_path):
    gen = PDFGenerator()
    path = tmp_path / "template.html"
    path.write_text(MINI_TEMPLATE, encoding="utf-8")
    gen.template_path = path
    return gen


def test_context_sanitises_style_fields():
    ctx = PDFGenerator()._build_context(_report_dict())
    assert ctx["payment_delay_color"] == "green"
    assert ctx["utilization_color"] == "#1a5f7a"
    assert ctx["trend_color"] == "#abc"
    assert ctx["viability_score_pct"] == "50"


def test_chevron_path_escapes(mini_generator):
    pytest.importorskip("chevron")
    out = mini_generator._render_html(_report_dict())
    _assert_neutralised(out)
    assert "color:green;" in out and "width:50%" in out


def test_fallback_path_escapes(mini_generator, monkeypatch):
    monkeypatch.setitem(sys.modules, "chevron", None)  # import chevron -> ImportError
    out = mini_generator._render_html(_report_dict())
    _assert_neutralised(out)
    assert "color:green;" in out and "width:50%" in out
    # substituted values are never re-scanned for tags
    assert "{{credit_rating}}" in out and "AAA" not in out


def test_full_template_render_is_escaped():
    out = PDFGenerator().get_html_preview(_report_dict())
    _assert_neutralised(out)


def test_emergency_html_escapes():
    out = PDFGenerator()._emergency_html({"legal_name": SCRIPT, "credit_rating": None})
    assert "<script>" not in out and "&lt;script&gt;" in out


def test_hidden_fields_reach_the_renderer():
    data = _report_dict()
    data["arrays"]["hidden_fields"] = ["company_name"]
    ctx = PDFGenerator()._build_context(data)
    assert "company_name" not in ctx["__visible_fields_set__"]


def test_fallback_handles_unclosed_section():
    gen = PDFGenerator()
    out = gen._render_mustache("a{{#flag}}b{{x}}", {"flag": False, "x": "<i>"})
    assert out == "ab&lt;i&gt;"


@pytest.mark.parametrize(
    "value,expected",
    [("#fff", "#fff"), ("#A1B2C3", "#A1B2C3"), ("Red", "red"), (EVIL_COLOR, "d"),
     ("#12345", "d"), (None, "d"), ("rgb(1,2,3)", "d")],
)
def test_safe_css_color(value, expected):
    assert _safe_css_color(value, "d") == expected


@pytest.mark.parametrize(
    "value,expected",
    [(72, "72"), ("72%", "72"), ("72/100", "72"), (150, "100"), (-5, "0"),
     ("N/A", "0"), (12.345, "12.3"), (True, "0")],
)
def test_score_pct(value, expected):
    assert _score_pct(value) == expected
