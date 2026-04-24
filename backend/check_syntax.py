import ast
import sys
from pathlib import Path

api_dir = Path("D:/valyez final/backend/api")
files = list(api_dir.glob("*.py"))
errors = []

for f in files:
    # Skip backup files if desired
    if "backup" in f.name or "clean" in f.name:
        continue
    try:
        content = f.read_text(encoding="utf-8")
        ast.parse(content)
        print(f"OK {f.name}")
    except SyntaxError as e:
        errors.append((f.name, e.msg, e.lineno))
        print(f"ERR {f.name}: {e.msg} at line {e.lineno}")

if errors:
    print("\n=== SYNTAX ERRORS FOUND ===")
    for fname, msg, ln in errors:
        print(f"  {fname} line {ln}: {msg}")
    sys.exit(1)
else:
    print("\nAll syntax OK!")
