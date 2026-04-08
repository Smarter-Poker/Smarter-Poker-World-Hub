#!/usr/bin/env python3
"""
FAST TARGETED SCRAPER — 13 Poker Tours (Cloudflare Bypass + JS Render)
======================================================================
Uses Scrapling's StealthySession to render JS from official tour sites and 
PokerAtlas, solving 403s and 404s natively. Then pipes the rendered DOM into
OpenAI for high-fidelity extraction.
"""
import json, re, sys, os, time, signal, uuid, hashlib, urllib.request
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).parent.parent
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence'
SOURCES_FILE = ROOT / 'data' / '../../../../tmp/test-wpt.json'

OPENAI_API_KEY = ''
SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = ''

for line in CRED_PATH.read_text().splitlines():
    if '=' in line and not line.strip().startswith('#'):
        k, _, v = line.partition('=')
        if k.strip() == 'OPENAI_API_KEY': OPENAI_API_KEY = v.strip().strip('"\'')
        if k.strip() == 'SUPABASE_SERVICE_ROLE_KEY': SERVICE_KEY = v.strip().strip('"\'')

BATCH_ID = str(uuid.uuid4())

def rest_post(data):
    url = SUPABASE_URL + '/rest/v1/tour_event_details'
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={
        'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except Exception as e:
        print(f"    ❌ Supabase DB Insert Error: {e}")
        return 500

def extract_with_llm(html_text, tour_code):
    if not OPENAI_API_KEY:
        print("    ⚠️  Missing OPENAI_API_KEY. Skipping LLM.")
        return []
        
    text = html_text[:15000]
    prompt = f"Extract ALL poker tournament events from this {tour_code} schedule page. Return ONLY a JSON array. Each object: {{event_name, buy_in (integer), start_date, guaranteed (integer), starting_chips, game_type, event_type}}. Return [] if none.\n\Text:\n{text}"
    
    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0
    }).encode()
    
    try:
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {OPENAI_API_KEY}"
        })
        with urllib.request.urlopen(req, timeout=45) as r:
            res = json.loads(r.read())
            content = res.get('choices', [{}])[0].get('message', {}).get('content', '[]')
            match = re.search(r'\[.*\]', content, re.DOTALL)
            if match:
                evts = json.loads(match.group(0))
                # Filter out pure noise, keep ones with buy_ins
                return [e for e in evts if isinstance(e.get('buy_in'), int)]
            return []
    except Exception as e:
        print(f"    ❌ LLM Error: {e}")
        return []

def main():
    print(f"\n{'═'*55}")
    print(f"  TOUR SCRAPER PRO (Scrapling + LLM) — 13 Tours")
    print(f"  Batch: {BATCH_ID}")
    print(f"{'═'*55}")

    try:
        from scrapling.fetchers import StealthySession
    except ImportError:
        print("  ❌ Scrapling not installed."); sys.exit(1)

    with open(SOURCES_FILE) as f:
        sources_data = json.load(f)

    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()

    results = {}
    
    for tour_code, tour_info in sources_data.get('tours', {}).items():
        print(f"\n  🎯 [{tour_code}] {tour_info['tour_name']}")
        sources = tour_info.get('sources', {})
        success = False
        
        for sname, sconfig in sources.items():
            url = sconfig.get('url')
            if not url: continue
            print(f"    🌐 Try {sname}: {url}")
            
            try:
                # 60s hard timeout
                class Timeout(Exception): pass
                def handler(s, f): raise Timeout()
                signal.signal(signal.SIGALRM, handler)
                signal.alarm(60)
                
                resp = session.fetch(url, google_search=False)
                if not resp or resp.status != 200:
                    print(f"    ❌ HTTP {resp.status if resp else 'no response'}")
                    signal.alarm(0); continue

                # Try full DOM render for SPAs (WSOPC, RGPS, WPT, PGT)
                ctx = session.context
                page = ctx.new_page()
                try:
                    page.goto(url, timeout=20000, wait_until='domcontentloaded')
                    page.wait_for_timeout(3500) # Wait for network/grids
                    html = page.content()
                except Exception as e:
                    print(f"    ⚠️ JS render failed: {e}")
                    html = resp.body.decode('utf-8', errors='ignore') if resp.body else ""
                finally:
                    page.close()
                signal.alarm(0)

                clean_text = re.sub(r'<[^>]+>', ' ', html)
                clean_text = re.sub(r'\s{3,}', '  ', clean_text).strip()
                
                if len(clean_text) < 100:
                    print("    ⚠️ Thin payload.")
                    continue

                events = extract_with_llm(clean_text, tour_code)
                print(f"    📅 Events: {len(events)}")
                
                if len(events) >= 3:
                    print(f"    ✅ SUCCESS via {sname}. Found {len(events)} events.")
                    for e in events[:2]:
                        print(f"        • {e.get('event_name')} | ${e.get('buy_in')}")
                    
                    # Save evidence payload locally as JSON
                    safe = re.sub(r'[^a-z0-9]', '_', tour_code.lower())
                    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
                    fp = EVIDENCE_DIR / f'tour_{safe}_{ts}.json'
                    fp.write_text(json.dumps({
                        "tour_code": tour_code,
                        "url": url,
                        "events": events
                    }, indent=2))
                    print(f"    💾 Evidence: {fp.name}")

                    if SERVICE_KEY:
                        total_inserted = 0
                        for e in events:
                            record = {
                                "tour_code": tour_code,
                                "event_name": e.get('event_name'),
                                "buy_in": e.get('buy_in'),
                                "start_date": e.get('start_date'),
                                "guaranteed": e.get('guaranteed'),
                                "starting_chips": e.get('starting_chips'),
                                "game_type": e.get('game_type', 'NLH'),
                                "event_type": e.get('event_type', 'side_event'),
                                "source_url": url,
                                "source": "llm_extraction",
                                "scraped_at": datetime.now(timezone.utc).isoformat()
                            }
                            if rest_post(record) < 300:
                                total_inserted += 1
                        print(f"    ✅ DB: Inserted {total_inserted} events to tour_event_details")

                    results[tour_code] = len(events)
                    success = True
                    break # Tour complete, stop trying sources
                else:
                    print(f"    ❌ Insufficient events ({len(events)})")
                    
            except Timeout:
                print("    ⏰ Timeout")
            except Exception as e:
                print(f"    ❌ Error: {e}")
            finally:
                signal.alarm(0)
                
        if not success:
            print(f"  ❌ FATAL: Could not scrape events for {tour_code}.")

    session.close()
    
    print(f"\n{'═'*55}")
    print(f"SUMMARY: {len(results)} / {len(sources_data.get('tours', {}))} tours successfully scraped")
    print(f"{'═'*55}")
    for t, c in results.items():
        print(f"✅ {t}: {c} events")

if __name__ == '__main__':
    main()
