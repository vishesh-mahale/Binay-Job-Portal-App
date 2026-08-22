-- ============================================================================
-- File: 19_supabase_webhook_prerequisites.sql
-- Purpose: Supabase Database Webhook Prerequisites (pg_net & Trigger Helper)
-- Safe & Non-Destructive (Creates helper ONLY IF missing).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enable pg_net extension (REQUIRED for async HTTP calls)
-- Installed in default 'net' schema to align with net.http_post(...) calls.
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ----------------------------------------------------------------------------
-- 2. Create supabase_functions schema (REQUIRED for Supabase UI Webhooks)
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS supabase_functions;

-- ----------------------------------------------------------------------------
-- 3. http_request() Helper Function (Creates ONLY IF missing)
-- Preserves existing Supabase platform-managed helpers without overwriting.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('supabase_functions.http_request()') IS NULL THEN
    EXECUTE $func$
      CREATE FUNCTION supabase_functions.http_request()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $body$
      DECLARE
        request_id bigint;
        payload jsonb;
        url text;
        method text;
        headers jsonb;
        timeout_ms integer;
        params jsonb;
      BEGIN
        url := TG_ARGV[0];
        method := TG_ARGV[1];
        headers := TG_ARGV[2]::jsonb;
        params := TG_ARGV[3]::jsonb;
        timeout_ms := TG_ARGV[4]::integer;

        payload := jsonb_build_object(
          'type', TG_OP,
          'table', TG_TABLE_NAME,
          'schema', TG_TABLE_SCHEMA,
          'record', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::jsonb END,
          'old_record', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::jsonb END
        );

        SELECT net.http_post(
          url := url,
          headers := headers,
          body := payload,
          timeout_milliseconds := timeout_ms
        ) INTO request_id;

        RETURN NEW;
      END;
      $body$;
    $func$;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Permissions & Closed-by-Default Access Control
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION supabase_functions.http_request() FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA supabase_functions TO postgres, supabase_admin, service_role;
GRANT EXECUTE ON FUNCTION supabase_functions.http_request() TO postgres, supabase_admin, service_role;
