# Valyze Credit Report System — Team Setup Guide

This document provides step-by-step instructions for setting up the Valyze Credit Report system on your local machine.

## Prerequisites

Before installation, install the following tools:

### Windows
| Tool | Version | Download |
|------|---------|----------|
| Python | 3.12+ | https://www.python.org/downloads/ |
| Node.js | 18+ | https://nodejs.org/ |
| Ghostscript | Latest | https://ghostscript.com/ |
| Tesseract OCR | Latest | https://github.com/UB-Mannheim/tesseract/wiki |

### macOS
| Tool | Version | Install Command |
|------|---------|-----------------|
| Python | 3.12+ | `brew install python@3.12` |
| Node.js | 18+ | `brew install node` |
| Ghostscript | Latest | `brew install ghostscript` |
| Tesseract OCR | Latest | `brew install tesseract` |

## Installation

### Windows
1. Right-click `install.bat` and run as **Administrator**
2. Follow the on-screen instructions
3. When complete, run `startall.bat`
4. Open browser to **http://localhost:1573**

### macOS
```bash
# Make scripts executable
chmod +x install.sh startall.sh startbackend.sh startfrontend.sh stop-all.sh

# Install all dependencies
./install.sh

# Start all services
./startall.sh

# Open browser to http://localhost:1573
```

## Available Services

| Service | Port | URL |
|---------|------|-----|
| Backend API | 8000 | http://localhost:8000 |
| Frontend Application | 1573 | http://localhost:1573 |
| Valyze Extractor | 5174 | http://localhost:5174 |

## Starting/Stopping Services

### Windows
| Command | Action |
|---------|--------|
| `startall.bat` | Start all services |
| `stop-all.bat` | Stop all services |
| `startbackend.bat` | Start only backend |
| `startfrontend.bat` | Start only frontend |

### macOS
| Command | Action |
|---------|--------|
| `./startall.sh` | Start all services |
| `./stop-all.sh` | Stop all services |
| `./startbackend.sh` | Start only backend |
| `./startfrontend.sh` | Start only frontend (via npm run dev in frontend dir) |

## Environment Configuration

The system uses environment variables for configuration:

### Backend Configuration (`.env` in project root)
```env
# Supabase Configuration (required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# LM Studio for AI Features (optional)
LM_STUDIO_URL=http://localhost:1234/v1
LM_STUDIO_MODEL=qwen/qwen3.5-9b

# Database Options
DATABASE_URL=sqlite+aiosqlite:///./valyez.db

# Upload Settings
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=100

# RAG Settings
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
TOP_K_CHUNKS=3

# Gotenberg for PDF Conversion
GOTENBERG_URL=http://localhost:3000

# Tesseract OCR Path
# Windows: C:/Program Files/Tesseract-OCR/tesseract.exe
# macOS: /opt/homebrew/bin/tesseract
TESSERACT_CMD=

# Environment
ENV=development
LOG_LEVEL=INFO
```

### Frontend Configuration (`.env` in frontend directory)
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_BASE_URL=http://localhost:8000
```

### Valyze Extractor Configuration (`.env` in valyze-extractor directory)
```env
VITE_ANTHROPIC_API_KEY=your-api-key-here
```

## Docker Setup (Optional)

If using Docker for gotenberg (PDF conversion):
```bash
docker-compose up -d
```

## Troubleshooting

### Port Already in Use
If ports are occupied:
1. Find the process: `netstat -ano | findstr :8000` (Windows) or `lsof -i :8000` (macOS)
2. Kill the process or change ports in:
   - `backend/main.py` — change `--port 8000`
   - `frontend/vite.config.js` — change `port: 1573`
   - `valyze-extractor/vite.config.js` — change `port: 5174`

### Module Not Found
Reinstall dependencies:
```bash
# Windows
install.bat

# macOS
./install.sh
```

### Permission Denied (macOS)
```bash
chmod +x *.sh
```

### OCR Not Working
Ensure Tesseract OCR is installed and the path is set in `.env`:
```env
TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe  # Windows
TESSERACT_CMD=/opt/homebrew/bin/tesseract                      # macOS
```

## Directory Structure
```
valyez-credit/
├── backend/                  # FastAPI backend
│   ├── api/                 # API routes
│   ├── database/            # Database models and setup
│   ├── engines/             # PDF processing engines
│   ├── models/              # Data models
│   ├── outputs/             # Generated reports (auto-created)
│   ├── services/            # Business logic
│   ├── supabase/            # Supabase migrations
│   ├── templates/           # Report templates
│   ├── uploads/             # File uploads (auto-created)
│   ├── utils/               # Utility functions
│   ├── main.py              # Application entry point
│   └── .env.example         # Environment variables template
├── frontend/                 # React + Vite frontend
│   ├── src/                 # React components
│   ├── .env.example         # Environment variables template
│   └── package.json
├── valyze-extractor/         # PDF extraction tool
│   ├── .env.example         # Environment variables template
│   └── package.json
├── design-system/           # Shared design components
├── startall.bat             # Windows - Start all services
├── startall.sh              # macOS - Start all services
├── stop-all.bat             # Windows - Stop all services
├── stop-all.sh              # macOS - Stop all services
├── startbackend.bat         # Windows - Start backend only
├── startbackend.sh          # macOS - Start backend only
├── startfrontend.bat        # Windows - Start frontend only
├── install.bat              # Windows - Install dependencies
├── install.sh               # macOS - Install dependencies
├── docker-compose.yml       # Docker services
├── .gitignore               # Git ignore rules
├── README.md                # Project readme
├── ARCHITECTURE.md          # Architecture documentation
├── DEPLOYMENT_GUIDE.md      # Deployment guide
└── DISTRIBUTION_CHECKLIST.md # Distribution preparation checklist
```

## AI Features (Optional)

To enable AI-powered analysis:
1. Download [LM Studio](https://lmstudio.ai/)
2. Download and load **Qwen2.5 7B** (or any Llama-compatible model)
3. Set `LM_STUDIO_URL` and `LM_STUDIO_MODEL` in `.env`
4. The backend will automatically use the local AI endpoint

## Team Communication

- **Frontend**: `http://localhost:1573` — Main user interface
- **Backend**: `http://localhost:8000` — API endpoints
- **Docs**: `http://localhost:8000/docs` — API documentation (Swagger UI)