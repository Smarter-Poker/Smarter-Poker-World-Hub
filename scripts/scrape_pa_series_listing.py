#!/usr/bin/env python3
"""
scrape_pa_series_listing.py — Task 1: Fetch ALL series slugs from PokerAtlas
=============================================================================
Scrapes https://www.pokeratlas.com/poker-tournament-series and extracts
every series slug from __NEXT_DATA__. Saves result as a JSON mapping file
for the resolver to use (one fetch, no guessing).

Output: data/pa_series_slugs.json
"""

import json, os, re, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def network_ok() -> bool:
    for url in ("https://1.1.1.1", "https://www.google.com"):
        try:
            req = urllib.request.Request(url, method="HEAD")
            urllib.request.urlopen(req, timeout=5)
            return True
        except: continue
    return False

def main():
    if not network_ok():
        log("❌ Network unavailable"); sys.exit(1)

    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    log("✅ StealthySession started")

    # Fetch the PA series listing page
    url = "https://www.pokeratlas.com/poker-tournament-series"
    log(f"Fetching: {url}")
    resp = session.fetch(url, google_search=True, timeout=45000, wait_until="networkidle")

    if not resp or resp.status != 200:
        log(f"❌ HTTP {getattr(resp, 'status', 0)}"); sys.exit(1)

    body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
    html = body.decode("utf-8", "ignore")
    log(f"✅ HTTP 200 — {len(body)} bytes")

    # Extract __NEXT_DATA__
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
    if not m:
        log("❌ No __NEXT_DATA__ found — saving raw HTML for debug")
        with open(PROJECT_ROOT / "data" / "pa_series_listing_debug.html", "w") as f:
            f.write(html)
        # Fallback: extract href links directly
        slugs = extract_from_html(html)
        if slugs:
            save_slugs(slugs)
        sys.exit(0)

    try:
        nd = json.loads(m.group(1))
    except Exception as e:
        log(f"❌ JSON parse error: {e}"); sys.exit(1)

    # Save raw __NEXT_DATA__ for debugging
    with open(PROJECT_ROOT / "data" / "pa_series_next_data.json", "w") as f:
        json.dump(nd, f, indent=2)
    log(f"Saved __NEXT_DATA__ ({len(json.dumps(nd))} chars)")

    # Walk the tree to find all series objects
    series_list = []
    def walk(obj, depth=0):
        if depth > 20: return
        if isinstance(obj, list):
            for item in obj: walk(item, depth+1)
        elif isinstance(obj, dict):
            # Look for series-like objects (have name + slug or href)
            slug = obj.get("slug") or obj.get("href") or obj.get("url") or ""
            name = obj.get("name") or obj.get("title") or obj.get("seriesName") or ""
            start = obj.get("startDate") or obj.get("start_date") or ""
            end   = obj.get("endDate") or obj.get("end_date") or ""
            venue = obj.get("venueName") or obj.get("venue") or obj.get("location") or ""
            city  = obj.get("city") or ""
            state = obj.get("state") or obj.get("stateCode") or ""

            if name and (slug or start):
                # Clean slug
                if isinstance(slug, str):
                    slug = slug.strip("/").split("/")[-1]  # get just the slug part
                series_list.append({
                    "slug": slug,
                    "name": str(name)[:150],
                    "start_date": str(start)[:10] if start else "",
                    "end_date": str(end)[:10] if end else "",
                    "venue": str(venue)[:100],
                    "city": str(city)[:50],
                    "state": str(state)[:2],
                })

            for v in obj.values():
                walk(v, depth+1)

    walk(nd)
    log(f"Found {len(series_list)} series objects in __NEXT_DATA__")

    # Also extract from HTML hrefs as backup
    html_slugs = extract_from_html(html)
    log(f"Found {len(html_slugs)} slugs from HTML hrefs")

    # Merge
    seen_slugs = {s["slug"] for s in series_list if s.get("slug")}
    for hs in html_slugs:
        if hs["slug"] not in seen_slugs:
            series_list.append(hs)
            seen_slugs.add(hs["slug"])

    log(f"Total unique series: {len(series_list)}")
    save_slugs(series_list)

    try: session.close()
    except: pass

def extract_from_html(html: str) -> list:
    """Extract series slugs from HTML href attributes."""
    slugs = []
    seen = set()
    for m in re.finditer(r'href="(/poker-tournament-series/([a-z0-9][a-z0-9-]+))"', html):
        slug = m.group(2)
        if slug not in seen and len(slug) > 5:
            seen.add(slug)
            slugs.append({"slug": slug, "name": "", "start_date": "", "end_date": ""})
    return slugs

def save_slugs(series_list: list):
    out = {
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "source": "https://www.pokeratlas.com/poker-tournament-series",
        "count": len(series_list),
        "series": series_list,
    }
    path = PROJECT_ROOT / "data" / "pa_series_slugs.json"
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    log(f"✅ Saved {len(series_list)} series to {path}")

    # Print sample
    for s in series_list[:10]:
        log(f"  {s['slug'][:60]:60} | {s.get('name','')[:40]:40} | {s.get('start_date','')}")

if __name__ == "__main__":
    main()
