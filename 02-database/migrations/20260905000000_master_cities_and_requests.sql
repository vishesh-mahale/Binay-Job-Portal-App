-- ============================================================================
-- Migration: Master Cities & Custom City Requests
-- Description: Creates master_cities catalog and city_requests tracking table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.master_cities (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    state       VARCHAR(100),
    country     VARCHAR(100) NOT NULL DEFAULT 'India',
    tier        VARCHAR(20) DEFAULT 'tier_2', -- tier_1, tier_2, tier_3
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_cities_name_state_ci 
    ON public.master_cities (lower(name), lower(COALESCE(state, '')));

CREATE TABLE IF NOT EXISTS public.city_requests (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requested_name      VARCHAR(100) NOT NULL,
    requested_state     VARCHAR(100),
    requested_country   VARCHAR(100) NOT NULL DEFAULT 'India',
    requested_by        UUID REFERENCES public.users(id) ON DELETE SET NULL,
    company_id          UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, approved, rejected
    approved_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
    approved_at         TIMESTAMPTZ,
    review_notes        TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initial seed data for Top Indian Cities
INSERT INTO public.master_cities (name, state, country, tier, is_active) VALUES
('Mumbai', 'Maharashtra', 'India', 'tier_1', true),
('Delhi', 'Delhi NCR', 'India', 'tier_1', true),
('Bengaluru', 'Karnataka', 'India', 'tier_1', true),
('Hyderabad', 'Telangana', 'India', 'tier_1', true),
('Ahmedabad', 'Gujarat', 'India', 'tier_1', true),
('Chennai', 'Tamil Nadu', 'India', 'tier_1', true),
('Kolkata', 'West Bengal', 'India', 'tier_1', true),
('Pune', 'Maharashtra', 'India', 'tier_1', true),
('Gurugram', 'Haryana', 'India', 'tier_1', true),
('Noida', 'Uttar Pradesh', 'India', 'tier_1', true),
('Jaipur', 'Rajasthan', 'India', 'tier_2', true),
('Surat', 'Gujarat', 'India', 'tier_2', true),
('Lucknow', 'Uttar Pradesh', 'India', 'tier_2', true),
('Kanpur', 'Uttar Pradesh', 'India', 'tier_2', true),
('Nagpur', 'Maharashtra', 'India', 'tier_2', true),
('Indore', 'Madhya Pradesh', 'India', 'tier_2', true),
('Thane', 'Maharashtra', 'India', 'tier_2', true),
('Bhopal', 'Madhya Pradesh', 'India', 'tier_2', true),
('Visakhapatnam', 'Andhra Pradesh', 'India', 'tier_2', true),
('Pimpri-Chinchwad', 'Maharashtra', 'India', 'tier_2', true),
('Patna', 'Bihar', 'India', 'tier_2', true),
('Vadodara', 'Gujarat', 'India', 'tier_2', true),
('Ghaziabad', 'Uttar Pradesh', 'India', 'tier_2', true),
('Ludhiana', 'Punjab', 'India', 'tier_2', true),
('Agra', 'Uttar Pradesh', 'India', 'tier_2', true),
('Nashik', 'Maharashtra', 'India', 'tier_2', true),
('Faridabad', 'Haryana', 'India', 'tier_2', true),
('Meerut', 'Uttar Pradesh', 'India', 'tier_2', true),
('Rajkot', 'Gujarat', 'India', 'tier_2', true),
('Kalyan-Dombivli', 'Maharashtra', 'India', 'tier_2', true),
('Vasai-Virar', 'Maharashtra', 'India', 'tier_2', true),
('Varanasi', 'Uttar Pradesh', 'India', 'tier_2', true),
('Srinagar', 'Jammu and Kashmir', 'India', 'tier_2', true),
('Aurangabad', 'Maharashtra', 'India', 'tier_2', true),
('Dhanbad', 'Jharkhand', 'India', 'tier_2', true),
('Amritsar', 'Punjab', 'India', 'tier_2', true),
('Navi Mumbai', 'Maharashtra', 'India', 'tier_2', true),
('Allahabad', 'Uttar Pradesh', 'India', 'tier_2', true),
('Ranchi', 'Jharkhand', 'India', 'tier_2', true),
('Howrah', 'West Bengal', 'India', 'tier_2', true),
('Coimbatore', 'Tamil Nadu', 'India', 'tier_2', true),
('Jabalpur', 'Madhya Pradesh', 'India', 'tier_2', true),
('Gwalior', 'Madhya Pradesh', 'India', 'tier_2', true),
('Vijayawada', 'Andhra Pradesh', 'India', 'tier_2', true),
('Jodhpur', 'Rajasthan', 'India', 'tier_2', true),
('Madurai', 'Tamil Nadu', 'India', 'tier_2', true),
('Raipur', 'Chhattisgarh', 'India', 'tier_2', true),
('Kota', 'Rajasthan', 'India', 'tier_2', true),
('Guwahati', 'Assam', 'India', 'tier_2', true),
('Chandigarh', 'Chandigarh', 'India', 'tier_2', true),
('Kochi', 'Kerala', 'India', 'tier_2', true),
('Thiruvananthapuram', 'Kerala', 'India', 'tier_2', true),
('Dehradun', 'Uttarakhand', 'India', 'tier_2', true),
('Bhubaneswar', 'Odisha', 'India', 'tier_2', true)
ON CONFLICT (lower(name), lower(COALESCE(state, ''))) DO NOTHING;
