import requests
import json

base_url = "http://localhost:3000/api/mlb"

def test_endpoint(url):
    print(f"Testing {url}...")
    try:
        resp = requests.get(url, timeout=10)
        print(f"Status Code: {resp.status_code}")
        data = resp.json()
        print(f"Keys in response: {list(data.keys())}")
        if 'data' in data:
            print(f"Number of players: {len(data['data'])}")
            if len(data['data']) > 0:
                print(f"Sample player: {data['data'][0]}")
    except Exception as e:
        print(f"Error: {e}")
    print("-" * 40)

test_endpoint(f"{base_url}/hitters")
test_endpoint(f"{base_url}/pitchers")
