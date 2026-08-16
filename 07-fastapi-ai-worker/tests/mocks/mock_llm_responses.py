"""Mock LLM response fixtures for deterministic testing across AI pipelines."""

MOCK_RESUME_PARSER_RESPONSE = {
    "name": "Jane Doe",
    "email": "jane.doe@example.com",
    "phone": "+91 9876543210",
    "current_title": "Senior Staff Software Engineer",
    "experience_years": 8.5,
    "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "Kubernetes", "Redis", "AWS"],
    "education": ["B.Tech Computer Science, National Institute of Technology"],
}

MOCK_JOB_AI_PROFILE_RESPONSE = {
    "extracted": {
        "must_have_skills": ["Python", "FastAPI", "PostgreSQL"],
        "nice_to_have_skills": ["Docker", "Kubernetes", "Redis"],
        "minimum_experience_years": 5.0,
        "preferred_education": ["Bachelor's or Master's in Computer Science"],
        "certifications": ["AWS Certified Solutions Architect"],
        "languages": ["English"],
    },
    "inferred": {
        "role_family": "Backend Engineering",
        "seniority": "Senior",
        "technical_domains": ["Distributed Systems", "Cloud Computing", "Microservices"],
        "industry_domains": ["FinTech", "Enterprise Software"],
        "soft_skills": ["Technical Leadership", "System Design", "Mentorship"],
        "primary_responsibilities": [
            "Architect and build high-throughput backend APIs",
            "Drive technical decisions and code quality",
        ],
        "likely_career_level": "IC4 / Senior Engineer",
        "keywords": ["fastapi", "asyncpg", "postgres", "microservices", "scale"],
        "confidence_score": 0.95,
    },
}
