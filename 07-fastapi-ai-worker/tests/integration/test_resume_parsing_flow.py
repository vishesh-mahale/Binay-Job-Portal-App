import pytest

from app.schemas.resume_parser import ResumeExtractedSchema
from app.services.document_extractor import DocumentExtractor


class TestResumeParsingPhase2:
    def test_resume_extracted_schema_validates_required_fields(self):
        payload = {
            "extracted_text": "John Doe\nPython Engineer",
            "raw_ai_output": {"name": "John Doe", "skills": ["Python"]},
            "normalized_output": {"name": "John Doe", "skills": ["Python"]},
            "confidence_details": {"overall": 0.92},
            "validation_result": {"valid": True},
            "overall_confidence": 92.0,
            "schema_version": "1.0",
        }

        model = ResumeExtractedSchema.model_validate(payload)

        assert model.extracted_text.startswith("John Doe")
        assert model.normalized_output["skills"][0] == "Python"
        assert model.overall_confidence == 92.0

    def test_document_extractor_reads_plain_text_and_rejects_invalid_magic(self):
        extractor = DocumentExtractor()

        text = extractor.extract_from_bytes(
            filename="resume.txt",
            content=b"John Doe\nSoftware Engineer\n",
        )

        assert "John Doe" in text.extracted_text

        with pytest.raises(ValueError):
            extractor.extract_from_bytes(filename="resume.pdf", content=b"not-a-pdf")

    def test_document_extractor_rejects_oversized_document(self):
        extractor = DocumentExtractor(max_document_size_bytes=10)

        with pytest.raises(ValueError):
            extractor.extract_from_bytes(filename="resume.txt", content=b"12345678901")
