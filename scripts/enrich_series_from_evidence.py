#!/usr/bin/env python3
"""
enrich_series_from_evidence.py — Phase 1 Enrichment for Poker Series Events
═══════════════════════════════════════════════════════════════════════════════
Backfills poker_events with:
  1. venue_name/city/state from parent poker_series records
  2. guarantee extracted from event_name patterns ($50K GTD, etc.)
  3. format extracted from event_name patterns (Bounty, Deep Stack, etc.)
  4. Recalculates scrape_completeness_score after enrichment

No network scraping required — purely DB-to-DB enrichment.

Usage:
    .venv/bin/python3 scripts/enrich_series_from_evidence.py
    .venv/bin/python3 scripts/enrich_series_from_evidence.py --dry-run
"""

import json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# ── Supabase ─────────────────────────────────────────────────────────────────
SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs"
)
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except Exception as e:
        log(f"  [GET ERR] {e}")
        return []


def sb_patch_events(event_uids, patch):
    """Patch multiple events by event_uid list."""
    if not event_uids:
        return 0
    # Batch by 50
    total = 0
    for i in range(0, len(event_uids), 50):
        chunk = event_uids[i:i+50]
        uid_filter = ",".join(chunk)
        url = f"{SUPABASE_URL}/rest/v1/poker_events?event_uid=in.({uid_filter})"
        data = json.dumps(patch).encode()
        req = urllib.request.Request(url, data=data, method="PATCH", headers=SB_HDRS)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                r.read()
            total += len(chunk)
        except Exception as e:
            log(f"  [PATCH ERR] {e}")
    return total


def sb_upsert_events(records):
    """Upsert event records to poker_events."""
    if not records:
        return 0
    total = 0
    for i in range(0, len(records), 50):
        chunk = records[i:i+50]
        url = f"{SUPABASE_URL}/rest/v1/poker_events?on_conflict=event_uid"
        data = json.dumps(chunk).encode()
        req = urllib.request.Request(url, data=data, method="POST", headers=SB_HDRS)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                r.read()
            total += len(chunk)
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")[:300]
            log(f"  [UPSERT ERR] HTTP {e.code}: {body}")
        except Exception as e:
            log(f"  [UPSERT ERR] {e}")
    return total


# ── Completeness scoring (matches poker_series_scraper.py) ────────────────────
def compute_completeness(rec):
    rich_fields = [
        "starting_stack", "level_duration_minutes", "rebuy_addon",
        "late_reg_levels", "guarantee", "format", "max_entries",
        "bounty_amount", "structure_sheet_url", "payout_levels",
        "timezone", "blind_levels",
    ]
    filled = sum(1 for f in rich_fields if rec.get(f) not in (None, "", 0, False))
    base_fields = ["event_name", "buy_in", "game_type", "start_date", "start_time"]
    base_score = sum(1 for f in base_fields if rec.get(f) not in (None, "", 0))
    return min(100, round((filled / len(rich_fields)) * 70 + (base_score / len(base_fields)) * 30))


# ── Guarantee extraction from event name ──────────────────────────────────────
def extract_guarantee(text):
    """Extract guarantee from text patterns like '$50K GTD', '$100,000 Guaranteed'."""
    if not text:
        return None
    # $XXK GTD / $XXK Gtd / $XXK Guaranteed
    m = re.search(r"\$(\d+)[Kk]\s*(?:GTD|Gtd|Guaranteed)", text)
    if m:
        return int(m.group(1)) * 1000
    # $XX,XXX GTD
    m2 = re.search(r"\$([\d,]+)\s*(?:GTD|Gtd|Guaranteed)", text, re.I)
    if m2:
        return int(m2.group(1).replace(",", ""))
    # Guaranteed: $XX,XXX
    m3 = re.search(r"(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)", text, re.I)
    if m3:
        val = int(m3.group(1).replace(",", ""))
        if val >= 1000:
            return val
    return None


