# =============================================================================
# Valyze Credit Report Backend — Dockerfile for Render (Free Tier)
# =============================================================================
# Multi-stage build for smaller final image
# Uses Playwright for PDF generation (no Gotenberg needed)
# =============================================================================

FROM python:3.11-slim AS base

# Prevent Python from writing .pyc files and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Tesseract OCR
    tesseract-ocr \
    tesseract-ocr-eng \
    # Poppler (for pdf2image)
    poppler-utils \
    # Ghostscript (for camelot-py)
    ghostscript \
    # Chromium (for Playwright PDF generation)
    chromium \
    # Build deps for Python packages
    build-essential \
    libpq-dev \
    # Cleanup
    && rm -rf /var/lib/apt/lists/*

# Set Tesseract path
ENV TESSERACT_CMD=/usr/bin/tesseract

# Set Chromium path for Playwright
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers (Chromium only for PDF generation)
RUN playwright install chromium || echo "Playwright install skipped - will use system chromium"

# Copy application code
COPY . .

# Create required directories
RUN mkdir -p uploads outputs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]