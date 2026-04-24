#!/usr/bin/env python
"""Verify template.html can be parsed by lxml"""

import traceback

try:
    from lxml import html

    tree = html.parse("backend/templates/template.html")
    print("HTML parse OK")
except Exception as e:
    print(f"ERROR: {e}")
    traceback.print_exc()
    exit(1)
