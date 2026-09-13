import asyncio
from app.core.database import get_db_manager
from sqlalchemy import text

async def main():
    db = get_db_manager()
    await db.initialize()
    async with db.transaction() as session:
        # Profile
        res = await session.execute(text("""
            SELECT id, professional_title, summary, 
                   date_of_birth, gender, city, state, postal_code 
            FROM candidate_profiles WHERE user_id = 'f0149de7-ff89-4184-977c-6de1bb071a3c'
        """))
        print("=== CANDIDATE PROFILE ===")
        row = res.mappings().first()
        if row:
            print(dict(row))
            cand_id = row["id"]
        
        # Educations
        res = await session.execute(text("SELECT * FROM candidate_educations WHERE candidate_id = :cid"), {"cid": cand_id})
        print("\n=== EDUCATIONS ===")
        for r in res.mappings().all():
            print(dict(r))

        # Experiences
        res = await session.execute(text("SELECT * FROM candidate_experiences WHERE candidate_id = :cid"), {"cid": cand_id})
        print("\n=== EXPERIENCES ===")
        for r in res.mappings().all():
            print(dict(r))

        # Skills
        res = await session.execute(text("SELECT * FROM candidate_skills WHERE candidate_id = :cid"), {"cid": cand_id})
        print("\n=== SKILLS ===")
        for r in res.mappings().all():
            print(dict(r))

if __name__ == "__main__":
    asyncio.run(main())
