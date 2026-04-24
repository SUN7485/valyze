import sys
import traceback

files = [
    "backend/utils/visibility.py",
    "backend/pdf_generator.py",
]

for filepath in files:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            source = f.read()
        compile(source, filepath, "exec")
        print(f"OK: {filepath}")
    except SyntaxError as e:
        print(f"SYNTAX ERROR in {filepath}:")
        print(f"  Line {e.lineno}: {e.msg}")
        if e.text:
            print(f"  Code: {e.text.strip()}")
        print(f"  Offset: {e.offset}")
    except Exception as e:
        print(f"ERROR in {filepath}: {type(e).__name__}: {e}")
        traceback.print_exc()
