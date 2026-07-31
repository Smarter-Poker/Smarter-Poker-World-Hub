#!/usr/bin/env python3
"""
FAST TARGETED SCRAPER — 13 Poker Tours (Cloudflare Bypass + JS Render)
======================================================================
Uses Scrapling's StealthySession to render JS from official tour sites and 
PokerAtlas, solving 403s and 404s natively. Then pipes the rendered DOM into
Grok (xAI) for high-fidelity extraction.
"""
import json, re, sys, os, time, signal, uuid, hashlib, urllib.request, urllib.parse, urllib.error
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).parent.parent
CRED_PATH = ROOT / '.agent' / 'skills' / 'credentials' / '.env'
EVIDENCE_DIR = ROOT / 'data' / 'scrape-evidence'
SOURCES_FILE = ROOT / 'data' / 'tour-scrape-sources.json'

def _load_cred_file(path):
    """Parse a KEY=VALUE .env file. Missing/unreadable file is a warning, not a crash."""
    vals = {}
    if not path.exists():
        print(f"  WARN: credentials file not found at {path} — falling back to environment variables")
        return vals
    try:
        raw = path.read_text()
    except OSError as e:
        print(f"  WARN: could not read {path}: {e} — falling back to environment variables")
        return vals
    for line in raw.splitlines():
        if '=' in line and not line.strip().startswith('#'):
            k, _, v = line.partition('=')
            vals[k.strip()] = v.strip().strip('"\'')
    return vals

_CREDS = _load_cred_file(CRED_PATH)

def _cred(*names):
    """Environment wins over the credentials file; first non-empty name wins."""
    for n in names:
        v = os.environ.get(n, '').strip()
        if v:
            return v
    for n in names:
        v = _CREDS.get(n, '').strip()
        if v:
            return v
    return ''

XAI_API_KEY = _cred('XAI_API_KEY')
SUPABASE_URL = (_cred('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
                or 'https://kuklfnapbkmacvwxktbh.supabase.co').rstrip('/')
SERVICE_KEY = _cred('SUPABASE_SERVICE_ROLE_KEY')
TWILIO_ACCOUNT_SID = _cred('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = _cred('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_FROM = _cred('TWILIO_PHONE_NUMBER')
ALERT_PHONE_TO = _cred('ALERT_PHONE_TO')

BATCH_ID = str(uuid.uuid4())

# Columns that actually exist on tour_event_details (see scrape_gcpt_schedules.py /
# scrape_final_push.py). Anything outside this set is rejected by PostgREST.
SCHEMA_COLS = {
    'tour_code', 'series_name', 'event_number', 'event_number_raw', 'event_name',
    'game_type', 'event_type', 'buy_in', 'guaranteed', 'start_date', 'day_of_week',
    'start_time', 'reg_open_time', 'starting_chips', 'levels', 'pdf_source_url',
    'source', 'scraped_at',
}
# Rows written by this script are tagged with SOURCE_TAG so a re-run can retire its
# own stale rows without touching rows other scrapers own.
SOURCE_TAG = 'llm_extraction'

DB_ERRORS = 0

def send_sms_alert(msg):
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN: return
    if not ALERT_PHONE_TO:
        print("    WARN: ALERT_PHONE_TO not set — skipping SMS alert.")
        return
    import base64
    url = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    data = urllib.parse.urlencode({
        "To": ALERT_PHONE_TO,
        "From": TWILIO_PHONE_FROM,
        "Body": f"[Smarter.Poker FATAL] {msg}"
    }).encode('utf-8')
    auth = base64.b64encode(f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode()).decode()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Basic {auth}",
        "Content-Type": "application/x-www-form-urlencoded"
    })
    try:
        urllib.request.urlopen(req, timeout=10)
        print("    📱 SMS Alert sent successfully.")
    except Exception as e:
        print(f"    ❌ Failed to send SMS: {e}")

