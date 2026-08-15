import psycopg2, json
db = "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres"
conn = psycopg2.connect(db)
cur = conn.cursor()

# Records from this batch (last 20 min)
cur.execute("""
    SELECT venue_name, COUNT(*) as recs,
           COUNT(scrape_html_hash) as hashes,
           COUNT(source_url) as urls,
           COUNT(CASE WHEN data_quality='scraped_verified' THEN 1 END) as verified,
           ROUND(AVG(scrape_completeness_score)::numeric, 1) as avg_score
    FROM venue_daily_tournaments
    WHERE scrape_timestamp >= NOW() - INTERVAL '20 minutes'
    GROUP BY venue_name ORDER BY venue_name;
""")
rows = cur.fetchall()
total_recs = sum(r[1] for r in rows)
total_hashes = sum(r[2] for r in rows)
total_verified = sum(r[4] for r in rows)

print(f"{'VENUE':<35} {'RECS':>5} {'HASH':>5} {'URL':>5} {'VRFY':>5} {'SCORE':>6}")
print("-" * 70)
for r in rows:
    print(f"{r[0]:<35} {r[1]:>5} {r[2]:>5} {r[3]:>5} {r[4]:>5} {r[5]:>6}")
print("-" * 70)
print(f"{'TOTAL':<35} {total_recs:>5} {total_hashes:>5} {'':>5} {total_verified:>5}")

# Authenticity checks
print(f"\n=== AUTHENTICITY ===")
print(f"  SHA-256 hashes:  {total_hashes}/{total_recs} ({'✅ PASS' if total_hashes==total_recs else '❌ FAIL'})")
print(f"  Verified tag:    {total_verified}/{total_recs} ({'✅ PASS' if total_verified==total_recs else '❌ FAIL'})")

# Buy-in diversity
cur.execute("SELECT DISTINCT buy_in FROM venue_daily_tournaments WHERE scrape_timestamp >= NOW() - INTERVAL '20 minutes' ORDER BY buy_in;")
buyins = [r[0] for r in cur.fetchall()]
print(f"  Unique buy-ins:  {len(buyins)} — {buyins[:15]}...")
print(f"  Genuine data:    {'✅ YES' if len(buyins) > 5 else '❌ SUSPICIOUS'}")

conn.close()
