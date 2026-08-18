"""Repository for job screening questions generation and persistence."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class ScreeningQuestionsRepository:
    """Repository for loading job requirements and persisting generated screening questions."""

    def __init__(self, db_manager: DatabaseManager) -> None:
        self.db_manager = db_manager

    async def load_job_for_screening(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Load job content and required skills for screening questions generation."""
        job_query = text("""
            SELECT 
                j.id AS job_id,
                j.title,
                j.description,
                j.responsibilities,
                j.requirements,
                j.preferred_qualifications,
                j.work_mode::text AS work_mode,
                j.employment_type::text AS employment_type
            FROM jobs j
            WHERE j.id = :job_id AND j.deleted_at IS NULL
        """)

        skills_query = text("""
            SELECT s.name AS skill_name, js.is_required
            FROM job_skills js
            JOIN skills s ON js.skill_id = s.id
            WHERE js.job_id = :job_id
        """)

        async with self.db_manager.transaction() as session:
            res = await session.execute(job_query, {"job_id": job_id})
            row = res.mappings().first()
            if not row:
                return None

            skills_res = await session.execute(skills_query, {"job_id": job_id})
            skills_rows = skills_res.mappings().all()

            skills_list = [r["skill_name"] for r in skills_rows]

            return {
                "job_id": str(row["job_id"]),
                "title": row["title"],
                "description": row.get("description") or "",
                "responsibilities": row.get("responsibilities") or "",
                "requirements": row.get("requirements") or "",
                "preferred_qualifications": row.get("preferred_qualifications") or "",
                "work_mode": row.get("work_mode"),
                "employment_type": row.get("employment_type"),
                "skills": skills_list,
            }

    async def update_job_screening_questions(
        self,
        job_id: str,
        questions: List[Dict[str, Any]],
        session: Optional[AsyncSession] = None,
    ) -> bool:
        """Atomic update to jobs table saving screening questions array."""
        query = text("""
            UPDATE jobs
            SET 
                screening_questions = CAST(:questions AS jsonb),
                screening_questions_enabled = TRUE,
                updated_at = NOW()
            WHERE id = :job_id AND deleted_at IS NULL
        """)

        params = {
            "job_id": job_id,
            "questions": json.dumps(questions),
        }

        if session is not None:
            res = await session.execute(query, params)
            return (res.rowcount or 0) > 0

        async with self.db_manager.transaction() as s:
            res = await s.execute(query, params)
            return (res.rowcount or 0) > 0
