import asyncio
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

response = client.post("/api/upload/start", json={
    "client_name": "Easy Import",
    "analyst_name": "System",
    "client_reference": "",
    "analyst_id": "",
    "order_comment": "",
    "company_name_hint": "Imported Company"
})

print(response.status_code)
print(response.text)
