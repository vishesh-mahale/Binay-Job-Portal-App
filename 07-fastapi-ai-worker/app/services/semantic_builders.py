"""Symmetric Semantic Text Builders for Candidates and Jobs.

Ensures mathematically consistent text representations for 768-dimensional pgvector cosine similarity.
Conforms strictly to Sections 7.1 and 7.2 of FAST-API PROMPT.md.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional


class CandidateSemanticTextBuilder:
    """Builds clean, symmetric semantic search text representation for candidates."""

    VERSION = "v1"

    @classmethod
    def build(
        cls,
        *,
        professional_title: Optional[str] = None,
        total_experience_years: Optional[float] = None,
        preferred_work_mode: Optional[str] = None,
        willing_to_relocate: bool = False,
        locations: Optional[List[str]] = None,
        confirmed_skills: Optional[List[str]] = None,
        resume_skills: Optional[List[str]] = None,
        experiences: Optional[List[Dict[str, Any]]] = None,
        educations: Optional[List[Dict[str, Any]]] = None,
        certifications: Optional[List[str]] = None,
    ) -> str:
        """
        Assemble symmetric candidate semantic representation.
        
        Template:
        Professional Title: {professional_title}
        Experience Level: {total_experience_years} years
        Work Preference: {preferred_work_mode} | Willing to Relocate: {willing_to_relocate}
        Locations: {locations_list}
        Confirmed Skills: {confirmed_skills_list}
        Resume Extracted Skills: {resume_skills_list}
        Experience Summary:
        {experience_roles_and_descriptions}
        Education: {highest_education} in {fields_of_study}
        Certifications: {certifications_list}
        """
        title_str = (professional_title or "").strip() or "Not Specified"
        
        exp_years_val = f"{total_experience_years:.1f}" if total_experience_years is not None else "0.0"
        exp_level_str = f"{exp_years_val} years"
        
        work_mode_str = (preferred_work_mode or "Not Specified").replace("_", " ").title()
        relocate_str = "Yes" if willing_to_relocate else "No"
        work_pref_str = f"{work_mode_str} | Willing to Relocate: {relocate_str}"
        
        locs = [loc.strip() for loc in (locations or []) if loc and loc.strip()]
        locations_str = ", ".join(locs) if locs else "Not Specified"
        
        c_skills = [s.strip() for s in (confirmed_skills or []) if s and s.strip()]
        confirmed_skills_str = ", ".join(c_skills) if c_skills else "None"
        
        r_skills = [s.strip() for s in (resume_skills or []) if s and s.strip()]
        resume_skills_str = ", ".join(r_skills) if r_skills else "None"
        
        # Experience summary
        exp_lines: List[str] = []
        for exp in (experiences or []):
            job_title = (exp.get("job_title") or "").strip()
            company = (exp.get("company_name") or "").strip()
            desc = (exp.get("description") or "").strip()
            header = f"- {job_title} at {company}" if company else f"- {job_title}"
            if desc:
                exp_lines.append(f"{header}: {desc}")
            elif header.strip("- "):
                exp_lines.append(header)
        experience_summary_str = "\n".join(exp_lines) if exp_lines else "None"

        # Education
        edu_entries: List[str] = []
        for edu in (educations or []):
            degree = (edu.get("degree") or "").strip()
            field = (edu.get("field_of_study") or "").strip()
            institution = (edu.get("institution_name") or "").strip()
            if degree and field:
                edu_entries.append(f"{degree} in {field} ({institution})" if institution else f"{degree} in {field}")
            elif degree:
                edu_entries.append(f"{degree} ({institution})" if institution else degree)
        education_str = "; ".join(edu_entries) if edu_entries else "Not Specified"

        # Certifications
        certs = [c.strip() for c in (certifications or []) if c and c.strip()]
        certifications_str = ", ".join(certs) if certs else "None"

        parts = [
            f"Professional Title: {title_str}",
            f"Experience Level: {exp_level_str}",
            f"Work Preference: {work_pref_str}",
            f"Locations: {locations_str}",
            f"Confirmed Skills: {confirmed_skills_str}",
            f"Resume Extracted Skills: {resume_skills_str}",
            "Experience Summary:",
            experience_summary_str,
            f"Education: {education_str}",
            f"Certifications: {certifications_str}",
        ]

        return "\n".join(parts)


class JobSemanticTextBuilder:
    """Builds clean, symmetric semantic search text representation for jobs."""

    VERSION = "v1"

    @classmethod
    def build(
        cls,
        *,
        title: str,
        category: Optional[str] = None,
        employment_type: Optional[str] = None,
        work_mode: Optional[str] = None,
        experience_min_years: Optional[int] = None,
        experience_max_years: Optional[int] = None,
        locations: Optional[List[str]] = None,
        skills: Optional[List[str]] = None,
        responsibilities: Optional[str] = None,
        requirements: Optional[str] = None,
        technical_domains: Optional[List[str]] = None,
        industry_domains: Optional[List[str]] = None,
        role_family: Optional[str] = None,
    ) -> str:
        """
        Assemble symmetric job semantic representation.
        
        Template:
        Title: {job.title}
        Category: {category.name}
        Employment Type: {job.employment_type} | Work Mode: {job.work_mode}
        Experience Required: {job.experience_min_years}-{job.experience_max_years} years
        Location: {job_locations_list}
        Required Skills: {skills_list}
        Responsibilities:
        {job.responsibilities}
        Requirements:
        {job.requirements}
        AI Domain & Concepts: {technical_domains}, {industry_domains}, {role_family}
        """
        emp_type_str = (employment_type or "Full Time").replace("_", " ").title()
        work_mode_str = (work_mode or "On Site").replace("_", " ").title()
        
        min_y = experience_min_years or 0
        max_y = f"-{experience_max_years}" if experience_max_years else "+"
        exp_req_str = f"{min_y}{max_y} years"

        locs = [l.strip() for l in (locations or []) if l and l.strip()]
        location_str = ", ".join(locs) if locs else "Not Specified"

        skill_list = [s.strip() for s in (skills or []) if s and s.strip()]
        skills_str = ", ".join(skill_list) if skill_list else "None"

        resp_str = (responsibilities or "").strip() or "Not Specified"
        req_str = (requirements or "").strip() or "Not Specified"

        domains: List[str] = []
        if technical_domains:
            domains.extend(technical_domains)
        if industry_domains:
            domains.extend(industry_domains)
        if role_family:
            domains.append(role_family)
        domains_str = ", ".join(domains) if domains else "General"

        parts = [
            f"Title: {title.strip()}",
            f"Category: {category or 'General'}",
            f"Employment Type: {emp_type_str} | Work Mode: {work_mode_str}",
            f"Experience Required: {exp_req_str}",
            f"Location: {location_str}",
            f"Required Skills: {skills_str}",
            "Responsibilities:",
            resp_str,
            "Requirements:",
            req_str,
            f"AI Domain & Concepts: {domains_str}",
        ]

        return "\n".join(parts)
