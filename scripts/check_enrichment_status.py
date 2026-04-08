import os
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env.local")

def get_db():
    pw  = os.environ.get("SUPABASE_DB_PASSWORD", "")
    host = os.environ.get("NEXT_PUBLIC_SUPABASE_URL","").replace("https://","").split(".")[0]
    return psycopg2.connect(
        f"postgresql://postgres:{pw}@db.{host}.supabase.co:5432/postgres",
        cursor_factory=psycopg2.extras.RealDictCursor,
    )

def check_status():
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                s.tour,
                COUNT(e.id) as total_events,
                COUNT(e.id) FILTER (WHERE e.scrape_completeness_score >= 60) as enriched_events,
                AVG(COALESCE(e.scrape_completeness_score, 0))::numeric(10,2) as avg_score
            FROM tour_series s
            JOIN tour_event_details e ON s.id = e.series_id
            WHERE s.tour IS NOT NULL
            GROUP BY s.tour
            ORDER BY enriched_events DESC
        """)
        rows = cur.fetchall()
        print(f"{'Tour':<15} | {'Events':<6} | {'Enriched (>=60)':<15} | {'%':<5} | {'Avg Score':<9}")
        print("-" * 65)
        for r in rows:
            tour = str(r['tour'])
            total = r['total_events']
            enriched = r['enriched_events']
            pct = (enriched / total * 100) if total > 0 else 0
            avg = str(r['avg_score'])
            print(f"{tour:<15} | {total:<6} | {enriched:<15} | {pct:<5.1f} | {avg:<9}")

if __name__ == '__main__':
    check_status()
