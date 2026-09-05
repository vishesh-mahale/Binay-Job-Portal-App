-- Migration: Add max_notice_period_days to public.jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS max_notice_period_days INTEGER;
