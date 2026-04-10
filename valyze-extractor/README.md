# Valyze Credit Intelligence Extractor

A React application for extracting structured credit intelligence data from various document formats using Google Gemini AI.

## Setup Instructions

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Docker Instructions

To run with Docker Compose:

```bash
docker compose up --build
```

The application will be available at `http://localhost:3000`

## Getting a Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key and add it to your `.env` file

## Environment Configuration

Create a `.env` file in the root directory with your Gemini API key:

```
VITE_GEMINI_KEY=your_gemini_api_key_here
```

**Important**: Never commit the `.env` file to git. The `.env` file is already included in `.gitignore` to prevent accidental commits.

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
