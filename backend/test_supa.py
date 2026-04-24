import os
from dotenv import load_dotenv
import requests

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

print(f"URL: {SUPABASE_URL}")
print(f"KEY: {SUPABASE_KEY[:10]}...")

url = f"{SUPABASE_URL}/rest/v1/reports?select=id&limit=1"
headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json"
}

try:
    resp = requests.get(url, headers=headers, timeout=10)
    print("STATUS:", resp.status_code)
    print("TEXT:", resp.text)
except Exception as e:
    print("EXCEPTION:", e)
