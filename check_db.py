from supabase import create_client
import os

supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if not supabase_url or not supabase_key:
    print("Missing env vars")
    exit(1)

sb = create_client(supabase_url, supabase_key)
ts = sb.table('tournament_series').select('name,tour').execute()
ps = sb.table('poker_series').select('series_name,tour').execute()

print(f"tournament_series count: {len(ts.data)}")
print(f"poker_series count: {len(ps.data)}")