def rest_call(method, path, payload=None):
    """Single Supabase REST call. Returns (status, error_text). Never raises."""
    global DB_ERRORS
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=body, method=method, headers={
        'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, ''
    except urllib.error.HTTPError as e:
        detail = ''
        try:
            detail = e.read().decode('utf-8', 'replace')[:400]
        except Exception:
            pass
        DB_ERRORS += 1
        print(f"    DB ERROR {method} {path}: HTTP {e.code} {detail}")
        return e.code, detail
    except Exception as e:
        DB_ERRORS += 1
        print(f"    DB ERROR {method} {path}: {e}")
        return 0, str(e)

def delete_prior_rows(tour_code):
    """Retire this script's previous rows for the tour so re-runs replace, not duplicate."""
    path = (f"tour_event_details?tour_code=eq.{urllib.parse.quote(tour_code)}"
            f"&source=eq.{urllib.parse.quote(SOURCE_TAG)}")
    status, _ = rest_call('DELETE', path)
    ok = 200 <= status < 300
    print(f"    DB: retired prior {SOURCE_TAG} rows for {tour_code} (HTTP {status})")
    return ok

def rest_post(records):
    """Insert records in chunks. Returns (inserted, failed)."""
    inserted, failed = 0, 0
    CHUNK = 25
    for i in range(0, len(records), CHUNK):
        chunk = records[i:i + CHUNK]
        status, _ = rest_call('POST', 'tour_event_details', chunk)
        if 200 <= status < 300:
            inserted += len(chunk)
        else:
            failed += len(chunk)
    return inserted, failed

# ─── Source verification (anti-hallucination) ────────────────────────────────
MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
          'august', 'september', 'october', 'november', 'december']

def _int_or_none(value):
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        digits = re.sub(r'[^0-9]', '', value)
        if digits:
            try:
                return int(digits)
            except ValueError:
                return None
    return None

def number_in_source(value, text_l):
    """True only if the integer literally occurs in the fetched page text."""
    n = _int_or_none(value)
    if n is None or n <= 0:
        return False
    variants = {str(n), f"{n:,}"}
    if n % 1000 == 0:
        variants.add(f"{n // 1000}k")
    if n % 1_000_000 == 0:
        variants.add(f"{n // 1_000_000}m")
    return any(v.lower() in text_l for v in variants)

def date_in_source(date_str, text_l):
    """True only if the date can be located in the fetched page text."""
    s = (date_str or '').strip()
    if not s:
        return False
    if s.lower() in text_l:
        return True
    m = re.match(r'^(\d{4})-(\d{1,2})-(\d{1,2})$', s)
    if not m:
        return False
    year, mon, day = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= mon <= 12 and 1 <= day <= 31):
        return False
    name = MONTHS[mon - 1]
    patterns = [
        rf'\b0?{mon}\s*[/\-.]\s*0?{day}\b',
        rf'\b{name}\s+0?{day}\b',
        rf'\b{name[:3]}\.?\s+0?{day}\b',
        rf'\b0?{day}\s+{name}\b',
    ]
    return any(re.search(p, text_l) for p in patterns)

def name_in_source(name, text_l):
    """Token-coverage check — the model may re-case or re-space, but not invent."""
    tokens = [t for t in re.split(r'[^a-z0-9]+', (name or '').lower()) if len(t) > 2]
    if not tokens:
        return False
    hits = sum(1 for t in tokens if t in text_l)
    return (hits / len(tokens)) >= 0.7

