-- Migration: Add rejection_reason to public.companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
