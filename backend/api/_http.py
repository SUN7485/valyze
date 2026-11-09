"""Small HTTP helpers shared by the API routers."""

from __future__ import annotations

import re
import unicodedata
from pathlib import PurePath
from urllib.parse import quote

_FALLBACK_UNSAFE = re.compile(r'[^A-Za-z0-9._ -]+')
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def content_disposition(filename: str, disposition: str = "attachment") -> str:
    """Build a Content-Disposition value that is safe for any filename.

    HTTP headers are latin-1, so a raw `filename="تقرير.pdf"` raises
    UnicodeEncodeError (a 500). This emits an ASCII `filename="..."` fallback
    (quotes, backslashes, CR/LF and other non-ASCII stripped) plus the RFC 5987
    `filename*=UTF-8''<percent-encoded>` form that browsers prefer.
    """
    name = _CONTROL.sub("", str(filename or "")).strip() or "download"

    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    ascii_name = _FALLBACK_UNSAFE.sub("_", ascii_name).strip(" ._")
    suffix = PurePath(name).suffix
    ascii_suffix = suffix if re.fullmatch(r"\.[A-Za-z0-9]{1,10}", suffix or "") else ""
    if not ascii_name.replace("_", "") or ascii_name == ascii_suffix.lstrip("."):
        ascii_name = f"download{ascii_suffix}"

    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(name, safe='')}"
