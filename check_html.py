import sys

try:
    import lxml.html

    lxml.html.parse("backend/templates/template.html")
    print("HTML parse OK")
    sys.exit(0)
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
