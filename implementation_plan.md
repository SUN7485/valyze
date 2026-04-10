# Implementation Plan: Valyze Credit Report System — JSON Import & Template Alignment

[Overview]
Audit and fix the entire Valyze credit report system to ensure the JSON input (220+ fields) flows seamlessly through the backend import, database storage, frontend edit pages, and PDF template rendering. The core problem is field name mismatches, missing field mappings, and disconnected data flow between the JSON input, the backend's easy_way import, the frontend editor pages, and the PDF template.

[Types]
No new Pydantic models needed. The existing `FullReport`, `ReportArrays`, `FieldData`, and all array item models already cover the JSON structure. The fix is in field name mapping and ensuring all JSON keys are properly handled by the backend's `flatten()` and `force_write()` functions in `report.py`.

[Files]
Detailed breakdown of files requiring changes:

- **backend/api/report.py** — Main file requiring fixes:
  - Update ALIASES dict to map ALL JSON field names to canonical field names
  - Update ARRAY_KEYS to include all array fields from JSON
  - Update PERCENTAGE_FIELDS to include all percentage fields
  - Update the `flatten()` function to handle nested structures correctly
  - Update the `critical` dict to cover all critical fields
  - Add handling for fields that exist in JSON but not in current ALIASES

- **backend/models/field_meta.py** — Add missing field registrations:
  - Register fields that appear in JSON but are not in FIELD_REGISTRY
  - Ensure all JSON fields have a corresponding registry entry

- **backend/templates/template.html** — Verify all {{field}} placeholders:
  - Confirm every {{field}} in the template has a corresponding field in the JSON or is properly mapped
  - Fix any hardcoded values that should be dynamic
  - Ensure array rendering works for all arrays

- **frontend/src/editor-pages/*.jsx** — Verify field names match:
  - Ensure fieldName attributes in FieldInput components match the JSON field names or ALIASES
  - Add any missing editor fields for JSON data that has no editor page
  - Ensure ArrayEditor components handle all array types

- **backend/pdf_generator.py** — Verify _build_context handles all fields:
  - Ensure all JSON fields are mapped in the context dict
  - Fix any field name mismatches between context keys and template placeholders
  - Ensure array normalization works for all array types

[Functions]
Detailed breakdown of function modifications:

- **backend/api/report.py → easy_way_import()** — Main import function:
  - Current ALIASES dict has ~60 entries; needs expansion to ~150+
  - Current ARRAY_KEYS has 15 entries; needs verification against JSON arrays
  - Current PERCENTAGE_FIELDS has ~12 entries; needs expansion
  - Current critical dict has ~30 entries; needs expansion
  - The `flatten()` function needs to handle the specific JSON nesting patterns

- **backend/api/report.py → flatten()** — Nested JSON flattener:
  - Must handle `financial_data.year_1.*` → `*_1` pattern
  - Must handle `swot_analysis.strengths` → `strengths` array
  - Must handle `related_concerns.branches` → `branches` array
  - Must handle `banking_information.*` or `banking.*` → banking fields

- **backend/pdf_generator.py → _build_context()** — Template context builder:
  - Must map all JSON fields to context keys
  - Must handle currency detection from country
  - Must handle boolean flag conversion
  - Must handle percentage formatting
  - Must handle status to label conversion

- **backend/pdf_generator.py → _render_mustache()** — Template renderer:
  - Must handle `{{#strengths.length}}` pattern for SWOT arrays
  - Must handle `{{#show_uae_fields}}` conditional blocks
  - Must handle `{{#extra_reg_fields}}` dynamic registration fields

[Classes]
No new classes needed. Existing classes are sufficient:
- `PDFGenerator` in `pdf_generator.py` — needs `_build_context()` updates
- `FullReport` in `report_schema.py` — already has all needed fields
- `ReportArrays` in `report_schema.py` — already has all needed arrays

[Dependencies]
No new dependencies needed. Existing dependencies are sufficient:
- FastAPI, SQLAlchemy, Pydantic (backend)
- React, Tailwind CSS (frontend)
- Playwright (PDF generation)
- chevron (Mustache templating)

[Testing]
Testing approach:
1. Import the user's JSON via the Easy Way import endpoint
2. Verify all 220+ fields are stored in the database
3. Open each frontend editor page and verify fields are populated
4. Generate PDF and verify all sections render correctly
5. Verify no "N/A" appears where data should be present
6. Verify arrays (shareholders, banking, news, SWOT, etc.) render correctly
7. Verify conditional sections (UAE fields, SWOT, etc.) show/hide correctly

[Implementation Order]
Single sentence describing the implementation sequence.

1. **Phase 1: Backend ALIASES & Field Mapping** — Expand the ALIASES dict in `report.py` to map all JSON field names to canonical field names. Add missing ARRAY_KEYS and PERCENTAGE_FIELDS.

2. **Phase 2: Backend FIELD_REGISTRY** — Add any missing fields to `field_meta.py` FIELD_REGISTRY that appear in JSON but aren't registered.

3. **Phase 3: Backend flatten() Logic** — Update the `flatten()` function to handle all JSON nesting patterns correctly (financial_data.year_1, swot_analysis, related_concerns, banking, etc.).

4. **Phase 4: PDF Generator Context** — Update `_build_context()` in `pdf_generator.py` to ensure all JSON fields are mapped to template context keys.

5. **Phase 5: Frontend Editor Pages** — Verify and fix fieldName attributes in all editor pages to match the canonical field names used by the backend.

6. **Phase 6: Template Verification** — Verify all {{field}} placeholders in `template.html` have corresponding context keys.

7. **Phase 7: End-to-End Testing** — Import the user's JSON, verify all fields populate in frontend editors, and generate PDF to verify rendering.