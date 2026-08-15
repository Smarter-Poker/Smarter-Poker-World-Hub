import psycopg2

db_url = "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres"

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("DROP INDEX IF EXISTS idx_venue_daily_tournaments_dedup;")
    conn.commit()
    print("SUCCESSFULLY DROPPED index idx_venue_daily_tournaments_dedup")
except Exception as e:
    print(e)
