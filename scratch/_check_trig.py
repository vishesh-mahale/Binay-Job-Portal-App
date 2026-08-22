import asyncio, os
import asyncpg
from dotenv import load_dotenv
load_dotenv('05-outbox-dispatcher-nestjs/.env')
DB = os.getenv('DATABASE_URL','').replace('postgresql+asyncpg://','postgresql://')
async def main():
    conn = await asyncpg.connect(DB, statement_cache_size=0)
    try:
        r = await conn.fetchrow("""
            SELECT t.tgtype, pg_get_triggerdef(t.oid) AS def
            FROM pg_trigger t WHERE t.tgrelid='public.outbox_events'::regclass AND t.tgname='outbox_dispatcher_wake'
        """)
        print(r['def'])
        # tgtype bit 2 = ROW (0-based bit1=ROW), show enabled state
        print('tgtype bits (bit2=ROW, bit6=ENABLED):', bin(r['tgtype']))
    finally:
        await conn.close()
asyncio.run(main())
