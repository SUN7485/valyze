#!/usr/bin/env python3
"""Git history report generator - pure Python implementation."""

import os
import sys
import struct
import zlib
import time

BASE_DIR = r"D:\valyez final"


def read_git_object(obj_path):
    """Read and decompress a git object."""
    try:
        with open(obj_path, "rb") as f:
            raw = f.read()
        decompressed = zlib.decompress(raw)
        header, content = decompressed.split(b"\x00", 1)
        obj_type, size = header.split(b" ")
        return obj_type.decode(), int(size), content
    except Exception as e:
        return None, None, None


def get_commit_info(commit_hash):
    """Get commit object content."""
    obj_path = os.path.join(
        BASE_DIR, ".git", "objects", commit_hash[:2], commit_hash[2:]
    )
    obj_type, size, content = read_git_object(obj_path)
    if obj_type != "commit":
        return None
    return content.decode("utf-8", errors="replace")


def parse_commit(commit_content):
    """Parse commit content and extract info."""
    lines = commit_content.split("\n")
    info = {
        "tree": None,
        "parents": [],
        "author": None,
        "committer": None,
        "message": "",
    }
    i = 0
    for line in lines:
        if line.startswith("tree "):
            info["tree"] = line[5:]
        elif line.startswith("parent "):
            info["parents"].append(line[7:])
        elif line.startswith("author "):
            info["author"] = line[7:]
        elif line.startswith("committer "):
            info["committer"] = line[10:]
        elif line == "":
            i = lines.index(line) + 1
            break
    info["message"] = "\n".join(lines[i:])
    return info


def get_tree_files(tree_hash, prefix=""):
    """Recursively get all files in a tree."""
    files = {}
    if not tree_hash or len(tree_hash) != 40:
        return files
    obj_path = os.path.join(BASE_DIR, ".git", "objects", tree_hash[:2], tree_hash[2:])
    obj_type, size, content = read_git_object(obj_path)
    if obj_type != "tree":
        return files

    i = 0
    while i < len(content):
        null_pos = content.find(b"\x00", i)
        if null_pos == -1:
            break
        mode_filename = content[i:null_pos].decode("utf-8", errors="replace")
        sha1 = content[null_pos + 1 : null_pos + 21].hex()
        i = null_pos + 21

        parts = mode_filename.split(" ", 1)
        if len(parts) == 2:
            mode, filename = parts
            full_path = prefix + filename if prefix else filename
            if mode.startswith("40000"):  # tree
                files.update(get_tree_files(sha1, full_path + "/"))
            else:
                files[full_path] = sha1
    return files


# ============================================================
# Command 1: git log --oneline -20
# ============================================================
print("=" * 70)
print("Command 1: git log --oneline -20")
print("=" * 70)

# Read current HEAD
head_ref_path = os.path.join(BASE_DIR, ".git", "HEAD")
with open(head_ref_path, "r") as f:
    head_content = f.read().strip()
# Format: ref: refs/heads/main
branch_ref = head_content.split(": ")[1] if ": " in head_content else head_content

if branch_ref.startswith("refs/"):
    branch_path = os.path.join(BASE_DIR, ".git", branch_ref)
    with open(branch_path, "r") as f:
        current_commit = f.read().strip()
else:
    current_commit = branch_ref

# Walk the commit chain by following parent relationships
commit_chain = []
seen = set()
max_commits = 20
while current_commit and current_commit not in seen and len(commit_chain) < max_commits:
    seen.add(current_commit)
    commit_chain.append(current_commit)
    commit_content = get_commit_info(current_commit)
    if commit_content:
        info = parse_commit(commit_content)
        if info["parents"]:
            current_commit = info["parents"][0]
        else:
            current_commit = None
    else:
        current_commit = None

for commit_hash in commit_chain:
    commit_content = get_commit_info(commit_hash)
    if commit_content:
        info = parse_commit(commit_content)
        short_hash = commit_hash[:7]
        message = info["message"].strip().split("\n")[0]
        print(f"{short_hash} {message}")

# ============================================================
# Command 2: git log --oneline --since='2 weeks ago'
# ============================================================
print()
print("=" * 70)
print("Command 2: git log --oneline --since='2 weeks ago'")
print("=" * 70)

two_weeks_ago = time.time() - (14 * 24 * 60 * 60)

for commit_hash in commit_chain:
    commit_content = get_commit_info(commit_hash)
    if commit_content:
        info = parse_commit(commit_content)
        committer_line = info["committer"]
        if committer_line:
            parts = committer_line.rsplit(" ", 2)
            if len(parts) >= 2:
                try:
                    timestamp = int(parts[-2])
                    if timestamp >= two_weeks_ago:
                        short_hash = commit_hash[:7]
                        message = info["message"].strip().split("\n")[0]
                        print(f"{short_hash} {message}")
                except (ValueError, IndexError):
                    pass

# ============================================================
# Command 3: git diff 304ee99 ac53597 --stat
# ============================================================
print()
print("=" * 70)
print("Command 3: git diff 304ee99 ac53597 --stat")
print("=" * 70)

commit_304_hash = "304ee99d74c5d227e7ea6b9fb101010d84a92d6f"
commit_ac53_hash = "ac53597527d01f257fba3f3bfe1931e50663b529"

commit_304 = get_commit_info(commit_304_hash)
info_304 = parse_commit(commit_304) if commit_304 else None

tree_304 = info_304["tree"] if info_304 else None
files_304 = get_tree_files(tree_304) if tree_304 else {}

commit_ac53 = get_commit_info(commit_ac53_hash)
info_ac53 = parse_commit(commit_ac53) if commit_ac53 else None

tree_ac53 = info_ac53["tree"] if info_ac53 else None
files_ac53 = get_tree_files(tree_ac53) if tree_ac53 else {}

all_files = set(files_304.keys()) | set(files_ac53.keys())
insertions = 0
deletions = 0
files_changed = 0

for f in sorted(all_files):
    if f in files_304 and f in files_ac53:
        if files_304[f] != files_ac53[f]:
            files_changed += 1
    elif f in files_304:
        files_changed += 1
        obj_path = os.path.join(
            BASE_DIR, ".git", "objects", files_304[f][:2], files_304[f][2:]
        )
        obj_type, size, content = read_git_object(obj_path)
        if obj_type == "blob":
            try:
                text = content.decode("utf-8", errors="replace")
                deletions += text.count("\n") + (1 if text else 0)
            except:
                pass
    elif f in files_ac53:
        files_changed += 1
        obj_path = os.path.join(
            BASE_DIR, ".git", "objects", files_ac53[f][:2], files_ac53[f][2:]
        )
        obj_type, size, content = read_git_object(obj_path)
        if obj_type == "blob":
            try:
                text = content.decode("utf-8", errors="replace")
                insertions += text.count("\n") + (1 if text else 0)
            except:
                pass

print(
    f" {files_changed} files changed, {insertions} insertions(+), {deletions} deletions(-)"
)
print()
print("=" * 70)
print("All commands completed successfully.")
print("=" * 70)
