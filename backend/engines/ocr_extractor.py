"""
OCR Extractor forValyze Credit report.

Handles image files (PNG, JPG, JPEG, TIFF) and scanned PDF pages.
Supports both Arabic and English OCR via Tesseract.
"""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from PIL import Image

load_dotenv()

# ---------------------------------------------------------------------------
# Tesseract setup
# ---------------------------------------------------------------------------

_TESSERACT_AVAILABLE = False

try:
    # WORKAROUND: Some older pytesseract versions check for pkgutil.find_loader
    # which was deprecated in Python 3.12. We temporarily add it to avoid import errors.
    # This is a compatibility fix that only affects this module's import context.
    import importlib.util
    import pkgutil
    
    _original_find_loader = getattr(pkgutil, 'find_loader', None)
    if not hasattr(pkgutil, "find_loader"):
        def _find_loader_compat(name):
            return importlib.util.find_spec(name) is not None
        pkgutil.find_loader = _find_loader_compat
    
    import pytesseract
    
    # Restore original to avoid affecting other modules
    if _original_find_loader is None and hasattr(pkgutil, 'find_loader'):
        delattr(pkgutil, 'find_loader')

    def _set_tesseract_path():
        global _TESSERACT_AVAILABLE
        cmd = os.getenv("TESSERACT_CMD", "")
        if cmd and Path(cmd).exists():
            pytesseract.pytesseract.tesseract_cmd = cmd
            _TESSERACT_AVAILABLE = True
            print(f"[OCR] Tesseract found at: {cmd}")
        else:
            # Try default path
            try:
                pytesseract.get_tesseract_version()
                _TESSERACT_AVAILABLE = True
                print("[OCR] Tesseract found on system PATH")
            except Exception:
                _TESSERACT_AVAILABLE = False
                print(
                    "[OCR] WARNING: Tesseract not found. Download from:\n"
                    "  https://github.com/UB-Mannheim/tesseract/wiki\n"
                    "  Install and set path in .env:\n"
                    "  TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe"
                )

    _set_tesseract_path()

except ImportError:
    pytesseract = None  # type: ignore
    print("[OCR] pytesseract not installed — OCR disabled")


class OCRExtractor:
    """Extracts text from images using Tesseract OCR."""

    def __init__(self):
        self.tesseract_available = _TESSERACT_AVAILABLE

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def check_tesseract_installed(self) -> bool:
        """Return True if Tesseract is available."""
        if not self.tesseract_available:
            print(
                "[OCR] Tesseract not found. Download from:\n"
                "  https://github.com/UB-Mannheim/tesseract/wiki\n"
                "  Install and set path in .env:\n"
                "  TESSERACT_CMD=C:/Program Files/Tesseract-OCR/tesseract.exe"
            )
            return False
        return True

    def extract(self, file_path: Path) -> dict:
        """Extract text from an image file via OCR."""
        result = {
            "text": "",
            "pages": 1,
            "language": "english",
            "file_type": "image",
            "tables": [],
            "success": False,
            "error": None,
        }

        if not self.check_tesseract_installed():
            result["error"] = "Tesseract OCR not installed — cannot process images"
            print(f"[OCR] Skipping {file_path.name}: Tesseract not available")
            return result

        try:
            print(f"[OCR] Processing image: {file_path.name}")
            img = Image.open(file_path)
            processed = self.preprocess_image(img)
            text = self.ocr_image(processed)
            result["text"] = text
            result["success"] = bool(text.strip())
            if not text.strip():
                result["error"] = "OCR produced no text"
            print(f"[OCR] Extracted {len(text)} chars from {file_path.name}")
        except Exception as e:
            result["error"] = f"OCR extraction failed: {e}"
            print(f"[OCR] ERROR processing {file_path.name}: {e}")

        return result

    def ocr_image(self, image: Image.Image) -> str:
        """Run Tesseract OCR on a PIL Image with Arabic+English support."""
        if not self.tesseract_available or pytesseract is None:
            return ""
        try:
            custom_config = r"--oem 3 --psm 6"  # psm 6 = assume uniform block of text
            text = pytesseract.image_to_string(
                image, lang="ara+eng", config=custom_config
            )
            return text if text else ""
        except Exception as e:
            print(f"[OCR] Tesseract error: {e}")
            # Fallback: try English only
            try:
                text = pytesseract.image_to_string(
                    image, lang="eng", config=r"--oem 3 --psm 6"
                )
                return text if text else ""
            except Exception as e2:
                print(f"[OCR] Fallback OCR also failed: {e2}")
                return ""

    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """
        Preprocess the image for better OCR accuracy.
        Optimized for scanned documents with multiple enhancement techniques.
        """
        try:
            import cv2
            import numpy as np

            # Convert PIL to OpenCV format
            cv_image = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            
            # 1. Convert to grayscale
            gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)
            
            # 2. Resize for optimal OCR (300 DPI equivalent)
            height, width = gray.shape
            if width < 1000:  # Upscale small images
                scale = 1000 / width
                gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            
            # 3. Noise reduction
            denoised = cv2.medianBlur(gray, 3)
            
            # 4. Contrast enhancement
            # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
            enhanced = clahe.apply(denoised)
            
            # 5. Sharpening
            kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
            sharpened = cv2.filter2D(enhanced, -1, kernel)
            
            # 6. Binarization with adaptive threshold (better for uneven lighting)
            binary = cv2.adaptiveThreshold(
                sharpened, 255, 
                cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                cv2.THRESH_BINARY, 11, 2
            )
            
            # Convert back to PIL
            return Image.fromarray(binary)
            
        except ImportError:
            print("[OCR] OpenCV not available — using PIL preprocessing")
            # Fallback: enhanced PIL preprocessing
            return self._pil_preprocess(image)
        except Exception as e:
            print(f"[OCR] Advanced preprocessing failed: {e}")
            # Fallback to basic preprocessing
            return self._pil_preprocess(image)
    
    def _pil_preprocess(self, image: Image.Image) -> Image.Image:
        """Fallback PIL-only preprocessing with enhanced techniques."""
        try:
            # Convert to grayscale
            gray = image.convert("L")
            
            # Resize if too small
            width, height = gray.size
            if width < 800:
                scale = 800 / width
                new_width = int(width * scale)
                new_height = int(height * scale)
                gray = gray.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Enhance contrast
            import PIL.ImageEnhance
            enhancer = PIL.ImageEnhance.Contrast(gray)
            enhanced = enhancer.enhance(1.5)  # Increase contrast
            
            # Binarization with optimal threshold
            # Calculate threshold using histogram analysis
            hist = enhanced.histogram()
            total_pixels = sum(hist)
            cumulative = 0
            threshold = 128  # Default
            
            for i, count in enumerate(hist):
                cumulative += count
                if cumulative > total_pixels * 0.5:  # Find median brightness
                    threshold = i
                    break
            
            # Apply binarization
            return enhanced.point(lambda x: 0 if x < threshold else 255, '1')
            
        except Exception as e:
            print(f"[OCR] PIL preprocessing failed: {e}")
            return image.convert("L")

    def ocr_multiple_images(self, images: list) -> str:
        """OCR a list of PIL Images and combine the results."""
        if not self.check_tesseract_installed():
            return ""

        all_text: list[str] = []
        for i, img in enumerate(images):
            try:
                print(f"[OCR] Processing page {i + 1} of {len(images)}...")
                processed = self.preprocess_image(img)
                text = self.ocr_image(processed)
                if text.strip():
                    all_text.append(text)
            except Exception as e:
                print(f"[OCR] Error on page {i + 1}: {e}")
                all_text.append("")

        return "\n\n".join(all_text)
