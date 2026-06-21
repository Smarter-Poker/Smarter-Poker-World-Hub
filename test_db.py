import os
from urllib.parse import urlparse
import psycopg2

db_url = os.environ.get('MLB_SUPABASE_URL')
if not db_url:
    print("No MLB_SUPABASE_URL")
    exit(1)

conn = psycopg2.connect(db_url)
cur = conn.cursor()
cur.execute("SELECT * FROM public.v_model_health")
print("v_model_health rows:", cur.fetchall())
cur.execute("SELECT to_jsonb(h) FROM v_model_health h LIMIT 1")
print("to_jsonb:", cur.fetchone())
