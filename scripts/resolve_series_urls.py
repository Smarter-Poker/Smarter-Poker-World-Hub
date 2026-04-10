#!/usr/bin/env python3
"""
resolve_series_urls.py — Poker Series URL Resolver & Validity Checker
======================================================================
For the 127 numeric-ID series that have no source_url, this script:

1. Searches PokerAtlas for each series by name using Scrapling StealthySession
2. Finds the actual PA slug URL
3. Determines schedule_status:
   - "published"      → PA page exists and has events listed
   - "not_published"  → PA page exists but no events / schedule TBD
   - "inactive"       → last run was >1 year ago OR no PA page found
4. Gets last_run_date from the page
5. Removes series inactive >1 year from master_poker_series_list.json
6. Updates master list with resolved source_url, schedule_status, last_run_date

Usage:
    .venv/bin/python3 scripts/resolve_series_urls.py          # resolve all numeric IDs
    .venv/bin/python3 scripts/resolve_series_urls.py --dry-run # preview only
    .venv/bin/python3 scripts/resolve_series_urls.py --limit 10 # first N only
"""

import argparse, hashlib, json, os, re, sys, time, urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MASTER_LIST  = PROJECT_ROOT / "data" / "master_poker_series_list.json"
LOG_DIR      = PROJECT_ROOT / "data" / "tournament-logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

log_path = LOG_DIR / f"resolve_series_urls_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(log_path, "a") as f: f.write(line + "\n")

MONTHS = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
    "sep":9,"oct":10,"nov":11,"dec":12,
}

