"""Match & Gap Analysis Service (Section 6.3)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.core.config import Settings, get_settings
from app.core.exceptions import AIProviderError, AIResponseValidationError
from app.core.logging import get_logger
from app.providers.base import LLMProvider
from app.schemas.match_analysis import (
    ExperienceMatchDetail,
    GapItem,
    MatchAnalysisResult,
    MatchScoreDetails,
    SkillMatchDetail,
)

logger = get_logger(__name__)

MATCH_ANALYSIS_SCHEMA = {
    "type": "object",
    "required": [
        "overall_match_score",
        "ranking_score",
        "skills_match_score",
        "experience_match_score",
        "domain_match_score",
    ],
    "properties": {
        "overall_match_score": {"type": "number"},
        "ranking_score": {"type": "number"},
        "skills_match_score": {"type": "number"},
        "experience_match_score": {"type": "number"},
        "domain_match_score": {"type": "number"},
        "skills_breakdown": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["skill_name", "matched"],
                "properties": {
                    "skill_name": {"type": "string"},
                    "matched": {"type": "boolean"},
                    "importance": {"type": "string"},
                    "candidate_source": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        "experience_breakdown": {
            "type": "object",
            "properties": {
                "required_years_min": {"type": "number"},
                "candidate_years": {"type": "number"},
                "meets_requirement": {"type": "boolean"},
            },
            "additionalProperties": False,
        },
        "gaps": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["category", "description"],
                "properties": {
                    "category": {"type": "string"},
                    "description": {"type": "string"},
                    "severity": {"type": "string"},
                },
                "additionalProperties": False,
            },
        },
        "fit_summary": {"type": "string"},
    },
    "additionalProperties": False,
}


class MatchService:
    """Service that computes AI match score and gap analysis for job applications."""

    def __init__(
        self,
        llm_provider: LLMProvider,
        settings: Optional[Settings] = None,
    ) -> None:
        self.llm = llm_provider
        self.settings = settings or get_settings()

    async def analyze_application_match(
        self,
        context: Dict[str, Any],
    ) -> MatchAnalysisResult:
        """Run structured LLM match evaluation on candidate facts vs job requirements."""
        system_prompt = (
            "You are an objective recruitment matching intelligence agent. "
            "Evaluate the candidate profile against the job posting requirements. "
            "Output scores from 0.0 to 100.0, detailed skills breakdown, experience comparison, "
            "identified qualification gaps, and an executive fit summary. "
            "Output must strictly follow JSON schema."
        )

        user_prompt = (
            f"Job Title: {context.get('job_title')}\n"
            f"Job Required Skills: {', '.join(context.get('required_skills', []))}\n"
            f"Job Optional Skills: {', '.join(context.get('optional_skills', []))}\n"
            f"Candidate Title: {context.get('candidate_title')}\n"
            f"Candidate Skills: {', '.join(context.get('candidate_skills', []))}\n"
            f"Candidate Experience Years: {context.get('candidate_experience_years', 'N/A')}\n"
        )

        try:
            raw_ai = await self.llm.generate_structured(
                prompt=system_prompt,
                user_input=user_prompt,
                response_schema=MATCH_ANALYSIS_SCHEMA,
            )
        except AIProviderError:
            raise
        except Exception as exc:
            logger.error("Match analysis LLM invocation failed", error=str(exc))
            raise AIProviderError(f"Match evaluation failed: {exc}") from exc

        try:
            overall_score = float(raw_ai.get("overall_match_score", 0.0))
            ranking_score = float(raw_ai.get("ranking_score", overall_score))
            skills_score = float(raw_ai.get("skills_match_score", 0.0))
            exp_score = float(raw_ai.get("experience_match_score", 0.0))
            domain_score = float(raw_ai.get("domain_match_score", 0.0))

            skills_breakdown = []
            for s in raw_ai.get("skills_breakdown", []):
                if isinstance(s, dict) and "skill_name" in s:
                    skills_breakdown.append(
                        SkillMatchDetail(
                            skill_name=s["skill_name"],
                            matched=bool(s.get("matched", False)),
                            importance=s.get("importance", "required"),
                            candidate_source=s.get("candidate_source"),
                        )
                    )

            exp_data = raw_ai.get("experience_breakdown")
            exp_breakdown = None
            if isinstance(exp_data, dict) and exp_data.get("meets_requirement") is not None:
                exp_breakdown = ExperienceMatchDetail(
                    required_years_min=exp_data.get("required_years_min"),
                    candidate_years=exp_data.get("candidate_years"),
                    meets_requirement=bool(exp_data.get("meets_requirement", True)),
                )

            gaps = []
            for g in raw_ai.get("gaps", []):
                if isinstance(g, dict) and "category" in g and "description" in g:
                    gaps.append(
                        GapItem(
                            category=g["category"],
                            description=g["description"],
                            severity=g.get("severity", "medium"),
                        )
                    )

            now_iso = datetime.now(timezone.utc).isoformat()
            details = MatchScoreDetails(
                skills_match_score=min(100.0, max(0.0, skills_score)),
                experience_match_score=min(100.0, max(0.0, exp_score)),
                domain_match_score=min(100.0, max(0.0, domain_score)),
                skills_breakdown=skills_breakdown,
                experience_breakdown=exp_breakdown,
                gaps=gaps,
                fit_summary=raw_ai.get("fit_summary", ""),
                evaluated_at=now_iso,
                model_name=self.llm.model_name,
            )

            return MatchAnalysisResult(
                match_score=round(min(100.0, max(0.0, overall_score)), 2),
                ranking_score=round(min(100.0, max(0.0, ranking_score)), 2),
                details=details,
            )
        except Exception as validation_err:
            logger.error("Failed to parse match analysis response", error=str(validation_err), raw=raw_ai)
            raise AIResponseValidationError(f"Invalid match evaluation payload: {validation_err}") from validation_err
