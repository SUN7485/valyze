import subprocess
import sys

# Get current commit
result = subprocess.run(
    ["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=r"D:\valyez final"
)
print(f"Current commit: {result.stdout.strip()}")

# Get last 20 commits
result = subprocess.run(
    ["git", "log", "--oneline", "-20"],
    capture_output=True,
    text=True,
    cwd=r"D:\valyez final",
)
print("\nLast 20 commits:")
print(result.stdout)

# Get remote URL
result = subprocess.run(
    ["git", "remote", "-v"], capture_output=True, text=True, cwd=r"D:\valyez final"
)
print("\nRemote:")
print(result.stdout)

# Get commits from 2 weeks ago
result = subprocess.run(
    ["git", "log", "--oneline", "--since=2 weeks ago"],
    capture_output=True,
    text=True,
    cwd=r"D:\valyez final",
)
print("\nCommits from 2 weeks ago:")
print(result.stdout)
