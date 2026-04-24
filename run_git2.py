#!/usr/bin/env python3
# Direct execution script for git commands
import subprocess
import sys
import os

os.chdir(r"D:\valyez final")

# Command 1: git log --oneline -20
print("=" * 70)
print("Command 1: git log --oneline -20")
print("=" * 70)
result = subprocess.run(
    [
        sys.executable,
        "-c",
        'import subprocess; r=subprocess.run(["git","log","--oneline","-20"],capture_output=True,text=True,cwd=r"D:\\valyez final");print(r.stdout)',
    ],
    capture_output=True,
    text=True,
    timeout=30,
)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

# Command 2: git log --since="2 weeks ago" --oneline
print("\n" + "=" * 70)
print("Command 2: git log --oneline --since='2 weeks ago'")
print("=" * 70)
result = subprocess.run(
    [
        sys.executable,
        "-c",
        'import subprocess; r=subprocess.run(["git","log","--oneline","--since=2 weeks ago"],capture_output=True,text=True,cwd=r"D:\\valyez final");print(r.stdout)',
    ],
    capture_output=True,
    text=True,
    timeout=30,
)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)

# Command 3: git diff 304ee99 ac53597 --stat
print("\n" + "=" * 70)
print("Command 3: git diff 304ee99 ac53597 --stat")
print("=" * 70)
result = subprocess.run(
    [
        sys.executable,
        "-c",
        'import subprocess; r=subprocess.run(["git","diff","304ee99","ac53597","--stat"],capture_output=True,text=True,cwd=r"D:\\valyez final");print(r.stdout)',
    ],
    capture_output=True,
    text=True,
    timeout=30,
)
print(result.stdout)
if result.stderr:
    print("STDERR:", result.stderr)
