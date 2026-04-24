#!/usr/bin/env python3
import os
import sys
import struct
import zlib


def read_git_object(obj_path):
    try:
        with open(obj_path, "rb") as f:
            raw = f.read()
        decompressed = zlib.decompress(raw)
        # Format: type size\x00content
        header, content = decompressed.split(b"\x00", 1)
        obj_type, size = header.split(b" ")
        return obj_type.decode(), int(size), content
    except Exception as e:
        return None, None, None


def get_commit_info(commit_hash):
    obj_path = f"D:\\valyez final\\.git\\objects\\{commit_hash[:2]}\\{commit_hash[2:]}"
    obj_type, size, content = read_git_object(obj_path)
    if obj_type != "commit":
        return None
    return content.decode("utf-8", errors="replace")


def parse_commit(commit_content):
    """Parse commit content and extract info"""
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


# Read from the reflog to get the list like git log does
reflog_path = "D:\\valyez final\\.git\\logs\\HEAD"
with open(reflog_path, "r") as f:
    reflog_lines = f.readlines()

# Parse reflog to get the chain of commits
# We need to find the actual parent-child relationships
# The reflog shows: old_value new_value message

print("=" * 70)
print("Command 1: git log --oneline -20")
print("=" * 70)

# We can reconstruct the order from the reflog
# Find all commits mentioned in the reflog in order
commits_visited = []
for line in reflog_lines:
    parts = line.strip().split()
    if len(parts) >= 3:
        old_hash = parts[0]
        new_hash = parts[1]
        if (
            new_hash != "0000000000000000000000000000000000000000"
            and new_hash not in commits_visited
        ):
            commits_visited.append(new_hash)
        if (
            old_hash != "0000000000000000000000000000000000000000"
            and old_hash not in commits_visited
        ):
            commits_visited.append(old_hash)

# Now let's verify these are actual commits and build the parent chain properly
# We need to start from HEAD and follow parents
head_ref = "D:\\valyez final\\.git\\HEAD"
with open(head_ref, "r") as f:
    head_content = f.read().strip()
# Should be: ref: refs/heads/main
branch_ref = head_content.split(": ")[1]
branch_path = f"D:\\valyez final\\.git\\{branch_ref}"
with open(branch_path, "r") as f:
    current_commit = f.read().strip()

print(f"Current HEAD: {current_commit}")
print()

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
            current_commit = info["parents"][0]  # Follow first parent
        else:
            current_commit = None
    else:
        current_commit = None

# Now display in git log --oneline format
for commit_hash in commit_chain:
    commit_content = get_commit_info(commit_hash)
    if commit_content:
        info = parse_commit(commit_content)
        # Get short hash and first line of message
        short_hash = commit_hash[:7]
        message = info["message"].strip().split("\n")[0]
        print(f"{short_hash} {message}")

print()
print("=" * 70)
print("Command 2: git log --oneline --since='2 weeks ago'")
print("=" * 70)

import time

# Two weeks ago timestamp
two_weeks_ago = time.time() - (14 * 24 * 60 * 60)

for commit_hash in commit_chain:
    commit_content = get_commit_info(commit_hash)
    if commit_content:
        info = parse_commit(commit_content)
        # Extract timestamp from committer line
        # Format: author name <email> timestamp timezone
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

print()
print("=" * 70)
print("Command 3: git diff 304ee99 ac53597 --stat")
print("=" * 70)

# For diff --stat, we need to compare the trees
# Get the tree for 304ee99
commit_304 = get_commit_info("304ee99d74c5d227e7ea6b9fb101010d84a92d6f")
info_304 = parse_commit(commit_304) if commit_304 else None


def get_tree_files(tree_hash, prefix=""):
    """Recursively get all files in a tree"""
    files = {}
    if not tree_hash or len(tree_hash) != 40:
        return files
    obj_path = f"D:\\valyez final\\.git\\objects\\{tree_hash[:2]}\\{tree_hash[2:]}"
    obj_type, size, content = read_git_object(obj_path)
    if obj_type != "tree":
        return files

    i = 0
    while i < len(content):
        # Format: mode filename\0sha1 (20 bytes)
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


tree_304 = info_304["tree"] if info_304 else None
files_304 = get_tree_files(tree_304) if tree_304 else {}

commit_ac53 = get_commit_info("ac53597527d01f257fba3f3bfe1931e50663b529")
info_ac53 = parse_commit(commit_ac53) if commit_ac53 else None

tree_ac53 = info_ac53["tree"] if info_ac53 else None
files_ac53 = get_tree_files(tree_ac53) if tree_ac53 else {}

# Calculate diff stats
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
        # Count deletions
        obj_path = (
            f"D:\\valyez final\\.git\\objects\\{files_304[f][:2]}\\{files_304[f][2:]}"
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
        # Count insertions
        obj_path = (
            f"D:\\valyez final\\.git\\objects\\{files_ac53[f][:2]}\\{files_ac53[f][2:]}"
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
