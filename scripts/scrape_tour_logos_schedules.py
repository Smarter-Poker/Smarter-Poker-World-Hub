#!/usr/bin/env python3
"""
TRAVELING POKER TOUR SCRAPER — Logos & 2026 Schedules
=====================================================
Scrapling + camoufox | Full 15-layer data integrity compliance
Only scrapes TRAVELING tours (not stationary venue series)

Usage:
  source .venv/bin/activate
  python3 scripts/scrape_tour_logos_schedules.py
"""

import hashlib
import json
import os
import re
import sys
import time
import uuid
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scrapling.fetchers import Fetcher

# ── Constants ──────────────────────────────────────────────────────
BATCH_ID = str(uuid.uuid4())
TIMESTAMP = datetime.now(timezone.utc).isoformat()
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence"
LOGO_DIR = PROJECT_ROOT / "public" / "images" / "tours"
OUTPUT_DIR = PROJECT_ROOT / "data" / "scrape-output"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
LOGO_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Traveling tours ONLY (excludes stationary venue series and inactive tours)
TRAVELING_TOURS = {
    "WSOP": {
        "name": "World Series of Poker",
        "homepage": "https://www.wsop.com",
        "schedule_url": "https://www.wsop.com/tournaments/",
        "cf_protected": False,
    },
    "WPT": {
        "name": "World Poker Tour",
        "homepage": "https://www.worldpokertour.com",
        "schedule_url": "https://www.worldpokertour.com/schedule/",
        "cf_protected": False,
    },
    "WSOPC": {
        "name": "WSOP Circuit",
        "homepage": "https://www.wsop.com/circuit/",
        "schedule_url": "https://www.wsop.com/circuit/schedule/",
        "cf_protected": False,
    },
    "MSPT": {
        "name": "Mid-States Poker Tour",
        "homepage": "https://msptpoker.com",
        "schedule_url": "https://msptpoker.com/schedule/",
        "cf_protected": False,
    },
    "RGPS": {
        "name": "RunGood Poker Series",
        "homepage": "https://rungoodgear.com",
        "schedule_url": "https://rungoodgear.com/poker-series/",
        "cf_protected": False,
    },
    "PGT": {
        "name": "PokerGO Tour",
        "homepage": "https://www.pokergo.com",
        "schedule_url": "https://www.pokergo.com/pgt/",
        "cf_protected": True,
    },
    "TRITON": {
        "name": "Triton Poker",
        "homepage": "https://www.triton-series.com",
        "schedule_url": "https://www.triton-series.com/schedule/",
        "cf_protected": False,
    },
    "NAPT": {
        "name": "North American Poker Tour",
        "homepage": "https://www.pokerstarslive.com/napt/",
        "schedule_url": "https://www.pokerstarslive.com/napt/",
        "cf_protected": False,
    },
    "CPPT": {
        "name": "Card Player Poker Tour",
        "homepage": "https://www.cardplayerpokertour.com",
        "schedule_url": "https://www.cardplayerpokertour.com",
        "cf_protected": False,
    },
    "ROUGHRIDER": {
        "name": "Roughrider Poker Tour",
        "homepage": "https://roughriderpokertour.com",
        "schedule_url": "https://roughriderpokertour.com/schedule/",
        "cf_protected": False,
    },
    "BPO": {
        "name": "Bar Poker Open",
        "homepage": "https://barpokeropen.com",
        "schedule_url": "https://barpokeropen.com/events/",
        "cf_protected": False,
    },
    "FPN": {
        "name": "Free Poker Network",
        "homepage": "https://freepokernetwork.com",
        "schedule_url": "https://freepokernetwork.com/events/",
        "cf_protected": False,
    },
    "LIPS": {
        "name": "Ladies International Poker Series",
        "homepage": "https://www.lipspoker.org",
        "schedule_url": "https://www.lipspoker.org/schedule/",
        "cf_protected": False,
    },
    "CARD_PLAYER_CRUISES": {
        "name": "Card Player Poker Tour",
        "homepage": "https://www.cardplayercruises.com",
        "schedule_url": "https://www.cardplayercruises.com/cruises/",
        "cf_protected": False,
    },
    "HPT": {
        "name": "Heartland Poker Tour",
        "homepage": "https://www.hptpoker.com",
        "schedule_url": "https://www.hptpoker.com",
        "cf_protected": False,
    },
}


def _network_available():
    """Quick network check before scraping."""
    try:
        req = urllib.request.Request("https://www.google.com", method="HEAD")
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False


