-- Add skills column to candidate_experiences
-- Stores per-company skills/technologies extracted from resume
ALTER TABLE candidate_experiences
ADD COLUMN IF NOT EXISTS skills JSONB NOT NULL DEFAULT '[]'::JSONB;

-- Add comment for documentation
COMMENT ON COLUMN candidate_experiences.skills IS 'Skills/technologies used in this role, extracted from resume. E.g. ["Spring Boot", "Kafka", "PostgreSQL"]';
