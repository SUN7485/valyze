import asyncio
import threading
import time
import requests
import uvicorn
from main import app

def run_server():
    uvicorn.run(app, host="127.0.0.1", port=3005, log_level="debug")

server_thread = threading.Thread(target=run_server, daemon=True)
server_thread.start()

time.sleep(3) # Wait for server to start

try:
    response = requests.post("http://127.0.0.1:3005/api/upload/start", json={
        "client_name": "Easy Import",
        "analyst_name": "System",
        "client_reference": "",
        "analyst_id": "",
        "order_comment": "",
        "company_name_hint": "Imported Company"
    }, timeout=5)
    print("STATUS:", response.status_code)
    print("BODY:", response.text)
except Exception as e:
    print("ERROR:", str(e))
