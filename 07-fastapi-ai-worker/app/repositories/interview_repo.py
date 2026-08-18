"""Repository for interview feedback loading and AI summary updates."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager


class InterviewRepository:
    """Repository for loading interview details and persisting AI assessment summaries."""

    def __init__(self, db_manager: DatabaseManager) -> None:
        self.db_manager = db_manager

    async def load_interview_context(self, interview_id: str) -> Optional[Dict[str, Any]]:
        """Load interview metadata, job context, and participant feedback entries."""
        interview_query = text("""
            SELECT 
                i.id AS interview_id,
                i.application_id,
                i.job_id,
                i.candidate_id,
                i.title AS interview_title,
                i.interview_type::text AS interview_type,
                j.title AS job_title,
                j.description AS job_description
            FROM interviews i
            JOIN jobs j ON i.job_id = j.id
            WHERE i.id = :interview_id AND i.deleted_at IS NULL
        """)

        feedback_query = text("""
            SELECT 
                f.id AS feedback_id,
                f.participant_id,
                f.decision::text AS decision,
                f.technical_skill,
                f.communication,
                f.problem_solving,
                f.cultural_fit,
                f.leadership,
                f.overall_rating,
                f.strengths,
                f.weaknesses,
                f.notes,
                f.is_final,
                p.role AS participant_role
            FROM interview_feedback f
            JOIN interview_participants p ON f.participant_id = p.id
            WHERE f.interview_id = :interview_id
        """)

        async with self.db_manager.transaction() as session:
            res = await session.execute(interview_query, {"interview_id": interview_id})
            row = res.mappings().first()
            if not row:
                return None

            fb_res = await session.execute(feedback_query, {"interview_id": interview_id})
            fb_rows = fb_res.mappings().all()

            feedback_list = [dict(r) for r in fb_rows]

            return {
                "interview_id": str(row["interview_id"]),
                "application_id": str(row["application_id"]),
                "job_id": str(row["job_id"]),
                "candidate_id": str(row["candidate_id"]) if row.get("candidate_id") else None,
                "interview_title": row["interview_title"],
                "interview_type": row.get("interview_type"),
                "job_title": row["job_title"],
                "job_description": row.get("job_description") or "",
                "feedback_list": feedback_list,
            }

    async def update_interview_ai_summary(
        self,
        interview_id: str,
        participant_id: str,
        ai_summary: str,
        session: Optional[AsyncSession] = None,
    ) -> bool:
        """Update interview_feedback.ai_summary without overwriting submitted human notes."""
        query = text("""
            UPDATE interview_feedback
            SET 
                ai_summary = :ai_summary,
                updated_at = NOW()
            WHERE interview_id = :interview_id 
              AND participant_id = :participant_id
        """)

        params = {
            "interview_id": interview_id,
            "participant_id": participant_id,
            "ai_summary": ai_summary,
        }

        if session is not None:
            res = await session.execute(query, params)
            return (res.rowcount or 0) > 0

        async with self.db_manager.transaction() as s:
            res = await s.execute(query, params)
            return (res.rowcount or 0) > 0
