import asyncio
from database.crud import create_report
import uuid

async def run():
    try:
        report_id = str(uuid.uuid4())
        print("Creating report...")
        report = await create_report(None, report_id)
        print("Success:", report.report_id)
    except Exception as e:
        print("Error:", str(e))

asyncio.run(run())
