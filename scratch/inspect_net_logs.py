import os, asyncio, asyncpg
from dotenv import load_dotenv

load_dotenv('07-fastapi-ai-worker/.env')
db_url = os.getenv('DATABASE_URL')
if db_url and 'postgresql+asyncpg://' in db_url:
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

async def main():
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'net';")
    print('TABLES IN net SCHEMA:', [t['table_name'] for t in tables])
    
    try:
        rows = await conn.fetch("SELECT id, status_code, content, created FROM net._http_response ORDER BY created DESC LIMIT 10;")
        print('=== PG_NET HTTP RESPONSES ===')
        for r in rows:
            print(f"Status: {r['status_code']} | Content: {r['content']} | Created: {r['created']}")
    except Exception as e:
        print('Error:', e)
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