def verify_events(events, source_text):
    """Drop / null out every field the source text cannot corroborate.

    Returns (verified_events, stats). An event survives only when its name and
    buy-in both appear in the fetched page; unsupported dates, guarantees and
    starting chips are nulled rather than stored as fact.
    """
    text_l = source_text.lower()
    stats = {'returned': len(events), 'dropped_name': 0, 'dropped_buy_in': 0,
             'dropped_duplicate': 0, 'nulled_date': 0, 'nulled_guaranteed': 0,
             'nulled_starting_chips': 0}
    verified, seen = [], set()
    for e in events:
        if not isinstance(e, dict):
            continue
        name = (e.get('event_name') or '').strip()
        if not name_in_source(name, text_l):
            stats['dropped_name'] += 1
            continue
        buy_in = _int_or_none(e.get('buy_in'))
        if not number_in_source(buy_in, text_l):
            stats['dropped_buy_in'] += 1
            continue

        start_date = e.get('start_date')
        if not date_in_source(start_date, text_l):
            if start_date:
                stats['nulled_date'] += 1
            start_date = None

        guaranteed = _int_or_none(e.get('guaranteed'))
        if guaranteed is not None and not number_in_source(guaranteed, text_l):
            stats['nulled_guaranteed'] += 1
            guaranteed = None

        chips = _int_or_none(e.get('starting_chips'))
        if chips is not None and not number_in_source(chips, text_l):
            stats['nulled_starting_chips'] += 1
            chips = None

        key = (re.sub(r'[^a-z0-9]+', ' ', name.lower()).strip(), start_date, buy_in)
        if key in seen:
            stats['dropped_duplicate'] += 1
            continue
        seen.add(key)

        game_type = e.get('game_type')
        game_type = game_type.strip() if isinstance(game_type, str) and game_type.strip() else None
        event_type = e.get('event_type')
        event_type = event_type.strip() if isinstance(event_type, str) and event_type.strip() else None
        if not event_type and re.search(r'main\s*event', name, re.I):
            event_type = 'main_event'

        verified.append({
            'event_name': name[:200],
            'buy_in': buy_in,
            'start_date': start_date,
            'guaranteed': guaranteed,
            'starting_chips': chips,
            'game_type': game_type,
            'event_type': event_type,
        })
    stats['verified'] = len(verified)
    return verified, stats

