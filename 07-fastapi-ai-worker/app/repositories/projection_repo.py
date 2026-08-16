"""Repository for candidate search profile projection operations (PD-002)."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import DatabaseManager
from app.schemas.candidate_search import (
    CandidateCanonicalAggregate,
    CandidateSearchProfileUpsert,
)
from app.core.logging import get_logger

logger = get_logger(__name__)


class CandidateProjectionRepository:
    """Manages candidate profile aggregate loading, stale checking, and projection UPSERT."""

    def __init__(self, db_manager: DatabaseManager) -> None:
        self.db_manager = db_manager

    async def _with_session(
        self, session: Optional[AsyncSession] = None
    ) -> AsyncGenerator[AsyncSession, None]:
        if session is not None:
            yield session
            return
        async with self.db_manager.session_maker() as s:
            yield s

    async def load_candidate_aggregate(
        self, candidate_id: str, session: Optional[AsyncSession] = None
    ) -> Optional[CandidateCanonicalAggregate]:
        """
        Load candidate canonical profile, child facts, and active resume parsed data.
        
        All queries are read-only and filter by deleted_at IS NULL.
        """
        async for s in self._with_session(session):
            # 1. Candidate base profile
            profile_query = """
                SELECT id, user_id, professional_title, summary,
                       city, state, country, current_location,
                       preferred_work_mode, willing_to_relocate, willing_to_travel,
                       notice_period_days, expected_salary_min, expected_salary_max,
                       salary_currency, is_open_to_work, profile_revision
                FROM candidate_profiles
                WHERE id = :candidate_id AND deleted_at IS NULL
            """
            result = await s.execute(text(profile_query), {"candidate_id": candidate_id})
            profile_row = result.mappings().first()
            if not profile_row:
                return None

            profile_data = dict(profile_row)

            # 2. Canonical skills (with linked skill name if present)
            skills_query = """
                SELECT cs.id, cs.candidate_id, cs.skill_id, cs.custom_skill_name,
                       cs.proficiency_level, cs.years_of_experience, cs.primary_source_type,
                       cs.verification_status, cs.candidate_confirmed_at,
                       s.name AS master_skill_name
                FROM candidate_skills cs
                LEFT JOIN skills s ON cs.skill_id = s.id
                WHERE cs.candidate_id = :candidate_id AND cs.deleted_at IS NULL
                ORDER BY cs.candidate_confirmed_at DESC NULLS LAST, cs.created_at DESC
            """
            skills_res = await s.execute(text(skills_query), {"candidate_id": candidate_id})
            skills = [dict(r) for r in skills_res.mappings().all()]

            # 3. Canonical experiences
            exp_query = """
                SELECT id, candidate_id, company_name, job_title, employment_type,
                       location, start_date, end_date, is_current, description,
                       responsibilities, achievements, primary_source_type,
                       verification_status, candidate_confirmed_at
                FROM candidate_experiences
                WHERE candidate_id = :candidate_id AND deleted_at IS NULL
                ORDER BY display_order ASC, start_date DESC NULLS LAST
            """
            exp_res = await s.execute(text(exp_query), {"candidate_id": candidate_id})
            experiences = [dict(r) for r in exp_res.mappings().all()]

            # 4. Canonical educations
            edu_query = """
                SELECT id, candidate_id, institution_name, degree, field_of_study,
                       start_date, end_date, is_current, grade, description,
                       primary_source_type, verification_status, candidate_confirmed_at
                FROM candidate_educations
                WHERE candidate_id = :candidate_id AND deleted_at IS NULL
                ORDER BY display_order ASC, start_date DESC NULLS LAST
            """
            edu_res = await s.execute(text(edu_query), {"candidate_id": candidate_id})
            educations = [dict(r) for r in edu_res.mappings().all()]

            # 5. Canonical certifications
            cert_query = """
                SELECT id, candidate_id, name, issuer, credential_id, credential_url,
                       issued_at, expires_at, does_not_expire, primary_source_type,
                       verification_status, candidate_confirmed_at
                FROM candidate_certifications
                WHERE candidate_id = :candidate_id AND deleted_at IS NULL
                ORDER BY issued_at DESC NULLS LAST
            """
            cert_res = await s.execute(text(cert_query), {"candidate_id": candidate_id})
            certifications = [dict(r) for r in cert_res.mappings().all()]

            # 6. Canonical projects
            proj_query = """
                SELECT id, candidate_id, title, description, project_url, repository_url,
                       started_at, completed_at, technologies, primary_source_type,
                       verification_status, candidate_confirmed_at
                FROM candidate_projects
                WHERE candidate_id = :candidate_id AND deleted_at IS NULL
                ORDER BY display_order ASC, started_at DESC NULLS LAST
            """
            proj_res = await s.execute(text(proj_query), {"candidate_id": candidate_id})
            projects = [dict(r) for r in proj_res.mappings().all()]

            # 7. Canonical languages
            lang_query = """
                SELECT id, candidate_id, language_name, proficiency,
                       primary_source_type, verification_status, candidate_confirmed_at
                FROM candidate_languages
                WHERE candidate_id = :candidate_id AND deleted_at IS NULL
            """
            lang_res = await s.execute(text(lang_query), {"candidate_id": candidate_id})
            languages = [dict(r) for r in lang_res.mappings().all()]

            # 8. Active resume document lookup (PD-002)
            doc_query = """
                SELECT document_id
                FROM candidate_profile_documents
                WHERE candidate_id = :candidate_id
                  AND document_role = 'resume'
                  AND is_current = TRUE
                  AND unlinked_at IS NULL
                LIMIT 1
            """
            doc_res = await s.execute(text(doc_query), {"candidate_id": candidate_id})
            doc_row = doc_res.mappings().first()

            active_doc_id: Optional[str] = str(doc_row["document_id"]) if doc_row else None
            active_parsing_result_id: Optional[str] = None
            active_parsed_data: Optional[Dict[str, Any]] = None

            if active_doc_id:
                # Load latest completed parsing result for active resume
                parse_query = """
                    SELECT rp.id AS parsing_result_id, rp.document_id,
                           rp.normalized_output, rp.raw_ai_output, rp.extracted_text
                    FROM resume_parsing_jobs rpj
                    JOIN resume_parsed_data rp ON rp.parsing_job_id = rpj.id
                    WHERE rpj.document_id = :active_document_id
                      AND rpj.status = 'completed'
                    ORDER BY rpj.completed_at DESC, rp.created_at DESC
                    LIMIT 1
                """
                parse_res = await s.execute(text(parse_query), {"active_document_id": active_doc_id})
                parse_row = parse_res.mappings().first()
                if parse_row:
                    active_parsing_result_id = str(parse_row["parsing_result_id"])
                    active_parsed_data = {
                        "normalized_output": parse_row["normalized_output"],
                        "raw_ai_output": parse_row["raw_ai_output"],
                        "extracted_text": parse_row["extracted_text"],
                    }

            return CandidateCanonicalAggregate(
                candidate_id=str(profile_data["id"]),
                user_id=str(profile_data["user_id"]) if profile_data.get("user_id") else None,
                profile_revision=profile_data.get("profile_revision", 1),
                professional_title=profile_data.get("professional_title"),
                summary=profile_data.get("summary"),
                city=profile_data.get("city"),
                state=profile_data.get("state"),
                country=profile_data.get("country"),
                current_location=profile_data.get("current_location"),
                preferred_work_mode=str(profile_data["preferred_work_mode"]) if profile_data.get("preferred_work_mode") else None,
                willing_to_relocate=bool(profile_data.get("willing_to_relocate", False)),
                willing_to_travel=bool(profile_data.get("willing_to_travel", False)),
                notice_period_days=profile_data.get("notice_period_days"),
                expected_salary_min=float(profile_data["expected_salary_min"]) if profile_data.get("expected_salary_min") is not None else None,
                expected_salary_max=float(profile_data["expected_salary_max"]) if profile_data.get("expected_salary_max") is not None else None,
                salary_currency=str(profile_data.get("salary_currency", "INR")),
                is_open_to_work=bool(profile_data.get("is_open_to_work", True)),
                skills=skills,
                experiences=experiences,
                educations=educations,
                certifications=certifications,
                projects=projects,
                languages=languages,
                active_resume_document_id=active_doc_id,
                active_resume_parsing_result_id=active_parsing_result_id,
                active_resume_parsed_data=active_parsed_data,
            )

    async def check_stale_source_state(
        self,
        candidate_id: str,
        stored_revision: int,
        stored_document_id: Optional[str],
        stored_parsing_result_id: Optional[str],
        session: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Check if candidate source state has evolved since initial read.
        
        Returns True if STALE (newer source state exists -> skip write to coalesce).
        Returns False if current source state still matches stored tuple.
        """
        async for s in self._with_session(session):
            # 1. Check profile_revision
            rev_res = await s.execute(
                text("SELECT profile_revision FROM candidate_profiles WHERE id = :id AND deleted_at IS NULL"),
                {"id": candidate_id},
            )
            rev_row = rev_res.mappings().first()
            if not rev_row:
                return True
            current_revision = rev_row["profile_revision"]
            if current_revision != stored_revision:
                logger.info(
                    "Stale projection detected: profile_revision changed",
                    candidate_id=candidate_id,
                    stored=stored_revision,
                    current=current_revision,
                )
                return True

            # 2. Check active resume document
            doc_res = await s.execute(
                text(
                    "SELECT document_id FROM candidate_profile_documents "
                    "WHERE candidate_id = :id AND document_role = 'resume' "
                    "AND is_current = TRUE AND unlinked_at IS NULL LIMIT 1"
                ),
                {"id": candidate_id},
            )
            doc_row = doc_res.mappings().first()
            current_doc_id = str(doc_row["document_id"]) if doc_row else None
            if current_doc_id != stored_document_id:
                logger.info(
                    "Stale projection detected: active resume document changed",
                    candidate_id=candidate_id,
                    stored=stored_document_id,
                    current=current_doc_id,
                )
                return True

            # 3. Check active parsing result (if document exists)
            current_result_id: Optional[str] = None
            if current_doc_id:
                parse_res = await s.execute(
                    text(
                        "SELECT rp.id AS parsing_result_id "
                        "FROM resume_parsing_jobs rpj "
                        "JOIN resume_parsed_data rp ON rp.parsing_job_id = rpj.id "
                        "WHERE rpj.document_id = :doc_id AND rpj.status = 'completed' "
                        "ORDER BY rpj.completed_at DESC, rp.created_at DESC LIMIT 1"
                    ),
                    {"doc_id": current_doc_id},
                )
                parse_row = parse_res.mappings().first()
                if parse_row:
                    current_result_id = str(parse_row["parsing_result_id"])

            if current_result_id != stored_parsing_result_id:
                logger.info(
                    "Stale projection detected: resume parsing result changed",
                    candidate_id=candidate_id,
                    stored=stored_parsing_result_id,
                    current=current_result_id,
                )
                return True

            return False

    async def upsert_search_profile(
        self,
        data: CandidateSearchProfileUpsert,
        session: Optional[AsyncSession] = None,
    ) -> bool:
        """
        Atomic revision-guarded UPSERT into candidate_search_profiles.
        
        Guarantees projection_revision <= source_profile_revision and
        prevents stale workers from overwriting newer projections.
        """
        query = """
            INSERT INTO candidate_search_profiles (
                candidate_id, source_profile_revision, projection_revision,
                active_resume_document_id, active_resume_parsing_result_id,
                professional_title, normalized_titles, skill_ids, skill_names,
                locations, fact_sources, total_experience_years, highest_education_level,
                searchable_text, search_vector, embedding, embedding_model, embedding_version, generated_at
            ) VALUES (
                :candidate_id, :source_profile_revision, :projection_revision,
                :active_resume_document_id, :active_resume_parsing_result_id,
                :professional_title, :normalized_titles, :skill_ids, :skill_names,
                :locations, :fact_sources, :total_experience_years, :highest_education_level,
                :searchable_text, to_tsvector('english', :searchable_text),
                :embedding, :embedding_model, :embedding_version, NOW()
            )
            ON CONFLICT (candidate_id) DO UPDATE SET
                source_profile_revision = EXCLUDED.source_profile_revision,
                projection_revision = EXCLUDED.projection_revision,
                active_resume_document_id = EXCLUDED.active_resume_document_id,
                active_resume_parsing_result_id = EXCLUDED.active_resume_parsing_result_id,
                professional_title = EXCLUDED.professional_title,
                normalized_titles = EXCLUDED.normalized_titles,
                skill_ids = EXCLUDED.skill_ids,
                skill_names = EXCLUDED.skill_names,
                locations = EXCLUDED.locations,
                fact_sources = EXCLUDED.fact_sources,
                total_experience_years = EXCLUDED.total_experience_years,
                highest_education_level = EXCLUDED.highest_education_level,
                searchable_text = EXCLUDED.searchable_text,
                search_vector = to_tsvector('english', EXCLUDED.searchable_text),
                embedding = EXCLUDED.embedding,
                embedding_model = EXCLUDED.embedding_model,
                embedding_version = EXCLUDED.embedding_version,
                generated_at = NOW()
            WHERE candidate_search_profiles.projection_revision <= EXCLUDED.projection_revision
        """

        # PostgreSQL vector format: '[0.123,0.456,...]'
        embedding_str = "[" + ",".join(str(x) for x in data.embedding) + "]"

        async for s in self._with_session(session):
            try:
                result = await s.execute(
                    text(query),
                    {
                        "candidate_id": data.candidate_id,
                        "source_profile_revision": data.source_profile_revision,
                        "projection_revision": data.projection_revision,
                        "active_resume_document_id": data.active_resume_document_id,
                        "active_resume_parsing_result_id": data.active_resume_parsing_result_id,
                        "professional_title": data.professional_title,
                        "normalized_titles": json.dumps(data.normalized_titles),
                        "skill_ids": data.skill_ids,
                        "skill_names": json.dumps(data.skill_names),
                        "locations": json.dumps(data.locations),
                        "fact_sources": json.dumps(data.fact_sources),
                        "total_experience_years": data.total_experience_years,
                        "highest_education_level": data.highest_education_level,
                        "searchable_text": data.searchable_text,
                        "embedding": embedding_str,
                        "embedding_model": data.embedding_model,
                        "embedding_version": data.embedding_version,
                    },
                )
                rows_affected = result.rowcount if hasattr(result, "rowcount") else 1
                return rows_affected > 0
            except Exception:
                if session is None:
                    await s.rollback()
                raise
