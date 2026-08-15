import psycopg2, json

db_url = "postgresql://postgres:${SUPABASE_DB_PASSWORD}@db.kuklfnapbkmacvwxktbh.supabase.co:5432/postgres"

# All 34 target fields
FIELDS = [
    # Core (7)
    "tournament_name", "buy_in", "game_type", "format", "day_of_week", "event_date", "start_time",
    # Prize & Structure (4)
    "guaranteed", "bounty_amount", "satellite_to", "payout_levels",
    # Tournament Structure (4)
    "starting_stack", "level_duration_minutes", "number_of_levels", "structure_sheet_url",
    # Registration & Rules (6)
    "late_registration", "rebuy_addon", "max_entries", "min_players_to_run",
    "registration_opens", "online_registration_url",
    # Series & Special Events (3)
    "series_name", "series_event_number", "is_special_event",
    # Venue & Timing (1)
    "timezone",
    # Scraper Intelligence (9)
    "scrape_completeness_score", "best_scrape_url", "scrape_fail_count",
    "flags", "human_verified", "is_recurring", "parent_tournament_id",
    "source_url", "scrape_html_hash", "scrape_timestamp", "data_quality"
]

RICH_FIELDS = [
    "tournament_name", "starting_stack", "level_duration_minutes",
    "rebuy_addon", "late_registration", "guaranteed", "format", "max_entries",
    "bounty_amount", "structure_sheet_url", "payout_levels", "timezone"
]

BASE_FIELDS = ["buy_in", "game_type", "day_of_week", "start_time", "event_date"]

conn = psycopg2.connect(db_url)
cur = conn.cursor()

# Check which columns actually exist in the table
cur.execute("""
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'venue_daily_tournaments' 
    ORDER BY ordinal_position;
""")
existing_cols = [r[0] for r in cur.fetchall()]
print("=== EXISTING COLUMNS IN TABLE ===")
for c in existing_cols:
    print(f"  {c}")

# Find missing target fields
missing_from_table = [f for f in FIELDS if f not in existing_cols]
present_in_table = [f for f in FIELDS if f in existing_cols]

print(f"\n=== FIELDS PRESENT: {len(present_in_table)}/{len(FIELDS)} ===")
print(f"=== FIELDS MISSING FROM SCHEMA: {len(missing_from_table)} ===")
for m in missing_from_table:
    print(f"  ❌ {m}")

# Get the batch_id for latest batch (or just get last 25 venues)
# Use the scrape_timestamp from last run
cur.execute("""
    SELECT DISTINCT venue_name FROM venue_daily_tournaments 
    WHERE scrape_timestamp >= NOW() - INTERVAL '30 minutes'
    ORDER BY venue_name;
""")
recent_venues = [r[0] for r in cur.fetchall()]
print(f"\n=== VENUES FROM LAST 30 MIN: {len(recent_venues)} ===")
for v in recent_venues:
    print(f"  {v}")

# Per-field population rates across recent records
print(f"\n=== FIELD POPULATION RATES (last 30 min records) ===")
for f in present_in_table:
    cur.execute(f"""
        SELECT 
            COUNT(*) as total,
            COUNT({f}) as filled,
            ROUND(COUNT({f})::numeric / NULLIF(COUNT(*), 0) * 100, 1) as pct
        FROM venue_daily_tournaments 
        WHERE scrape_timestamp >= NOW() - INTERVAL '30 minutes';
    """)
    total, filled, pct = cur.fetchone()
    status = "✅" if pct and pct >= 80 else "⚠️" if pct and pct >= 20 else "❌"
    print(f"  {status} {f}: {filled}/{total} ({pct}%)")

# Per-venue completeness score
print(f"\n=== PER-VENUE COMPLETENESS (last 30 min) ===")
rich_present = [f for f in RICH_FIELDS if f in existing_cols]
base_present = [f for f in BASE_FIELDS if f in existing_cols]

rich_case = " + ".join([f"CASE WHEN {f} IS NOT NULL THEN 1 ELSE 0 END" for f in rich_present])
base_case = " + ".join([f"CASE WHEN {f} IS NOT NULL THEN 1 ELSE 0 END" for f in base_present])

cur.execute(f"""
    SELECT 
        venue_name,
        COUNT(*) as records,
        ROUND(AVG(({rich_case})::numeric / {len(rich_present)} * 70 + ({base_case})::numeric / {len(base_present)} * 30), 1) as avg_score,
        ROUND(MIN(({rich_case})::numeric / {len(rich_present)} * 70 + ({base_case})::numeric / {len(base_present)} * 30), 1) as min_score,
        ROUND(MAX(({rich_case})::numeric / {len(rich_present)} * 70 + ({base_case})::numeric / {len(base_present)} * 30), 1) as max_score
    FROM venue_daily_tournaments
    WHERE scrape_timestamp >= NOW() - INTERVAL '30 minutes'
    GROUP BY venue_name
    ORDER BY avg_score DESC;
""")
rows = cur.fetchall()
for r in rows:
    print(f"  {r[0]}: avg={r[2]}, min={r[3]}, max={r[4]}, records={r[1]}")

# Overall average
cur.execute(f"""
    SELECT 
        ROUND(AVG(({rich_case})::numeric / {len(rich_present)} * 70 + ({base_case})::numeric / {len(base_present)} * 30), 1) as overall_avg
    FROM venue_daily_tournaments
    WHERE scrape_timestamp >= NOW() - INTERVAL '30 minutes';
""")
overall = cur.fetchone()[0]
print(f"\n=== OVERALL COMPLETENESS SCORE: {overall}/100 ===")

conn.close()
