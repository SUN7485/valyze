"""Run git commands directly without bash wrapper."""

import os
import sys
import subprocess

os.chdir(r"D:\valyez final")

print("=" * 70)
print("Command 1: git log --oneline -20")
print("=" * 70)
# Use Popen directly with longer timeout
proc = subprocess.Popen(
    ["git", "log", "--oneline", "-20"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
try:
    stdout, stderr = proc.communicate(timeout=120)
    print(stdout)
    if stderr:
        print("STDERR:", stderr)
except subprocess.TimeoutExpired:
    proc.kill()
    print("TIMEOUT")

print("\n" + "=" * 70)
print("Command 2: git log --oneline --since='2 weeks ago'")
print("=" * 70)
proc = subprocess.Popen(
    ["git", "log", "--oneline", "--since=2 weeks ago"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
try:
    stdout, stderr = proc.communicate(timeout=120)
    print(stdout)
    if stderr:
        print("STDERR:", stderr)
except subprocess.TimeoutExpired:
    proc.kill()
    print("TIMEOUT")

print("\n" + "=" * 70)
print("Command 3: git diff 304ee99 ac53597 --stat")
print("=" * 70)
proc = subprocess.Popen(
    ["git", "diff", "304ee99", "ac53597", "--stat"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
try:
    stdout, stderr = proc.communicate(timeout=120)
    print(stdout)
    if stderr:
        print("STDERR:", stderr)
except subprocess.TimeoutExpired:
    proc.kill()
    print("TIMEOUT")
