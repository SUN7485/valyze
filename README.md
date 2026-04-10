# Valyze Credit Report System

A full-stack credit report analysis and PDF extraction system with AI-powered features.

## Quick Start

### Windows
1. Run `install.bat` (as Administrator)
2. Run `startall.bat`
3. Open http://localhost:1573

### macOS
```bash
chmod +x install.sh startall.sh startbackend.sh
./install.sh
./startall.sh
```
Then open http://localhost:1573

---

## Installation Notes

### External Dependencies (must be installed separately)

| Tool | Windows | macOS | Purpose |
|------|---------|-------|---------|
| Python 3.12 | python.org | `brew install python@3.12` | Backend runtime |
| Node.js 18+ | nodejs.org | `brew install node` | Frontend runtime |
| Ghostscript | [gs.de](https://www.ghostscript.com/) | `brew install ghostscript` | PDF processing |
| Tesseract OCR | [UB-Mannheim](https://github.com/UB-Mannheim/tesseract/wiki) | `brew install tesseract` | OCR for scanned PDFs |
| Poppler | Included in GS | `brew install poppler` | PDF rendering |

---

## System Requirements

### Windows
- Python 3.12+
- Node.js 18+
- 8GB RAM minimum
- Windows 10/11

### macOS
- Python 3.10+
- Node.js 18+
- 8GB RAM minimum
- macOS 10.15+

---

## Project Structure

```
valyez-final/
├── backend/              # FastAPI backend
│   ├── main.py          # API entry point
│   ├── api/             # API routes
│   ├── models/          # Database models
│   ├── engines/         # PDF processing engines
│   ├── uploads/         # Uploaded files
│   └── outputs/         # Generated reports
├── frontend/             # React + Vite frontend
│   ├── src/             # React components
│   └── dist/            # Production build
├── valyze-extractor/    # Standalone PDF extractor
├── design-system/       # Shared design components
├── startall.bat         # Windows - Start all services
├── startall.sh          # macOS - Start all services
├── install.bat          # Windows - Install dependencies
└── install.sh           # macOS - Install dependencies
```

---

## Services

| Service | Port | URL |
|---------|------|-----|
| Backend API | 8000 | http://localhost:8000 |
| Frontend | 1573 | http://localhost:1573 |
| Valyze Extractor | 5174 | http://localhost:5174 |

---

## Optional: AI Features

The system works without AI, but for enhanced analysis:

1. Download **LM Studio** from https://lmstudio.ai/
2. Download and load **Qwen2.5 7B** (or any Llama-compatible model)
3. The backend will automatically use the local AI endpoint

---

## Troubleshooting

### Port Already in Use
If you get port errors, change the port in:
- `backend/main.py` - change `--port 8000`
- `frontend/vite.config.js` - change port 1573
- `valyze-extractor/vite.config.js` - change port 5174

### Permission Denied (macOS)
```bash
chmod +x *.sh
```

### Module Not Found
Reinstall dependencies:
```bash
# Windows
install.bat

# macOS
./install.sh
```

---

## Built With

- **Backend**: FastAPI, SQLAlchemy, Playwright, OpenCV
- **Frontend**: React 19, Vite, Tailwind CSS
- **PDF Processing**: pypdf, pdfplumber, pytesseract

---

## License

Proprietary - All rights reserved