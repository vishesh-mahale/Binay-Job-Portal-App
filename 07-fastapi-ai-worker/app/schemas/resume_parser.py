"""Schemas for resume parsing and structured AI extraction output."""

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ResumeExtractedSchema(BaseModel):
    """Validated result for a parsed resume document."""

    model_config = ConfigDict(extra="forbid")

    extracted_text: str = Field(..., description="Raw extracted text from the document")
    raw_ai_output: Dict[str, Any] = Field(..., description="Original structured AI output")
    normalized_output: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Normalized canonical extracted candidate data",
    )
    confidence_details: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Per-field confidence and evidence details",
    )
    validation_result: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Validation result metadata from the parser",
    )
    overall_confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=100.0,
        description="Overall confidence score (0-100)",
    )
    schema_version: str = Field(default="1.0", description="Schema version for this parsed output")

    @field_validator("extracted_text")
    @classmethod
    def validate_extracted_text(cls, value: str) -> str:
        if not value or not value.strip():
            raise ValueError("extracted_text cannot be empty")
        return value

    @field_validator("raw_ai_output")
    @classmethod
    def validate_raw_ai_output(cls, value: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(value, dict):
            raise ValueError("raw_ai_output must be a JSON object")
        return value
