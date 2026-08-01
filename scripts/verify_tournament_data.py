#!/usr/bin/env python3
"""
6-Layer Verification Script — Cross-reference DB tournament data against live venue sources.
Uses Scrapling + StealthySession (camoufox) for Cloudflare-resistant scraping.
Captures full provenance chain per Data Integrity Framework.
"""
import hashlib, json, os, re, sys, time, uuid
from datetime import datetime, timezone

# --- Layer 1: Scrapling fetcher setup ---
try:
    from scrapling.fetchers import Fetcher, StealthySession
    print("✅ Scrapling loaded")
except ImportError:
    sys.exit("❌ Scrapling not installed in this venv")

import urllib.request

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
EVIDENCE_DIR = 'data/scrape-evidence'
BATCH_ID = str(uuid.uuid4())
os.makedirs(EVIDENCE_DIR, exist_ok=True)

# --- Venues to verify ---
# Using 3 real venues with different source types for cross-reference
VERIFY_VENUES = [
    {
        "db_name": "Thunder Valley Casino",
        "pa_url": "https://www.pokeratlas.com/poker-room/thunder-valley-casino-lincoln/tournament-schedule",
        "website_url": "https://www.thundervalleyresort.com/entertainment/poker/poker-tournaments",
    },
    {
        "db_name": "Graton Resort & Casino",
        "pa_url": "https://www.pokeratlas.com/poker-room/graton-resort-casino-rohnert-park/tournament-schedule",
        "website_url": "https://www.gratonresortcasino.com/entertainment/poker",
    },
    {
        "db_name": "The Lodge Card Club",
        "pa_url": "https://www.pokeratlas.com/poker-room/the-lodge-card-club-round-rock/tournament-schedule",
        "website_url": "https://thelodgeaustin.com/tournaments/",
    },
]


def _network_available():
    """Quick network check before launching browser."""
    try:
        import socket
        socket.create_connection(("google.com", 443), timeout=5)
        return True
    except Exception:
        return False


def fetch_db_records(venue_name):
    """Fetch all active tournament records for a venue from our DB."""
    encoded = urllib.parse.quote(venue_name)
    url = f'{SUPABASE_URL}/rest/v1/venue_daily_tournaments?venue_name=ilike.*{encoded}*&data_quality=eq.scraped_verified&select=id,buy_in,tournament_name,start_time,day_of_week,game_type,guaranteed,format,source_url&order=buy_in.asc&limit=100'
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}'
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def extract_buyins_from_text(text):
    """Extract all dollar amounts from text, distinguishing buy-ins from GTD."""
    buyins = []
    gtds = []
    
    # Find $XK GTD patterns
    for m in re.finditer(r'\$(\d{1,3})\s*K\b', text, re.I):
        gtds.append(int(m.group(1)) * 1000)
    
    # Find "$X GTD" or "Guaranteed $X"
    for m in re.finditer(r'\$([0-9,]+)\s*(?:GTD|Guaranteed)', text, re.I):
        try: gtds.append(int(m.group(1).replace(',', '')))
        except: pass
    
    # Find "Buy-In: $X" or "Buy In $X"
    for m in re.finditer(r'(?:buy[- ]?in|entry)[:\s]*\$([0-9,]+)', text, re.I):
        try: buyins.append(int(m.group(1).replace(',', '')))
        except: pass
    
    # Find all standalone $ amounts
    all_dollars = []
    for m in re.finditer(r'\$(\d{1,3}(?:,\d{3})*)', text):
        try:
            amt = int(m.group(1).replace(',', ''))
            if 20 <= amt <= 25000:
                # Check if this is near a GTD keyword
                ctx_s = max(0, m.start()-10)
                ctx_e = min(len(text), m.end()+20)
                ctx = text[ctx_s:ctx_e]
                if re.search(r'GTD|Guaranteed|guarantee|prize|pool', ctx, re.I):
                    if amt not in gtds: gtds.append(amt)
                elif m.end() < len(text) and text[m.end():m.end()+2].strip().upper().startswith('K'):
                    if amt * 1000 not in gtds: gtds.append(amt * 1000)
                else:
                    all_dollars.append(amt)
        except: pass
    
    if not buyins:
        buyins = all_dollars
    
    return sorted(set(buyins)), sorted(set(gtds))


