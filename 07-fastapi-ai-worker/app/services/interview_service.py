"""Interview AI Feedback Synthesis Service (Section 6.6)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import Settings, get_settings
from app.core.exceptions import AIProviderError, AIResponseValidationError
from app.core.logging import get_logger
from app.providers.base import LLMProvider
from app.schemas.interview_summary import InterviewSummaryResult

logger = get_logger(__name__)

INTERVIEW_SUMMARY_SCHEMA = {
    "type": "object",
    "required": ["summary", "strengths", "weaknesses", "recommendation"],
    "properties": {
        "summary": {"type": "string"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "weaknesses": {"type": "array", "items": {"type": "string"}},
        "technical_assessment": {"type": "string"},
        "cultural_fit_assessment": {"type": "string"},
        "recommendation": {"type": "string"},
    },
    "additionalProperties": False,
}


class InterviewService:
    """Service that synthesizes multi-interviewer feedback into cohesive AI summaries."""

    def __init__(
        self,
        llm_provider: LLMProvider,
        settings: Optional[Settings] = None,
    ) -> None:
        self.llm = llm_provider
        self.settings = settings or get_settings()

    async def generate_interview_summary(
        self,
        interview_context: Dict[str, Any],
    ) -> InterviewSummaryResult:
        """Synthesize participant feedback and score ratings into an executive interview summary."""
        system_prompt = (
            "You are an executive hiring panel synthesizer. "
            "Given candidate interview feedback, ratings, and interviewer notes, "
            "synthesize a concise, unbiased, objective assessment highlighting key strengths, "
            "concerns/weaknesses, and consensus recommendation. "
            "Output strictly valid JSON matching schema."
        )

        feedback_entries = []
        for fb in interview_context.get("feedback_list", []):
            feedback_entries.append(
                f"- Interviewer ({fb.get('participant_role')}): Decision={fb.get('decision')}, "
                f"Technical={fb.get('technical_skill')}/5, Comm={fb.get('communication')}/5, "
                f"ProblemSolving={fb.get('problem_solving')}/5, Culture={fb.get('cultural_fit')}/5. "
                f"Strengths='{fb.get('strengths')}'. Weaknesses='{fb.get('weaknesses')}'. "
                f"Notes='{fb.get('notes')}'"
            )

        user_prompt = (
            f"Job Title: {interview_context.get('job_title')}\n"
            f"Interview: {interview_context.get('interview_title')} ({interview_context.get('interview_type')})\n"
            f"Feedback List:\n" + ("\n".join(feedback_entries) if feedback_entries else "No individual notes recorded.")
        )

        try:
            raw_ai = await self.llm.generate_structured(
                prompt=system_prompt,
                user_input=user_prompt,
                response_schema=INTERVIEW_SUMMARY_SCHEMA,
            )
        except AIProviderError:
            raise
        except Exception as exc:
            logger.error("Interview summary LLM invocation failed", error=str(exc))
            raise AIProviderError(f"Interview summary generation failed: {exc}") from exc

        try:
            summary_text = raw_ai.get("summary") or "Interview summary evaluated."
            strengths = [str(s) for s in raw_ai.get("strengths", []) if s]
            weaknesses = [str(w) for w in raw_ai.get("weaknesses", []) if w]
            recommendation = str(raw_ai.get("recommendation") or "Review")

            now_iso = datetime.now(timezone.utc).isoformat()
            return InterviewSummaryResult(
                summary=summary_text,
                strengths=strengths,
                weaknesses=weaknesses,
                technical_assessment=raw_ai.get("technical_assessment"),
                cultural_fit_assessment=raw_ai.get("cultural_fit_assessment"),
                recommendation=recommendation,
                model_name=self.llm.model_name,
                generated_at=now_iso,
            )
        except Exception as validation_err:
            logger.error("Failed to parse interview summary response", error=str(validation_err), raw=raw_ai)
            raise AIResponseValidationError(f"Invalid interview summary payload: {validation_err}") from validation_err
