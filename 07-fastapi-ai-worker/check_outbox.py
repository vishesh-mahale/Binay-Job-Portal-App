import asyncio
from app.core.database import get_db_manager
from sqlalchemy import text

async def main():
    db = get_db_manager()
    await db.initialize()
    async with db.transaction() as session:
        result = await session.execute(text("SELECT id, aggregate_type, aggregate_id, event_type, updated_at FROM outbox_events ORDER BY updated_at DESC LIMIT 5"))
        for row in result.mappings().all():
            print(dict(row))

if __name__ == "__main__":
    asyncio.run(main())
