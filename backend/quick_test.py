#!/usr/bin/env python
import traceback

try:
    from utils.visibility import is_field_empty

    print("Import OK")
    print("Test values:")
    print("  None:", is_field_empty(None))
    print("  '':", is_field_empty(""))
    print("  'N/A':", is_field_empty("N/A"))
    print("  'hello':", is_field_empty("hello"))
except Exception as e:
    print("ERROR:", e)
    traceback.print_exc()
