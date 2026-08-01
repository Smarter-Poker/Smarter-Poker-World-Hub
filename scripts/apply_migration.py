import urllib.request, json
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

req = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/rpc/exec_sql',
    data=json.dumps({'query': 'ALTER TABLE "public"."poker_venues" ADD COLUMN IF NOT EXISTS "logo_url" text;'}).encode(),
    method='POST',
    headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
)
try:
    urllib.request.urlopen(req)
    print("Migration applied successfully!")
except Exception as e:
    if hasattr(e, 'read'): print(e.read().decode())
    else: print(e)
