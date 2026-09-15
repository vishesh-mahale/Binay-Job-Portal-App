"""Extract text from legacy .doc (OLE2) Word documents."""

from __future__ import annotations

import io
import struct
from typing import Optional

import olefile


def extract_doc_text(content: bytes) -> str:
    """Extract text from a .doc file using OLE2 stream parsing.
    
    Reads the WordDocument stream and extracts Unicode text.
    Uses fc_min as start offset and reads to end of stream
    (fc_mac is often incorrect in .doc files and cuts off text).
    """
    try:
        ole = olefile.OleFileIO(io.BytesIO(content))
    except Exception as e:
        raise ValueError(f"Cannot read .doc file: {e}")

    if not ole.exists("WordDocument"):
        raise ValueError("Invalid .doc file: WordDocument stream not found")

    word_stream = ole.openstream("WordDocument").read()

    if len(word_stream) < 0x50:
        raise ValueError("WordDocument stream too small to be a valid .doc")

    magic = struct.unpack_from("<H", word_stream, 0x0000)[0]
    if magic != 0xA5EC:
        raise ValueError(f"Invalid .doc magic: 0x{magic:04X} (expected 0xA5EC)")

    fc_min = struct.unpack_from("<I", word_stream, 0x0018)[0]

    if fc_min >= len(word_stream):
        return _fallback_extract_text(word_stream)

    text_bytes = word_stream[fc_min:]

    try:
        text_utf16 = text_bytes.decode("utf-16-le", errors="replace")
        cleaned_u16 = _clean_control_chars(text_utf16)
        cjk_count = sum(1 for ch in cleaned_u16 if 0x3400 <= ord(ch) <= 0x9FFF or 0xAC00 <= ord(ch) <= 0xD7AF)
        ascii_count = sum(1 for ch in cleaned_u16 if ch.isascii() and ch.isalpha())
        if cjk_count > 10 and cjk_count > ascii_count:
            text_ansi = text_bytes.decode("cp1252", errors="replace")
            cleaned_ansi = _clean_control_chars(text_ansi)
            if len(cleaned_ansi.strip()) > 10:
                return cleaned_ansi.strip()
        elif len(cleaned_u16.strip()) > 10:
            return cleaned_u16.strip()
    except Exception:
        pass

    try:
        text_ansi = text_bytes.decode("cp1252", errors="replace")
        cleaned_ansi = _clean_control_chars(text_ansi)
        if len(cleaned_ansi.strip()) > 10:
            return cleaned_ansi.strip()
    except Exception:
        pass

    return _fallback_extract_text(word_stream)


def _clean_control_chars(text: str) -> str:
    """Remove Word control characters but keep newlines/tabs.
    
    Also strips trailing garbage (repeated null-like chars, CJK gibberish)
    that appear after the real text content in .doc files.
    """
    cleaned = []
    for ch in text:
        code = ord(ch)
        if code in (0x0D, 0x0A, 0x09):
            cleaned.append(ch)
        elif code == 0x07:
            cleaned.append("\n")
        elif code == 0x01:
            cleaned.append("\n")
        elif 0x20 <= code <= 0x7E:
            cleaned.append(ch)
        elif 0x7F < code < 0xD800:
            cleaned.append(ch)
        elif 0xE000 <= code < 0xFFFD:
            cleaned.append(ch)
        elif code == 0xFFFD:
            cleaned.append("?")
    
    result = "".join(cleaned)
    
    # Strip trailing garbage: find last meaningful section
    # Look for patterns like "Signature", "Date:", or last line with mostly ASCII
    lines = result.split("\n")
    
    # Find the last line that looks like real resume content
    last_good = len(lines) - 1
    for i in range(len(lines) - 1, -1, -1):
        line = lines[i].strip()
        if not line:
            continue
        # Count ASCII letters vs non-ASCII
        ascii_count = sum(1 for c in line if c.isascii() and c.isalpha())
        total_alpha = sum(1 for c in line if c.isalpha())
        if total_alpha == 0:
            continue
        # If >50% of alpha chars are ASCII, this is probably real content
        if ascii_count / max(total_alpha, 1) > 0.5:
            last_good = i
            break
    
    lines = lines[:last_good + 1]
    return "\n".join(lines)


def _fallback_extract_text(word_stream: bytes) -> str:
    """Fallback: extract readable text by finding long UTF-16 sequences."""
    candidates = []
    i = 0
    while i < len(word_stream) - 1:
        char = struct.unpack_from("<H", word_stream, i)[0]
        if 0x20 <= char <= 0x7E or char in (0x0D, 0x0A, 0x09):
            start = i
            while i < len(word_stream) - 1:
                char = struct.unpack_from("<H", word_stream, i)[0]
                if 0x20 <= char <= 0x7E or char in (0x0D, 0x0A, 0x09):
                    i += 2
                else:
                    break
            length = i - start
            if length >= 20:
                try:
                    text = word_stream[start:i].decode("utf-16-le", errors="replace")
                    candidates.append(text)
                except Exception:
                    pass
        else:
            i += 2

    if candidates:
        return "\n".join(candidates)

    try:
        return word_stream.decode("utf-16-le", errors="replace")
    except Exception:
        return ""
