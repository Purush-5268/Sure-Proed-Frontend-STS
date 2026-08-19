import requests

url = "http://127.0.0.1:8000/api/companies/"
# We might need authentication. If we get a 401/403, we know it's a permission issue.
try:
    response = requests.get(url)
    print(f"Status Code: {response.status_code}")
    print("Response JSON snippet:")
    print(str(response.json())[:500])
except Exception as e:
    print(f"Error: {e}")
