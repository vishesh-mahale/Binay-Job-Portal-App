import asyncio
import json
from app.core.database import get_db_manager
from sqlalchemy import text

async def main():
    db = get_db_manager()
    await db.initialize()
    async with db.transaction() as session:
        res = await session.execute(text("SELECT * FROM resume_parsed_data ORDER BY created_at DESC LIMIT 1"))
        row = res.mappings().first()
        if row:
            d = dict(row)
            print("Keys:", list(d.keys()))
            print("Document ID:", d.get("document_id"))
            # Print parsed json keys
            parsed_json = d.get("parsed_json") or d.get("normalized_json") or d.get("raw_json")
            if parsed_json:
                print("Parsed JSON keys:", list(parsed_json.keys()) if isinstance(parsed_json, dict) else "Not dict")

if __name__ == "__main__":
    asyncio.run(main())
