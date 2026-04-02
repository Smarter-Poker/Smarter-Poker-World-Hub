import urllib.request, json
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs'

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
