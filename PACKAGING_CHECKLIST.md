# Packaging Checklist for Distribution

## Files to Include in ZIP

### Essential (Always Include)
```
valyez-final/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── api/
│   ├── models/
│   ├── engines/
│   ├── templates/
│   ├── database/
│   ├── .env                    # ⚠️ Check for secrets before distributing
│   └── uploads/                # Can be empty
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── src/
│   └── public/
├── valyze-extractor/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
├── design-system/
├── startall.bat
├── startall.sh
├── startbackend.sh
├── startbackend.bat
├── install.bat
├── install.sh
└── README.md
```

### Files to EXCLUDE from ZIP (can regenerate)
- `node_modules/` - Regenerate with `npm install`
- `__pycache__/` - Python cache
- `.venv/` - Virtual environment
- `*.db` files - Databases (SQLite)
- `backend/outputs/` - Generated files
- `backend/uploads/` - Uploaded files
- `backend/chroma_db/` - Vector database
- `dist/` - Frontend build output

## Pre-ZIP Checklist

### 1. Clean Up Generated Files
```bash
# Delete cache and generated files
rm -rf backend/__pycache__ backend/*/__pycache__
rm -rf backend/outputs/* backend/uploads/*
rm -rf backend/chroma_db/*
rm -rf frontend/dist
rm -rf .ruff_cache
```

### 2. Review Sensitive Files
- [ ] Check `backend/.env` for API keys/secrets
- [ ] Check any hardcoded credentials in code
- [ ] Remove `.env` or replace with `.env.example`

### 3. Verify Scripts Have Execute Permission (macOS)
```bash
chmod +x install.sh startall.sh startbackend.sh
```

### 4. Test the ZIP Contents
- Extract ZIP to a fresh location
- Run installation script
- Start services
- Verify all 3 ports work

## What Recipient Needs to Do

### Windows
1. Extract ZIP
2. Run `install.bat`
3. Run `startall.bat`
4. Open http://localhost:1573

### macOS
1. Extract ZIP
2. Run `./install.sh`
3. Run `./startall.sh`
4. Open http://localhost:1573

## Optional: Include Sample Data
If you want to include test files:
- Add dummy PDF to `backend/uploads/` for testing
- Document in README that these are samples

## Version Info to Update
Before packaging, update version in:
- `frontend/package.json`
- `README.md` (if version mentioned)