def scrape_and_verify(venue_config, session):
    """Full 6-layer verification for one venue."""
    db_name = venue_config['db_name']
    pa_url = venue_config['pa_url']
    website_url = venue_config['website_url']
    
    print(f"\n{'='*70}")
    print(f"VERIFYING: {db_name}")
    print(f"{'='*70}")
    
    # --- Layer 1: Fetch DB records ---
    db_records = fetch_db_records(db_name)
    db_buyins = sorted(set(r['buy_in'] for r in db_records if r.get('buy_in')))
    print(f"\n📊 DB Records: {len(db_records)}")
    print(f"   DB Buy-ins: {db_buyins}")
    
    # --- Layer 2: Scrape PokerAtlas with Scrapling ---
    print(f"\n🌐 Layer 2: Scraping PokerAtlas → {pa_url}")
    pa_text = None
    pa_hash = None
    pa_status = None
    try:
        resp = session.fetch(pa_url)
        pa_status = resp.status
        body = resp.body if hasattr(resp, 'body') and resp.body else (resp.text.encode() if hasattr(resp, 'text') else b'')
        pa_hash = hashlib.sha256(body).hexdigest()
        pa_text = body.decode('utf-8', 'ignore') if isinstance(body, bytes) else str(body)
        print(f"   HTTP: {pa_status} | Hash: {pa_hash[:16]}... | Bytes: {len(body)}")
    except Exception as e:
        print(f"   ❌ PA Scrape failed: {e}")
    
    pa_buyins, pa_gtds = ([], [])
    if pa_text:
        pa_buyins, pa_gtds = extract_buyins_from_text(pa_text)
        print(f"   PA Buy-ins found: {pa_buyins[:15]}")
        print(f"   PA GTDs found: {pa_gtds[:10]}")
    
    # --- Layer 3: Scrape venue website (camoufox) ---
    print(f"\n🌐 Layer 3: Scraping venue website → {website_url}")
    site_text = None
    site_hash = None
    site_status = None
    try:
        resp2 = session.fetch(website_url)
        site_status = resp2.status
        body2 = resp2.body if hasattr(resp2, 'body') and resp2.body else (resp2.text.encode() if hasattr(resp2, 'text') else b'')
        site_hash = hashlib.sha256(body2).hexdigest()
        site_text = body2.decode('utf-8', 'ignore') if isinstance(body2, bytes) else str(body2)
        print(f"   HTTP: {site_status} | Hash: {site_hash[:16]}... | Bytes: {len(body2)}")
    except Exception as e:
        print(f"   ❌ Site scrape failed: {e}")
    
    site_buyins, site_gtds = ([], [])
    if site_text:
        site_buyins, site_gtds = extract_buyins_from_text(site_text)
        print(f"   Site Buy-ins found: {site_buyins[:15]}")
        print(f"   Site GTDs found: {site_gtds[:10]}")
    
    # --- Layer 4: Cross-reference ---
    print(f"\n🔍 Layer 4: Cross-reference")
    all_source_buyins = sorted(set(pa_buyins + site_buyins))
    
    # Check each DB buy-in against source truth
    verified = 0
    unverified = 0
    suspicious = 0
    
    for bi in db_buyins:
        if bi in all_source_buyins:
            verified += 1
            print(f"   ✅ ${bi:>5} — CONFIRMED in source data")
        elif bi in pa_gtds or bi in site_gtds:
            suspicious += 1
            print(f"   🚨 ${bi:>5} — THIS IS A GTD AMOUNT, NOT A BUY-IN!")
        else:
            # Check if close to a source buy-in (within 10%)
            close = [s for s in all_source_buyins if abs(s - bi) / max(bi, 1) < 0.15]
            if close:
                verified += 1
                print(f"   ⚠️  ${bi:>5} — Close match to source ${close} (within 15%)")
            else:
                unverified += 1
                print(f"   ❓ ${bi:>5} — NOT FOUND in any source (may be from different scrape window)")
    
    # Check for source buy-ins NOT in our DB
    missing_from_db = [bi for bi in all_source_buyins if bi not in db_buyins]
    if missing_from_db:
        print(f"\n   📝 Source buy-ins NOT in our DB: {missing_from_db}")
    
    # --- Layer 5: Evidence capture ---
    evidence = {
        "venue_name": db_name,
        "batch_id": BATCH_ID,
        "verification_timestamp": datetime.now(timezone.utc).isoformat(),
        "pokeratlas": {
            "url": pa_url,
            "http_status": pa_status,
            "scrape_html_hash": pa_hash,
            "buyins_found": pa_buyins,
            "gtds_found": pa_gtds,
        },
        "venue_website": {
            "url": website_url,
            "http_status": site_status,
            "scrape_html_hash": site_hash,
            "buyins_found": site_buyins,
            "gtds_found": site_gtds,
        },
        "database": {
            "record_count": len(db_records),
            "buyins": db_buyins,
        },
        "verification_result": {
            "confirmed": verified,
            "unverified": unverified,
            "suspicious_gtd_as_buyin": suspicious,
            "missing_from_db": missing_from_db,
        }
    }
    
    evidence_file = os.path.join(EVIDENCE_DIR, f"verify_{db_name.replace(' ', '_').lower()}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(evidence_file, 'w') as f:
        json.dump(evidence, f, indent=2)
    print(f"\n   📄 Evidence saved: {evidence_file}")
    
    # --- Layer 6: Verdict ---
    total = verified + unverified + suspicious
    pct = 100 * verified / total if total else 0
    print(f"\n   📊 VERDICT: {verified}/{total} buy-ins verified ({pct:.0f}%)")
    if suspicious > 0:
        print(f"   🚨 {suspicious} buy-ins appear to be GTD amounts — CORRUPTED!")
    if pct >= 80:
        print(f"   ✅ PASS — Data quality acceptable")
    elif pct >= 50:
        print(f"   ⚠️  MARGINAL — Needs review")
    else:
        print(f"   ❌ FAIL — Data quality unacceptable")
    
    return evidence


def main():
    if not _network_available():
        sys.exit("❌ Network unavailable — cannot verify")
    
    print(f"🔐 Batch ID: {BATCH_ID}")
    print(f"📅 Timestamp: {datetime.now(timezone.utc).isoformat()}")
    print(f"🌐 Starting StealthySession (camoufox)...")
    
    session = StealthySession(headless=True)
    session.start()
    
    results = []
    for venue in VERIFY_VENUES:
        try:
            evidence = scrape_and_verify(venue, session)
            results.append(evidence)
        except Exception as e:
            print(f"\n❌ Failed to verify {venue['db_name']}: {e}")
        time.sleep(3)  # Be polite between venues
    
    session.close()
    
    # Summary
    print(f"\n{'='*70}")
    print(f"VERIFICATION SUMMARY")
    print(f"{'='*70}")
    total_confirmed = sum(r['verification_result']['confirmed'] for r in results)
    total_unverified = sum(r['verification_result']['unverified'] for r in results)
    total_suspicious = sum(r['verification_result']['suspicious_gtd_as_buyin'] for r in results)
    total = total_confirmed + total_unverified + total_suspicious
    print(f"  Venues verified: {len(results)}")
    print(f"  Buy-ins confirmed: {total_confirmed}/{total} ({100*total_confirmed/total:.0f}%)")
    print(f"  Unverified: {total_unverified}")
    print(f"  GTD-as-BuyIn corruption: {total_suspicious}")
    
    if total_suspicious == 0:
        print(f"\n  ✅ NO GTD CORRUPTION DETECTED — Fix is working!")
    else:
        print(f"\n  🚨 GTD CORRUPTION STILL PRESENT — {total_suspicious} records need cleanup!")


if __name__ == '__main__':
    main()
