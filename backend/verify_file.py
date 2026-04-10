with open('api/report.py', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')

# Search for the specific function
for i, line in enumerate(lines, 1):
    if 'async def easy_way_import' in line:
        start_line = i
        print(f"Function starts at line {start_line}")
        
        # Find function boundaries
        indent_level = line.count(' ')
        end_line = start_line
        while end_line < len(lines):
            current_indent = len(lines[end_line - 1]) - len(lines[end_line - 1].lstrip())
            if end_line > start_line and current_indent <= indent_level and lines[end_line - 1].strip():
                break
            end_line += 1
        
        print(f"Function ends around line {end_line - 1}")
        
        # Show lines around line 406
        print("\n=== Lines around line 406 ===")
        for j in range(400, 412):
            if start_line <= j <= end_line - 1:
                print(f"{j:4d}: {lines[j-1]}")

        break

# Search specifically for currency-related lines
print("\n=== Currency-related lines ===")
for i, line in enumerate(lines, 1):
    if 'currency' in line:
        print(f"{i:4d}: {line}")
