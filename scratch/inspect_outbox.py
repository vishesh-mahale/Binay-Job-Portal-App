import os, asyncio, asyncpg
from dotenv import load_dotenv

load_dotenv('07-fastapi-ai-worker/.env')
db_url = os.getenv('DATABASE_URL')
if db_url and 'postgresql+asyncpg://' in db_url:
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

async def main():
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    rows = await conn.fetch('SELECT id, event_type, status, occurred_at, published_at, updated_at FROM outbox_events ORDER BY occurred_at DESC LIMIT 10;')
    print('=== LATEST 10 OUTBOX EVENTS BY OCCURRED_AT ===')
    for r in rows:
        print(f"ID: {r['id']} | Event: {r['event_type']} | Status: {r['status']} | OccurredAt: {r['occurred_at']}")
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
