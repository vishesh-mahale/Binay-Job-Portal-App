-- Migration: Add DB integrity constraints for interview_rounds array, custom_skills array, and max_notice_period_days
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'interview_rounds_array'
    ) THEN
        ALTER TABLE public.jobs ADD CONSTRAINT interview_rounds_array CHECK (jsonb_typeof(interview_rounds) = 'array');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'custom_skills_array'
    ) THEN
        ALTER TABLE public.jobs ADD CONSTRAINT custom_skills_array CHECK (jsonb_typeof(custom_skills) = 'array');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'max_notice_period_days_non_negative'
    ) THEN
        ALTER TABLE public.jobs ADD CONSTRAINT max_notice_period_days_non_negative CHECK (max_notice_period_days IS NULL OR max_notice_period_days >= 0);
    END IF;
END $$;
