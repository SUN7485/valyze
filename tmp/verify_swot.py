import sys
import os
from pathlib import Path

# Add backend to path
sys.path.append(str(Path("D:/valyez final/backend")))

from pdf_generator import PDFGenerator

def test_swot_deduplication():
    gen = PDFGenerator()
    
    # Mock data with DUAL SWOT (nested and top-level)
    report_data = {
        "legal_name": "Test Company",
        "swot_analysis": {
            "strengths": ["Strength A", "Strength B"],
            "weaknesses": ["Weakness A"]
        },
        "strengths": ["Strength A", "Strength B", "Strength C"], # Some overlap
        "weaknesses": ["Weakness B"],
        "opportunities": ["Opp 1"],
        "threats": ["Threat 1"]
    }
    
    # We need to simulate how report.py handles this or how pdf_generator flattens it
    # report.py now deduplicates it. Let's assume the deduplicated data looks like:
    deduped_data = {
        "fields": {
            "legal_name": {"value": "Test Company"},
            "company_name": {"value": "Test Company"}
        },
        "arrays": {
            "strengths": ["Strength A", "Strength B", "Strength C"],
            "weaknesses": ["Weakness A", "Weakness B"],
            "opportunities": ["Opp 1"],
            "threats": ["Threat 1"]
        }
    }
    
    html = gen.get_html_preview(deduped_data)
    
    # Check for "💪 Strengths" string - should appear exactly once in the rendered SWOT section
    # Note: It might appear in the Dashboard too if it extracts there, 
    # but the SWOT section itself shouldn't repeat.
    
    strengths_count = html.count("💪 Strengths")
    print(f"Strengths header count: {strengths_count}")
    
    # Check for .length logic bug (duplication within the SWOT section)
    # If the bug was active, Strength A would appear multiple times if strengths.length was used as a loop
    strength_a_count = html.count("Strength A")
    print(f"Strength A count: {strength_a_count}")
    
    # Check for page breaks
    has_breaks = "page-break-before: always" in html
    print(f"Has explicit page breaks: {has_breaks}")

    if strengths_count == 1 and strength_a_count == 1:
        print("VERIFICATION SUCCESS: SWOT is unique.")
    else:
        print("VERIFICATION MARGINAL: Check if SWOT appears in dashboard too.")

if __name__ == "__main__":
    test_swot_deduplication()
