# Distribution Checklist

Use this checklist when preparing to share the project with someone else.

---

## Pre-Packaging (Clean Up First)

### Remove Temporary Files
- [ ] Delete `backend/outputs/*` (generated files)
- [ ] Delete `backend/uploads/*` (test uploads)
- [ ] Delete `tmp/` folder contents
- [ ] Delete `.ruff_cache/` folder
- [ ] Delete `node_modules/` (will be reinstalled by user)
- [ ] Delete `frontend/node_modules/`
- [ ] Delete `valyze-extractor/node_modules/`
- [ ] Delete `design-system/node_modules/`
- [ ] Delete `frontend/dist/`

### Clean Databases
- [ ] Keep `valyez.db` if you want to include sample data
- [ ] Or delete it if you want fresh install

### Environment Files
- [ ] Keep `.env` if it contains non-sensitive defaults
- [ ] Do NOT include real API keys or secrets
- [ ] Create `.env.example` with placeholder values

---

## What to Include in ZIP

### Required Files (ALWAYS include)
- [ ] `backend/` (entire folder)
- [ ] `frontend/` (entire folder)
- [ ] `valyze-extractor/` (entire folder)
- [ ] `design-system/` (entire folder)
- [ ] `README.md`
- [ ] `startall.bat` / `startall.sh`
- [ ] `startbackend.bat` / `startbackend.sh`
- [ ] `install.bat` / `install.sh`

### Optional Files
- [ ] `docker-compose.yml` (if using Docker)
- [ ] `valyez.db` (if includes sample data)
- [ ] `system_required_fields.md`
- [ ] `test_data.json`
- [ ] `FINAL_BUG_FIX_SUMMARY.md`

---

## Files to EXCLUDE from ZIP

| File/Folder | Reason |
|-------------|--------|
| `node_modules/` | Will be reinstalled |
| `.venv/` | Python venv - user creates their own |
| `__pycache__/` | Python bytecode cache |
| `.ruff_cache/` | Linter cache |
| `*.log` | Log files |
| `outputs/` | Generated files |
| `uploads/` | Test uploads |
| `dist/` | Build output |
| `.vscode/` | Editor settings |
| `.git/` | Git history (if any) |

---

## Instructions for Recipient

Include this in your communication:

```
INSTRUCTIONS FOR SETUP:

1. Install Prerequisites:
   - Python 3.12+ (Windows) / Python 3.10+ (macOS)
   - Node.js 18+

2. Windows:
   - Double-click install.bat
   - Double-click startall.bat
   - Open http://localhost:1573

3. macOS:
   - chmod +x *.sh
   - ./install.sh
   - ./startall.sh
   - Open http://localhost:1573
```

---

## Optional: Create a Fresh Database

To include empty database:
```bash
# This deletes all data - use carefully
rm valyez.db
# The system will create new one on first run
```

---

## Verification Before Sharing

- [ ] ZIP file size is reasonable (<500MB without node_modules)
- [ ] All scripts have correct line endings (LF for macOS, CRLF for Windows)
- [ ] No private keys or credentials in code
- [ ] README is up to date
- [ ] Tested that install script works on fresh machine

---

## One-Click Package Command (PowerShell)

```powershell
# Windows - Run in project root
Compress-Archive -Path "backend","frontend","valyze-extractor","design-system","README.md","startall.bat","startall.sh","install.bat","install.sh","startbackend.bat","startbackend.sh" -DestinationPath "valyez-dist.zip" -Force
```

---

## One-Click Package Command (macOS)

```bash
# macOS - Run in project root
zip -r valyez-dist.zip backend frontend valyze-extractor design-system README.md startall.bat startall.sh install.bat install.sh startbackend.bat startbackend.sh
```