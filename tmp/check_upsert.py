import psycopg2

db_url = "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres"

try:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM venue_daily_tournaments;")
    total = cur.fetchone()[0]
    
    cur.execute("SELECT venue_name, COUNT(*) FROM venue_daily_tournaments GROUP BY venue_name ORDER BY COUNT(*) DESC LIMIT 5;")
    d = cur.fetchall()
    
    print(f"Total Records: {total}")
    print("Top Venues:")
    for row in d:
        print(f"  {row[0]}: {row[1]}")
        
except Exception as e:
    print(e)