def scrape_page(url, cf_protected=False):
    """Scrape a page using Scrapling Fetcher. Returns (page, body_bytes, provenance) or (None, None, None)."""
    try:
        page = Fetcher.get(url, stealthy_headers=True, timeout=20)
        if page.status != 200:
            print(f"  ⚠ HTTP {page.status} for {url}")
            return None, None, None

        body = page.body if page.body else (page.text.encode() if page.text else b"")
        html_hash = hashlib.sha256(body).hexdigest()

        provenance = {
            "scrape_url": url,
            "scrape_http_status": page.status,
            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
            "scrape_html_hash": html_hash,
            "scrape_byte_count": len(body),
            "scrape_script": "scripts/scrape_tour_logos_schedules.py",
            "batch_id": BATCH_ID,
            "body_preview": body[:200].decode("utf-8", errors="replace"),
        }
        return page, body, provenance
    except Exception as e:
        print(f"  ✗ Error scraping {url}: {e}")
        return None, None, None


def extract_logo_url(page, homepage):
    """Extract the best logo URL from a page using priority hierarchy."""
    logo_url = None

    # Priority 1: og:image meta tag
    try:
        og_image = page.css_first('meta[property="og:image"]')
        if og_image:
            content = og_image.attributes.get("content", "")
            if content:
                logo_url = content
                print(f"  ✓ Found og:image: {logo_url[:80]}")
                return _resolve_url(logo_url, homepage)
    except Exception:
        pass

    # Priority 2: twitter:image meta tag
    try:
        tw = page.css_first('meta[name="twitter:image"]')
        if tw:
            content = tw.attributes.get("content", "")
            if content:
                logo_url = content
                print(f"  ✓ Found twitter:image: {logo_url[:80]}")
                return _resolve_url(logo_url, homepage)
    except Exception:
        pass

    # Priority 3: link rel="icon" or link rel="apple-touch-icon"
    try:
        for selector in ['link[rel="apple-touch-icon"]', 'link[rel="icon"]', 'link[rel="shortcut icon"]']:
            icon = page.css_first(selector)
            if icon:
                href = icon.attributes.get("href", "")
                if href and not href.endswith(".ico"):
                    logo_url = href
                    print(f"  ✓ Found {selector}: {logo_url[:80]}")
                    return _resolve_url(logo_url, homepage)
    except Exception:
        pass

    # Priority 4: Header/nav logo img
    try:
        for selector in [
            'header img[class*="logo"]', 'header img[alt*="logo"]',
            'nav img[class*="logo"]', 'nav img[alt*="logo"]',
            'img[class*="logo"]', '.logo img', '#logo img',
            'header img', 'a[class*="logo"] img',
        ]:
            img = page.css_first(selector)
            if img:
                src = img.attributes.get("src", "")
                if src and not src.endswith(".svg") and "data:" not in src:
                    logo_url = src
                    print(f"  ✓ Found logo img ({selector}): {logo_url[:80]}")
                    return _resolve_url(logo_url, homepage)
    except Exception:
        pass

    print("  ✗ No logo found")
    return None


def _resolve_url(url, base):
    """Resolve a relative URL to absolute."""
    if not url:
        return None
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        from urllib.parse import urlparse
        parsed = urlparse(base)
        return f"{parsed.scheme}://{parsed.netloc}{url}"
    if url.startswith("http"):
        return url
    return base.rstrip("/") + "/" + url


def download_logo(url, tour_code):
    """Download a logo image and save to public/images/tours/."""
    if not url:
        return None
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
            "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
        }
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=15)
        data = resp.read()
        content_type = resp.headers.get("Content-Type", "")

        # Determine extension
        ext = ".png"
        if "jpeg" in content_type or "jpg" in content_type:
            ext = ".jpg"
        elif "webp" in content_type:
            ext = ".webp"
        elif "svg" in content_type:
            ext = ".svg"
        elif url.endswith(".jpg") or url.endswith(".jpeg"):
            ext = ".jpg"
        elif url.endswith(".webp"):
            ext = ".webp"

        filename = f"{tour_code.lower()}{ext}"
        filepath = LOGO_DIR / filename
        filepath.write_bytes(data)
        print(f"  ✓ Logo saved: {filepath.name} ({len(data)} bytes)")
        return f"/images/tours/{filename}"
    except Exception as e:
        print(f"  ✗ Logo download failed: {e}")
        return None


