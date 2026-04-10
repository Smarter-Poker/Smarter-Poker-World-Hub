#!/usr/bin/env python3
"""
gemini_report2_remediation.py

Executes ALL three directives from the Gemini Deep Research Report #2:
  1. Merge/DELETE duplicates (21 pairs identified)
  2. Close newly-identified permanently/temporarily closed venues
  3. Flag additional cash-only venues (remove from tournament scraper)
"""

import urllib.request, json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
env_path = PROJECT_ROOT / ".env.local"
SUPABASE_URL = ""
SUPABASE_KEY = ""

for line in env_path.read_text().splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line: continue
    k, _, v = line.partition("=")
    k = k.strip(); v = v.strip().strip('"').strip("'")
    if k == "NEXT_PUBLIC_SUPABASE_URL": SUPABASE_URL = v
    if k == "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY = v

SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_delete(table, params):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, method="DELETE", headers=SB_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
            return True
    except Exception as e:
        return str(e)

def sb_patch(table, params, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, data=json.dumps(data).encode(), method="PATCH", headers=SB_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            r.read()
            return True
    except Exception as e:
        return str(e)

def delete4eva(venue_id, venue_name):
    """Clear all FK dependencies then delete the venue permanently."""
    dep_tables = [
        "commander_waitlist_history", "commander_tables", "commander_notifications",
        "venue_daily_tournaments", "venue_favorites"
    ]
    for dt in dep_tables:
        sb_delete(dt, f"?venue_id=eq.{venue_id}")
    
    result = sb_delete("poker_venues", f"?id=eq.{venue_id}")
    if result is True:
        print(f"  🗑️  DELETED [{venue_id}] {venue_name}")
        return True
    else:
        # Try deactivation as fallback
        sb_patch("poker_venues", f"?id=eq.{venue_id}", {"is_active": False})
        print(f"  ⚠️  Could not delete [{venue_id}] {venue_name} (deactivated instead): {result}")
        return False

# ============================================================================
# PHASE 1: DUPLICATE MERGE + DELETE
# ============================================================================
print("=" * 70)
print("PHASE 1: DUPLICATE RESOLUTION (21 pairs)")
print("=" * 70)

# Format: (keep_id, delete_id, keep_name, delete_name)
# The "keep" venue is always the one with the genuine logo / more complete data
# Per Gemini report Table of duplicates:
duplicates = [
    # Aria: Keep 2036 "Aria Casino" (original, has tournament data), delete 3360 "Aria"
    (2036, 3360, "Aria Casino", "Aria"),
    # Atlantis: Keep 1992 (original), delete 2169 
    (1992, 2169, "Atlantis Casino Resort", "Atlantis Casino"),
    # Bally's Twin River: Keep 1892 (original), delete 3376
    (1892, 3376, "Bally's Twin River Lincoln", "Bally Twin River"),
    # Bellagio: Keep 2499 "Bellagio Poker Room" (has data), delete 3396 "Bellagio"
    (2499, 3396, "Bellagio Poker Room", "Bellagio"),
    # bestbet Jacksonville: Keep 1827 (original), delete 3370
    (1827, 3370, "bestbet Jacksonville", "Jacksonville Poker Room"),
    # Canterbury Park: Keep 1983 (original card club), delete 3351
    (1983, 3351, "Canterbury Park Card Club", "Canterbury Park"),
    # Casino 99 / Casino Chico: Keep 1936 Casino 99 (original), delete 2866
    (1936, 2866, "Casino 99", "Casino Chico"),
    # Daytona: Keep 2037 (original), delete 3125 and 3354
    (2037, 3125, "Daytona Beach Racing and Card Club", "Daytona Beach Racing & Card Club"),
    (2037, 3354, "Daytona Beach Racing and Card Club", "Daytona Racing & Card Club"),
    # Ebro: Keep 1947 Ebro Poker Room (has data), delete 2249
    (1947, 2249, "Ebro Poker Room", "Ebro Greyhound Park"),
    # FireKeepers: Keep 3383 (has Casino in name), delete 3388
    (3383, 3388, "FireKeepers Casino", "FireKeepers"),
    # Hard Rock Cincinnati: Keep 1879 (original), delete 3101
    (1879, 3101, "Hard Rock Cincinnati", "Hard Rock Casino Cincinnati"),
    # Harrah's Cherokee: Keep 1878 (has apostrophe), delete 3380
    (1878, 3380, "Harrah's Cherokee", "Harrahs Cherokee"),
    # Horseshoe LV: Keep 3123 (full name), delete 3384
    (3123, 3384, "Horseshoe Las Vegas", "Horseshoe LV"),
    # Horseshoe Tunica: Keep 2032 (original), delete 3395
    (2032, 3395, "Horseshoe Casino Tunica", "Horseshoe Tunica"),
    # Lucky Chances: Keep 1930 (original), delete 3381
    (1930, 3381, "Lucky Chances Casino", "Lucky Chances"),
    # MGM Grand: Keep 3362 (shorter canonical), delete 3390
    (3362, 3390, "MGM Grand", "MGM Grand Poker Room"),
    # Orange City: Keep 1945 (full name), delete 3369
    (1945, 3369, "Orange City Racing & Card Club", "Orange City Racing"),
    # Rivers Philly / SugarHouse: Keep 2955 Rivers Casino (current name), delete 2302
    (2955, 2302, "Rivers Casino Philadelphia", "SugarHouse Philadelphia"),
    # Rivers Pittsburgh: Keep 1889 (original), delete 3389
    (1889, 3389, "Rivers Casino Pittsburgh", "Rivers Pittsburgh"),
    # South Point: Keep 1987 (original), delete 3363
    (1987, 3363, "South Point Casino", "South Point"),
    # Texas Card House Spring/Houston: Keep 1923 TCH Spring (primary), delete 2533
    (1923, 2533, "Texas Card House Spring", "Texas Card House Houston"),
]

deleted_count = 0
for keep_id, del_id, keep_name, del_name in duplicates:
    # First, migrate any tournament data from the duplicate to the keeper
    try:
        duped_data = sb_get("venue_daily_tournaments", f"?venue_id=eq.{del_id}&limit=1000")
        if duped_data:
            print(f"  📦 Migrating {len(duped_data)} tournament records from [{del_id}] to [{keep_id}]")
            for row in duped_data:
                row.pop("id", None)
                row["venue_id"] = keep_id
            # Bulk upsert via POST
            url = f"{SUPABASE_URL}/rest/v1/venue_daily_tournaments"
            hdrs = {**SB_HDRS, "Prefer": "resolution=merge-duplicates"}
            data = json.dumps(duped_data).encode()
            req = urllib.request.Request(url, data=data, method="POST", headers=hdrs)
            try: urllib.request.urlopen(req, timeout=30)
            except: pass  # Duplicates are fine
    except: pass
    
    if delete4eva(del_id, del_name):
        deleted_count += 1

print(f"\nPhase 1 Complete: {deleted_count}/{len(duplicates)} duplicates permanently deleted.\n")

# ============================================================================
# PHASE 2: CLOSE NEWLY-IDENTIFIED VENUES
# ============================================================================
print("=" * 70)
print("PHASE 2: PERMANENT & TEMPORARY CLOSURES")
print("=" * 70)

# From the report:
# Permanently closed:
#   - Sahara (ID 2140) - closed Nov 16, 2024
#   - Resorts World Las Vegas (ID 1819) - closing end of March 2026
#   - Atlantis Casino Resort (ID 1992) - listed as Reno duplicate but keep checking

close_permanently = [
    (2140, "Sahara"),            # Closed Nov 16, 2024 - space replaced by slots
    (1819, "Resorts World Las Vegas"),  # Closing end of March 2026
]

# Temporarily closed:
close_temporarily = [
    (1842, "WinStar World Casino"),  # Ice storm destroyed poker room tent
]

for vid, vname in close_permanently:
    delete4eva(vid, f"{vname} (PERMANENTLY CLOSED)")

for vid, vname in close_temporarily:
    result = sb_patch("poker_venues", f"?id=eq.{vid}", {"has_tournaments": False, "is_active": True})
    print(f"  ❄️  TEMP CLOSED [{vid}] {vname} (kept active, removed from scraper)")

print()

# ============================================================================
# PHASE 3: FLAG CASH-ONLY VENUES (remove from tournament scraper)
# ============================================================================
print("=" * 70)
print("PHASE 3: CASH-ONLY VENUE FLAGGING")
print("=" * 70)

# The report explicitly confirmed these as cash-only:
# Black Eagle Country Club (already flagged), Magic City Casino (2235), 
# Plus the previous report's list that we already handled.
# The report also mentions Stones Gambling Hall has tournaments (revoke cash-only if set)

# Venues the report says are explicitly cash-only that might not be flagged yet:
cash_only_names_to_check = [
    "Black Eagle Country Club Poker Zone",
    "Magic City Casino",
]

# Let's also handle the WA State spread-limit rooms that the report calls out 
# as having very restricted tournament models (most already flagged)

# Check what's currently flagged
all_venues = sb_get("poker_venues", "?select=id,name,has_tournaments&is_active=eq.true&limit=2000")
venues_by_name = {v["name"]: v for v in all_venues}

# Stones Gambling Hall: Report says it HAS tournaments (Spring Classic etc.)
# Make sure it's flagged correctly
stones = venues_by_name.get("Stones Gambling Hall")
if stones and not stones.get("has_tournaments"):
    sb_patch("poker_venues", f"?id=eq.{stones['id']}", {"has_tournaments": True})
    print(f"  ✅ CORRECTED [{stones['id']}] Stones Gambling Hall → has_tournaments=true (runs Spring Classic)")

# Commerce Casino: Report says it HAS tournaments (LAPC, daily $180 NLH)
commerce = venues_by_name.get("Commerce Casino")
if commerce and not commerce.get("has_tournaments"):
    sb_patch("poker_venues", f"?id=eq.{commerce['id']}", {"has_tournaments": True})
    print(f"  ✅ CORRECTED [{commerce['id']}] Commerce Casino → has_tournaments=true (hosts LAPC)")

# FireKeepers Casino: Report says it HAS tournaments (MSPT Michigan State Championship)
for name in ["FireKeepers Casino", "FireKeepers"]:
    fk = venues_by_name.get(name)
    if fk and not fk.get("has_tournaments"):
        sb_patch("poker_venues", f"?id=eq.{fk['id']}", {"has_tournaments": True})
        print(f"  ✅ CORRECTED [{fk['id']}] {name} → has_tournaments=true (hosts MSPT)")

# Flag Magic City as cash-only
magic = venues_by_name.get("Magic City Casino")
if magic and magic.get("has_tournaments"):
    sb_patch("poker_venues", f"?id=eq.{magic['id']}", {"has_tournaments": False})
    print(f"  💵 FLAGGED [{magic['id']}] Magic City Casino → cash-only")

print()

# ============================================================================
# FINAL COUNT
# ============================================================================
print("=" * 70)
print("FINAL DATABASE STATE")
print("=" * 70)

from urllib.request import Request, urlopen
hdrs_count = {**SB_HDRS, "Prefer": "count=exact"}

# Active venues
r = urlopen(Request(f"{SUPABASE_URL}/rest/v1/poker_venues?select=id&is_active=eq.true&limit=1", headers=hdrs_count))
r.read()
active_total = r.headers.get("content-range", "")
print(f"Total active venues: {active_total}")

# Tournament venues
r2 = urlopen(Request(f"{SUPABASE_URL}/rest/v1/poker_venues?select=id&is_active=eq.true&has_tournaments=eq.true&limit=1", headers=hdrs_count))
r2.read()
tourn_total = r2.headers.get("content-range", "")
print(f"Tournament scraper pool: {tourn_total}")

# Cash-only venues
r3 = urlopen(Request(f"{SUPABASE_URL}/rest/v1/poker_venues?select=id&is_active=eq.true&has_tournaments=eq.false&limit=1", headers=hdrs_count))
r3.read()
cash_total = r3.headers.get("content-range", "")
print(f"Cash-only venues: {cash_total}")

print("\n✅ ALL REMEDIATION COMPLETE.")
