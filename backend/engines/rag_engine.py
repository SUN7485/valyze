from rank_bm25 import BM25Okapi
import json
import re
import asyncio
from pathlib import Path
from typing import Optional
import os
from dotenv import load_dotenv

load_dotenv()

# Security: Using JSON instead of pickle to prevent code execution
# BM25 index is rebuilt from tokenized corpus on load

class RAGEngine:

    def __init__(self):
        self.top_k = int(os.getenv("TOP_K_CHUNKS", 3))
        self.upload_dir = Path(os.getenv("UPLOAD_DIR", "uploads"))
        
        # Import here to avoid circular imports
        from ai.lm_client import LMStudioClient
        self.lm_client = LMStudioClient()
        
        print("[RAG] BM25 search engine initialized")
        print("[RAG] No numpy/ChromaDB needed")

    def tokenize(self, text: str) -> list:
        """
        Tokenizer that handles Arabic and English.
        Uses unicode-aware regex to split words.
        """
        if not text:
            return []
        text = text.lower()
        # \w+ with UNICODE flag handles Arabic words
        tokens = re.findall(r'\w+', text, re.UNICODE)
        return tokens

    async def setup_collection(
        self,
        report_id: str
    ) -> bool:
        """
        Build BM25 index from chunks.json.
        Saves index as JSON for safe serialization (no pickle).
        """
        try:
            chunks_path = self.upload_dir / report_id / "chunks.json"
            index_path = self.upload_dir / report_id / "bm25_index.json"
            
            if not chunks_path.exists():
                print(f"[RAG] No chunks.json found for {report_id}")
                return False
            
            # Load chunks
            with open(chunks_path, "r", encoding="utf-8") as f:
                chunks = json.load(f)
            
            if not chunks:
                print("[RAG] No chunks to index")
                return False
            
            # Extract texts
            texts = [c.get("text", "") for c in chunks]
            
            # Tokenize all chunks
            tokenized = [self.tokenize(text) for text in texts]
            
            # Save tokenized corpus and texts as JSON (safe serialization)
            # BM25 index will be rebuilt on query for security
            index_data = {
                "tokenized_corpus": tokenized,
                "texts": texts,
                "chunks": chunks
            }
            
            with open(index_path, "w", encoding="utf-8") as f:
                json.dump(index_data, f, ensure_ascii=False)
            
            print(f"[RAG] BM25 index built: {len(texts)} chunks indexed")
            return True
            
        except Exception as e:
            print(f"[RAG] Failed to build BM25 index: {e}")
            return False

    def query_chunks(
        self,
        report_id: str,
        query: str,
        top_k: int = None,
        field_name: str = None
    ) -> list:
        """
        Searches chunks using BM25 with enhanced relevance scoring.
        Returns top_k most relevant chunk texts with quality scores.
        """
        if top_k is None:
            top_k = self.top_k
            
        try:
            index_path = self.upload_dir / report_id / "bm25_index.json"
            
            if not index_path.exists():
                # Try to load from chunks.json directly
                chunks_path = self.upload_dir / report_id / "chunks.json"
                if not chunks_path.exists():
                    return []
                with open(chunks_path, "r", encoding="utf-8") as f:
                    chunks = json.load(f)
                return [c.get("text", "") for c in chunks[:top_k]]
            
            # Load index data from JSON (safe deserialization)
            with open(index_path, "r", encoding="utf-8") as f:
                index_data = json.load(f)
            
            # Rebuild BM25 index from tokenized corpus (security: no pickle)
            tokenized_corpus = index_data["tokenized_corpus"]
            texts = index_data["texts"]
            chunks = index_data["chunks"]
            bm25 = BM25Okapi(tokenized_corpus)
            
            # Tokenize query
            query_tokens = self.tokenize(query)
            if not query_tokens:
                return texts[:top_k]
            
            # Get BM25 scores for all chunks
            scores = bm25.get_scores(query_tokens)
            
            # Create list of (score, text, chunk_data) tuples
            scored_chunks = []
            for i, (score, text, chunk_data) in enumerate(zip(scores, texts, chunks)):
                # Calculate additional quality metrics
                quality_score = self._calculate_chunk_quality(chunk_data, field_name, query)
                total_score = score * quality_score
                
                scored_chunks.append({
                    'text': text,
                    'bm25_score': score,
                    'quality_score': quality_score,
                    'total_score': total_score,
                    'chunk_data': chunk_data
                })
            
            # Sort by total score (BM25 * quality)
            scored_chunks.sort(key=lambda x: x['total_score'], reverse=True)
            
            # Return top k chunks
            return [chunk['text'] for chunk in scored_chunks[:top_k]]
            
        except Exception as e:
            print(f"[RAG] Query failed: {e}")
            return []

    def _calculate_chunk_quality(self, chunk_data: dict, field_name: str, query: str) -> float:
        """
        Calculate chunk quality score based on various factors.
        Returns a score between 0.1 and 1.0.
        """
        quality_score = 1.0  # Start with perfect score
        
        # 1. Text quality assessment
        text = chunk_data.get("text", "")
        if not text or len(text.strip()) < 50:
            quality_score *= 0.3  # Very short or empty text
        
        # 2. Language consistency penalty
        language = chunk_data.get("language", "")
        if language == "mixed":
            quality_score *= 0.7  # Mixed language chunks are less reliable
        
        # 3. OCR quality penalty (for garbled text)
        if self._is_garbled_ocr(text):
            quality_score *= 0.4  # Heavily penalize garbled OCR
        
        # 4. Source type preference
        source_type = chunk_data.get("source_type", "")
        if source_type == "table":
            quality_score *= 1.2  # Tables are often high quality
        elif source_type == "text":
            quality_score *= 1.0  # Regular text
        else:
            quality_score *= 0.8  # Unknown source type
        
        # 5. Field-specific relevance boost
        if field_name and self._is_field_specific_relevant(chunk_data, field_name, query):
            quality_score *= 1.3  # Boost for field-specific relevance
        
        # Ensure score is within bounds
        return max(0.1, min(1.0, quality_score))
    
    def _is_garbled_ocr(self, text: str) -> bool:
        """
        Detect garbled OCR text with excessive special characters or nonsense.
        """
        if not text:
            return False
        
        # Count non-alphanumeric characters (excluding spaces and common punctuation)
        non_alpha = sum(1 for char in text if not char.isalnum() and char not in ' .,;:!?()-_')
        ratio = non_alpha / len(text) if len(text) > 0 else 0
        
        # If more than 30% of characters are non-alphanumeric (excluding basic punctuation)
        return ratio > 0.3
    
    def _is_field_specific_relevant(self, chunk_data: dict, field_name: str, query: str) -> bool:
        """
        Check if chunk is specifically relevant to the field being queried.
        """
        text = chunk_data.get("text", "").lower()
        
        # Field-specific relevance patterns
        field_patterns = {
            "company_name": ["company", "business", "enterprise", "corporation", "شركة", "مؤسسة"],
            "address": ["address", "location", "street", "city", "عنوان", "مكان"],
            "phone": ["phone", "telephone", "contact", "هاتف", "اتصال"],
            "email": ["email", "e-mail", "@", "بريد", "إلكتروني"],
            "financial": ["revenue", "profit", "income", "balance", "مبيعات", "أرباح"],
            "legal": ["license", "registration", "legal", "قانوني", "ترخيص"],
            "other_registration_id": ["other registration", "additional registration", "extra registration", "other reg", "رقم تسجيل آخر", "تسجيل إضافي"]
        }
        
        # Check if chunk contains field-specific keywords
        for pattern in field_patterns.get(field_name, []):
            if pattern in text:
                return True
        
        return False

    async def fill_empty_fields(
        self,
        report_id: str,
        current_fields: dict
    ) -> dict:
        """
        Fills MISSING fields using BM25 search + LM Studio.
        Keeps same interface as before.
        """
        from ai.prompts import FIELD_QUERIES, SYSTEM_PROMPT
        
        # Setup BM25 index first
        setup_ok = await self.setup_collection(report_id)
        if not setup_ok:
            print("[RAG] Cannot setup index. Skipping AI filling.")
            return current_fields
        
        # Check LM Studio
        lm_available = await self.lm_client.check_connection()
        if not lm_available:
            print("[RAG] LM Studio not available. Skipping AI filling.")
            return current_fields
        
        # Check if we have enough extracted content to make RAG worthwhile
        chunks_path = self.upload_dir / report_id / "chunks.json"
        if chunks_path.exists():
            with open(chunks_path, "r", encoding="utf-8") as f:
                chunks = json.load(f)
            total_text = sum(len(chunk.get("text", "")) for chunk in chunks)
            if total_text < 1000:  # Less than 1KB of text
                print(f"[RAG] Insufficient extracted content ({total_text} chars). Skipping AI filling.")
                return current_fields
        
        # Find fields to fill - but only critical fields first
        fields_to_fill = []
        critical_fields = [
            "legal_name", "company_name", "registration_number", 
            "industry", "business_activity", "founding_year",
            "address", "city", "country", "phone", "email"
        ]
        
        for field_name, field_data in current_fields.items():
            # Check if it's missing and queryable - handle both dict and object field data
            confidence = None
            if isinstance(field_data, dict):
                confidence = field_data.get("confidence", "missing")
            elif hasattr(field_data, "confidence"):
                confidence = field_data.confidence
            else:
                confidence = "missing"
            
            if confidence == "missing" and field_name in FIELD_QUERIES:
                # Prioritize critical fields
                if field_name in critical_fields:
                    fields_to_fill.insert(0, field_name)  # Add to front
                else:
                    fields_to_fill.append(field_name)     # Add to end
        
        # No longer limiting fields - AI can fill as many as needed
        print(f"[RAG] Attempting to fill {len(fields_to_fill)} fields (prioritized)")
        
        # Process fields in parallel batches for speed
        # Too many concurrent requests can overwhelm LM Studio, so we batch
        BATCH_SIZE = int(os.getenv("AI_BATCH_SIZE", 5))
        print(f"[RAG] Processing {len(fields_to_fill)} fields in parallel batches of {BATCH_SIZE}")
        
        filled_count = 0
        
        # Save progress file
        progress_path = (
            self.upload_dir / report_id / "rag_progress.json"
        )
        
        # Process in batches
        for batch_start in range(0, len(fields_to_fill), BATCH_SIZE):
            batch_end = min(batch_start + BATCH_SIZE, len(fields_to_fill))
            batch_fields = fields_to_fill[batch_start:batch_end]
            batch_num = batch_start // BATCH_SIZE + 1
            total_batches = (len(fields_to_fill) + BATCH_SIZE - 1) // BATCH_SIZE
            
            print(f"[RAG] Batch {batch_num}/{total_batches}: Processing {len(batch_fields)} fields in parallel")
            
            # Update progress
            progress = {
                "total": len(fields_to_fill),
                "completed": batch_start,
                "current_field": f"batch {batch_num}/{total_batches}",
                "status": "running"
            }
            with open(progress_path, "w", encoding="utf-8") as f:
                json.dump(progress, f)
            
            # Create tasks for parallel execution
            async def extract_single_field(field_name: str):
                """Extract a single field using AI"""
                try:
                    query = FIELD_QUERIES.get(field_name, f"Extract {field_name}")
                    relevant_chunks = self.query_chunks(report_id, query, top_k=3, field_name=field_name)
                    
                    if not relevant_chunks:
                        return field_name, None, "no_chunks"
                    
                    result = await self.lm_client.extract_field(
                        field_name=field_name,
                        question=query,
                        context_chunks=relevant_chunks
                    )
                    
                    if result.get("found") and result.get("value"):
                        return field_name, result, "found"
                    else:
                        return field_name, None, "not_found"
                        
                except Exception as e:
                    print(f"[RAG] Error on field {field_name}: {e}")
                    return field_name, None, "error"
            
            # Run all fields in this batch in parallel
            tasks = [extract_single_field(field_name) for field_name in batch_fields]
            results = await asyncio.gather(*tasks)
            
            # Process results
            for field_name, result, status in results:
                if status == "found" and result:
                    current_fields[field_name].value = result["value"]
                    current_fields[field_name].confidence = "medium"
                    current_fields[field_name].source = "ai"
                    current_fields[field_name].locked = False
                    filled_count += 1
                    print(f"[RAG]   ✓ {field_name}: {str(result['value'])[:30]}...")
                elif status == "no_chunks":
                    print(f"[RAG]   - {field_name}: No relevant chunks")
                elif status == "not_found":
                    print(f"[RAG]   - {field_name}: Not found in document")
                elif status == "error":
                    print(f"[RAG]   ✗ {field_name}: Error")
            
            # Small delay between batches to let LM Studio breathe
            await asyncio.sleep(0.3)
        
        # Final progress update
        with open(progress_path, "w", encoding="utf-8") as f:
            json.dump({
                "total": len(fields_to_fill),
                "completed": len(fields_to_fill),
                "current_field": "done",
                "status": "complete"
            }, f)
        
        print(f"[RAG] Filled {filled_count} fields with AI")
        print(f"[RAG] {len(fields_to_fill) - filled_count} "
              f"fields remain MISSING")
        
        return current_fields

    async def fill_array_fields(
        self,
        report_id: str,
        current_arrays: dict
    ) -> dict:
        """
        Tries to fill empty array fields using BM25 + AI.
        """
        lm_available = await self.lm_client.check_connection()
        if not lm_available:
            return current_arrays
        
        array_queries = {
            "shareholders": 
                "Who are the shareholders and ownership percentages?",
            "banking_relationships":
                "What banks does the company use?",
            "branches":
                "Does the company have branches and where?",
            "regional_affiliates":
                "What are the regional affiliates or related companies?"
        }
        
        for array_name, query in array_queries.items():
            try:
                # Use getattr for Pydantic models, or check the attribute directly
                if getattr(current_arrays, array_name, None):
                    continue
                    
                chunks = self.query_chunks(report_id, query, field_name=array_name)
                if not chunks:
                    continue
                
                print(f"[RAG] Trying to fill array: {array_name}")
                
            except Exception as e:
                print(f"[RAG] Array fill error {array_name}: {e}")
                continue
        
        return current_arrays

    async def delete_collection(self, report_id: str):
        """
        Deletes BM25 index for this report.
        Called when report is deleted.
        """
        try:
            index_path = self.upload_dir / report_id / "bm25_index.json"
            if index_path.exists():
                index_path.unlink()
                print(f"[RAG] Deleted BM25 index for {report_id}")
        except Exception as e:
            print(f"[RAG] Delete failed: {e}")