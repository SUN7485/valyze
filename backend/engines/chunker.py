"""
Text Chunker forValyze Credit report.

Splits extracted text into overlapping chunks for vector storage / RAG.
Also converts tables to natural-language text for semantic retrieval.
"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Optional


class TextChunker:
    """Splits text into overlapping chunks for RAG indexing."""

    # ------------------------------------------------------------------
    # Text chunking
    # ------------------------------------------------------------------

    def chunk_text(
        self,
        text: str,
        chunk_size: int = 1000,
        overlap: int = 200,
    ) -> list[dict]:
        """
        Split *text* into overlapping chunks, breaking at sentence
        boundaries where possible.

        Returns a list of chunk dicts:
          chunk_id, text, chunk_index, language, char_count
        """
        if not text or not text.strip():
            return []

        text = self.clean_text(text)
        chunks: list[dict] = []

        # Build sentence list
        sentences = self._split_sentences(text)

        current_chunk: list[str] = []
        current_len = 0
        chunk_index = 0

        for sentence in sentences:
            sent_len = len(sentence)

            # If a single sentence exceeds chunk_size, hard-split it
            if sent_len > chunk_size:
                # Flush current chunk first
                if current_chunk:
                    chunk_text = " ".join(current_chunk)
                    chunks.append(self._make_chunk(chunk_text, chunk_index))
                    chunk_index += 1
                    current_chunk = []
                    current_len = 0

                # Hard-split the long sentence
                for start in range(0, sent_len, chunk_size - overlap):
                    fragment = sentence[start : start + chunk_size]
                    chunks.append(self._make_chunk(fragment, chunk_index))
                    chunk_index += 1
                continue

            # Would adding this sentence exceed chunk_size?
            if current_len + sent_len + 1 > chunk_size and current_chunk:
                chunk_text = " ".join(current_chunk)
                chunks.append(self._make_chunk(chunk_text, chunk_index))
                chunk_index += 1

                # Keep last part for overlap
                overlap_text = chunk_text[-overlap:] if len(chunk_text) > overlap else chunk_text
                current_chunk = [overlap_text]
                current_len = len(overlap_text)

            current_chunk.append(sentence)
            current_len += sent_len + 1

        # Flush remaining
        if current_chunk:
            chunk_text = " ".join(current_chunk)
            chunks.append(self._make_chunk(chunk_text, chunk_index))

        print(f"[CHUNKER] Created {len(chunks)} chunks from {len(text)} chars")
        return chunks

    # ------------------------------------------------------------------
    # Document-level chunking
    # ------------------------------------------------------------------

    def chunk_document(
        self,
        extraction_result: dict,
        report_id: str,
        chunk_size: int = 1000,
        overlap: int = 200,
    ) -> list[dict]:
        """
        Chunk the full extraction result (text + tables) for a document.

        Each chunk gets tagged with the report_id.
        """
        all_chunks: list[dict] = []

        # Chunk the main text
        main_text = extraction_result.get("text", "")
        if main_text.strip():
            text_chunks = self.chunk_text(main_text, chunk_size, overlap)
            for c in text_chunks:
                c["report_id"] = report_id
                c["source_type"] = "text"
            all_chunks.extend(text_chunks)

        # Convert tables to text and chunk them too
        tables = extraction_result.get("tables", [])
        for i, table in enumerate(tables):
            table_text = self.table_to_text(table)
            if table_text.strip():
                table_chunks = self.chunk_text(table_text, chunk_size, overlap)
                for c in table_chunks:
                    c["report_id"] = report_id
                    c["source_type"] = "table"
                    c["table_index"] = i
                all_chunks.extend(table_chunks)

        print(
            f"[CHUNKER] Document chunked: {len(all_chunks)} total chunks "
            f"({len(all_chunks) - len(tables)} text, {len(tables)} table-derived)"
        )
        return all_chunks

    # ------------------------------------------------------------------
    # Table → natural language
    # ------------------------------------------------------------------

    def table_to_text(self, table: dict) -> str:
        """
        Convert a structured table dict to natural-language sentences.

        This allows RAG to find table data through semantic queries.
        """
        parts: list[str] = []
        headers = table.get("headers", [])
        rows = table.get("rows", [])
        page = table.get("page")

        if page:
            parts.append(f"Table from page {page}:")

        if not rows:
            return ""

        for row in rows:
            if not row:
                continue
            # Build a sentence: "Header1 is Value1, Header2 is Value2, ..."
            pairs: list[str] = []
            for ci, cell in enumerate(row):
                cell_str = str(cell).strip() if cell else ""
                if not cell_str:
                    continue
                if ci < len(headers) and headers[ci]:
                    pairs.append(f"{headers[ci]}: {cell_str}")
                else:
                    pairs.append(cell_str)
            if pairs:
                parts.append(", ".join(pairs) + ".")

        return "\n".join(parts)

    # ------------------------------------------------------------------
    # Text cleaning
    # ------------------------------------------------------------------

    def clean_text(self, text: str) -> str:
        """
        Clean text while preserving Arabic characters and numbers.

        Removes control characters and collapses excessive whitespace.
        """
        if not text:
            return ""
        # Remove control characters except newlines and tabs
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", text)
        # Collapse excessive newlines (>3 → 2)
        text = re.sub(r"\n{4,}", "\n\n\n", text)
        # Collapse excessive spaces
        text = re.sub(r"[ \t]{4,}", "   ", text)
        return text.strip()

    # ------------------------------------------------------------------
    # Save chunks to file
    # ------------------------------------------------------------------

    @staticmethod
    def save_chunks(chunks: list[dict], output_path: Path) -> None:
        """Write chunks to a JSON file for later RAG indexing."""
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(chunks, f, ensure_ascii=False, indent=2)
        print(f"[CHUNKER] Saved {len(chunks)} chunks to {output_path}")

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _split_sentences(text: str) -> list[str]:
        """Split text at sentence boundaries."""
        # Sentence-ending punctuation: ., !, ?, ۔ (Arabic full stop)
        parts = re.split(r"(?<=[.!?۔])\s+", text)
        return [p.strip() for p in parts if p.strip()]

    @staticmethod
    def _make_chunk(text: str, index: int) -> dict:
        """Create a chunk metadata dict."""
        # Detect language (lightweight)
        arabic_chars = len(re.findall(r"[\u0600-\u06FF]", text))
        total_alpha = len(re.findall(r"[a-zA-Z\u0600-\u06FF]", text))
        if total_alpha == 0:
            lang = "english"
        elif arabic_chars / total_alpha > 0.5:
            lang = "arabic"
        elif arabic_chars > 0:
            lang = "mixed"
        else:
            lang = "english"

        return {
            "chunk_id": str(uuid.uuid4()),
            "text": text,
            "chunk_index": index,
            "language": lang,
            "char_count": len(text),
        }
