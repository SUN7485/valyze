import asyncio
from fastapi.testclient import TestClient
from main import app
import traceback
import sys

with open("test_out.txt", "w") as f:
    try:
        client = TestClient(app)
        response = client.post("/api/upload/start", json={
            "client_name": "Easy Import",
            "analyst_name": "System",
            "client_reference": "",
            "analyst_id": "",
            "order_comment": "",
            "company_name_hint": "Imported Company"
        })
        f.write(f"STATUS: {response.status_code}\n")
        f.write(f"BODY: {response.text}\n")
    except Exception as e:
        f.write("EXCEPTION CAUGHT:\n")
        traceback.print_exc(file=f)
