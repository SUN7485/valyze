"""
Automatically add data-field="{{field_name}}" attributes to value container elements
that contain a simple mustache variable and don't already have a data-field.

This covers:
- divs with class containing 'value' (reg-value, info-value, metric-value, sc-row-value, value)
- td elements with only a mustache var text node
"""

import re
from pathlib import Path
from lxml import html

template_path = Path("backend/templates/template.html")
content = template_path.read_text(encoding="utf-8")

# Parse HTML
tree = html.fromstring(content)

count = 0
for elem in tree.iter():
    # Skip if already has data-field
    if elem.get("data-field") is not None:
        continue

    # Check element class for value-like containers
    cls = elem.get("class") or ""
    class_list = cls.split()
    is_value_container = any(
        c in class_list
        for c in ["reg-value", "info-value", "metric-value", "sc-row-value", "value"]
    )

    # Also catch td elements that contain only a single mustache variable
    is_td_var = (
        elem.tag == "td"
        and len(elem) == 0  # no child elements
        and (elem.text or "").strip().startswith("{{")
        and (elem.text or "").strip().endswith("}}")
    )

    if is_value_container or is_td_var:
        # Extract field name from text content
        text = (elem.text or "").strip()
        m = re.match(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", text)
        if m:
            field_name = m.group(1)
            elem.set("data-field", field_name)
            count += 1

# Write back
template_path.write_bytes(html.tostring(tree, encoding="utf-8", method="html"))
print(f"Added data-field to {count} elements")
