# Valyze Credit Intelligence Extractor

A React application for extracting structured credit intelligence data from various document formats using Anthropic Claude AI.

## Quick Start

```bash
npm install
npm run dev:with-proxy
```

Two servers start:
- Proxy server: `http://localhost:3001`
- App: `http://localhost:5173`

## Manual Start (if preferred)

Terminal 1:
```bash
npm run server
```

Terminal 2:
```bash
npm run dev
```

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