@echo off
cd backend
echo Testing easy_way_import with risk_assessment data
echo.
python - <<END
import requests
import json

url = 'http://localhost:8000/api/report/test-report-id/easy-way'
headers = {'Content-Type': 'application/json'}
data = {
    "risk_assessment": {
        "credit_rating": "BBB+",
        "risk_level": "Medium",
        "health_score": 76
    },
    "company_identity": {
        "country": "United Arab Emirates"
    }
}

try:
    # Import data
    print("1. Importing test data...")
    response = requests.post(url, headers=headers, json=data)
    print(f"   Status: {response.status_code}")
    print(f"   Response: {json.dumps(response.json(), indent=2)}")
    print()

    # Check imported fields
    print("2. Checking imported fields...")
    check_url = 'http://localhost:8000/api/report/test-report-id'
    check_response = requests.get(check_url)
    
    if check_response.status_code == 200:
        report = check_response.json()
        
        # Print fields of interest
        print(f"   Report status: {report.get('status')}")
        print()
        
        # Check specific fields
        fields_to_check = [
            'credit_rating', 'risk_level', 'health_score', 
            'paydex_score', 'recommended_limit', 'max_exposure',
            'currency'
        ]
        
        for field in fields_to_check:
            field_data = report.get('fields', {}).get(field)
            if field_data:
                print(f"   {field:20} value: {field_data.get('value')}")
                print(f"   {field:20} source: {field_data.get('source')}")
                print(f"   {field:20} locked: {field_data.get('locked')}")
                print()
except Exception as e:
    print(f"Error: {e}")
END