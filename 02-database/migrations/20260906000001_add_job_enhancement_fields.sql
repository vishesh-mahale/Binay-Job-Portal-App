-- Migration: Add work_shift, education_type, min_education_level, interview_rounds to public.jobs table
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS work_shift VARCHAR(50) DEFAULT 'day_shift',
ADD COLUMN IF NOT EXISTS education_type VARCHAR(50) DEFAULT 'any',
ADD COLUMN IF NOT EXISTS min_education_level VARCHAR(100),
ADD COLUMN IF NOT EXISTS interview_rounds JSONB DEFAULT '[]'::JSONB;
