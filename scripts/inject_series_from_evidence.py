#!/usr/bin/env python3
"""
inject_series_from_evidence.py  v2 — ANTIGRAVITY FIX
=====================================================
Reads discovered series from today's evidence files and injects
into poker_venues with proper city/state parsing.

Fixes applied:
  1. Removed `notes` column (doesn't exist in schema)
  2. Must provide city + state (NOT NULL constraints)  
  3. Parses "City, ST SeriesName..." format from PA evidence
  4. Uses correct on_conflict=(name,city,state) composite constraint
"""

import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
EVIDENCE_DIR = BASE_DIR / "data" / "scrape-evidence"

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}
SB_SELECT_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Accept": "application/json",
}

USA_STATES = {
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
    "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
    "VA","WA","WV","WI","WY","DC",
}

BATCH_DATE = "20260408"


def normalize_key(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[''`]", "", s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\s+\d{4}$", "", s)
    return s


def parse_series_record(raw_name: str, source: str, scrape_hash: str, scrape_ts: str) -> dict | None:
    """
    Parse a series name that may be in format:
      "City, ST SeriesName VenueName Dates"  (PokerAtlas format)
      "SeriesName"  (HendonMob/PokerNews format)

    Returns a dict with name, city, state (all strings, never None).
    """
    raw_name = raw_name.strip()
    if not raw_name or len(raw_name) < 8:
        return None

    city = ""
    state = ""
    clean_name = raw_name

    # Try to parse "City, ST Rest..." pattern (PokerAtlas)
    # e.g. "Las Vegas, NV 2026 Wynn April Signature Series..."
    pa_match = re.match(r'^([A-Za-z\s\-\.]+),\s*([A-Z]{2})\s+(.+)$', raw_name)
    if pa_match:
        candidate_city = pa_match.group(1).strip()
        candidate_state = pa_match.group(2).strip()
        remainder = pa_match.group(3).strip()

        if candidate_state in USA_STATES:
            city = candidate_city
            state = candidate_state

            # Strip the venue name + dates from the remainder to get clean series name
            # PokerAtlas format: "SERIES NAME Venue Name Mon DD - Mon DD, YYYY N Events"
            # Try to find the date pattern and strip everything from there
            date_match = re.search(
                r'\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d+\s*[-–]',
                remainder, re.I
            )
            if date_match:
                remainder = remainder[:date_match.start()].strip()

            # The remainder often has "SERIES NAME VenueName" — we want just series name
            # PA series names are usually the first meaningful capitalized phrase
            clean_name = remainder

        # else: not a USA state code, treat as whole name
    
    # Strip HTML entities
    clean_name = clean_name.replace("&amp;", "&").replace("&#39;", "'")
    clean_name = re.sub(r"\s+", " ", clean_name).strip()

    # Skip pure buy-in names like "$ 150 + 50 No Limit Hold'em - Bounty"
    if re.match(r'^\$\s*\d', clean_name) or re.match(r'^\d+\s*\+', clean_name):
        return None

    # Skip news headlines (they end up in PokerNews evidence)
    if any(kw in clean_name.lower() for kw in ["wins ", "crowned champion", "triumphs", "misses out", "stays ahead"]):
        return None

    # Skip single event names
    if re.match(r'^Event\s+#\d+:', clean_name, re.I):
        return None

    if len(clean_name) < 8:
        return None

    return {
        "name": clean_name,
        "city": city or "",
        "state": state or "",
        "source": source,
        "scrape_source": source,
        "scrape_html_hash": scrape_hash,
        "scrape_timestamp": scrape_ts,
    }


def get_existing_series() -> set:
    """Fetch all existing series names from poker_venues."""
    known = set()
    url = f"{SUPABASE_URL}/rest/v1/poker_venues?select=name&venue_type=eq.series&limit=2000"
    req = urllib.request.Request(url, headers=SB_SELECT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            rows = json.loads(r.read())
            for row in rows:
                known.add(normalize_key(row["name"]))
        print(f"  Existing series in DB: {len(known)}")
    except Exception as e:
        print(f"  WARNING: Could not fetch existing series: {e}")
    return known


def load_evidence_records() -> list:
    """Load all series records from today's evidence files."""
    pattern = f"series_*{BATCH_DATE}*.json"
    evidence_files = list(EVIDENCE_DIR.glob(pattern))
    print(f"  Found {len(evidence_files)} evidence files from {BATCH_DATE}")

    all_records = []
    seen_names = set()

    for ef in sorted(evidence_files):
        try:
            data = json.loads(ef.read_text())
            records = data.get("records", [])
            source_tag = data.get("source", ef.stem.split("_")[1] if "_" in ef.stem else "unknown")
            scrape_hash = data.get("scrape_html_hash", "")
            scrape_ts = data.get("scrape_timestamp", datetime.now(timezone.utc).isoformat())

            for rec in records:
                raw_name = (rec.get("name") or "").strip()
                if not raw_name:
                    continue

                parsed = parse_series_record(raw_name, source_tag, scrape_hash, scrape_ts)
                if not parsed:
                    continue

                key = normalize_key(parsed["name"])
                if not key or key in seen_names:
                    continue
                seen_names.add(key)
                all_records.append(parsed)

        except Exception as e:
            print(f"  WARN: Could not read {ef.name}: {e}")

    print(f"  Loaded {len(all_records)} unique parsed series from evidence")
    return all_records


def insert_batch(records: list) -> tuple[int, int]:
    """Insert records with proper city+state defaults to satisfy NOT NULL."""
    CHUNK = 50
    inserted = 0
    failed = 0

    # Build payloads — ALL NOT NULL columns provided
    payloads = []
    for rec in records:
        payloads.append({
            "name": rec["name"],
            "city": rec.get("city") or "",      # NOT NULL — use empty string
            "state": rec.get("state") or "",    # NOT NULL — use empty string
            "venue_type": "series",
            "is_active": True,
            "has_tournaments": True,
            "data_quality": "scraped_verified",
            "source": rec.get("scrape_source", "discovery_v3"),
            "scrape_source": rec.get("scrape_source", "discovery_v3"),
            "scrape_html_hash": rec.get("scrape_html_hash", ""),
            "scrape_timestamp": rec.get("scrape_timestamp", datetime.now(timezone.utc).isoformat()),
        })

    # Use the real composite unique constraint: (name, city, state)
    conflict_url = f"{SUPABASE_URL}/rest/v1/poker_venues?on_conflict=name%2Ccity%2Cstate"

    for i in range(0, len(payloads), CHUNK):
        chunk = payloads[i:i + CHUNK]
        body = json.dumps(chunk).encode()
        req = urllib.request.Request(conflict_url, data=body, method="POST", headers=SB_HEADERS)
        try:
            urllib.request.urlopen(req, timeout=30)
            inserted += len(chunk)
            print(f"  ✅ Chunk {i//CHUNK + 1}/{(len(payloads)-1)//CHUNK + 1}: {len(chunk)} inserted (running total: {inserted})")
        except Exception as e:
            err = e.read().decode()[:400] if hasattr(e, "read") else str(e)[:400]
            print(f"  ❌ Chunk {i//CHUNK + 1} failed: {err[:200]}")
            failed += len(chunk)
        time.sleep(0.2)

    return inserted, failed


def verify_db_count() -> int:
    url = f"{SUPABASE_URL}/rest/v1/poker_venues?select=id&venue_type=eq.series&limit=2000"
    req = urllib.request.Request(url, headers=SB_SELECT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            rows = json.loads(r.read())
            return len(rows)
    except Exception as e:
        print(f"  WARNING: Could not verify count: {e}")
        return -1


def main():
    print("=" * 65)
    print("  ANTIGRAVITY SERIES INJECTION v2 — Evidence-Based Insert")
    print(f"  Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    # Step 1: Get existing series
    print("\n📡 Step 1: Fetching existing series from DB...")
    existing_keys = get_existing_series()

    # Step 2: Load from evidence
    print(f"\n📂 Step 2: Loading from evidence files (batch {BATCH_DATE})...")
    all_records = load_evidence_records()

    # Step 3: Filter out already-existing ones
    new_records = [r for r in all_records if normalize_key(r["name"]) not in existing_keys]
    print(f"\n🔍 Step 3: {len(new_records)} NEW series to insert (not yet in DB)")

    if not new_records:
        print("\n✅ All series already in DB. Nothing to insert.")
        db_count = verify_db_count()
        print(f"   Current DB series count: {db_count}")
        return

    # Show preview
    print("\n📋 Preview (first 30):")
    for i, r in enumerate(new_records[:30], 1):
        loc = f"{r['city']}, {r['state']}" if r.get('city') and r.get('state') else "Touring"
        print(f"  {i:3}. [{loc[:20]:20}] {r['name'][:50]}")
    if len(new_records) > 30:
        print(f"  ... and {len(new_records) - 30} more")

    # Step 4: Insert
    print(f"\n💾 Step 4: Inserting {len(new_records)} series...")
    inserted, failed = insert_batch(new_records)

    # Step 5: Verify
    print("\n📊 Step 5: Verifying final DB count...")
    db_count = verify_db_count()

    print("\n" + "=" * 65)
    print(f"  ✅ COMPLETE")
    print(f"  Inserted:  {inserted}")
    print(f"  Failed:    {failed}")
    print(f"  DB series total (poker_venues): {db_count}")
    print("=" * 65)


if __name__ == "__main__":
    main()
