import requests

def test():
    # Login
    res = requests.post("http://127.0.0.1:8000/api/auth/token/", json={
        "email": "paidipillipurushotham@gmail.com",
        "password": "Temp@12345"
    })
    
    if res.status_code != 200:
        print("Login failed:", res.status_code, res.text)
        return
        
    token = res.json().get("access")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get profile
    p_res = requests.get("http://127.0.0.1:8000/api/students/?user__email=paidipillipurushotham@gmail.com", headers=headers)
    print("Profile:", p_res.json())
    
    # Get applications
    a_res = requests.get("http://127.0.0.1:8000/api/applications/", headers=headers)
    print("Applications:", a_res.json())

test()
