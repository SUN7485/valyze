#!/usr/bin/env python3
"""Git report using os.popen as fallback."""

import os
import sys

os.chdir(r"D:\valyez final")


def run_cmd(cmd):
    try:
        result = os.popen(cmd).read()
        return result
    except Exception as e:
        return f"Error: {e}"


# Command 1
print("=" * 70)
print("Command 1: git log --oneline -20")
print("=" * 70)
print(run_cmd("git log --oneline -20"))

# Command 2
print("=" * 70)
print("Command 2: git log --oneline --since='2 weeks ago'")
print("=" * 70)
print(run_cmd('git log --oneline --since="2 weeks ago"'))

# Command 3
print("=" * 70)
print("Command 3: git diff 304ee99 ac53597 --stat")
print("=" * 70)
print(run_cmd("git diff 304ee99 ac53597 --stat"))