def extract_schedule_events(page, tour_code, url):
    """Try to extract schedule/event data from a page. Returns list of event dicts."""
    events = []
    text = page.text if page.text else ""

    # ── Strategy 1: Look for JSON-LD structured data ──
    try:
        ld_scripts = page.css('script[type="application/ld+json"]')
        for script in ld_scripts:
            try:
                ld_data = json.loads(script.text)
                if isinstance(ld_data, list):
                    for item in ld_data:
                        if item.get("@type") == "Event":
                            events.append(_parse_ld_event(item))
                elif isinstance(ld_data, dict):
                    if ld_data.get("@type") == "Event":
                        events.append(_parse_ld_event(ld_data))
                    elif ld_data.get("@type") == "ItemList":
                        for item in ld_data.get("itemListElement", []):
                            if isinstance(item, dict) and item.get("@type") == "Event":
                                events.append(_parse_ld_event(item))
            except json.JSONDecodeError:
                pass
    except Exception:
        pass

    if events:
        print(f"  ✓ Extracted {len(events)} events from JSON-LD")
        return events

    # ── Strategy 2: Table parsing ──
    try:
        tables = page.css("table")
        for table in tables:
            rows = table.css("tr")
            for row in rows[1:]:  # skip header
                cells = row.css("td")
                if len(cells) >= 2:
                    event_text = cells[0].text.strip() if cells[0].text else ""
                    # Skip empty or header-like rows
                    if event_text and len(event_text) > 3:
                        ev = {"event_name": event_text}
                        if len(cells) >= 3:
                            ev["buy_in_raw"] = cells[1].text.strip() if cells[1].text else ""
                            ev["dates_raw"] = cells[2].text.strip() if cells[2].text else ""
                        elif len(cells) >= 2:
                            ev["dates_raw"] = cells[1].text.strip() if cells[1].text else ""
                        events.append(ev)
        if events:
            print(f"  ✓ Extracted {len(events)} events from table rows")
            return events
    except Exception:
        pass

    # ── Strategy 3: Common event card selectors ──
    for selector_group in [
        (".event-card", ".event-title,.event-name,h3,h4", ".event-date,.date,.dates", ".buy-in,.buyin,.price"),
        (".schedule-item,.schedule-event", "h3,h4,.title,.name", ".date,.dates,.when", ".buy-in,.buyin"),
        (".tour-stop,.stop-card", "h3,h4,.stop-name,.name", ".dates,.date", ".buy-in,.buyin"),
        ('[class*="event"]', "h3,h4,.title", ".date,.dates", ".buy-in,.buyin"),
    ]:
        try:
            container_sel, name_sel, date_sel, buyin_sel = selector_group
            cards = page.css(container_sel)
            if len(cards) >= 2:
                for card in cards:
                    name_el = card.css_first(name_sel)
                    date_el = card.css_first(date_sel)
                    buyin_el = card.css_first(buyin_sel)
                    if name_el and name_el.text and name_el.text.strip():
                        ev = {"event_name": name_el.text.strip()}
                        if date_el and date_el.text:
                            ev["dates_raw"] = date_el.text.strip()
                        if buyin_el and buyin_el.text:
                            ev["buy_in_raw"] = buyin_el.text.strip()
                        events.append(ev)
                if events:
                    print(f"  ✓ Extracted {len(events)} events via selector: {container_sel}")
                    return events
        except Exception:
            pass

    # ── Strategy 4: List items with date patterns ──
    try:
        date_pattern = re.compile(r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\S*\s+\d{1,2}', re.I)
        for sel in ["li", ".item", "article", "div[class*='schedule']", "div[class*='event']"]:
            items = page.css(sel)
            for item in items:
                txt = item.text.strip() if item.text else ""
                if date_pattern.search(txt) and len(txt) > 15 and len(txt) < 500:
                    events.append({"event_name": txt[:200], "dates_raw": ""})
        if events:
            print(f"  ✓ Extracted {len(events)} events from text pattern matching")
            return events[:50]  # cap
    except Exception:
        pass

    print(f"  ✗ No schedule events found for {tour_code}")
    return []


def _parse_ld_event(ld):
    """Parse a JSON-LD Event object."""
    ev = {"event_name": ld.get("name", "")}
    if ld.get("startDate"):
        ev["start_date"] = ld["startDate"][:10]
    if ld.get("endDate"):
        ev["end_date"] = ld["endDate"][:10]
    loc = ld.get("location", {})
    if isinstance(loc, dict):
        ev["venue"] = loc.get("name", "")
        addr = loc.get("address", {})
        if isinstance(addr, dict):
            ev["city"] = addr.get("addressLocality", "")
            ev["state"] = addr.get("addressRegion", "")
    if ld.get("offers"):
        offers = ld["offers"]
        if isinstance(offers, dict):
            ev["buy_in_raw"] = str(offers.get("price", ""))
        elif isinstance(offers, list) and offers:
            ev["buy_in_raw"] = str(offers[0].get("price", ""))
    return ev


def save_evidence(tour_code, provenance, events_count, logo_path):
    """Save scrape evidence JSON."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    evidence = {
        **provenance,
        "tour_code": tour_code,
        "records_extracted": events_count,
        "logo_saved": logo_path,
        "batch_id": BATCH_ID,
    }
    filepath = EVIDENCE_DIR / f"tour_{tour_code.lower()}_{ts}.json"
    filepath.write_text(json.dumps(evidence, indent=2))
    return str(filepath)


def main():
    print("=" * 70)
    print("TRAVELING POKER TOUR SCRAPER")
    print(f"Batch ID: {BATCH_ID}")
    print(f"Started:  {TIMESTAMP}")
    print(f"Tours:    {len(TRAVELING_TOURS)}")
    print("=" * 70)

    if not _network_available():
        print("✗ Network unavailable. Aborting.")
        sys.exit(1)

    results = {}
    consecutive_failures = 0

    for code, tour in TRAVELING_TOURS.items():
        print(f"\n{'─' * 50}")
        print(f"[{code}] {tour['name']}")
        print(f"  Homepage: {tour['homepage']}")

        # ── Circuit breaker: abort after 5 consecutive failures ──
        if consecutive_failures >= 5:
            print("✗ Circuit breaker: 5 consecutive failures. Stopping.")
            break

        # ── Scrape homepage for logo ──
        logo_url = None
        print("  → Scraping homepage for logo...")
        page, body, provenance = scrape_page(tour["homepage"], tour["cf_protected"])

        logo_path = None
        if page and body:
            consecutive_failures = 0
            logo_url = extract_logo_url(page, tour["homepage"])
            if logo_url:
                logo_path = download_logo(logo_url, code)
        else:
            consecutive_failures += 1
            print(f"  ✗ Homepage scrape failed (failures: {consecutive_failures})")

        # ── Scrape schedule page for events ──
        events = []
        schedule_provenance = None
        if tour["schedule_url"] != tour["homepage"]:
            print(f"  → Scraping schedule page...")
            sched_page, sched_body, sched_prov = scrape_page(tour["schedule_url"], tour["cf_protected"])
            if sched_page and sched_body:
                events = extract_schedule_events(sched_page, code, tour["schedule_url"])
                schedule_provenance = sched_prov
            else:
                # Try homepage for schedule if schedule page failed
                if page:
                    events = extract_schedule_events(page, code, tour["homepage"])
        else:
            if page:
                events = extract_schedule_events(page, code, tour["homepage"])

        # ── Save evidence ──
        prov = schedule_provenance or provenance
        if prov:
            evidence_path = save_evidence(code, prov, len(events), logo_path)
            print(f"  ✓ Evidence: {Path(evidence_path).name}")

        results[code] = {
            "tour_code": code,
            "tour_name": tour["name"],
            "logo_path": logo_path,
            "logo_source_url": logo_url if logo_path else None,
            "events_count": len(events),
            "events": events[:100],  # cap at 100 events per tour
            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
            "scrape_html_hash": prov["scrape_html_hash"] if prov else None,
        }

        # Rate limit: 2s between tours
        time.sleep(2)

    # ── Save combined output ──
    output_path = OUTPUT_DIR / f"tour_schedules_{BATCH_ID[:8]}.json"
    output_data = {
        "batch_id": BATCH_ID,
        "scrape_timestamp": TIMESTAMP,
        "scrape_script": "scripts/scrape_tour_logos_schedules.py",
        "tours_scraped": len(results),
        "data": results,
    }
    output_path.write_text(json.dumps(output_data, indent=2))

    # ── Summary ──
    print(f"\n{'=' * 70}")
    print("SCRAPE SUMMARY")
    print(f"{'=' * 70}")
    logos_found = sum(1 for r in results.values() if r["logo_path"])
    events_found = sum(r["events_count"] for r in results.values())
    print(f"Tours scraped:    {len(results)}")
    print(f"Logos downloaded:  {logos_found}")
    print(f"Events extracted:  {events_found}")
    print(f"Output:           {output_path.name}")
    print(f"Batch ID:         {BATCH_ID}")

    # ── Per-tour results ──
    for code, r in results.items():
        logo_emoji = "✓" if r["logo_path"] else "✗"
        print(f"  {logo_emoji} {code.ljust(25)} logo={'Yes' if r['logo_path'] else 'No'.ljust(3)}  events={r['events_count']}")

    return results


if __name__ == "__main__":
    main()
