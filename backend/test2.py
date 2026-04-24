import asyncio
from api.upload import start_upload, StartUploadRequest

async def main():
    req = StartUploadRequest(
        client_name="Test",
        analyst_name="Test Analyst"
    )
    try:
        res = await start_upload(req)
        print("Success:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(main())
