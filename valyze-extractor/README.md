# Valyze Credit Intelligence Extractor

Deprecated standalone extractor. The extractor now lives inside the main frontend at `frontend/src/pages/ExtractorPage.jsx` and is accessed through `/extractor`.

## Legacy Quick Start

```bash
npm install
npm run dev
```

App: `http://localhost:5173`

Use `VITE_PROXY_URL=http://localhost:8000/api/proxy` for local backend proxy.

## Getting an Anthropic API Key

1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
2. Create a new API key (starts with `sk-ant-`)
3. Enter it in the app UI when prompted

## Features

- Upload up to 5 files (PDF, images, Word documents, Excel, CSV, TXT)
- Drag and drop file upload support
- Dark theme interface
- Real-time processing status with 4 stages
- Comprehensive credit intelligence extraction
- Multiple tabbed views (Summary, Financials, Risk, News, Raw JSON)
- Export functionality (Copy JSON, Download JSON)

## File Formats Supported

- PDF documents
- Images (JPG, JPEG, PNG)
- Word documents (.docx)
- Excel spreadsheets (.xlsx)
- CSV files

## Docker

```bash
docker compose up --build
```

App available at `http://localhost:3000`