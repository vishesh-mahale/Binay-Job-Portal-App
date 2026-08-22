import os, asyncio, asyncpg
from dotenv import load_dotenv

load_dotenv('07-fastapi-ai-worker/.env')
db_url = os.getenv('DATABASE_URL')
if db_url and 'postgresql+asyncpg://' in db_url:
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

async def main():
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name = 'candidate_search_profiles';")
    print('COLUMNS IN candidate_search_profiles:', [c['column_name'] for c in cols])
    
    rows = await conn.fetch('SELECT * FROM candidate_search_profiles LIMIT 5;')
    print('=== TOP ROWS IN candidate_search_profiles ===')
    for r in rows:
        d = dict(r)
        if 'embedding_vector' in d and d['embedding_vector'] is not None:
            d['embedding_vector'] = f"Vector(dim={len(d['embedding_vector'])})"
        print(d)
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
