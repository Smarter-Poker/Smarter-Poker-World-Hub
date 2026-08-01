import sys, os, time, uuid, json, urllib.request, re
import concurrent.futures
from datetime import datetime, timezone

# Load essential vars
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://kuklfnapbkmacvwxktbh.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))
SB_HDRS = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Content-Type": "application/json"}
SKIP_TYPES = {"charity","charity_event","charity_game","series","poker_series","tour","poker_tour","traveling_tour","regional_tour","tournament_series"}

def sb_get_paged(path, base_params):
    all_rows, offset = [], 0
    while True:
        req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}{base_params}&limit=1000&offset={offset}", headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"})
        try:
            with urllib.request.urlopen(req) as r:
                rows = json.loads(r.read())
            all_rows.extend(rows)
            if len(rows) < 1000: break
            offset += 1000
        except Exception as e:
            print(f"Error fetching {path}: {e}")
            break
    return all_rows

def get_missing():
    recs = sb_get_paged("venue_daily_tournaments", "?select=venue_id")
    saved = set(r["venue_id"] for r in recs if r.get("venue_id"))
    all_venues = sb_get_paged("poker_venues", "?select=id,name,state,city,venue_type,has_tournaments,website,scrape_url,pokeratlas_slug,pokeratlas_url,poker_atlas_url,schedule_scrape_url&is_active=eq.true&has_tournaments=eq.true")
    card_rooms = [v for v in all_venues if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
    return [v for v in card_rooms if v["id"] not in saved]

sys.path.append(os.getcwd())
import scripts.scrape_targeted_202 as scraper
from scrapling.fetchers import StealthySession

def process_venue(venue, hm_map, cp_map, batch_id):
    name = venue.get('name')
    # print(f"🚀 Started: {name}")
    try:
        session = StealthySession(headless=True, solve_cloudflare=True)
        session.start()
        res = scraper.scrape_venue(venue, session, batch_id, hm_map, cp_map)
        session.close()
        
        # Immediate flush logic
        if res.get("found") and res.get("records"):
            # Upsert records
            print(f"✅ Found {len(res['records'])} records for {name}!")
            scraper.sb_upsert("venue_daily_tournaments", res["records"])
            scraper.sb_patch_venue(venue["id"], {
                "has_tournaments":True,
                "scrape_url":res.get("primary_url",""),
                "schedule_scrape_url":res.get("primary_url",""),
                "scrape_source":res.get("source",""),
                "schedule_last_scraped_at":datetime.now(timezone.utc).isoformat(),
                "last_scraped_at":datetime.now(timezone.utc).isoformat(),
            })
            return True, name
        else:
            # IT HAS NO TOURNAMENTS
            print(f"❌ Nothing found for {name} across 5 sources — patching has_tournaments=False")
            scraper.sb_patch_venue(venue["id"], {
                "has_tournaments":False,
                "schedule_last_scraped_at":datetime.now(timezone.utc).isoformat(),
                "last_scraped_at":datetime.now(timezone.utc).isoformat()
            })
            return False, name
    except Exception as e:
        print(f"⚠️ Error on {name}: {e}")
        return False, name

if __name__ == "__main__":
    missing = get_missing()
    print(f"Found {len(missing)} targeted venues to process rapidly.")
    
    if not missing:
        print("🎉 100% COVERAGE ACHIEVED!")
        sys.exit(0)

    batch_id = str(uuid.uuid4())
    print("Fetching global HendonMob/Cardplayer maps...")
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    hm_map = scraper.fetch_hendonmob(session)
    cp_map = scraper.fetch_cardplayer(session)
    session.close()

    print(f"Starting parallel workers for {len(missing)} venues...")
    successes = []
    fails = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(process_venue, v, hm_map, cp_map, batch_id): v for v in missing}
        for future in concurrent.futures.as_completed(futures):
            res, name = future.result()
            if res: successes.append(name)
            else: fails.append(name)
            
    print(f"\n--- DONE ---")
    print(f"✅ Venues with data ingested: {len(successes)}")
    print(f"❌ Venues marked has_tournaments=False/Empty: {len(fails)}")
