import os, asyncio, asyncpg, uuid
from dotenv import load_dotenv

load_dotenv('07-fastapi-ai-worker/.env')
db_url = os.getenv('DATABASE_URL')
if db_url and 'postgresql+asyncpg://' in db_url:
    db_url = db_url.replace('postgresql+asyncpg://', 'postgresql://')

async def main():
    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    event_id = uuid.uuid4()
    agg_id = uuid.uuid4()
    
    await conn.execute("""
        INSERT INTO outbox_events (id, aggregate_type, aggregate_id, event_type, schema_version, payload, status)
        VALUES ($1, 'candidate', $2, 'candidate.profile.changed', 1, '{"test": "VISUAL_CHECK_FOR_USER"}', 'pending');
    """, event_id, agg_id)
    
    row = await conn.fetchrow('SELECT id, event_type, status, occurred_at FROM outbox_events WHERE id = $1;', event_id)
    print('====================================================')
    print('FRESHLY INSERTED EVENT ID:', str(row['id']))
    print('EVENT TYPE:', row['event_type'])
    print('STATUS:', row['status'])
    print('OCCURRED AT (UTC):', str(row['occurred_at']))
    print('====================================================')
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
