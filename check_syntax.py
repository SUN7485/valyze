import py_compile
import sys

files = [
    "backend/utils/visibility.py",
    "backend/pdf_generator.py",
]

for f in files:
    try:
        py_compile.compile(f, doraise=True)
        print(f"OK: {f}")
    except py_compile.PyCompileError as e:
        print(f"ERROR in {f}:")
        print(f"  {e.msg} at line {e.lineno or 'unknown'}")
    except Exception as e:
        print(f"ERROR in {f}: {e}")
