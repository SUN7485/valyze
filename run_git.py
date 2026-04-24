import os
import sys
import subprocess
import time

# This script runs git commands using subprocess
# Run it with: python run_git.py

os.chdir(r"D:\valyez final")

print("=" * 70)
print("Command 1: git log --oneline -20")
print("=" * 70)
result = subprocess.run(
    ["git", "log", "--oneline", "-20"], capture_output=True, text=True, timeout=30
)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

print("\n" + "=" * 70)
print("Command 2: git log --oneline --since='2 weeks ago'")
print("=" * 70)
result = subprocess.run(
    ["git", "log", "--oneline", "--since=2 weeks ago"],
    capture_output=True,
    text=True,
    timeout=30,
)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

print("\n" + "=" * 70)
print("Command 3: git diff 304ee99 ac53597 --stat")
print("=" * 70)
result = subprocess.run(
    ["git", "diff", "304ee99", "ac53597", "--stat"],
    capture_output=True,
    text=True,
    timeout=30,
)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
