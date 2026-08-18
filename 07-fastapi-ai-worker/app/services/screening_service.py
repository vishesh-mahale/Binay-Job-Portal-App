"""Job Screening Questions Generation Service (Section 6.7.1)."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import Settings, get_settings
from app.core.exceptions import AIProviderError, AIResponseValidationError
from app.core.logging import get_logger
from app.providers.base import LLMProvider
from app.schemas.screening_questions import (
    JobScreeningQuestionsResult,
    ScreeningQuestionItem,
)

logger = get_logger(__name__)

SCREENING_QUESTIONS_SCHEMA = {
    "type": "object",
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["question", "category", "required", "question_type"],
                "properties": {
                    "question": {"type": "string"},
                    "category": {"type": "string"},
                    "required": {"type": "boolean"},
                    "question_type": {"type": "string"},
                    "options": {"type": "array", "items": {"type": "string"}},
                },
                "additionalProperties": False,
            },
        }
    },
    "additionalProperties": False,
}


class ScreeningService:
    """Service that generates customized applicant screening questions for a job posting."""

    def __init__(
        self,
        llm_provider: LLMProvider,
        settings: Optional[Settings] = None,
    ) -> None:
        self.llm = llm_provider
        self.settings = settings or get_settings()

    async def generate_screening_questions(
        self,
        job_context: Dict[str, Any],
    ) -> JobScreeningQuestionsResult:
        """Generate 3-6 tailored screening questions based on job skills, responsibilities, and requirements."""
        system_prompt = (
            "You are an expert technical talent recruiter. "
            "Generate 3 to 6 practical applicant screening questions for the given job. "
            "Focus on mandatory skills, essential experience, work authorizations/logistics, and domain experience. "
            "Never generate discriminatory or illegal questions (age, race, religion, gender, marital status). "
            "Return valid structured JSON matching schema."
        )

        user_prompt = (
            f"Title: {job_context.get('title')}\n"
            f"Work Mode: {job_context.get('work_mode')}\n"
            f"Employment Type: {job_context.get('employment_type')}\n"
            f"Required Skills: {', '.join(job_context.get('skills', []))}\n"
            f"Responsibilities: {job_context.get('responsibilities')}\n"
            f"Requirements: {job_context.get('requirements')}\n"
            f"Preferred Qualifications: {job_context.get('preferred_qualifications')}\n"
        )

        try:
            raw_ai = await self.llm.generate_structured(
                prompt=system_prompt,
                user_input=user_prompt,
                response_schema=SCREENING_QUESTIONS_SCHEMA,
            )
        except AIProviderError:
            raise
        except Exception as exc:
            logger.error("Screening questions LLM invocation failed", error=str(exc))
            raise AIProviderError(f"Screening questions generation failed: {exc}") from exc

        try:
            raw_questions = raw_ai.get("questions") or []
            items = []
            for q in raw_questions:
                if isinstance(q, dict) and "question" in q:
                    q_id = str(uuid.uuid4())
                    items.append(
                        ScreeningQuestionItem(
                            id=q_id,
                            question=q["question"],
                            category=q.get("category", "technical"),
                            required=bool(q.get("required", True)),
                            question_type=q.get("question_type", "text"),
                            options=q.get("options"),
                        )
                    )

            if not items:
                items.append(
                    ScreeningQuestionItem(
                        id=str(uuid.uuid4()),
                        question="Do you meet the core requirements for this position?",
                        category="technical",
                        required=True,
                        question_type="boolean",
                    )
                )

            now_iso = datetime.now(timezone.utc).isoformat()
            return JobScreeningQuestionsResult(
                questions=items,
                model_name=self.llm.model_name,
                generated_at=now_iso,
            )
        except Exception as validation_err:
            logger.error("Failed to parse screening questions response", error=str(validation_err), raw=raw_ai)
            raise AIResponseValidationError(f"Invalid screening questions payload: {validation_err}") from validation_err
