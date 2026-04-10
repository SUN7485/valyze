"""
Generate API routes forValyze Credit report.

Orchestrates AI narrative and SWOT generation.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession

from database.crud import get_report, save_report_json, update_report_status
from database.db import get_db
from ai.narratives import NarrativeGenerator
from ai.swot import SWOTGenerator

router = APIRouter(prefix="/api/generate", tags=["generate"])

UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "uploads"))

# Critical fields that should NEVER be overwritten if they came from easy_way_import
CRITICAL_FIELDS = [
    "credit_rating", "risk_level", "health_score", "recommended_limit",
    "max_exposure", "paydex_score", "viability_score", "delinquency_score",
    "failure_score", "payment_score", "rating_color", "risk_color",
    "final_credit_rating", "final_risk_level", "financial_health",
    "payment_risk", "company_size", "annual_revenue",
]


def should_overwrite_field(report, field_name: str) -> bool:
    """
    Check if a field should be overwritten by AI generation.
    Returns False if the field has source='easy_way_import', meaning
    it was imported via Easy Way Import and should never be overwritten.
    """
    # Only check critical fields that come from JSON import
    if field_name not in CRITICAL_FIELDS:
        return True  # Allow overwriting non-critical fields (narratives, etc.)
    
    field = report.fields.get(field_name)
    if field is None:
        return True  # Field doesn't exist, allow creation
    
    # Check the source attribute
    source = getattr(field, 'source', '') or ''
    if source == 'easy_way_import':
        print(f"[GENERATE] SKIP {field_name} - source is 'easy_way_import', preserving imported value")
        return False  # NEVER overwrite imported values
    
    return True  # Allow overwriting

@router.post("/narratives/{report_id}")
async def generate_narratives(report_id: str, db: AsyncSession = Depends(get_db)):
    """
    Generate all AI narratives, SWOT, and recommendations for a report.
    Typically called after user review.
    """
    # 1. Get report
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    # 2. Verify status
    if report.status not in ["ready", "editing", "done", "uploading"]:
        raise HTTPException(
            status_code=400, 
            detail=f"Report status '{report.status}' is not valid for generation. Must be ready or editing."
        )

    # 3. Set status
    await update_report_status(db, report_id, "generating")
    
    try:
        # 4. Initialize generators
        narrative_gen = NarrativeGenerator()
        swot_gen = SWOTGenerator()
        
        # Convert Pydantic model to dict for generator context
        report_data = report.model_dump()
        
        # 5. Check LM Studio
        lm_available = await narrative_gen.lm.check_connection()
        print(f"[GENERATE] LM Studio status: {lm_available}")

        # 6. Run Generation
        # Narratives
        narrative_results = await narrative_gen.generate_all_narratives(report_data, report_id)
        
        # Check if SWOT arrays already have data from JSON import - skip AI generation if so
        arrays = report_data.get("arrays", {})
        
        # SWOT - only generate if arrays are empty
        swot_result = None
        swot_fields = ["strengths", "weaknesses", "opportunities", "threats"]
        has_existing_swot = any(
            arrays.get(field) and len(arrays.get(field, [])) > 0 
            for field in swot_fields
        )
        
        if has_existing_swot:
            print(f"[GENERATE] SWOT arrays already populated from JSON - preserving existing data")
            swot_result = {
                "strengths": arrays.get("strengths", []),
                "weaknesses": arrays.get("weaknesses", []),
                "opportunities": arrays.get("opportunities", []),
                "threats": arrays.get("threats", []),
            }
        else:
            swot_result = await swot_gen.generate_swot(report_data)
        
        # Recommendations - only generate if empty
        recommendations = None
        if arrays.get("recommendations") and len(arrays.get("recommendations", [])) > 0:
            print(f"[GENERATE] Recommendations already populated from JSON - preserving")
            recommendations = arrays.get("recommendations", [])
        else:
            recommendations = await swot_gen.generate_recommendations(report_data)
        
        # Risk Mitigations - only generate if empty
        risk_mitigations = None
        if arrays.get("risk_mitigations") and len(arrays.get("risk_mitigations", [])) > 0:
            print(f"[GENERATE] Risk mitigations already populated from JSON - preserving")
            risk_mitigations = arrays.get("risk_mitigations", [])
        else:
            risk_mitigations = await swot_gen.generate_risk_mitigations(report_data)
        
        # Monitoring Triggers - only generate if empty
        monitoring = None
        if arrays.get("monitoring_triggers") and len(arrays.get("monitoring_triggers", [])) > 0:
            print(f"[GENERATE] Monitoring triggers already populated from JSON - preserving")
            monitoring = arrays.get("monitoring_triggers", [])
        else:
            monitoring = await swot_gen.generate_monitoring_triggers(report_data)
        
        # Alerts are always generated (logic-based, no AI overwrite risk)
        alerts = swot_gen.generate_alerts(report_data)

        # 7. Merge into report
        # Merge narratives into fields
        for field_name, field_data in narrative_results.items():
            # Check if we should overwrite this field
            if not should_overwrite_field(report, field_name):
                continue  # Skip - preserve imported value
            
            if field_name in report.fields:
                report.fields[field_name].value = field_data["value"]
                report.fields[field_name].confidence = field_data["confidence"]
                report.fields[field_name].source = field_data["source"]
                report.fields[field_name].locked = field_data["locked"]

        # Update arrays
        report.arrays.strengths = swot_result.get("strengths", [])
        report.arrays.weaknesses = swot_result.get("weaknesses", [])
        report.arrays.opportunities = swot_result.get("opportunities", [])
        report.arrays.threats = swot_result.get("threats", [])
        
        # Assuming we need to map recommendations to the correct model
        from models.report_schema import Recommendation, RiskMitigation, MonitoringTrigger, Alert
        
        report.arrays.recommendations = [Recommendation(**r) for r in recommendations]
        report.arrays.risk_mitigations = [RiskMitigation(**m) for m in risk_mitigations]
        report.arrays.monitoring_triggers = [MonitoringTrigger(**t) for t in monitoring]
        report.arrays.alerts = [Alert(**a) for a in alerts]

        # 8. Save to DB
        report.status = "complete"
        report.updated_at = datetime.now(timezone.utc).isoformat()
        await save_report_json(db, report_id, report.model_dump_json())
        await update_report_status(db, report_id, "complete")

        return {
            "status": "complete",
            "report_id": report_id,
            "generation_summary": {
                "narratives_generated": len(narrative_results),
                "arrays_generated": 8,
                "lm_studio_used": lm_available,
                "alerts_triggered": len(alerts)
            }
        }

    except Exception as e:
        print(f"[GENERATE] Fatal error: {e}")
        await update_report_status(db, report_id, "ready") # Rollback status
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.get("/progress/{report_id}")
async def get_generation_progress(report_id: str, db: AsyncSession = Depends(get_db)):
    """Read narrative_progress.json and return status. Also checks DB status as fallback."""
    import time
    
    progress_file = UPLOAD_DIR / report_id / "narrative_progress.json"
    
    # Default values
    file_status = "not_started"
    progress_percent = 0
    current_step = "Waiting to start..."
    completed = 0
    total = 10
    progress_mtime = 0
    
    # Try to read from progress file
    if progress_file.exists():
        try:
            progress_mtime = progress_file.stat().st_mtime
            with open(progress_file, "r") as f:
                data = json.load(f)
                
            file_status = data.get("status", "running")
            progress_percent = data.get("progress_percent", 0)
            current_step = f"Generating {data.get('current', 'fields')}..."
            completed = data.get("completed", 0)
            total = data.get("total", 10)
        except Exception as e:
            print(f"[PROGRESS] Error reading progress file: {e}")
    
    # Also check database status as authoritative source
    db_status = None
    try:
        report = await get_report(db, report_id)
        if report:
            db_status = report.status
            # If DB says done/complete/finished, force complete status
            if db_status in ["done", "complete", "finished"]:
                file_status = "done"
                progress_percent = 100
                current_step = "Finalized!"
            # If DB says ready, generation was cancelled or failed - allow restart
            elif db_status == "ready":
                file_status = "ready"
                progress_percent = 0
                current_step = "Ready to generate..."
    except Exception as e:
        print(f"[PROGRESS] Error checking DB status: {e}")
    
    # Check for stuck generation: if DB says generating but progress file is old (> 5 min)
    current_time = time.time()
    is_stuck = False
    if db_status == "generating":
        if progress_mtime == 0 or (current_time - progress_mtime) > 300:  # 5 minutes timeout
            is_stuck = True
            file_status = "stuck"
            current_step = "Generation stuck - please retry"
            progress_percent = 0
    
    # Determine if generation is complete (check multiple status values)
    is_complete = (
        file_status in ["done", "complete", "ready", "stuck", "finished"] or 
        progress_percent >= 100 or
        db_status in ["done", "complete", "ready", "finished"]
    )
    
    if is_complete and file_status != "stuck":
        file_status = "done"
        progress_percent = 100
        current_step = "Finalized!"
    
    return {
        "status": file_status,
        "progress_percent": progress_percent,
        "current_step": current_step,
        "completed": completed,
        "total": total,
        "complete": is_complete,
        "stuck": is_stuck
    }


@router.post("/regenerate/{report_id}")
async def regenerate_sections(
    report_id: str, 
    sections: List[str] = Body(..., embed=True),
    db: AsyncSession = Depends(get_db)
):
    """Regenerate specific sections (swot, recommendations, etc.)."""
    report = await get_report(db, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    narrative_gen = NarrativeGenerator()
    swot_gen = SWOTGenerator()
    report_data = report.model_dump()
    arrays = report_data.get("arrays", {})
    
    from models.report_schema import Recommendation, RiskMitigation, MonitoringTrigger, Alert

    for section in sections:
        print(f"[REGENERATE] Targeting section: {section}")
        if section == "swot":
            # Check if SWOT already has data from JSON
            has_existing = any(
                arrays.get(field) and len(arrays.get(field, [])) > 0 
                for field in ["strengths", "weaknesses", "opportunities", "threats"]
            )
            if has_existing:
                print("[REGENERATE] SWOT already populated from JSON - skipping")
                continue
            swot = await swot_gen.generate_swot(report_data)
            report.arrays.strengths = swot.get("strengths", [])
            report.arrays.weaknesses = swot.get("weaknesses", [])
            report.arrays.opportunities = swot.get("opportunities", [])
            report.arrays.threats = swot.get("threats", [])
        elif section == "recommendations":
            if arrays.get("recommendations") and len(arrays.get("recommendations", [])) > 0:
                print("[REGENERATE] Recommendations already populated from JSON - skipping")
                continue
            recs = await swot_gen.generate_recommendations(report_data)
            report.arrays.recommendations = [Recommendation(**r) for r in recs]
        elif section == "risk_mitigations":
            if arrays.get("risk_mitigations") and len(arrays.get("risk_mitigations", [])) > 0:
                print("[REGENERATE] Risk mitigations already populated from JSON - skipping")
                continue
            mit = await swot_gen.generate_risk_mitigations(report_data)
            report.arrays.risk_mitigations = [RiskMitigation(**m) for m in mit]
        elif section == "monitoring":
            if arrays.get("monitoring_triggers") and len(arrays.get("monitoring_triggers", [])) > 0:
                print("[REGENERATE] Monitoring triggers already populated from JSON - skipping")
                continue
            mon = await swot_gen.generate_monitoring_triggers(report_data)
            report.arrays.monitoring_triggers = [MonitoringTrigger(**t) for t in mon]
        elif section == "alerts":
            # Alerts are always regenerated (logic-based)
            alerts = swot_gen.generate_alerts(report_data)
            report.arrays.alerts = [Alert(**a) for a in alerts]
        elif section in report.fields:
            # Check if we should overwrite this field
            if not should_overwrite_field(report, section):
                print(f"[REGENERATE] Field {section} is from easy_way_import - skipping")
                continue
            
            # Check if this field already has data from JSON
            field_data = report.fields.get(section)
            if field_data:
                val = getattr(field_data, "value", None)
                if val and str(val).strip() and str(val).lower() not in ["n/a", "none", "", "null", "pending"]:
                    print(f"[REGENERATE] Field {section} already populated from JSON - skipping")
                    continue
            # Try to find the method in narrative_gen
            method_name = f"generate_{section.replace('_text', '').replace('_description', '').replace('_meaning', '')}"
            if hasattr(narrative_gen, method_name):
                method = getattr(narrative_gen, method_name)
                val = await method(report_data)
                report.fields[section].value = val
                report.fields[section].source = "ai"
                report.fields[section].confidence = "high"

    report.updated_at = datetime.now(timezone.utc).isoformat()
    await save_report_json(db, report_id, report.model_dump_json())
    
    return {"message": f"Regenerated {len(sections)} sections", "sections": sections}
