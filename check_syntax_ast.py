import ast

files = [
    "backend/utils/visibility.py",
    "backend/pdf_generator.py",
]

for filepath in files:
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            source = f.read()
        ast.parse(source, filepath)
        print(f"OK: {filepath}")
    except SyntaxError as e:
        print(f"ERROR in {filepath}:")
        print(f"  Line {e.lineno}: {e.msg}")
        print(f"  Text: {e.text.strip() if e.text else 'N/A'}")
    except Exception as e:
        print(f"ERROR in {filepath}: {e}")
