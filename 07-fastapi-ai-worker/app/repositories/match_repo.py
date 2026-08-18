"""Repository for application match and gap analysis data access."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class MatchRepository:
    """Repository for loading application matching context and updating AI match results."""

    def __init__(self, db_manager: DatabaseManager) -> None:
        self.db_manager = db_manager

    async def load_application_match_context(self, application_id: str) -> Optional[Dict[str, Any]]:
        """Load complete application, candidate facts, and job requirements for match analysis."""
        app_query = text("""
            SELECT 
                ja.id AS application_id,
                ja.job_id,
                ja.candidate_id,
                ja.user_id,
                ja.is_guest,
                ja.guest_name,
                ja.cover_letter,
                ja.answers_to_screening_questions,
                ja.status::text AS application_status,
                j.title AS job_title,
                j.description AS job_description,
                j.responsibilities AS job_responsibilities,
                j.requirements AS job_requirements,
                j.ai_ideal_candidate_profile,
                csp.professional_title AS candidate_title,
                csp.skill_names AS candidate_skills,
                csp.total_experience_years AS candidate_experience_years,
                csp.searchable_text AS candidate_searchable_text
            FROM job_applications ja
            JOIN jobs j ON ja.job_id = j.id
            LEFT JOIN candidate_search_profiles csp ON ja.candidate_id = csp.candidate_id
            WHERE ja.id = :application_id AND ja.deleted_at IS NULL AND j.deleted_at IS NULL
        """)

        job_skills_query = text("""
            SELECT s.name AS skill_name, js.is_required
            FROM job_skills js
            JOIN skills s ON js.skill_id = s.id
            WHERE js.job_id = :job_id
        """)

        async with self.db_manager.transaction() as session:
            res = await session.execute(app_query, {"application_id": application_id})
            row = res.mappings().first()
            if not row:
                return None

            job_id = str(row["job_id"])
            skills_res = await session.execute(job_skills_query, {"job_id": job_id})
            skills_rows = skills_res.mappings().all()

            required_skills = [r["skill_name"] for r in skills_rows if r.get("is_required")]
            optional_skills = [r["skill_name"] for r in skills_rows if not r.get("is_required")]

            return {
                "application_id": str(row["application_id"]),
                "job_id": job_id,
                "candidate_id": str(row["candidate_id"]) if row.get("candidate_id") else None,
                "is_guest": row["is_guest"],
                "guest_name": row.get("guest_name"),
                "cover_letter": row.get("cover_letter"),
                "screening_answers": row.get("answers_to_screening_questions") or [],
                "job_title": row["job_title"],
                "job_description": row.get("job_description") or "",
                "job_responsibilities": row.get("job_responsibilities") or "",
                "job_requirements": row.get("job_requirements") or "",
                "ai_ideal_candidate_profile": row.get("ai_ideal_candidate_profile") or {},
                "required_skills": required_skills,
                "optional_skills": optional_skills,
                "candidate_title": row.get("candidate_title") or "",
                "candidate_skills": row.get("candidate_skills") or [],
                "candidate_experience_years": row.get("candidate_experience_years"),
                "candidate_searchable_text": row.get("candidate_searchable_text") or "",
            }

    async def update_application_match_result(
        self,
        application_id: str,
        match_score: float,
        match_details: Dict[str, Any],
        ranking_score: float,
        session: Optional[AsyncSession] = None,
    ) -> bool:
        """Atomic update to job_applications table setting match and ranking scores."""
        query = text("""
            UPDATE job_applications
            SET 
                ai_match_score = :match_score,
                ai_match_details = CAST(:match_details AS jsonb),
                ai_ranking_score = :ranking_score,
                updated_at = NOW()
            WHERE id = :application_id AND deleted_at IS NULL
        """)

        params = {
            "application_id": application_id,
            "match_score": round(match_score, 2),
            "match_details": json.dumps(match_details),
            "ranking_score": round(ranking_score, 2),
        }

        if session is not None:
            res = await session.execute(query, params)
            return (res.rowcount or 0) > 0

        async with self.db_manager.transaction() as s:
            res = await s.execute(query, params)
            return (res.rowcount or 0) > 0
