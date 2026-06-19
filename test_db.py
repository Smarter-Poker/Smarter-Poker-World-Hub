import json
from supabase import create_client

with open('.env.local', 'r') as f:
    env_vars = {}
    for line in f:
        if '=' in line:
            k, v = line.strip().split('=', 1)
            env_vars[k.strip()] = v.strip()

sb = create_client(env_vars['NEXT_PUBLIC_MLB_SUPABASE_URL'], env_vars['MLB_SUPABASE_SERVICE_ROLE_KEY'])
res = sb.table('pred_best_bets').select('bet_type, market, selection, player_name').limit(20).execute()
print(json.dumps(res.data, indent=2))