def network_ok() -> bool:
    for url in ("https://1.1.1.1", "https://www.google.com"):
        try:
            req = urllib.request.Request(url, method="HEAD")
            urllib.request.urlopen(req, timeout=5)
            return True
        except: continue
    return False

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[''`]", "", s).lower()).strip("-")

def parse_last_run(html: str) -> str | None:
    """Extract the most recent event end date from a PA series page."""
    # Try __NEXT_DATA__ structured data first
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if m:
        try:
            nd = json.loads(m.group(1))
            # Walk looking for dates
            dates = []
            def walk_dates(obj):
                if isinstance(obj, list):
                    for item in obj: walk_dates(item)
                elif isinstance(obj, dict):
                    for key in ("endDate","startDate","date","eventDate"):
                        v = obj.get(key)
                        if isinstance(v, str) and re.match(r"20\d\d-\d\d-\d\d", v):
                            dates.append(v[:10])
                    for v in obj.values(): walk_dates(v)
            walk_dates(nd)
            if dates: return max(dates)
        except: pass

    # HTML fallback: scan for year patterns
    text = re.sub(r"<[^>]+>", " ", html)
    date_matches = re.findall(r"\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b", text)
    if date_matches:
        iso_dates = [f"{y}-{mo}-{d}" for y,mo,d in date_matches]
        return max(iso_dates)

    # Look for "Mar 2025", "April 2024" patterns
    for m in re.finditer(r"\b(" + "|".join(MONTHS) + r")\s+(\d{1,2}),?\s+(20\d\d)\b", text, re.I):
        pass  # just get the last one
    month_years = re.findall(r"\b(?:" + "|".join(MONTHS) + r")\s+(?:\d{1,2},\s+)?(20\d\d)\b", text, re.I)
    if month_years:
        return f"{max(month_years)}-01-01"  # approximate

    return None

def count_events_on_page(html: str) -> int:
    """Count how many events appear to be listed on the page."""
    nd_m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if nd_m:
        try:
            nd = json.loads(nd_m.group(1))
            count = [0]
            def walk_count(obj):
                if isinstance(obj, list):
                    for item in obj: walk_count(item)
                elif isinstance(obj, dict):
                    if obj.get("buyIn") and (obj.get("startTime") or obj.get("startDate")):
                        count[0] += 1
                    for v in obj.values(): walk_count(v)
            walk_count(nd)
            return count[0]
        except: pass

    # HTML fallback: count $ occurrences in table rows
    rows = re.findall(r"<tr[^>]*>.*?</tr>", html, re.DOTALL | re.I)
    return sum(1 for r in rows if "$" in r and re.search(r"\b\d{2,3}:\d{2}\b", r))

def try_fetch_series(session, name: str, series_id: str) -> tuple:
    """
    Find a PA series page by:
    1. Fetch the PA series listing/search and find matching slug
    2. Try year-specific URL patterns for current and recent years
    Returns (url, html, status) or ("", "", 0)
    """
    slug_base = slugify(name)
    now_year = datetime.now(timezone.utc).year

    # Try year-specific slugs for current and past 2 years (PA uses year-prefixed slugs)
    year_candidates = []
    for yr in [now_year, now_year - 1, now_year - 2]:
        # PA format: {year}-{name-slug}-{venue?}-{year}
        # We try just {year}-{base_slug} and {year}-{base_slug}-{year}
        year_candidates.extend([
            f"https://www.pokeratlas.com/poker-tournament-series/{yr}-{slug_base}-{yr}",
            f"https://www.pokeratlas.com/poker-tournament-series/{yr}-{slug_base}",
        ])

    for url in year_candidates:
        try:
            resp = session.fetch(url, google_search=True, timeout=30000, wait_until="networkidle")
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8", "ignore")
                if len(html) > 5000 and ("tournament" in html.lower() or "poker" in html.lower()):
                    log(f"    ✅ Hit: {url}")
                    return url, html, 200
            elif resp and resp.status == 404:
                continue
        except Exception as e:
            log(f"    [FETCH ERR] {url[:60]}: {str(e)[:50]}")
            time.sleep(1)

    # Last resort: search PA series listing for the name
    try:
        search_url = f"https://www.pokeratlas.com/poker-tournament-series"
        resp = session.fetch(search_url, google_search=True, timeout=30000, wait_until="networkidle")
        if resp and resp.status == 200:
            body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
            html = body.decode("utf-8", "ignore")
            # Find links matching the series name
            name_words = [w for w in name.lower().split() if len(w) > 4]
            for link_m in re.finditer(r'href="(/poker-tournament-series/[a-z0-9-]+)"', html):
                href = link_m.group(1)
                href_words = href.lower().replace("-", " ")
                if all(w in href_words for w in name_words[:2]):
                    full_url = f"https://www.pokeratlas.com{href}"
                    resp2 = session.fetch(full_url, google_search=True, timeout=30000, wait_until="networkidle")
                    if resp2 and resp2.status == 200:
                        body2 = resp2.body if isinstance(resp2.body, bytes) else str(resp2.body).encode("utf-8")
                        html2 = body2.decode("utf-8", "ignore")
                        if len(html2) > 5000:
                            log(f"    ✅ Found via listing: {full_url}")
                            return full_url, html2, 200
    except Exception as e:
        log(f"    [SEARCH ERR] {str(e)[:60]}")

    return "", "", 0


TOUR_KEYWORDS = [
    "wsop", "world series of poker", "mspt", "mid-states poker tour",
    "wpt", "world poker tour", "hpt", "heartland poker tour",
    "rgps", "run good poker", "bestbet poker tour", "lodge poker tour",
    "ante up poker tour", "poker night in america", "ggpoker", "partypoker", "pokerstars",
]
def is_tour(s):
    name = str(s.get("name", "")).lower()
    sid  = str(s.get("id", "")).lower()
    return any(kw in name or kw in sid for kw in TOUR_KEYWORDS)

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--dry-run",  action="store_true")
    p.add_argument("--limit",    type=int, default=0)
    p.add_argument("--force",    action="store_true", help="Re-check already-resolved series")
    args = p.parse_args()

    if not MASTER_LIST.exists():
        log(f"❌ Master list not found: {MASTER_LIST}"); sys.exit(1)

    with open(MASTER_LIST) as f:
        data = json.load(f)
    all_series = data.get("master_list", [])

    # Only process numeric IDs without source_url
    to_resolve = [
        s for s in all_series
        if str(s.get("id","")).isdigit()
        and not s.get("source_url")
        and not is_tour(s)
        and (args.force or not s.get("schedule_status"))
    ]
    log(f"Master list: {len(all_series)} total entries")
    log(f"Numeric IDs to resolve: {len(to_resolve)}")

    if args.limit > 0:
        to_resolve = to_resolve[:args.limit]
        log(f"Limited to first {args.limit}")

    if not to_resolve:
        log("✅ All resolved!"); return

    if not network_ok():
        log("❌ Network unavailable"); sys.exit(1)

    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    log("✅ StealthySession started")

    # Stats
    resolved = 0
    published = 0
    not_published = 0
    inactive = 0
    removed = 0
    one_year_ago = datetime.now(timezone.utc) - timedelta(days=365)

    # Build index for fast lookup
    series_index = {str(s.get("id","")): i for i, s in enumerate(all_series)}

    removal_ids = set()

    for i, series in enumerate(to_resolve):
        sid  = str(series.get("id",""))
        name = series.get("name","Unknown")
        log(f"\n[{i+1}/{len(to_resolve)}] {name} (ID: {sid})")

        url, html, status = try_fetch_series(session, name, sid)

        if status != 200 or not html:
            log(f"  ❌ No PA page found — marking inactive")
            idx = series_index.get(sid)
            if idx is not None:
                all_series[idx]["schedule_status"] = "inactive"
                all_series[idx]["schedule_note"] = "No PA page found"
            inactive += 1
            time.sleep(3)
            continue

        resolved += 1
        last_run = parse_last_run(html)
        event_count = count_events_on_page(html)

        log(f"  ✅ Found: {url[:80]}")
        log(f"  last_run={last_run} | events_on_page={event_count}")

        # Check staleness
        if last_run:
            try:
                last_dt = datetime.strptime(last_run, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                if last_dt < one_year_ago:
                    log(f"  ⚠️  Last ran {last_run} — MORE THAN 1 YEAR AGO — REMOVING from list")
                    removal_ids.add(sid)
                    inactive += 1
                    removed += 1
                    time.sleep(2)
                    continue
            except: pass

        # Determine schedule_status
        if event_count > 0:
            schedule_status = "published"
            published += 1
            log(f"  📅 Status: PUBLISHED ({event_count} events listed)")
        else:
            schedule_status = "not_published"
            not_published += 1
            log(f"  ⏳ Status: NOT YET PUBLISHED (page exists, no events)")

        # Update master list entry
        idx = series_index.get(sid)
        if idx is not None:
            all_series[idx]["source_url"] = url
            all_series[idx]["schedule_status"] = schedule_status
            all_series[idx]["last_run_date"] = last_run
            all_series[idx]["events_on_page"] = event_count

        time.sleep(3)

    try: session.close()
    except: pass

    # Remove inactive series that ran >1 year ago
    before = len(all_series)
    all_series = [s for s in all_series if str(s.get("id","")) not in removal_ids]
    after = len(all_series)
    log(f"\n{'='*60}")
    log(f"RESOLVER DONE")
    log(f"  Resolved:      {resolved}")
    log(f"  Published:     {published}")
    log(f"  Not Published: {not_published}")
    log(f"  Inactive:      {inactive}")
    log(f"  Removed (>1yr): {removed} ({before} → {after} series)")

    if not args.dry_run:
        data["master_list"] = all_series
        data["last_resolved"] = datetime.now(timezone.utc).isoformat()
        with open(MASTER_LIST, "w") as f:
            json.dump(data, f, indent=2)
        log(f"  ✅ Master list updated: {MASTER_LIST}")
    else:
        log(f"  [DRY RUN] No changes written")

    log(f"Log: {log_path}")

if __name__ == "__main__":
    main()
