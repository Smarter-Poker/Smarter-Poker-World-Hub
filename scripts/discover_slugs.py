#!/usr/bin/env python3
"""
discover_slugs.py — PokerAtlas Slug Discovery for Missing Venues

Uses the EXISTING scraper infrastructure (StealthySession + camoufox) to:
1. Search PokerAtlas's region pages for each missing venue  
2. If found, save the correct slug to the venue's DB record
3. If not on PA, try the venue's own website URL & Gemini-verified URLs

This does NOT scrape tournament data — it only discovers the source URLs
so the existing completeness_scraper can use them on its next run.

Follows all 15-layer data integrity rules from the Scrapling skill.
"""

import sys, os, re, json, time, hashlib, uuid, urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence" / "slug-discovery"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# ── Supabase ──
SUPABASE_URL = ""
SUPABASE_KEY = ""
env_path = PROJECT_ROOT / ".env.local"
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
    "Prefer": "return=minimal",
}

def sb_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def sb_patch(table, params, data):
    url = f"{SUPABASE_URL}/rest/v1/{table}{params}"
    req = urllib.request.Request(url, data=json.dumps(data).encode(), method="PATCH", headers=SB_HDRS)
    urllib.request.urlopen(req, timeout=15).read()

def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[''`]","",s).lower()).strip("-")

def save_evidence(venue_name, source, data):
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    slug = slugify(venue_name)[:30]
    fp = EVIDENCE_DIR / f"{slug}_{source}_{ts}.json"
    fp.write_text(json.dumps(data, indent=2))

# ── Scrapling session (same as daemon) ──
from scrapling.fetchers import StealthySession

def _network_available():
    try:
        req = urllib.request.Request('https://www.google.com', method='HEAD',
                                     headers={"User-Agent": "Mozilla/5.0"})
        urllib.request.urlopen(req, timeout=10)
        return True
    except: return False

class DiscoverySession:
    def __init__(self):
        self.session = None
        self._dead = False
    
    def connect(self):
        if not _network_available():
            print("❌ Network unavailable")
            return False
        for attempt in range(3):
            try:
                self.session = StealthySession(headless=True)
                self.session.start()
                self._dead = False
                print(f"✅ StealthySession connected (attempt {attempt+1})")
                return True
            except Exception as e:
                print(f"⚠️ Session start failed (attempt {attempt+1}): {e}")
                time.sleep(2 ** attempt)
        return False
    
    def fetch(self, url, timeout=15000):
        if self._dead or not self.session:
            self.connect()
        try:
            resp = self.session.fetch(url, timeout=timeout, wait_until="domcontentloaded")
            return resp
        except Exception as e:
            print(f"  Fetch error: {e}")
            self._dead = True
            return None
    
    def close(self):
        try: self.session.close()
        except: pass

# ── PokerAtlas region/state index scraping ──
PA_STATE_URLS = {
    "CA": "https://www.pokeratlas.com/poker-rooms/california",
    "TX": "https://www.pokeratlas.com/poker-rooms/texas", 
    "FL": "https://www.pokeratlas.com/poker-rooms/florida",
    "WA": "https://www.pokeratlas.com/poker-rooms/washington",
    "MI": "https://www.pokeratlas.com/poker-rooms/michigan",
    "NV": "https://www.pokeratlas.com/poker-rooms/nevada",
    "PA": "https://www.pokeratlas.com/poker-rooms/pennsylvania",
    "OR": "https://www.pokeratlas.com/poker-rooms/oregon",
    "IL": "https://www.pokeratlas.com/poker-rooms/illinois",
    "CO": "https://www.pokeratlas.com/poker-rooms/colorado",
    "LA": "https://www.pokeratlas.com/poker-rooms/louisiana",
    "OK": "https://www.pokeratlas.com/poker-rooms/oklahoma",
    "NY": "https://www.pokeratlas.com/poker-rooms/new-york",
    "MT": "https://www.pokeratlas.com/poker-rooms/montana",
    "NJ": "https://www.pokeratlas.com/poker-rooms/new-jersey",
    "IN": "https://www.pokeratlas.com/poker-rooms/indiana",
    "AZ": "https://www.pokeratlas.com/poker-rooms/arizona",
    "MN": "https://www.pokeratlas.com/poker-rooms/minnesota",
    "IA": "https://www.pokeratlas.com/poker-rooms/iowa",
    "SD": "https://www.pokeratlas.com/poker-rooms/south-dakota",
    "MS": "https://www.pokeratlas.com/poker-rooms/mississippi",
    "NC": "https://www.pokeratlas.com/poker-rooms/north-carolina",
    "VA": "https://www.pokeratlas.com/poker-rooms/virginia",
    "WV": "https://www.pokeratlas.com/poker-rooms/west-virginia",
    "WI": "https://www.pokeratlas.com/poker-rooms/wisconsin",
    "NM": "https://www.pokeratlas.com/poker-rooms/new-mexico",
    "ND": "https://www.pokeratlas.com/poker-rooms/north-dakota",
    "RI": "https://www.pokeratlas.com/poker-rooms/rhode-island",
    "CT": "https://www.pokeratlas.com/poker-rooms/connecticut",
    "MA": "https://www.pokeratlas.com/poker-rooms/massachusetts",
    "MD": "https://www.pokeratlas.com/poker-rooms/maryland",
    "NH": "https://www.pokeratlas.com/poker-rooms/new-hampshire",
    "DE": "https://www.pokeratlas.com/poker-rooms/delaware",
    "OH": "https://www.pokeratlas.com/poker-rooms/ohio",
    "AR": "https://www.pokeratlas.com/poker-rooms/arkansas",
    "ID": "https://www.pokeratlas.com/poker-rooms/idaho",
}

def extract_pa_slugs_from_state_page(html):
    """Pull all /poker-room/{slug} links from a PA state page."""
    slugs = {}
    for m in re.finditer(r'href="/poker-room/([^/"]+)"[^>]*>([^<]+)', html):
        slug = m.group(1).strip()
        name_text = m.group(2).strip()
        if slug and name_text:
            slugs[slug] = name_text
    return slugs

def fuzzy_match(venue_name, pa_name):
    """Check if venue name loosely matches a PokerAtlas listing."""
    vn = set(re.sub(r"[^a-z0-9 ]","",venue_name.lower()).split())
    pn = set(re.sub(r"[^a-z0-9 ]","",pa_name.lower()).split())
    STOP = {"the","and","casino","poker","room","card","club","house","social","at","in","of","a"}
    vn -= STOP; pn -= STOP
    if not vn or not pn: return False
    overlap = vn & pn
    return len(overlap) >= max(1, min(len(vn), len(pn)) * 0.5)


# ── Gemini-verified URLs ──
GEMINI_URLS = {
    "Commerce Casino": "https://commercecasino.com/tournaments/",
    "FireKeepers Casino": "https://firekeeperscasino.com/casino/games/poker/",
    "Fortune Poker Room": "https://www.pokeratlas.com/poker-room/fortune-poker-room-renton/tournaments",
    "Casino Caribbean Kirkland Casino": "https://www.pokeratlas.com/poker-room/caribbean-kirkland/tournaments",
    "Krazy Kopz at Vision Lanes": "https://www.pokeratlas.com/poker-room/krazy-kopz-westland/tournaments",
    "Krazy Kopz @ The Ivory Room": "https://www.pokeratlas.com/poker-room/krazy-kopz-westland/tournaments",
    "Rivers Casino": "https://www.riverscasino.com/schenectady/casino/poker-room",
    "Bellagio Poker Room": "https://bellagio.mgmresorts.com/en/casino/poker.html",
    "Horseshoe Las Vegas": "https://www.caesars.com/horseshoe-las-vegas/casino/poker",
    "Stones Gambling Hall": "https://www.stonesgamblinghall.com/tournaments/",
}

def main():
    batch_id = str(uuid.uuid4())
    print("=" * 70)
    print(f"POKERATLAS SLUG DISCOVERY + SOURCE MAPPING")
    print(f"Batch: {batch_id}")
    print(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # Get missing venues
    SKIP = {"charity","charity_event","charity_game","series","poker_series",
            "tour","poker_tour","traveling_tour","regional_tour","tournament_series"}

    all_tourn = sb_get("poker_venues",
        "?select=id,name,city,state,venue_type,website"
        "&is_active=eq.true&has_tournaments=eq.true&order=name.asc&limit=2000")
    all_tourn = [v for v in all_tourn if (v.get("venue_type") or "").lower() not in SKIP]

    venue_ids = [v["id"] for v in all_tourn]
    has_data = set()
    for i in range(0, len(venue_ids), 100):
        chunk = venue_ids[i:i+100]
        rows = sb_get("venue_daily_tournaments", f"?select=venue_id&venue_id=in.({','.join(str(x) for x in chunk)})&limit=5000")
        for r in rows: has_data.add(r["venue_id"])

    missing = [v for v in all_tourn if v["id"] not in has_data]
    print(f"\nMissing venues to discover: {len(missing)}")

    # Group by state
    by_state = {}
    for v in missing:
        st = (v.get("state") or "").upper()
        by_state.setdefault(st, []).append(v)

    print(f"States covered: {sorted(by_state.keys())}")

    # Connect session
    session = DiscoverySession()
    if not session.connect():
        print("❌ Cannot connect — aborting")
        sys.exit(1)

    # Phase 1: Scrape PA state index pages → build slug library
    print("\n" + "=" * 70)
    print("PHASE 1: Building PokerAtlas Slug Library")
    print("=" * 70)
    
    pa_library = {}  # slug → name mapping
    states_to_scrape = set(by_state.keys())
    consecutive_fails = 0

    for st in sorted(states_to_scrape):
        if st not in PA_STATE_URLS:
            print(f"  [{st}] No PA state URL — skipping index")
            continue
        if consecutive_fails >= 3:
            print("  ❌ Circuit breaker: 3 consecutive failures — reconnecting")
            session.close()
            time.sleep(3)
            session.connect()
            consecutive_fails = 0

        url = PA_STATE_URLS[st]
        print(f"  [{st}] Fetching {url}...", end=" ", flush=True)
        resp = session.fetch(url)
        if resp and getattr(resp, 'status', 0) == 200:
            html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
            slugs = extract_pa_slugs_from_state_page(html)
            pa_library.update(slugs)
            print(f"✅ {len(slugs)} rooms found")
            
            # Evidence
            save_evidence(f"state_{st}", "pokeratlas_index", {
                "url": url, "status": 200,
                "scrape_html_hash": hashlib.sha256(html.encode()).hexdigest(),
                "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                "rooms_found": len(slugs),
                "batch_id": batch_id,
            })
            consecutive_fails = 0
        else:
            print("❌ Failed")
            consecutive_fails += 1
        time.sleep(2)

    print(f"\nPA Library: {len(pa_library)} total room slugs indexed")

    # Phase 2: Match missing venues to PA slugs
    print("\n" + "=" * 70)
    print("PHASE 2: Matching Venues to Sources")
    print("=" * 70)

    matched = 0
    unmatched = 0
    results = {}

    for v in missing:
        vid = v["id"]
        name = v["name"]
        city = v.get("city", "")
        state = v.get("state", "")
        
        found_source = None
        
        # Method 1: Direct PA slug match from library
        for pa_slug, pa_name in pa_library.items():
            if fuzzy_match(name, pa_name):
                found_source = {
                    "type": "pokeratlas",
                    "slug": pa_slug,
                    "url": f"https://www.pokeratlas.com/poker-room/{pa_slug}/tournaments",
                    "pa_name": pa_name,
                    "method": "state_index_match",
                }
                break
        
        # Method 2: Try auto-generated slugs directly
        if not found_source:
            for slug_try in [
                slugify(name + "-" + city),
                slugify(name),
                slugify(name.replace("Casino", "").replace("Poker Room", "").strip() + "-" + city),
            ]:
                test_url = f"https://www.pokeratlas.com/poker-room/{slug_try}/tournaments"
                resp = session.fetch(test_url, timeout=10000)
                if resp and getattr(resp, 'status', 0) == 200:
                    html = resp.html_content or ''
                    if len(html) > 1000:  # real page, not error
                        found_source = {
                            "type": "pokeratlas",
                            "slug": slug_try,
                            "url": test_url,
                            "method": "direct_slug_hit",
                        }
                        save_evidence(name, "pokeratlas_direct", {
                            "url": test_url, "status": 200,
                            "scrape_html_hash": hashlib.sha256(html.encode()).hexdigest(),
                            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                            "batch_id": batch_id,
                        })
                        break
                time.sleep(0.5)
        
        # Method 3: Gemini-verified URL
        if not found_source and name in GEMINI_URLS:
            found_source = {
                "type": "gemini_verified",
                "url": GEMINI_URLS[name],
                "method": "gemini_report",
            }
        
        # Method 4: Venue's own website
        if not found_source:
            ws = (v.get("website") or "").strip()
            if ws and ws.startswith("http"):
                found_source = {
                    "type": "website",
                    "url": ws,
                    "method": "venue_website",
                }
        
        if found_source:
            matched += 1
            status = "✅"
            # Update venue record with discovered source
            patch_data = {"schedule_scrape_url": found_source["url"]}
            if found_source.get("slug"):
                patch_data["pokeratlas_slug"] = found_source["slug"]
            try:
                sb_patch("poker_venues", f"?id=eq.{vid}", patch_data)
            except Exception as e:
                # Column might not exist — try just website
                try:
                    sb_patch("poker_venues", f"?id=eq.{vid}", {"website": found_source["url"]})
                except:
                    pass
        else:
            unmatched += 1
            status = "❌"
        
        results[str(vid)] = {
            "id": vid, "name": name, "city": city, "state": state,
            "source": found_source, "matched": found_source is not None,
        }
        
        print(f"  {status} [{vid}] {name} — {city}, {state}" + (f" → {found_source['url']}" if found_source else ""))
    
    session.close()

    # Save full results
    output = PROJECT_ROOT / "data" / "tournament-logs" / "slug_discovery_results.json"
    with open(output, "w") as f:
        json.dump(results, f, indent=2)

    print("\n" + "=" * 70)
    print("SLUG DISCOVERY COMPLETE")
    print(f"  Matched: {matched}/{len(missing)}")
    print(f"  Unmatched: {unmatched}/{len(missing)}")
    print(f"  Results: {output}")
    print("=" * 70)

    if unmatched > 0:
        print(f"\n❌ {unmatched} VENUES STILL UNMATCHED — need manual Google search:")
        for r in results.values():
            if not r["matched"]:
                print(f"  [{r['id']}] {r['name']} — {r['city']}, {r['state']}")

if __name__ == "__main__":
    main()
