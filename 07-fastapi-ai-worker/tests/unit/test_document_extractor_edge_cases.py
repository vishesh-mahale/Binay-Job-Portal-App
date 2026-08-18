"""Unit tests for DocumentExtractor PDF and error paths."""

from __future__ import annotations

import io
import zipfile

import pytest

from app.services.document_extractor import DocumentExtractor


def test_validate_magic_bytes_pdf_success():
    extractor = DocumentExtractor()
    extractor._validate_magic_bytes("test.pdf", b"%PDF-1.4")


def test_validate_magic_bytes_docx_success():
    extractor = DocumentExtractor()
    extractor._validate_magic_bytes("test.docx", b"PK\x03\x04")


def test_validate_magic_bytes_invalid_pdf():
    extractor = DocumentExtractor()
    with pytest.raises(ValueError, match="Invalid PDF file"):
        extractor._validate_magic_bytes("test.pdf", b"not a pdf")


def test_validate_magic_bytes_unsupported():
    extractor = DocumentExtractor()
    extractor._validate_magic_bytes("test.xyz", b"unknown")


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


def test_validate_size_success():
    extractor = DocumentExtractor()
    extractor._validate_size(b"x" * 1024)


def test_validate_size_too_large():
    extractor = DocumentExtractor()
    with pytest.raises(ValueError, match="Document exceeds max size"):
        extractor._validate_size(b"x" * (11 * 1024 * 1024))
