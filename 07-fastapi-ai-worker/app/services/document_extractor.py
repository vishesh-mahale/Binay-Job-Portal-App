"""Document extraction service for PDF, DOCX, and plain text files."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

import PyPDF2
from docx import Document as DocxDocument
from PIL import Image
import pytesseract

from app.core.config import get_settings
from app.schemas.resume_parser import ResumeExtractedSchema


class DocumentExtractor:
    """Extract text from resumes with security checks and OCR fallback."""

    def __init__(
        self,
        max_document_size_bytes: Optional[int] = None,
        max_extracted_text_length: Optional[int] = None,
        max_pdf_pages: Optional[int] = None,
    ) -> None:
        settings = get_settings()
        self.max_document_size_bytes = max_document_size_bytes or settings.MAX_DOCUMENT_SIZE_BYTES
        self.max_extracted_text_length = max_extracted_text_length or settings.MAX_EXTRACTED_TEXT_LENGTH
        self.max_pdf_pages = max_pdf_pages or settings.MAX_PDF_PAGES

    def _validate_magic_bytes(self, filename: str, content: bytes) -> None:
        name = (filename or "").lower()
        if name.endswith(".pdf"):
            if not content.startswith(b"%PDF"):
                raise ValueError("Invalid PDF file: magic bytes do not match PDF format")
        elif name.endswith(".docx"):
            if not content.startswith(b"PK"):
                raise ValueError("Invalid DOCX file: magic bytes do not match ZIP archive")
        elif name.endswith(".txt"):
            return

    def _validate_size(self, content: bytes) -> None:
        if len(content) > self.max_document_size_bytes:
            raise ValueError(
                f"Document exceeds max size: {len(content)} > {self.max_document_size_bytes} bytes"
            )

    def extract_from_bytes(self, filename: str, content: bytes) -> ResumeExtractedSchema:
        """Extract text from raw bytes and return a validated resume schema."""
        if not isinstance(content, (bytes, bytearray)):
            raise ValueError("Document content must be bytes")

        raw = bytes(content)
        self._validate_size(raw)
        self._validate_magic_bytes(filename, raw)

        name = (filename or "").lower()
        if name.endswith(".pdf"):
            extracted_text = self._extract_pdf_text(raw)
        elif name.endswith(".docx"):
            extracted_text = self._extract_docx_text(raw)
        elif name.endswith(".txt"):
            extracted_text = raw.decode("utf-8", errors="replace")
        else:
            extracted_text = raw.decode("utf-8", errors="replace")

        if len(extracted_text) > self.max_extracted_text_length:
            extracted_text = extracted_text[: self.max_extracted_text_length]

        return ResumeExtractedSchema(
            extracted_text=extracted_text,
            raw_ai_output={"source_file": filename, "bytes": len(raw)},
            normalized_output={"source_file": filename},
            confidence_details={"file_type": Path(filename).suffix.lower(), "bytes": len(raw)},
            validation_result={"valid": True, "source": "document_extractor"},
            overall_confidence=100.0,
            schema_version="1.0",
        )

    def extract_from_file(self, file_path: str) -> ResumeExtractedSchema:
        """Extract text from a file path."""
        path = Path(file_path)
        return self.extract_from_bytes(path.name, path.read_bytes())

    def _extract_pdf_text(self, content: bytes) -> str:
        try:
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            if len(reader.pages) > self.max_pdf_pages:
                raise ValueError(f"PDF exceeds supported page limit: {len(reader.pages)} > {self.max_pdf_pages}")

            pages = []
            for page in reader.pages:
                text = page.extract_text() or ""
                pages.append(text)
            return "\n\n".join(pages).strip()
        except Exception as exc:  # pragma: no cover - fallback path
            raise ValueError(f"Failed to extract PDF text: {exc}") from exc

    def _extract_docx_text(self, content: bytes) -> str:
        try:
            stream = io.BytesIO(content)
            document = DocxDocument(stream)
            paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
            return "\n".join(paragraphs).strip()
        except Exception as exc:  # pragma: no cover - fallback path
            raise ValueError(f"Failed to extract DOCX text: {exc}") from exc

    def ocr_image(self, image_bytes: bytes) -> str:
        """OCR a raw image using Tesseract. Used as an optional fallback."""
        try:
            image = Image.open(io.BytesIO(image_bytes))
            return pytesseract.image_to_string(image)
        except Exception as exc:  # pragma: no cover - OCR runtime environment dependent
            raise ValueError(f"OCR failed: {exc}") from exc
