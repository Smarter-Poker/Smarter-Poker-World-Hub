import psycopg2
db = "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres"
conn = psycopg2.connect(db)
cur = conn.cursor()
cur.execute("SELECT COUNT(*) FROM venue_daily_tournaments;")
total = cur.fetchone()[0]
cur.execute("SELECT COUNT(DISTINCT venue_name) FROM venue_daily_tournaments;")
venues = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM venue_daily_tournaments WHERE scrape_timestamp >= NOW() - INTERVAL '15 minutes';")
recent = cur.fetchone()[0]
print(f"Total records in DB: {total}")
print(f"Unique venues:       {venues}")
print(f"Records last 15 min: {recent}")
conn.close()
