import asyncio
import json
from app.core.database import get_db_manager
from sqlalchemy import text

async def main():
    db = get_db_manager()
    await db.initialize()
    async with db.transaction() as session:
        res = await session.execute(text("SELECT document_id, raw_ai_output, normalized_output FROM resume_parsed_data ORDER BY created_at DESC LIMIT 1"))
        row = res.mappings().first()
        if row:
            print("=== RAW AI OUTPUT educations ===")
            raw_ai = row["raw_ai_output"]
            if isinstance(raw_ai, dict):
                ai_data = raw_ai.get("ai", {})
                print(json.dumps(ai_data.get("educations"), indent=2))

            print("\n=== NORMALIZED OUTPUT educations ===")
            norm = row["normalized_output"]
            if isinstance(norm, dict):
                print(json.dumps(norm.get("educations"), indent=2))

if __name__ == "__main__":
    asyncio.run(main())
