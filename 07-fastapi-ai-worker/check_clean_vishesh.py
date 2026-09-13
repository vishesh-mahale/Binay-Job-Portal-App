import asyncio, asyncpg

async def check():
    DB_URL = "postgresql://postgres.jzpvssryooucygnuifkb:z0qHzABWth61A3ah@aws-0-ap-south-1.pooler.supabase.com:6543/postgres"
    conn = await asyncpg.connect(DB_URL, statement_cache_size=0)
    CANDIDATE_ID = 'b15d064e-080b-4e79-97bb-5517cae382f5'

    profile = await conn.fetchrow('SELECT professional_title, summary, city, profile_revision FROM candidate_profiles WHERE id = $1', CANDIDATE_ID)
    skills_count = await conn.fetchval('SELECT COUNT(*) FROM candidate_skills WHERE candidate_id = $1', CANDIDATE_ID)
    projects_count = await conn.fetchval('SELECT COUNT(*) FROM candidate_projects WHERE candidate_id = $1', CANDIDATE_ID)
    docs_count = await conn.fetchval('SELECT COUNT(*) FROM candidate_profile_documents WHERE candidate_id = $1', CANDIDATE_ID)

    print('Profile:', dict(profile))
    print('Skills count:', skills_count)
    print('Projects count:', projects_count)
    print('Documents count:', docs_count)
    await conn.close()

asyncio.run(check())
