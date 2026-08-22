import os, asyncio, asyncpg
from dotenv import load_dotenv

load_dotenv('07-fastapi-ai-worker/.env')
db_url = os.getenv('DATABASE_URL')
if db_url and 'postgresql+asyncpg://' in db_url:
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

sql_test = """
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
"""

async def main():
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    print('Executing DO $$ IF to_regprocedure(...) IS NULL block...')
    await conn.execute(sql_test)
    print('SUCCESS! The DO block with to_regprocedure executed cleanly with 0 errors!')
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
