"""
File Handler forValyze Credit report.

Master router that detects file types, routes to the correct extractor,
detects language, and orchestrates multi-file processing.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from engines.ocr_extractor import OCRExtractor
from engines.pdf_extractor import PDFExtractor
from engines.word_extractor import WordExtractor


# Extension → file type mapping
_EXT_MAP: dict[str, str] = {
    ".pdf": "pdf",
    ".docx": "word",
    ".doc": "word",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".tiff": "image",
    ".tif": "image",
    ".bmp": "image",
}


class FileHandler:
    """Routes files to the correct extraction engine."""

    def __init__(self):
        self.pdf_extractor = PDFExtractor()
        self.word_extractor = WordExtractor()
        self.ocr_extractor = OCRExtractor()

    # ------------------------------------------------------------------
    # File type detection
    # ------------------------------------------------------------------

    def detect_file_type(self, file_path: Path) -> str:
        """Return the file type based on extension."""
        ext = file_path.suffix.lower()
        return _EXT_MAP.get(ext, "unknown")

    # ------------------------------------------------------------------
    # Main extraction entry point
    # ------------------------------------------------------------------

    def extract_text(self, file_path: Path) -> dict:
        """
        Extract text from any supported file.

        Returns a dict with keys:
          text, pages, language, file_type, tables, success, error
        """
        file_type = self.detect_file_type(file_path)
        print(f"[FILE] Detected type '{file_type}' for: {file_path.name}")

        if file_type == "unknown":
            return {
                "text": "",
                "pages": 0,
                "language": "english",
                "file_type": "unknown",
                "tables": [],
                "success": False,
                "error": f"Unsupported file type: {file_path.suffix}",
            }

        try:
            if file_type == "pdf":
                result = self.pdf_extractor.extract(file_path)
            elif file_type == "word":
                result = self.word_extractor.extract(file_path)
            elif file_type == "image":
                result = self.ocr_extractor.extract(file_path)
            else:
                result = {
                    "text": "",
                    "pages": 0,
                    "language": "english",
                    "file_type": file_type,
                    "tables": [],
                    "success": False,
                    "error": f"No extractor for type: {file_type}",
                }
        except Exception as e:
            print(f"[FILE] Extraction error for {file_path.name}: {e}")
            result = {
                "text": "",
                "pages": 0,
                "language": "english",
                "file_type": file_type,
                "tables": [],
                "success": False,
                "error": str(e),
            }

        # Detect language from extracted text
        if result.get("text"):
            result["language"] = self.detect_language(result["text"])

        return result

    # ------------------------------------------------------------------
    # Language detection
    # ------------------------------------------------------------------

    def detect_language(self, text: str) -> str:
        """
        Detect the language of the given text.

        Returns "arabic", "english", or "mixed".
        Uses Arabic character ratio first, then falls back to langdetect.
        """
        if not text or not text.strip():
            return "english"

        # Count Arabic characters (Unicode block 0600-06FF + FE70-FEFF)
        arabic_chars = len(re.findall(r"[\u0600-\u06FF\uFE70-\uFEFF]", text))
        total_alpha = len(re.findall(r"[a-zA-Z\u0600-\u06FF\uFE70-\uFEFF]", text))

        if total_alpha == 0:
            return "english"

        arabic_ratio = arabic_chars / total_alpha

        if arabic_ratio > 0.7:
            return "arabic"
        elif arabic_ratio > 0.3:
            return "mixed"
        elif arabic_ratio > 0.05:
            # Some Arabic present — double-check with langdetect
            try:
                from langdetect import detect
                lang = detect(text[:2000])
                if lang == "ar":
                    return "mixed"
            except Exception:
                pass
            return "mixed"
        else:
            return "english"

    # ------------------------------------------------------------------
    # Multi-file processing
    # ------------------------------------------------------------------

    def process_all_files(self, report_id: str, upload_dir: Path) -> list:
        """
        Process all files in uploads/{report_id}/.

        Returns a list of extraction result dicts, one per file.
        """
        report_dir = upload_dir / report_id

        if not report_dir.exists():
            print(f"[FILE] Upload directory not found: {report_dir}")
            return []

        results: list[dict] = []
        files = [
            f for f in report_dir.iterdir()
            if f.is_file() and f.name != ".gitkeep" and f.name != "chunks.json"
        ]

        if not files:
            print(f"[FILE] No files found in {report_dir}")
            return []

        print(f"[FILE] Found {len(files)} files to process")

        for i, file_path in enumerate(files, start=1):
            print(f"[FILE] Processing file {i}/{len(files)}: {file_path.name}")
            try:
                extraction = self.extract_text(file_path)
                extraction["filename"] = file_path.name
                results.append(extraction)
            except Exception as e:
                print(f"[FILE] FAILED on {file_path.name}: {e}")
                results.append({
                    "filename": file_path.name,
                    "text": "",
                    "pages": 0,
                    "language": "english",
                    "file_type": self.detect_file_type(file_path),
                    "tables": [],
                    "success": False,
                    "error": str(e),
                })

        return results