# ── Format extraction from event name ─────────────────────────────────────────
def extract_format(text):
    if not text:
        return None
    for fmt, pat in [
        ("Mystery Bounty", r"mystery.?bounty"),
        ("Progressive KO", r"progressive|PKO"),
        ("Bounty", r"bounty"),
        ("Deep Stack", r"deep.?stack"),
        ("Turbo", r"turbo"),
        ("Rebuy", r"rebuy"),
        ("Freezeout", r"freezeout"),
        ("Satellite", r"satellite"),
        ("Freeroll", r"freeroll"),
        ("Shootout", r"shootout"),
        ("Hyper", r"hyper"),
        ("Multi-Flight", r"multi.?flight"),
        ("6-Max", r"6.?max"),
        ("8-Max", r"8.?max"),
    ]:
        if re.search(pat, text, re.I):
            return fmt
    return None


# ── Fix date rollover (2027 → 2026) ──────────────────────────────────────────
def fix_date_rollover(event, series_start, series_end):
    """If event date is 2027 but series is 2026, fix it."""
    if not event.get("start_date"):
        return None
    sd = event["start_date"]
    if sd.startswith("2027-") and series_start and series_start.startswith("2026-"):
        fixed = "2026-" + sd[5:]
        return fixed
    return None


def main():
    dry_run = "--dry-run" in sys.argv

    log("=" * 70)
    log("POKER SERIES EVENTS ENRICHMENT — Phase 1")
    log(f"  Mode: {'DRY RUN' if dry_run else 'LIVE'}")
    log("=" * 70)

    # ── Step 1: Load all 44 parent series records ────────────────────────────
    log("\n1. Loading parent poker_series records...")
    series_rows = sb_get("poker_series", "?select=series_uid,series_name,venue_name,city,state,start_date,end_date,total_guaranteed&events_scraped=eq.true&limit=100")
    log(f"   Found {len(series_rows)} series with events_scraped=true")

    series_lookup = {}
    for s in series_rows:
        uid = s.get("series_uid")
        if uid:
            series_lookup[uid] = s

    # ── Step 2: Load all events ──────────────────────────────────────────────
    log("\n2. Loading all poker_events...")
    all_events = []
    for offset in range(0, 5000, 1000):
        chunk = sb_get("poker_events", f"?select=*&limit=1000&offset={offset}")
        if not chunk:
            break
        all_events.extend(chunk)
        if len(chunk) < 1000:
            break
    log(f"   Loaded {len(all_events)} events")

    # ── Step 3: Enrich each event ────────────────────────────────────────────
    log("\n3. Enriching events...")
    updates = []
    stats = {
        "venue_filled": 0,
        "guarantee_filled": 0,
        "format_filled": 0,
        "date_fixed": 0,
        "score_improved": 0,
    }

    for evt in all_events:
        uid = evt.get("event_uid")
        series_uid = evt.get("series_uid")
        parent = series_lookup.get(series_uid, {})
        patch = {}
        changed = False

        # 3a: Backfill venue_name/city/state from parent
        if (not evt.get("venue_name") or evt["venue_name"] in ("", "Unknown")) and parent.get("venue_name"):
            patch["venue_name"] = parent["venue_name"]
            changed = True
            stats["venue_filled"] += 1
        if (not evt.get("city") or evt["city"] == "") and parent.get("city"):
            patch["city"] = parent["city"]
            changed = True
        if (not evt.get("state") or evt["state"] == "") and parent.get("state"):
            patch["state"] = parent["state"]
            changed = True

        # 3b: Extract guarantee from event_name
        if not evt.get("guarantee"):
            gtd = extract_guarantee(evt.get("event_name", "") + " " + (evt.get("notes") or ""))
            if gtd:
                patch["guarantee"] = gtd
                changed = True
                stats["guarantee_filled"] += 1

        # 3c: Extract format from event_name
        if not evt.get("format"):
            fmt = extract_format(evt.get("event_name", ""))
            if fmt:
                patch["format"] = fmt
                changed = True
                stats["format_filled"] += 1

        # 3d: Fix 2027 → 2026 date rollover
        fixed_date = fix_date_rollover(evt, parent.get("start_date"), parent.get("end_date"))
        if fixed_date:
            patch["start_date"] = fixed_date
            changed = True
            stats["date_fixed"] += 1

        # 3e: Recalculate completeness score
        if changed:
            merged = {**evt, **patch}
            new_score = compute_completeness(merged)
            old_score = evt.get("scrape_completeness_score", 0)
            if new_score != old_score:
                patch["scrape_completeness_score"] = new_score
                if new_score > old_score:
                    stats["score_improved"] += 1

        if patch and uid:
            patch["event_uid"] = uid  # needed for upsert conflict
            # Carry forward all existing fields for the upsert
            full_record = {**evt, **patch}
            # Only keep DB-safe fields
            safe_keys = [
                "event_uid", "series_uid", "event_name", "event_number", "event_type",
                "buy_in", "fee", "starting_stack", "blind_levels", "guarantee",
                "prize_pool", "entries", "start_date", "start_time", "end_date",
                "day_number", "flight", "late_reg_levels", "re_entry", "re_entry_limit",
                "unlimited_re_entry", "game_type", "format", "venue_name", "city", "state",
                "source", "notes", "data_quality", "scrape_html_hash", "scrape_timestamp",
                "scrape_confidence", "scrape_batch_id", "scrape_completeness_score",
            ]
            clean = {k: full_record.get(k) for k in safe_keys if k in full_record}
            updates.append(clean)

    log(f"\n   Enrichment summary:")
    log(f"     Venue backfilled:     {stats['venue_filled']}")
    log(f"     Guarantee extracted:  {stats['guarantee_filled']}")
    log(f"     Format extracted:     {stats['format_filled']}")
    log(f"     Dates fixed (2027→26):{stats['date_fixed']}")
    log(f"     Scores improved:      {stats['score_improved']}")
    log(f"     Total records to update: {len(updates)}")

    # ── Step 4: Upsert enriched records ──────────────────────────────────────
    if updates and not dry_run:
        log(f"\n4. Upserting {len(updates)} enriched events...")
        ok = sb_upsert_events(updates)
        log(f"   ✅ Upserted {ok} events")
    elif dry_run:
        log(f"\n4. [DRY RUN] Would upsert {len(updates)} enriched events")
        # Show sample
        if updates:
            sample = updates[0]
            log(f"   Sample: {sample.get('event_name','')[:60]}")
            log(f"           venue={sample.get('venue_name')} city={sample.get('city')} state={sample.get('state')}")
            log(f"           guarantee={sample.get('guarantee')} format={sample.get('format')}")
            log(f"           score={sample.get('scrape_completeness_score')}")

    # ── Step 5: Post-check ───────────────────────────────────────────────────
    if not dry_run and updates:
        log("\n5. Post-enrichment score check...")
        post_events = []
        for offset in range(0, 5000, 1000):
            chunk = sb_get("poker_events", f"?select=scrape_completeness_score&limit=1000&offset={offset}")
            if not chunk:
                break
            post_events.extend(chunk)
            if len(chunk) < 1000:
                break

        scores = [e.get("scrape_completeness_score", 0) for e in post_events if e.get("scrape_completeness_score") is not None]
        if scores:
            avg = sum(scores) / len(scores)
            ge70 = sum(1 for s in scores if s >= 70)
            ge60 = sum(1 for s in scores if s >= 60)
            log(f"   Total events: {len(scores)}")
            log(f"   Average score: {avg:.1f}")
            log(f"   Score >= 60: {ge60} ({ge60*100//len(scores)}%)")
            log(f"   Score >= 70: {ge70} ({ge70*100//len(scores)}%)")

    log("\n" + "=" * 70)
    log("ENRICHMENT DONE")
    log("=" * 70)


if __name__ == "__main__":
    main()
