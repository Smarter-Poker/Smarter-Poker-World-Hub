import psycopg2

db_url = "postgresql://postgres.kuklfnapbkmacvwxktbh:${SUPABASE_DB_PASSWORD}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"

# Wait, Supabase connections usually use aws-0-REGION.pooler.supabase.com:6543 or db.PROJECT_REF.supabase.co:5432
db_url2 = "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres"

try:
    conn = psycopg2.connect(db_url2)
    cur = conn.cursor()
    cur.execute("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'venue_daily_tournaments';")
    for row in cur.fetchall():
        print(f"INDEX: {row[0]}")
        print(f"DEF:   {row[1]}\n")
except Exception as e:
    print(e)
