#!/usr/bin/env python3
"""
LIPS Event Scraper — Individual event pages
SOURCE: lipstour.com/events/?event=XXXX
Event IDs discovered via HTML probe: 2104-2110, 2136
METHOD: Scrapling Fetcher (non-CF site, plain 200s)
"""
import sys, re, json, hashlib, uuid, time, os
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from scrapling.fetchers import Fetcher
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env.local")

from supabase import create_client
sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

DRY_RUN = "--dry-run" in sys.argv
EVIDENCE_DIR = Path(__file__).parent.parent / "data" / "scrape-evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# Event IDs discovered in HTML probe — these are REAL IDs from the page
EVENT_IDS = [2104, 2105, 2106, 2107, 2108, 2109, 2110, 2136]
BASE_URL = "https://lipstour.com/events/?event="

batch_id = str(uuid.uuid4())
events = []

def extract_clean_title(html):
    # Post title
    m = re.search(r'<h1[^>]*class="[^"]*(?:ep-event-name|event-title|entry-title)[^"]*"[^>]*>([^<]+)<', html)
    if m: return m.group(1).strip()
    # og:title
    m = re.search(r'<meta\s+property="og:title"\s+content="([^"]+)"', html)
    if m:
        t = m.group(1).strip()
        if ' – ' in t: t = t.split(' – ')[0].strip()
        if ' | ' in t: t = t.split(' | ')[0].strip()
        return t
    # First h1
    m = re.search(r'<h1[^>]*>([^<]{10,100})<', html)
    if m: return m.group(1).strip()
    return None

def extract_buyin(html, text):
    # Structured buy-in labels
    m = re.search(r'(?:Buy-?[Ii]n|Entry\s*Fee|Registration)[:\s]*\$([0-9,]+)', html) or \
        re.search(r'(?:Buy-?[Ii]n|Entry\s*Fee|Registration)[:\s]*\$([0-9,]+)', text)
    if m: return int(m.group(1).replace(',',''))
    # Dollar amount at start of title
    m = re.search(r'^\s*\$([0-9,]+)', text)
    if m:
        v = int(m.group(1).replace(',',''))
        if 50 <= v <= 50000: return v
    return None

def extract_gtd(html, text):
    m = re.search(r'\$([0-9,]+)\s*(?:GTD|Guaranteed)', text, re.IGNORECASE)
    if m: return int(m.group(1).replace(',',''))
    return None

def extract_date(html, text):
    # JSON-LD startDate
    m = re.search(r'"startDate"\s*:\s*"(\d{4}-\d{2}-\d{2})', html)
    if m: return m.group(1)
    # ISO date in text
    m = re.search(r'(\d{4}-\d{2}-\d{2})', text)
    if m: return m.group(1)
    # Human date
    months = {'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,'july':7,'august':8,'september':9,'october':10,'november':11,'december':12}
    m = re.search(r'(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})', text, re.IGNORECASE)
    if m:
        mo = months.get(m.group(1).lower(), 0)
        return f"{m.group(3)}-{mo:02d}-{int(m.group(2)):02d}" if mo else None
    return None

def extract_game_type(title):
    t = title.lower()
    if 'plo' in t or 'pot-limit omaha' in t or 'omaha' in t: return 'PLO'
    if 'stud' in t: return 'Stud'
    if 'horse' in t: return 'HORSE'
    return 'NLH'

def extract_event_type(title):
    t = title.lower()
    if 'main event' in t: return 'main_event'
    if 'high roller' in t: return 'high_roller'
    if 'mystery bounty' in t or 'bounty' in t: return 'bounty'
    if 'ladies' in t or 'women' in t: return 'ladies'
    if 'seniors' in t or 'senior' in t: return 'seniors'
    if 'satellite' in t or 'qualifier' in t: return 'satellite'
    return 'side_event'

print(f"\n🎰 LIPS EVENT SCRAPER")
print(f"   Batch: {batch_id}")
print(f"   Event IDs: {EVENT_IDS}")
print(f"   Mode: {'DRY-RUN' if DRY_RUN else 'LIVE'}")

for i, eid in enumerate(EVENT_IDS):
    url = f"{BASE_URL}{eid}"
    print(f"\n[LIPS] Event {eid} — {url}")

    page = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
    if not page or page.status != 200:
        print(f"  [FAIL] HTTP {page.status if page else 'None'}")
        time.sleep(1)
        continue

    body = page.body if isinstance(page.body, bytes) else (page.body or b'')
    html = body.decode('utf-8', errors='replace')
    html_hash = hashlib.sha256(body).hexdigest()
    ts = datetime.now(timezone.utc).isoformat()
    # Strip tags for text
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)

    print(f"  [OK] {page.status} — {len(body):,}b — hash: {html_hash[:12]}...")

    title = extract_clean_title(html) or f"LIPS Event {eid}"
    buyin = extract_buyin(html, text)
    gtd = extract_gtd(html, text)
    start_date = extract_date(html, text)

    print(f"  Title: {title}")
    print(f"  Buy-in: ${buyin} | GTD: ${gtd} | Date: {start_date}")

    # Save evidence
    ev = {
        "event_id": eid,
        "scrape_url": url,
        "scrape_http_status": 200,
        "scrape_html_hash": html_hash,
        "scrape_byte_count": len(body),
        "scrape_timestamp": ts,
        "batch_id": batch_id,
        "extracted": {"title": title, "buy_in": buyin, "guaranteed": gtd, "start_date": start_date},
    }
    ef = EVIDENCE_DIR / f"lips_event_{eid}_{ts[:10].replace('-','')}.json"
    ef.write_text(json.dumps(ev, indent=2, default=str))

    events.append({
        "tour_code": "LIPS",
        "series_name": "Ladies International Poker Series 2025-26",
        "event_number": i + 1,
        "event_number_raw": str(eid),
        "event_name": title[:200],
        "game_type": extract_game_type(title),
        "event_type": extract_event_type(title),
        "buy_in": buyin,
        "guaranteed": gtd,
        "start_date": start_date,
        "source": f"lipstour_com_event_{eid}_scrapled_2026",
        "scraped_at": ts,
    })

    time.sleep(1.5)

print(f"\n{'='*50}")
print(f"LIPS: {len(events)} events scraped")
for e in events:
    print(f"  #{e['event_number']} {e['event_name'][:60]} | ${e['buy_in']} | {e['start_date']}")

if DRY_RUN:
    print("\n[DRY-RUN] No DB write.")
elif events:
    # Delete old poor-quality LIPS rows first
    del_r = sb.table("tour_event_details").delete().eq("tour_code","LIPS").execute()
    print(f"\n[DB] Deleted old LIPS rows")
    ins_r = sb.table("tour_event_details").insert(events).execute()
    if ins_r.data:
        print(f"[DB] Inserted {len(ins_r.data)} clean LIPS events")
    else:
        print(f"[DB ERROR] {ins_r}")
