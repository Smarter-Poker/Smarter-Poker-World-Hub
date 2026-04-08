import os
import sys
from supabase import create_client
from dotenv import load_dotenv

load_dotenv(".env.local")

try:
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    res = sb.table("tour_event_details").select("*").limit(10).execute()
    data = res.data
    print(f"Total returned: {len(data)}")
    for r in data:
        print(f"[{r['tour_code']}] {r['event_name'][:40]} | URL={r['source_url']}")
except Exception as e:
    print("ERROR:", e, file=sys.stderr)
