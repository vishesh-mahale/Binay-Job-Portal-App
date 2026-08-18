"""Unit tests for DocumentExtractor edge cases."""

from __future__ import annotations

import io
import zipfile

import pytest

from app.services.document_extractor import DocumentExtractor


def test_docx_zip_bomb_rejected():
    extractor = DocumentExtractor()
    large_payload = b"PK" + b"\x00" * 100
    with pytest.raises(ValueError, match="Invalid DOCX ZIP archive"):
        extractor.extract_from_bytes("bomb.docx", large_payload)


def test_docx_path_traversal_rejected():
    extractor = DocumentExtractor()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("../malicious.txt", "bad")
    with pytest.raises(ValueError, match="Unsafe DOCX archive path"):
        extractor.extract_from_bytes("safe.docx", buf.getvalue())


def test_docx_too_many_entries_rejected():
    extractor = DocumentExtractor()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for i in range(1001):
            zf.writestr(f"file_{i}.txt", "x")
    with pytest.raises(ValueError, match="exceeds max entries"):
        extractor.extract_from_bytes("big.docx", buf.getvalue())


def test_docx_entry_too_large_rejected():
    extractor = DocumentExtractor()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("huge.txt", "x" * (11 * 1024 * 1024))
    with pytest.raises(ValueError, match="Document exceeds max size"):
        extractor.extract_from_bytes("huge.docx", buf.getvalue())
