"""
PDF Extractor forValyze Credit report.

Handles text-based, scanned, and mixed PDF files.
Uses PyMuPDF for text, camelot for tables, and OCR for scanned pages.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional
import warnings

import pypdf
from PIL import Image

from engines.ocr_extractor import OCRExtractor
from engines.pattern_engine import _to_western

# Suppress camelot warnings about image-based PDFs
warnings.filterwarnings(
    "ignore", 
    message=".*image-based.*",
    category=UserWarning
)


class PDFExtractor:
    """Extracts text and tables from PDF files."""

    def __init__(self):
        self.ocr = OCRExtractor()

    # ------------------------------------------------------------------
    # Main entry point
    # ------------------------------------------------------------------

    # OCR threshold: always OCR PDFs under this page count
    OCR_PAGE_THRESHOLD = 50
    
    def extract(self, file_path: Path) -> dict:
        """
        Extract text from PDF with intelligent OCR strategy.
        
        Strategy:
        1. Try text extraction first (pypdf)
        2. Analyze text quality and page count
        3. Use OCR only when necessary (scanned pages or poor text extraction)
        4. Merge results intelligently
        5. Enhanced table extraction for both text and OCR results
        """
        result = {
            "text": "",
            "pages": 0,
            "language": "english",
            "file_type": "pdf",
            "tables": [],
            "success": False,
            "error": None,
            "processing_time": 0,
            "ocr_used": False,
            "table_detection_methods": []
        }
        
        import time
        start_time = time.time()
        
        try:
            print(f"[PDF] Processing: {file_path.name}")
            print(f"[PDF] File size: {file_path.stat().st_size / (1024*1024):.1f}MB")

            # Step 1: Text extraction
            print("[PDF] Step 1: Text extraction...")
            text_result = self.extract_text_based(file_path)
            text = text_result.get("text", "")
            page_count = text_result.get("pages", 0)
            result["pages"] = page_count
            
            # Calculate text density for progress reporting
            avg_chars_per_page = len(text) / page_count if page_count > 0 else 0
            print(f"[PDF] Text extraction completed: {page_count} pages, "
                  f"{avg_chars_per_page:.1f} chars/page")
            
            # Step 2: Analyze if OCR is needed
            print("[PDF] Step 2: Analyzing OCR necessity...")
            use_ocr = self._should_use_ocr(text, page_count, file_path)
            
            # Step 3: Table extraction via camelot (better for Arabic PDFs)
            print("[PDF] Step 3: Table extraction...")
            tables = self.extract_tables_with_camelot(file_path)
            if tables:
                result["table_detection_methods"].append("camelot")
                print(f"[PDF] Camelot tables found: {len(tables)}")
            
            # Step 4: OCR if needed
            ocr_text = ""
            if use_ocr:
                print("[PDF] Step 4: OCR processing...")
                print(f"[PDF] Estimated OCR time: {page_count * 2:.0f}-{page_count * 5:.0f} seconds")
                
                ocr_result = self.extract_with_ocr(file_path)
                ocr_text = ocr_result.get("text", "")
                result["ocr_used"] = True
                
                # Smart merging: prefer OCR if it has significantly more content
                if len(ocr_text) > len(text) * 1.5:  # 50% more content threshold
                    print(f"[PDF] OCR has significantly more content "
                          f"({len(ocr_text)} vs {len(text)} chars)")
                    text = ocr_text
                elif ocr_text and len(ocr_text) > len(text) * 0.5:  # 50% threshold
                    # Merge both results, removing duplicates
                    text = self._merge_text_results(text, ocr_text)
                elif ocr_text:
                    # OCR has some content, append it
                    text = text + "\n\n--- OCR EXTRACTED ---\n\n" + ocr_text
            
            # Step 5: Detect language
            print("[PDF] Step 5: Language detection...")
            language = self.detect_language(text)
            
            # Step 6: Enhanced table extraction for Arabic content
            if language in ("arabic", "mixed"):
                print("[PDF] Step 6: Arabic table extraction...")
                arabic_tables = self.extract_arabic_tables_from_text(text)
                tables.extend(arabic_tables)
                if arabic_tables:
                    result["table_detection_methods"].append("arabic_text")
                    print(f"[PDF] Arabic tables from text: {len(arabic_tables)}")
            
            result["text"] = text
            result["tables"] = tables
            result["language"] = language
            result["success"] = True
            
            # Calculate processing time
            result["processing_time"] = time.time() - start_time
            
            print(f"[PDF] ✓ Processing completed successfully!")
            print(f"[PDF] Final: {len(text)} chars, {len(tables)} tables, "
                  f"lang={language}, OCR={result['ocr_used']}, "
                  f"time={result['processing_time']:.1f}s")
            
        except Exception as e:
            result["error"] = str(e)
            result["processing_time"] = time.time() - start_time
            print(f"[PDF] ✗ Extraction error: {e}")
            print(f"[PDF] Processing failed after {result['processing_time']:.1f}s")
        
        return result
    
    def _should_use_ocr(self, text: str, page_count: int, file_path: Path) -> bool:
        """Determine if OCR should be used based on text quality and file characteristics."""
        if page_count == 0:
            return False
        
        # Calculate text density
        avg_chars_per_page = len(text) / page_count
        
        # If very little text per page, likely scanned
        if avg_chars_per_page < 100:
            print(f"[PDF] Low text density ({avg_chars_per_page:.1f} chars/page) "
                  f"→ OCR recommended")
            return True
        
        # If PDF is small and has some text, still try OCR for completeness
        if page_count <= 20 and avg_chars_per_page < 500:
            print(f"[PDF] Small PDF with moderate text density "
                  f"({avg_chars_per_page:.1f} chars/page) → OCR for completeness")
            return True
        
        # Check file size - large files might be scanned
        try:
            file_size_mb = file_path.stat().st_size / (1024 * 1024)
            if file_size_mb > 5 and avg_chars_per_page < 1000:
                print(f"[PDF] Large file ({file_size_mb:.1f}MB) with low text density "
                      f"→ OCR recommended")
                return True
        except:
            pass
        
        # For larger PDFs, only use OCR if text extraction was very poor
        if page_count > self.OCR_PAGE_THRESHOLD and avg_chars_per_page < 50:
            print(f"[PDF] Large PDF with very poor text extraction "
                  f"({avg_chars_per_page:.1f} chars/page) → OCR needed")
            return True
        
        print(f"[PDF] Good text extraction ({avg_chars_per_page:.1f} chars/page) "
              f"→ skipping OCR")
        return False
    
    def _merge_text_results(self, text1: str, text2: str) -> str:
        """Merge two text results, removing duplicates and maintaining order."""
        if not text1 or not text2:
            return text1 or text2
        
        # Split into lines for deduplication
        lines1 = text1.split('\n')
        lines2 = text2.split('\n')
        
        # Remove empty lines and normalize whitespace
        lines1 = [line.strip() for line in lines1 if line.strip()]
        lines2 = [line.strip() for line in lines2 if line.strip()]
        
        # Create a set of normalized lines from first text for quick lookup
        seen_lines = set(lines1)
        
        # Add unique lines from second text
        merged_lines = list(lines1)
        for line in lines2:
            if line not in seen_lines:
                merged_lines.append(line)
                seen_lines.add(line)
        
        return '\n'.join(merged_lines)

    # ------------------------------------------------------------------
    # pypdf text extraction
    # ------------------------------------------------------------------

    def extract_with_pypdf(self, file_path: Path) -> tuple[str, int]:
        """Extract text from all pages using pypdf."""
        all_text: list[str] = []
        page_count = 0

        try:
            with open(file_path, "rb") as f:
                reader = pypdf.PdfReader(f)
                page_count = len(reader.pages)
                
                for page in reader.pages:
                    page_text = page.extract_text()
                    if page_text:
                        all_text.append(page_text)
                        
        except Exception as e:
            print(f"[PDF] pypdf error: {e}")

        return "\n\n".join(all_text), page_count

    # ------------------------------------------------------------------
    # Table extraction via pdfplumber
    # ------------------------------------------------------------------

    def extract_tables_with_pdfplumber(self, file_path: Path) -> list:
        """Extract all tables from the PDF using pdfplumber."""
        tables: list[dict] = []

        try:
            import pdfplumber

            with pdfplumber.open(str(file_path)) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    page_tables = page.extract_tables()
                    if not page_tables:
                        continue

                    for raw_table in page_tables:
                        if not raw_table or len(raw_table) < 2:
                            continue

                        # Clean None cells
                        cleaned = []
                        for row in raw_table:
                            cleaned.append([
                                (cell if cell is not None else "")
                                for cell in row
                            ])

                        # Skip tables with < 2 columns
                        if len(cleaned[0]) < 2:
                            continue

                        # First row as headers, rest as data rows
                        headers = cleaned[0]
                        rows = cleaned[1:]

                        tables.append({
                            "page": page_num,
                            "headers": headers,
                            "rows": rows,
                            "raw": cleaned,
                        })

        except ImportError:
            print("[PDF] pdfplumber not installed — skipping table extraction")
        except Exception as e:
            print(f"[PDF] Table extraction error: {e}")

        return tables

    # ------------------------------------------------------------------
    # Table extraction via camelot (better for Arabic PDFs)
    # ------------------------------------------------------------------

    def extract_tables_with_camelot(self, file_path: Path) -> list:
        """Extract all tables from the PDF using camelot (better for Arabic)."""
        tables: list[dict] = []

        try:
            import camelot

            # Try lattice mode first (tables with borders)
            try:
                camelot_tables = camelot.read_pdf(
                    str(file_path),
                    pages='all',
                    flavor='lattice',  # for bordered tables
                    copy_text=['v']    # copy text vertically
                )
                if camelot_tables.n > 0:
                    print(f"[PDF] Camelot lattice found {camelot_tables.n} tables")
                    tables.extend(self._convert_camelot_tables(camelot_tables))
                    return tables
            except Exception as e:
                print(f"[PDF] Camelot lattice failed: {e}")

            # Fall back to stream mode (tables without borders)
            try:
                camelot_tables = camelot.read_pdf(
                    str(file_path),
                    pages='all',
                    flavor='stream',
                    edge_tol=50,
                    row_tol=10
                )
                if camelot_tables.n > 0:
                    print(f"[PDF] Camelot stream found {camelot_tables.n} tables")
                    tables.extend(self._convert_camelot_tables(camelot_tables))
            except Exception as e:
                print(f"[PDF] Camelot stream failed: {e}")

        except ImportError:
            print("[PDF] camelot not installed — falling back to pdfplumber")
            return self.extract_tables_with_pdfplumber(file_path)
        except Exception as e:
            print(f"[PDF] Camelot extraction error: {e}")
            # Fall back to pdfplumber
            return self.extract_tables_with_pdfplumber(file_path)

        return tables

    def _convert_camelot_tables(self, camelot_tables) -> list:
        """Convert camelot table objects to our table dict format."""
        tables = []
        
        for i, table in enumerate(camelot_tables):
            try:
                # Get the dataframe
                df = table.df
                if df.empty or len(df) < 2 or len(df.columns) < 2:
                    continue
                
                # Convert to list format
                raw_data = df.values.tolist()
                headers = raw_data[0] if len(raw_data) > 0 else []
                rows = raw_data[1:] if len(raw_data) > 1 else []
                
                tables.append({
                    "page": table.page,
                    "headers": headers,
                    "rows": rows,
                    "raw": raw_data,
                    "source": "camelot"
                })
            except Exception as e:
                print(f"[PDF] Error converting camelot table {i}: {e}")
        
        return tables
    
    def detect_tables_in_scanned_pdf(self, file_path: Path) -> list:
        """Use computer vision to detect table structures in scanned PDFs."""
        tables = []
        
        try:
            import cv2
            import numpy as np
            from pdf2image import convert_from_path
            
            # Convert PDF to images
            images = convert_from_path(str(file_path), dpi=150)  # Lower DPI for faster processing
            
            for page_num, image in enumerate(images, start=1):
                try:
                    # Convert PIL to OpenCV
                    cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
                    
                    # Convert to grayscale
                    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
                    
                    # Enhance contrast
                    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
                    enhanced = clahe.apply(gray)
                    
                    # Detect horizontal and vertical lines
                    horizontal_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
                    vertical_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
                    
                    # Detect horizontal lines
                    horizontal_lines = cv2.morphologyEx(enhanced, cv2.MORPH_OPEN, horizontal_kernel)
                    # Detect vertical lines  
                    vertical_lines = cv2.morphologyEx(enhanced, cv2.MORPH_OPEN, vertical_kernel)
                    
                    # Combine lines to get table grid
                    table_grid = cv2.addWeighted(horizontal_lines, 0.5, vertical_lines, 0.5, 0)
                    
                    # Find contours of table cells
                    _, binary = cv2.threshold(table_grid, 50, 255, cv2.THRESH_BINARY)
                    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    
                    # Filter contours to find table-like structures
                    table_contours = []
                    for contour in contours:
                        x, y, w, h = cv2.boundingRect(contour)
                        aspect_ratio = w / h if h > 0 else 0
                        area = cv2.contourArea(contour)
                        
                        # Look for rectangular shapes that could be table cells
                        if area > 1000 and 0.1 < aspect_ratio < 10:
                            table_contours.append(contour)
                    
                    if len(table_contours) > 5:  # Likely a table if many cells detected
                        print(f"[PDF] CV detected table structure on page {page_num}")
                        
                        # Extract text from the table area using OCR
                        table_text = self._extract_text_from_table_area(cv_image, table_contours)
                        if table_text:
                            tables.append({
                                "page": page_num,
                                "headers": [],  # Will be parsed from text
                                "rows": self._parse_table_text(table_text),
                                "raw": table_text,
                                "source": "cv_detection"
                            })
                
                except Exception as e:
                    print(f"[PDF] CV table detection failed on page {page_num}: {e}")
                    continue
            
        except ImportError:
            print("[PDF] OpenCV or pdf2image not available for CV table detection")
        except Exception as e:
            print(f"[PDF] CV table detection error: {e}")
        
        return tables
    
    def _extract_text_from_table_area(self, image, contours) -> str:
        """Extract text from detected table area using OCR."""
        try:
            # Create mask for table area
            mask = np.zeros(image.shape[:2], dtype=np.uint8)
            cv2.fillPoly(mask, contours, 255)
            
            # Extract table region
            table_region = cv2.bitwise_and(image, image, mask=mask)
            
            # Convert to PIL for OCR
            from PIL import Image
            pil_image = Image.fromarray(cv2.cvtColor(table_region, cv2.COLOR_BGR2RGB))
            
            # Preprocess and OCR
            processed = self.ocr.preprocess_image(pil_image)
            return self.ocr.ocr_image(processed)
            
        except Exception as e:
            print(f"[PDF] Table text extraction failed: {e}")
            return ""
    
    def _parse_table_text(self, text: str) -> list:
        """Parse table text into rows."""
        if not text.strip():
            return []
        
        lines = text.split('\n')
        rows = []
        
        for line in lines:
            if line.strip():
                # Split by multiple spaces, tabs, or pipes
                parts = re.split(r'\s{2,}|\t+|\|+', line.strip())
                cleaned_parts = [part.strip() for part in parts if part.strip()]
                if cleaned_parts:
                    rows.append(cleaned_parts)
        
        return rows

    # ------------------------------------------------------------------
    # Scanned PDF detection
    # ------------------------------------------------------------------

    def is_scanned_pdf(self, text: str, page_count: int) -> bool:
        """Return True if the PDF appears to be scanned (very little text)."""
        if page_count == 0:
            return False
        avg_chars_per_page = len(text) / page_count
        return avg_chars_per_page < 50

    # ------------------------------------------------------------------
    # Internal: OCR all pages of a PDF
    # ------------------------------------------------------------------

    def _ocr_pdf_pages(self, file_path: Path) -> str:
        """Convert each PDF page to image and OCR it using pdf2image with parallel processing."""
        try:
            from pdf2image import convert_from_path
            import concurrent.futures
            import time
            
            print(f"[PDF] Converting {file_path.name} to images for OCR...")
            start_time = time.time()
            
            # Use pdf2image to convert all pages (Poppler is required on Windows PATH)
            # Use 300 DPI for Arabic accuracy
            images = convert_from_path(str(file_path), dpi=300)
            conversion_time = time.time() - start_time
            print(f"[PDF] Converted {len(images)} pages in {conversion_time:.1f}s")
            
            # Use parallel processing for OCR on large documents
            if len(images) > 3:  # Use parallel processing for documents with more than 3 pages
                print(f"[PDF] Using parallel OCR for {len(images)} pages...")
                return self._ocr_pages_parallel(images)
            else:
                return self.ocr.ocr_multiple_images(images)
            
        except ImportError:
            print("[PDF] pdf2image not installed. Cannot OCR PDF pages.")
            return ""
        except Exception as e:
            print(f"[PDF] PDF to image conversion failed: {e}")
            return ""
            
    def _ocr_pages_parallel(self, images: list) -> str:
        """OCR multiple pages in parallel using ThreadPoolExecutor."""
        import concurrent.futures
        import time
        
        start_time = time.time()
        all_text = []
        
        def ocr_single_page(img_index):
            try:
                img = images[img_index]
                processed = self.ocr.preprocess_image(img)
                text = self.ocr.ocr_image(processed)
                print(f"[OCR] Processed page {img_index + 1}/{len(images)}")
                return text
            except Exception as e:
                print(f"[OCR] Error on page {img_index + 1}: {e}")
                return ""
        
        # Use ThreadPoolExecutor for parallel OCR processing
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            futures = [executor.submit(ocr_single_page, i) for i in range(len(images))]
            for future in concurrent.futures.as_completed(futures):
                text = future.result()
                if text.strip():
                    all_text.append(text)
        
        total_time = time.time() - start_time
        print(f"[PDF] Parallel OCR completed {len(images)} pages in {total_time:.1f}s")
        
        return "\n\n".join(all_text)

    # ------------------------------------------------------------------
    # New methods for the updated extraction strategy
    # ------------------------------------------------------------------

    def extract_text_based(self, file_path: Path) -> dict:
        """Extract text using pypdf and pdfplumber."""
        text, page_count = self.extract_with_pypdf(file_path)
        return {"text": text, "pages": page_count}

    def extract_with_ocr(self, file_path: Path) -> dict:
        """Extract text using OCR only."""
        ocr_text = self._ocr_pdf_pages(file_path)
        return {"text": ocr_text, "pages": 0}  # pages not tracked in OCR

    def detect_language(self, text: str) -> str:
        """Detect language from text (simple heuristic)."""
        if not text.strip():
            return "english"
        
        # Simple Arabic detection
        arabic_chars = sum(1 for char in text if '\u0600' <= char <= '\u06FF')
        total_chars = len(text)
        
        if total_chars == 0:
            return "english"
            
        arabic_ratio = arabic_chars / total_chars
        
        if arabic_ratio > 0.3:
            return "arabic"
        elif arabic_ratio > 0.1:
            return "mixed"
        else:
            return "english"

    def extract_arabic_tables_from_text(self, text: str) -> list:
        """Extract Arabic tables from text using pattern matching."""
        tables = []
        
        # Look for common Arabic table patterns
        lines = text.split('\n')
        current_table = []
        in_table = False
        
        for line in lines:
            # Arabic table detection patterns
            if (line.strip() and 
                any(char in line for char in ['\u0660', '\u0661', '\u0662', '\u0663', '\u0664', 
                                             '\u0665', '\u0666', '\u0667', '\u0668', '\u0669']) and
                any(sep in line for sep in ['|', '  ', '\t']) and
                len(line.split()) >= 2):
                
                if not in_table:
                    in_table = True
                    current_table = []
                
                current_table.append(line)
            else:
                if in_table and len(current_table) >= 2:
                    # Process the table
                    table_data = self._parse_arabic_table(current_table)
                    if table_data:
                        tables.append({
                            "page": 0,  # Unknown page
                            "headers": table_data.get("headers", []),
                            "rows": table_data.get("rows", []),
                            "raw": current_table,
                            "source": "text_extraction"
                        })
                    in_table = False
                    current_table = []
        
        return tables

    def _parse_arabic_table(self, lines: list) -> dict:
        """Parse Arabic table lines into structured data."""
        if not lines or len(lines) < 2:
            return {}
        
        # Try to detect headers (first line often has different pattern)
        headers = []
        rows = []
        
        # Simple split by multiple spaces or tabs
        for i, line in enumerate(lines):
            # Clean the line
            clean_line = line.strip()
            # Split by multiple spaces or tabs
            parts = [part.strip() for part in clean_line.split() if part.strip()]
            
            if i == 0:
                headers = parts
            else:
                rows.append(parts)
        
        return {"headers": headers, "rows": rows}
