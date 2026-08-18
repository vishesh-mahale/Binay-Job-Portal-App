"""
Repository for Job AI Profile and 768-dim Embedding Persistence (JD-001).
Interacts with jobs, job_skills, job_locations, and job_categories tables.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager
from app.core.logging import get_logger
from app.schemas.job_enrichment import JobCanonicalAggregate, JobEnrichmentResult

logger = get_logger(__name__)


class JobRepository:
    """Manages job loading, optimistic concurrency stale verification, and AI enrichment persistence."""

    def __init__(self, db_manager: DatabaseManager) -> None:
        self.db_manager = db_manager

    async def load_job_aggregate(self, job_id: str) -> Optional[JobCanonicalAggregate]:
        """
        Load complete canonical job data with skills and locations for AI enrichment.
        Read-only query executed outside transaction.
        """
        job_query = text("""
            SELECT 
                j.id,
                j.title,
                j.slug,
                j.category AS denorm_category,
                j.employment_type::text AS employment_type,
                j.work_mode::text AS work_mode,
                j.experience_level::text AS experience_level,
                j.salary_min,
                j.salary_max,
                j.salary_currency::text AS salary_currency,
                j.description,
                j.responsibilities,
                j.requirements,
                j.preferred_qualifications,
                j.benefits,
                j.location_city,
                j.location_state,
                j.location_country,
                j.updated_at,
                jc.name AS category_name
            FROM jobs j
            LEFT JOIN job_categories jc ON j.category_id = jc.id
            WHERE j.id = :job_id AND j.deleted_at IS NULL
        """)

        skills_query = text("""
            SELECT s.name AS skill_name
            FROM job_skills js
            JOIN skills s ON js.skill_id = s.id
            WHERE js.job_id = :job_id
            ORDER BY js.importance_score DESC, js.is_required DESC
        """)

        locations_query = text("""
            SELECT city, state, country, is_primary
            FROM job_locations
            WHERE job_id = :job_id
            ORDER BY is_primary DESC, created_at ASC
        """)

        async with self.db_manager.transaction() as session:
            job_res = await session.execute(job_query, {"job_id": job_id})
            job_row = job_res.mappings().first()
            if not job_row:
                return None

            skills_res = await session.execute(skills_query, {"job_id": job_id})
            skill_rows = skills_res.mappings().all()
            skills_list = [r["skill_name"] for r in skill_rows if r.get("skill_name")]

            locs_res = await session.execute(locations_query, {"job_id": job_id})
            loc_rows = locs_res.mappings().all()
            formatted_locs: List[str] = []
            for r in loc_rows:
                parts = [p.strip() for p in [r.get("city"), r.get("state"), r.get("country")] if p and p.strip()]
                if parts:
                    formatted_locs.append(", ".join(parts))

            # Fallback if no separate job_locations exist but denormalized city exists
            if not formatted_locs and job_row.get("location_city"):
                fallback_parts = [
                    p.strip()
                    for p in [job_row.get("location_city"), job_row.get("location_state"), job_row.get("location_country")]
                    if p and p.strip()
                ]
                if fallback_parts:
                    formatted_locs.append(", ".join(fallback_parts))

            category = job_row.get("category_name") or job_row.get("denorm_category")

            return JobCanonicalAggregate(
                job_id=str(job_row["id"]),
                title=job_row["title"] or "",
                slug=job_row.get("slug"),
                category=category,
                employment_type=job_row.get("employment_type"),
                work_mode=job_row.get("work_mode"),
                experience_level=job_row.get("experience_level"),
                salary_min=float(job_row["salary_min"]) if job_row.get("salary_min") is not None else None,
                salary_max=float(job_row["salary_max"]) if job_row.get("salary_max") is not None else None,
                salary_currency=job_row.get("salary_currency") or "INR",
                description=job_row.get("description") or "",
                responsibilities=job_row.get("responsibilities"),
                requirements=job_row.get("requirements"),
                preferred_qualifications=job_row.get("preferred_qualifications"),
                benefits=job_row.get("benefits"),
                skills=skills_list,
                locations=formatted_locs,
                updated_at=job_row["updated_at"],
            )

    async def check_stale_job(self, job_id: str, stored_updated_at: datetime) -> bool:
        """
        Check if the job was updated in NestJS while AI enrichment was processing.
        Returns True if job has changed or is deleted (stale), False if clean.
        """
        query = text("SELECT updated_at FROM jobs WHERE id = :job_id AND deleted_at IS NULL")

        async with self.db_manager.transaction() as session:
            res = await session.execute(query, {"job_id": job_id})
            row = res.mappings().first()

            if not row:
                logger.warning("Job no longer exists or deleted", job_id=job_id)
                return True

            current_updated_at = row["updated_at"]
            if current_updated_at != stored_updated_at:
                logger.info(
                    "Stale job detected; updated_at mismatch",
                    job_id=job_id,
                    current_updated_at=str(current_updated_at),
                    stored_updated_at=str(stored_updated_at),
                )
                return True

            return False

    async def update_job_ai_enrichment(
        self,
        result: JobEnrichmentResult,
        session: AsyncSession,
    ) -> bool:
        """
        Atomically updates jobs table with AI candidate profile JSONB and 768-dim vector embedding.
        Enforces optimistic concurrency via WHERE id = :job_id AND updated_at = :stored_updated_at.
        Satisfies database constraint jobs_ai_profile_metadata_presence.
        """
        ai_profile_dict = result.ai_profile.model_dump()
        ai_profile_json = json.dumps(ai_profile_dict)
        vector_literal = "[" + ",".join(str(f) for f in result.embedding) + "]"

        update_query = text("""
            UPDATE jobs SET
                ai_ideal_candidate_profile = CAST(:ai_profile_json AS JSONB),
                ai_profile_model = :ai_profile_model,
                ai_profile_version = :ai_profile_version,
                ai_generated_at = NOW(),
                embedding = CAST(:embedding_vector AS vector(768)),
                embedding_status = 'completed',
                embedding_model = :embedding_model,
                embedding_version = :embedding_version,
                embedding_generated_at = NOW()
            WHERE id = :job_id
              AND updated_at = :stored_updated_at
              AND deleted_at IS NULL
        """)

        db_res = await session.execute(
            update_query,
            {
                "job_id": result.job_id,
                "ai_profile_json": ai_profile_json,
                "ai_profile_model": result.ai_profile.metadata.model,
                "ai_profile_version": 1,
                "embedding_vector": vector_literal,
                "embedding_model": result.embedding_model,
                "embedding_version": result.embedding_version,
                "stored_updated_at": result.stored_updated_at,
            },
        )

        rows_updated = db_res.rowcount if hasattr(db_res, "rowcount") else 0
        if rows_updated == 0:
            logger.warning(
                "Job update affected 0 rows (stale guard triggered or job deleted)",
                job_id=result.job_id,
            )
            return False

        logger.info(
            "Job AI profile and 768-dim embedding updated successfully",
            job_id=result.job_id,
            embedding_model=result.embedding_model,
        )
        return True
