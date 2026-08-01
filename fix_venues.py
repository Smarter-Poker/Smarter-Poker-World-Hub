import json, urllib.request, re

URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def get_poker_venues():
    req = urllib.request.Request(f"{URL}/rest/v1/poker_venues?select=id,name,slug&limit=20", headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"})
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(e.read())
        return None

v = get_poker_venues()
for idx, x in enumerate(v):
    print(x)