def extract_with_llm(html_text, tour_code):
    if not XAI_API_KEY:
        print("    ⚠️  Missing XAI_API_KEY. Skipping LLM.")
        return []
        
    text = html_text[:15000]
    if len(html_text) > 15000:
        print(f"    WARN: page text truncated to 15000 of {len(html_text)} chars — "
              f"tail of the schedule is not visible to the extractor.")
    prompt = f"Extract ALL poker tournament events from this {tour_code} schedule page. Return ONLY a JSON array. Each object: {{event_name, buy_in (integer), start_date, guaranteed (integer), starting_chips, game_type, event_type}}. Return [] if none.\n\Text:\n{text}"
    
    body = json.dumps({
        "model": "grok-3-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0
    }).encode()
    
    try:
        req = urllib.request.Request("https://api.x.ai/v1/chat/completions", data=body, headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {XAI_API_KEY}"
        })
        with urllib.request.urlopen(req, timeout=45) as r:
            res = json.loads(r.read())
            content = res.get('choices', [{}])[0].get('message', {}).get('content', '[]')
            match = re.search(r'\[.*\]', content, re.DOTALL)
            if match:
                evts = json.loads(match.group(0))
                # Filter out pure noise, keep ones with buy_ins
                return [e for e in evts
                        if isinstance(e, dict) and _int_or_none(e.get('buy_in')) is not None]
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
    db_failures = {}
    failed_tours = []

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

                html_hash = hashlib.sha256(html.encode('utf-8', 'ignore')).hexdigest()
                raw_events = extract_with_llm(clean_text, tour_code)
                events, vstats = verify_events(raw_events, clean_text)
                print(f"    📅 Events: {len(events)} verified against source "
                      f"(model returned {len(raw_events)}; dropped "
                      f"{vstats['dropped_name']} unmatched-name, {vstats['dropped_buy_in']} unmatched-buy-in, "
                      f"{vstats['dropped_duplicate']} duplicate; nulled {vstats['nulled_date']} dates, "
                      f"{vstats['nulled_guaranteed']} guarantees, {vstats['nulled_starting_chips']} chip counts)")

                if len(events) >= 3:
                    print(f"    ✅ SUCCESS via {sname}. Found {len(events)} events.")
                    for e in events[:2]:
                        print(f"        • {e.get('event_name')} | ${e.get('buy_in')}")
                    
                    # Save evidence payload locally as JSON
                    safe = re.sub(r'[^a-z0-9]', '_', tour_code.lower())
                    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
                    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
                    fp = EVIDENCE_DIR / f'tour_{safe}_{ts}.json'
                    scraped_at = datetime.now(timezone.utc).isoformat()
                    fp.write_text(json.dumps({
                        "tour_code": tour_code,
                        "url": url,
                        "batch_id": BATCH_ID,
                        "scrape_timestamp": scraped_at,
                        "scrape_html_hash": html_hash,
                        "scrape_byte_count": len(html),
                        "extraction_method": SOURCE_TAG,
                        "verification": vstats,
                        "raw_llm_events": raw_events,
                        "events": events
                    }, indent=2))
                    print(f"    💾 Evidence: {fp.name}")

                    if SERVICE_KEY:
                        records = []
                        for e in events:
                            record = {
                                "tour_code": tour_code,
                                "event_name": e.get('event_name'),
                                "buy_in": e.get('buy_in'),
                                "start_date": e.get('start_date'),
                                "guaranteed": e.get('guaranteed'),
                                "starting_chips": e.get('starting_chips'),
                                "game_type": e.get('game_type'),
                                "event_type": e.get('event_type'),
                                "pdf_source_url": url,
                                "source": SOURCE_TAG,
                                "scraped_at": scraped_at
                            }
                            records.append({k: v for k, v in record.items() if k in SCHEMA_COLS})

                        # Replace this script's prior rows for the tour instead of
                        # appending a duplicate set on every run. If the retire step
                        # fails, skip the insert rather than duplicate the schedule.
                        if delete_prior_rows(tour_code):
                            total_inserted, failed = rest_post(records)
                            print(f"    ✅ DB: Inserted {total_inserted} events to tour_event_details"
                                  + (f" ({failed} FAILED)" if failed else ""))
                            if failed:
                                db_failures[tour_code] = db_failures.get(tour_code, 0) + failed
                        else:
                            print(f"    DB: skipped insert for {tour_code} — could not retire prior rows "
                                  f"(inserting now would duplicate the schedule). Evidence file retained.")
                            db_failures[tour_code] = db_failures.get(tour_code, 0) + len(records)
                    else:
                        print("    WARN: SUPABASE_SERVICE_ROLE_KEY missing — evidence saved, nothing written to DB.")

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
            failed_tours.append(tour_code)
            print(f"  ❌ FATAL: Could not scrape events for {tour_code}.")

    session.close()

    total_tours = len(sources_data.get('tours', {}))
    print(f"\n{'═'*55}")
    print(f"SUMMARY: {len(results)} / {total_tours} tours successfully scraped")
    print(f"{'═'*55}")
    for t, c in results.items():
        print(f"✅ {t}: {c} events")
    if failed_tours:
        print(f"FAILED TOURS ({len(failed_tours)}): {', '.join(failed_tours)}")
    if db_failures:
        print(f"DB WRITE FAILURES: {db_failures}")
    if DB_ERRORS:
        print(f"TOTAL DB ERRORS THIS RUN: {DB_ERRORS}")

    if len(results) < 3:
        print("\n☢️ CRITICAL FAILURE EXCEPTION TRIGGERED ☢️")
        send_sms_alert(f"Offline Scraper Daemon failed. Only {len(results)} tours completed. Action required immediately on python execution box.")

    # Non-zero exit so a cron/CI wrapper cannot mistake a partial run for success.
    if failed_tours or db_failures or DB_ERRORS:
        return 1
    return 0

if __name__ == '__main__':
    sys.exit(main())
