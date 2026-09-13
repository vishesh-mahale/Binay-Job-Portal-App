"""Domain service for transforming candidate aggregates into search projections (PD-002)."""

from __future__ import annotations

from datetime import date, datetime
import logging
from typing import Any, Dict, List, Optional, Set, Tuple

from app.core.config import Settings, get_settings
from app.providers.base import EmbeddingProvider
from app.schemas.candidate_search import (
    CandidateCanonicalAggregate,
    CandidateMergedSearchData,
    CandidateSearchProfileUpsert,
)
from app.services.semantic_builders import CandidateSemanticTextBuilder
from app.core.logging import get_logger

logger = get_logger(__name__)

# Education level hierarchy (higher score = higher level)
EDUCATION_HIERARCHY = {
    "doctorate": 5,
    "phd": 5,
    "master": 4,
    "msc": 4,
    "ms": 4,
    "mba": 4,
    "mtech": 4,
    "bachelor": 3,
    "bsc": 3,
    "bs": 3,
    "btech": 3,
    "be": 3,
    "bba": 3,
    "diploma": 2,
    "associate": 2,
    "high_school": 1,
    "secondary": 1,
}


class CandidateProjectionService:
    """Orchestrates candidate search fact merging, semantic text building, and embedding generation."""

    def __init__(self, embedding_provider: EmbeddingProvider, settings: Optional[Settings] = None) -> None:
        self.embedding_provider = embedding_provider
        self.settings = settings or get_settings()

    def merge_facts(self, aggregate: CandidateCanonicalAggregate) -> CandidateMergedSearchData:
        """
        Merge canonical profile facts with latest active resume parsed data.
        
        Conforms strictly to PD-002:
        - Confirmed canonical facts take highest precedence (source: 'candidate_manual').
        - Active resume facts are included as supplements (source: 'resume_ai').
        - Origin of every fact is tracked in fact_sources JSONB.
        """
        fact_sources: Dict[str, Any] = {
            "skills": {},
            "titles": {},
            "experiences": {},
            "education": {},
        }

        # 1. Merge Skills
        skill_ids: List[str] = []
        skill_name_set: Set[str] = set()
        confirmed_skills: List[str] = []
        resume_skills: List[str] = []

        # Canonical skills
        for cs in aggregate.skills:
            skill_id = cs.get("skill_id")
            if skill_id:
                skill_ids.append(str(skill_id))
            
            raw_name = cs.get("master_skill_name") or cs.get("custom_skill_name") or ""
            name = raw_name.strip()
            if name:
                norm_key = name.lower()
                if norm_key not in skill_name_set:
                    skill_name_set.add(norm_key)
                    confirmed_skills.append(name)
                    source_label = cs.get("primary_source_type") or "candidate_manual"
                    fact_sources["skills"][name] = str(source_label)

        # Resume extracted skills
        resume_parsed = aggregate.active_resume_parsed_data or {}
        norm_output = resume_parsed.get("normalized_output") or {}
        ai_data = norm_output.get("ai") or norm_output
        extracted_skill_list = ai_data.get("skills") or []
        if isinstance(extracted_skill_list, list):
            for raw_s in extracted_skill_list:
                if isinstance(raw_s, dict):
                    s_name = (raw_s.get("name") or "").strip()
                else:
                    s_name = str(raw_s).strip()
                if s_name:
                    norm_key = s_name.lower()
                    if norm_key not in skill_name_set:
                        skill_name_set.add(norm_key)
                        resume_skills.append(s_name)
                        fact_sources["skills"][s_name] = "resume_ai"

        all_skill_names = confirmed_skills + resume_skills

        # 2. Normalized Titles & Fact Sources
        normalized_titles_set: Set[str] = set()
        titles_list: List[str] = []

        if aggregate.professional_title and aggregate.professional_title.strip():
            title = aggregate.professional_title.strip()
            norm_t = title.lower()
            normalized_titles_set.add(norm_t)
            titles_list.append(title)
            fact_sources["titles"][title] = "candidate_manual"

        for exp in aggregate.experiences:
            job_title = (exp.get("job_title") or "").strip()
            if job_title:
                norm_t = job_title.lower()
                if norm_t not in normalized_titles_set:
                    normalized_titles_set.add(norm_t)
                    titles_list.append(job_title)
                    fact_sources["titles"][job_title] = "candidate_manual"

        # 3. Locations
        loc_set: Set[str] = set()
        locations: List[str] = []
        for loc in [aggregate.current_location, aggregate.city, aggregate.state, aggregate.country]:
            if loc and loc.strip():
                clean_loc = loc.strip()
                if clean_loc.lower() not in loc_set:
                    loc_set.add(clean_loc.lower())
                    locations.append(clean_loc)

        # 4. Total Experience Years Calculation
        total_exp_years = self._calculate_experience_years(aggregate.experiences)
        if total_exp_years is None and ai_data.get("experience_years") is not None:
            try:
                total_exp_years = float(ai_data["experience_years"])
                fact_sources["experiences"]["total_years"] = "resume_ai"
            except (ValueError, TypeError):
                total_exp_years = None
        else:
            fact_sources["experiences"]["total_years"] = "candidate_manual"

        # 5. Highest Education Level
        highest_edu = self._determine_highest_education(aggregate.educations)
        if not highest_edu and ai_data.get("educations"):
            edu_raw = ai_data["educations"]
            if isinstance(edu_raw, list) and edu_raw:
                highest_edu = edu_raw[0].get("raw") or edu_raw[0].get("degree") or str(edu_raw[0])
                fact_sources["education"]["highest_level"] = "resume_ai"
            elif edu_raw:
                highest_edu = str(edu_raw)
                fact_sources["education"]["highest_level"] = "resume_ai"
        elif not highest_edu and ai_data.get("education"):
            edu_raw = ai_data["education"]
            highest_edu = str(edu_raw[0]) if isinstance(edu_raw, list) and edu_raw else str(edu_raw)
            fact_sources["education"]["highest_level"] = "resume_ai"
        else:
            fact_sources["education"]["highest_level"] = "candidate_manual"

        # 6. Certifications
        certifications: List[str] = []
        for c in aggregate.certifications:
            c_name = (c.get("name") or "").strip()
            if c_name:
                certifications.append(c_name)

        # 7. Assemble Symmetric Semantic Text (Section 7.2)
        semantic_text = CandidateSemanticTextBuilder.build(
            professional_title=aggregate.professional_title,
            total_experience_years=total_exp_years,
            preferred_work_mode=aggregate.preferred_work_mode,
            willing_to_relocate=aggregate.willing_to_relocate,
            locations=locations,
            confirmed_skills=confirmed_skills,
            resume_skills=resume_skills,
            experiences=aggregate.experiences,
            educations=aggregate.educations,
            certifications=certifications,
        )

        # 8. Assemble Searchable Text (Keyword lexical search)
        searchable_parts = [
            aggregate.professional_title or "",
            " ".join(titles_list),
            " ".join(all_skill_names),
            " ".join(locations),
            " ".join([f"{e.get('job_title', '')} {e.get('company_name', '')} {e.get('description', '')}" for e in aggregate.experiences]),
            " ".join([f"{ed.get('degree', '')} {ed.get('field_of_study', '')} {ed.get('institution_name', '')}" for ed in aggregate.educations]),
            " ".join(certifications),
            " ".join([p.get("title", "") + " " + (p.get("description", "") or "") for p in aggregate.projects]),
            " ".join([l.get("language_name", "") for l in aggregate.languages]),
        ]
        searchable_text = " ".join([p.strip() for p in searchable_parts if p.strip()])

        return CandidateMergedSearchData(
            candidate_id=aggregate.candidate_id,
            source_profile_revision=aggregate.profile_revision,
            projection_revision=aggregate.profile_revision,
            active_resume_document_id=aggregate.active_resume_document_id,
            active_resume_parsing_result_id=aggregate.active_resume_parsing_result_id,
            professional_title=aggregate.professional_title,
            normalized_titles=sorted(list(normalized_titles_set)),
            skill_ids=skill_ids,
            skill_names=all_skill_names,
            locations=locations,
            fact_sources=fact_sources,
            total_experience_years=round(total_exp_years, 1) if total_exp_years is not None else None,
            highest_education_level=highest_edu,
            semantic_text=semantic_text,
            searchable_text=searchable_text,
        )

    async def generate_projection(
        self, aggregate: CandidateCanonicalAggregate
    ) -> CandidateSearchProfileUpsert:
        """
        Transform candidate aggregate into projection and generate 768-dimensional embedding.
        """
        merged = self.merge_facts(aggregate)

        # Generate 768-dimensional vector embedding
        raw_embedding = await self.embedding_provider.embed(merged.semantic_text)
        embedding = raw_embedding.embedding if hasattr(raw_embedding, "embedding") else raw_embedding
        if len(embedding) != 768:
            raise ValueError(
                f"Embedding provider generated vector of dimension {len(embedding)}; expected 768"
            )

        return CandidateSearchProfileUpsert(
            candidate_id=merged.candidate_id,
            source_profile_revision=merged.source_profile_revision,
            projection_revision=merged.projection_revision,
            active_resume_document_id=merged.active_resume_document_id,
            active_resume_parsing_result_id=merged.active_resume_parsing_result_id,
            professional_title=merged.professional_title,
            normalized_titles=merged.normalized_titles,
            skill_ids=merged.skill_ids,
            skill_names=merged.skill_names,
            locations=merged.locations,
            fact_sources=merged.fact_sources,
            total_experience_years=merged.total_experience_years,
            highest_education_level=merged.highest_education_level,
            searchable_text=merged.searchable_text,
            embedding=embedding,
            embedding_model=self.embedding_provider.model_name,
            embedding_version=1,
        )

    def _calculate_experience_years(self, experiences: List[Dict[str, Any]]) -> Optional[float]:
        """Calculate total non-overlapping experience in years by merging date ranges."""
        if not experiences:
            return None

        today = date.today()
        ranges: list[tuple[date, date]] = []

        for exp in experiences:
            start_raw = exp.get("start_date")
            if not start_raw:
                continue

            try:
                start = start_raw if isinstance(start_raw, date) else datetime.strptime(str(start_raw), "%Y-%m-%d").date()
            except (ValueError, TypeError):
                continue

            end_raw = exp.get("end_date")
            if exp.get("is_current") or not end_raw:
                end = today
            else:
                try:
                    end = end_raw if isinstance(end_raw, date) else datetime.strptime(str(end_raw), "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    end = today

            if end >= start:
                ranges.append((start, end))

        if not ranges:
            return None

        ranges.sort(key=lambda r: r[0])
        merged: list[tuple[date, date]] = [ranges[0]]
        for start, end in ranges[1:]:
            prev_start, prev_end = merged[-1]
            if start <= prev_end:
                merged[-1] = (prev_start, max(prev_end, end))
            else:
                merged.append((start, end))

        total_days = sum((end - start).days for start, end in merged)
        years = total_days / 365.25
        return round(years, 1) if years > 0 else 0.0

    def _determine_highest_education(self, educations: List[Dict[str, Any]]) -> Optional[str]:
        """Determine highest education level from canonical educations."""
        if not educations:
            return None

        highest_score = -1
        highest_name = None

        for edu in educations:
            degree = (edu.get("degree") or "").lower()
            matched = False
            for key, score in EDUCATION_HIERARCHY.items():
                if key in degree:
                    if score > highest_score:
                        highest_score = score
                        highest_name = edu.get("degree")
                    matched = True
                    break
            if not matched and highest_name is None:
                highest_name = edu.get("degree")

        return highest_name
