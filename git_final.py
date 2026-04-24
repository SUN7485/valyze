import subprocess
import sys
import os

# Change to the target directory
os.chdir(r"D:\valyez final")

# Test git --version
result = subprocess.run(["git", "--version"], capture_output=True, text=True)
print(result.stdout)

# Command 1
print("=" * 70)
print("Command 1: git log --oneline -20")
print("=" * 70)
result = subprocess.run(
    ["git", "log", "--oneline", "-20"], capture_output=True, text=True, timeout=120
)
print(result.stdout)

# Command 2
print("=" * 70)
print('Command 2: git log --oneline --since="2 weeks ago"')
print("=" * 70)
result = subprocess.run(
    ["git", "log", "--oneline", "--since=2 weeks ago"],
    capture_output=True,
    text=True,
    timeout=120,
)
print(result.stdout)

# Command 3
print("=" * 70)
print("Command 3: git diff 304ee99 ac53597 --stat")
print("=" * 70)
result = subprocess.run(
    ["git", "diff", "304ee99", "ac53597", "--stat"],
    capture_output=True,
    text=True,
    timeout=120,
)
print(result.stdout)

print("Done")
