#!/usr/bin/env python3
"""
GCPT Full Schedule Scraper — v2.0
===================================
SOURCE: gulfcoastpoker.net — Each stop's schedule sub-page
METHOD: DynamicFetcher (JS rendering with 8s wait — renders the event table)
INTEGRITY: SHA-256 hash, evidence JSON, provenance tracking, anti-hallucination
ZERO FAKE DATA: Only what's rendered in the actual schedule table.

Usage:
  python3 scripts/scrape_gcpt_schedules.py            # Live insert
  python3 scripts/scrape_gcpt_schedules.py --dry-run  # No DB writes
"""
import sys, re, json, hashlib, uuid, time, argparse
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

try:
    from scrapling.fetchers import DynamicFetcher, Fetcher
    print("[OK] Scrapling loaded")
except ImportError:
    print("[FATAL] pip install scrapling camoufox"); sys.exit(1)

try:
    from supabase import create_client
    from dotenv import load_dotenv
    import os
    load_dotenv(Path(__file__).parent.parent / ".env.local")
    sb = create_client(os.environ["NEXT_PUBLIC_SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    print("[OK] Supabase connected")
except Exception as e:
    print(f"[WARN] Supabase: {e}")
    sb = None

EVIDENCE_DIR = Path(__file__).parent.parent / "data" / "scrape-evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# SOURCE OF TRUTH — all scraping URLs stored here for future re-scraping
GCPT_STOPS = [
    {
        "stop_name": "The Heater",
        "source_url": "https://gulfcoastpoker.net/the-heater/schedule",  # schedule sub-page
        "venue": "Beau Rivage Resort & Casino",
        "city": "Biloxi", "state": "MS",
        "date_text": "Jan 7-19, 2026",
        "series_year": "2026",
    },
    {
        "stop_name": "Milly In Philly",
        "source_url": "https://gulfcoastpoker.net/milly-in-philly/schedule",
        "venue": "Pearl River Resort",
        "city": "Choctaw", "state": "MS",
        "date_text": "Mar 18-29, 2026",
        "series_year": "2026",
    },
    {
        "stop_name": "Horseshoe Tunica",
        "source_url": "https://gulfcoastpoker.net/tunica/schedule",
        "venue": "Horseshoe Casino & Hotel",
        "city": "Tunica", "state": "MS",
        "date_text": "Jul 10-20, 2025",
        "series_year": "2025",
    },
    {
        "stop_name": "7 Clans Poker Cup",
        "source_url": "https://gulfcoastpoker.net/7-clans/schedule",
        "venue": "Coushatta Casino Resort",
        "city": "Kinder", "state": "LA",
        "date_text": "Apr 7-19, 2026",
        "series_year": "2026",
    },
    {
        "stop_name": "Louisiana State Championship",
        "source_url": "https://gulfcoastpoker.net/bossier/schedule",
        "venue": "Horseshoe Hotel & Casino",
        "city": "Bossier City", "state": "LA",
        "date_text": "Sep 18-28, 2025",
        "series_year": "2025",
    },
    {
        "stop_name": "North Texas Cup",
        "source_url": "https://gulfcoastpoker.net/north-texas-cup/schedule",
        "venue": "Johny's Social Card Club",
        "city": "Wichita Falls", "state": "TX",
        "date_text": "Oct 8-12, 2025",
        "series_year": "2025",
    },
    {
        "stop_name": "Poker Gras",
        "source_url": "https://gulfcoastpoker.net/poker-gras/schedule",
        "venue": "Caesars Hotel & Casino",
        "city": "New Orleans", "state": "LA",
        "date_text": "Nov 5-23, 2025",
        "series_year": "2025",
    },
]


def fetch_dynamic(url, wait_ms=10000):
    """DynamicFetcher for JS-rendered schedule tables"""
    print(f"  [DynamicFetcher] {url}")
    try:
        fetcher = DynamicFetcher(headless=True, network_idle=True)
        resp = fetcher.fetch(url, wait=wait_ms, network_idle=True)
        if resp and resp.status == 200:
            body = resp.body if isinstance(resp.body, bytes) else (resp.body or b'')
            print(f"  [OK] {resp.status} — {len(body):,}b")
            return body, 200
        print(f"  [FAIL] HTTP {resp.status if resp else 'None'}")
    except Exception as e:
        print(f"  [DynamicFetcher ERROR] {e}")

    # Fallback: basic Fetcher
    print("  [Fallback] Fetcher...")
    page = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
    if page and page.status == 200:
        body = page.body if isinstance(page.body, bytes) else (page.body or b'')
        return body, 200
    return None, None


def parse_gcpt_schedule(html_bytes, stop, source_url, html_hash, ts, batch_id):
    """
    Parse a GCPT schedule page. Event table rendered by DynamicFetcher:
    Format: Date | Day | Time | Evt# | Event Name | GTD | Buy-in | Chips | Levels
    """
    html = html_bytes.decode('utf-8', errors='replace') if isinstance(html_bytes, bytes) else html_bytes
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)

    events = []
    seen = set()

    # Primary pattern: "M/D Day HH:MMam EVT# Event Name | $X GTD $Y chips levels"
    # Derived from probe output:
    # "4/7 Tuesday 10:00am Clash of the Clans Invitational $320 20,000 15 View"
    # "4/9 Thursday 5:00pm 4A Triple Bag Bonus | $100,000 GTD $400 25,000 25/45"
    evt_table_pattern = re.compile(
        r'(\d{1,2}/\d{1,2})\s+'                          # date M/D
        r'(\w+day)\s+'                                    # day name
        r'(\d{1,2}:\d{2}(?:am|pm))\s+'                   # time
        r'(?:(\d+[A-Z]?)\s+)?'                            # optional event number
        r'([A-Z][^\d$]{5,100}?)'                          # event name
        r'(?:\|\s*\$([0-9,]+)\s*GTD\s*)?'                # optional "$X GTD"
        r'\$([0-9,]+)'                                    # buy-in
        r'\s+([0-9,]+)\s+'                                # starting chips
        r'(\d+(?:/\d+)?)',                                # blind levels
        re.IGNORECASE
    )

    for m in evt_table_pattern.finditer(text):
        date_str = m.group(1)    # e.g. "4/7"
        day_name = m.group(2)
        time_str = m.group(3)
        evt_num = m.group(4) or str(len(events) + 1)
        evt_name = re.sub(r'\s+', ' ', m.group(5).strip().rstrip('|')).strip()
        gtd_s = m.group(6)
        buyin_s = m.group(7)
        chips_s = m.group(8)
        levels_s = m.group(9)

        if len(evt_name) < 3 or evt_name.lower() in ('see', 'view', 'the', 'a'):
            continue

        key = f"{date_str}_{evt_name[:25].lower()}"
        if key in seen:
            continue
        seen.add(key)

        buyin = int(re.sub(r'[^0-9]', '', buyin_s)) if buyin_s else None
        gtd = int(re.sub(r'[^0-9]', '', gtd_s)) if gtd_s else None
        chips = int(re.sub(r'[^0-9]', '', chips_s)) if chips_s else None

        # Parse date: M/D → full date
        try:
            mo, dy = date_str.split('/')
            yr = stop.get("series_year", "2026")
            start_date = f"{yr}-{int(mo):02d}-{int(dy):02d}"
        except Exception:
            start_date = None

        events.append({
            "tour_code": "GCPT",
            "series_name": f"GCPT — {stop['stop_name']} {stop.get('series_year', '2026')}",
            "event_number": len(events) + 1,              # sequential int for DB
            "event_number_raw": evt_num,                  # "4A", "3C", etc.
            "event_name": evt_name[:200],
            "game_type": infer_game_type(evt_name),
            "event_type": infer_event_type(evt_name),
            "buy_in": buyin,
            "guaranteed": gtd,
            "starting_chips": chips,
            "levels": levels_s,
            "start_date": start_date,
            "start_time": time_str,
            "day_of_week": day_name,
            "venue": stop["venue"],
            "city": stop["city"],
            "state": stop["state"],
            "source": f"gcpt_{stop['stop_name'].lower().replace(' ','_')}_scrapled_2026",
            "scrape_url": source_url,  # SOURCE OF TRUTH — always stored
            "scrape_html_hash": html_hash,
            "scrape_timestamp": ts,
            "data_quality": "scraped_verified",
            "scraped_at": ts,
        })

    # Fallback: parse from free text if table parser got nothing
    if not events:
        # "$100,000 GTD" + nearby event name
        gtd_blocks = re.findall(
            r'((?:Main.Event|High.Roller|Mystery.Bounty|Double.Bag|Triple.Bag|Triple.Stack|'
            r'Ladies|Seniors|Bounty|Freezeout|Championship|PLO|Accumulator|Heads.{0,5}Up|'
            r'Rookie|Opener|Turbo|Qualifier)[^$|\n]{3,80})'
            r'[^$]*?\$([0-9,]+)\s*(?:GTD|Guaranteed)',
            text, re.IGNORECASE
        )
        for ename, gtd_s in gtd_blocks:
            clean = re.sub(r'\s+', ' ', ename).strip().rstrip('|,').strip()
            if len(clean) < 5:
                continue
            key = clean[:30].lower()
            if key in seen:
                continue
            seen.add(key)
            gtd = int(re.sub(r'[^0-9]', '', gtd_s))
            events.append({
                "tour_code": "GCPT",
                "series_name": f"GCPT — {stop['stop_name']} {stop.get('series_year','2026')}",
                "event_number": len(events) + 1,
                "event_name": clean[:200],
                "game_type": infer_game_type(clean),
                "event_type": infer_event_type(clean),
                "buy_in": None,
                "guaranteed": gtd,
                "venue": stop["venue"],
                "city": stop["city"],
                "state": stop["state"],
                "source": f"gcpt_{stop['stop_name'].lower().replace(' ','_')}_scrapled_2026",
                "scrape_url": source_url,
                "scrape_html_hash": html_hash,
                "scrape_timestamp": ts,
                "data_quality": "scraped_verified",
                "scraped_at": ts,
            })

    return events


def infer_game_type(name):
    n = name.lower()
    if 'plo' in n or 'pot-limit omaha' in n or 'pot limit omaha' in n: return 'PLO'
    if 'omaha hi-lo' in n or 'o8' in n: return 'O8'
    if 'stud' in n or 'razz' in n: return 'Stud'
    if 'horse' in n: return 'HORSE'
    if '2-7' in n or 'lowball' in n: return '2-7'
    if 'mixed' in n: return 'Mixed'
    return 'NLH'

def infer_event_type(name):
    n = name.lower()
    if 'main event' in n: return 'main_event'
    if 'mystery bounty' in n: return 'mystery_bounty'
    if 'high roller' in n: return 'high_roller'
    if 'bounty' in n: return 'bounty'
    if 'ladies' in n: return 'ladies'
    if 'senior' in n: return 'seniors'
    if 'satellite' in n or 'qualifier' in n: return 'satellite'
    if 'freezeout' in n: return 'freezeout'
    if 'turbo' in n: return 'turbo'
    if 'tag team' in n: return 'tag_team'
    return 'side_event'

def anti_hallucination(events, stop_name):
    if not events:
        return True
    names = [e.get("event_name", "") for e in events]

    # Gate 1: >90% names are generic "$X NLH" = AI pattern (primary check)
    generic = sum(1 for n in names if re.match(r'^\$[\d,]+\s+NLH$', n.strip()))
    if names and generic / len(names) > 0.90:
        print(f"  [BLOCK] {generic}/{len(names)} generic '$X NLH' names — AI pattern")
        return False

    # Gate 2: ALL events have NO buy-in AND no guarantee = suspicious (pure stubs)
    has_buyin = any(e.get("buy_in") for e in events)
    has_gtd = any(e.get("guaranteed") for e in events)
    if not has_buyin and not has_gtd and len(events) > 5:
        print(f"  [BLOCK] {len(events)} events with no buy-ins or guarantees — possible stubs")
        return False

    # Gate 3: All identical event names = AI pattern
    if len(names) > 3 and len(set(names)) == 1:
        print(f"  [BLOCK] All {len(names)} events have identical names")
        return False

    print(f"  [OK] Anti-hallucination passed: {len(events)} events")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--stop", help="Single stop name (partial match)")
    args = parser.parse_args()

    batch_id = str(uuid.uuid4())
    started = datetime.now(timezone.utc)
    print(f"\n🎰 GCPT SCHEDULE SCRAPER v2.0")
    print(f"   Batch: {batch_id}")
    print(f"   Mode:  {'DRY-RUN' if args.dry_run else 'LIVE INSERT'}")

    stops = GCPT_STOPS
    if args.stop:
        stops = [s for s in GCPT_STOPS if args.stop.lower() in s["stop_name"].lower()]
        if not stops:
            print(f"[ERROR] No stop matching '{args.stop}'")
            sys.exit(1)

    all_events = []
    results = []

    for i, stop in enumerate(stops):
        print(f"\n{'='*60}")
        print(f"  {stop['stop_name']} — {stop['venue']}")
        print(f"  Source: {stop['source_url']}")
        print(f"{'='*60}")

        body, status = fetch_dynamic(stop["source_url"], wait_ms=10000)
        if not body:
            print(f"  [FAIL] Could not fetch schedule page")
            results.append({"stop": stop["stop_name"], "status": "failed", "events": 0})
            continue

        html_hash = hashlib.sha256(body).hexdigest()
        ts = datetime.now(timezone.utc).isoformat()
        print(f"  [SHA-256] {html_hash[:16]}... ({len(body):,}b)")

        events = parse_gcpt_schedule(body, stop, stop["source_url"], html_hash, ts, batch_id)
        print(f"  [Parsed] {len(events)} events")
        for e in events[:8]:
            print(f"    #{e['event_number']} {e['event_name'][:55]:<55} buyin=${e.get('buy_in','?')} gtd=${e.get('guaranteed','?')} date={e.get('start_date','?')}")

        # Save evidence (always)
        ev_file = EVIDENCE_DIR / f"gcpt_{stop['stop_name'].lower().replace(' ','_')}_{started.strftime('%Y%m%d_%H%M%S')}.json"
        ev_file.write_text(json.dumps({
            "scrape_url": stop["source_url"],
            "scrape_http_status": status,
            "scrape_html_hash": html_hash,
            "scrape_byte_count": len(body),
            "scrape_timestamp": ts,
            "scrape_script": __file__,
            "batch_id": batch_id,
            "stop_name": stop["stop_name"],
            "venue": stop["venue"],
            "records_extracted": len(events),
            "events_sample": events[:5],
        }, indent=2, default=str))
        print(f"  [Evidence] {ev_file.name}")

        if not anti_hallucination(events, stop["stop_name"]):
            results.append({"stop": stop["stop_name"], "status": "blocked", "events": len(events)})
            continue

        all_events.extend(events)
        results.append({"stop": stop["stop_name"], "status": "success", "events": len(events)})

        if i < len(stops) - 1:
            time.sleep(2)

    # Summary
    print(f"\n{'='*60}")
    print(f"  GCPT SCRAPE COMPLETE — {len(all_events)} total events")
    for r in results:
        icon = {"success": "✅", "failed": "❌", "blocked": "🚫"}.get(r["status"], "?")
        print(f"  {icon} {r['stop']:<35} {r['events']} events")
    print(f"{'='*60}")

    if args.dry_run:
        print("\n[DRY-RUN] No DB writes.")
        return

    if not sb or not all_events:
        print("[SKIP] No DB or no events")
        return

    print(f"\n[DB] Inserting {len(all_events)} events to tour_event_details...")
    CHUNK, inserted = 25, 0
    # Only columns that exist in tour_event_details schema
    SCHEMA_COLS = {
        "tour_code", "series_name", "event_number", "event_number_raw",
        "event_name", "game_type", "event_type", "buy_in", "guaranteed",
        "start_date", "day_of_week", "start_time", "reg_open_time",
        "starting_chips", "levels", "pdf_source_url", "source", "scraped_at",
    }
    for i in range(0, len(all_events), CHUNK):
        chunk = [{k: v for k, v in e.items() if k in SCHEMA_COLS} for e in all_events[i:i+CHUNK]]
        try:
            r = sb.table("tour_event_details").insert(chunk).execute()
            cnt = len(r.data) if r.data else len(chunk)
            inserted += cnt
            print(f"  [DB] chunk {i//CHUNK+1}: {cnt} rows")
        except Exception as e:
            print(f"  [DB ERROR] {e}")

    try:
        sb.table("data_audit_log").insert({
            "table_name": "tour_event_details",
            "action": "scrape_insert",
            "batch_id": batch_id,
            "records_count": inserted,
            "agent_id": "scrape_gcpt_schedules.py",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass

    print(f"\n✅ GCPT: {inserted} events inserted to tour_event_details")
    print(f"   Source registry: {[s['source_url'] for s in GCPT_STOPS]}")


if __name__ == "__main__":
    main()
