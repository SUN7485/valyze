import asyncio
from database.db import SessionLocal
from database.crud import list_reports

async def main():
    async with SessionLocal() as db:
        reports = await list_reports(db)
        print(f"Total reports: {len(reports)}")
        for r in reports[:10]:
            name = "Unknown"
            if getattr(r, "fields", None):
                f = r.fields.get("company_name") or r.fields.get("legal_name")
                if f:
                    name = f.get("value") if isinstance(f, dict) else f
            print(f"ID: {r.id} | Name: {name}")

if __name__ == "__main__":
    asyncio.run(main())
