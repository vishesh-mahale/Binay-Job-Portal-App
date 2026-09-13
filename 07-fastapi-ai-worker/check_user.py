import asyncio
from sqlalchemy import text
from app.core.database import DatabaseManager
from app.core.config import get_settings

async def find_user():
    settings = get_settings()
    db = DatabaseManager(settings)
    await db.initialize()
    async with db.get_session() as s:
        r = await s.execute(text("SELECT id, email FROM users WHERE email LIKE '%visheshmahale2%'"))
        users = r.mappings().all()
        for u in users:
            print(f"User: {u['id']} | {u['email']}")
    await db._engine.dispose()

asyncio.run(find_user())
