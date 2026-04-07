#!/usr/bin/env python3
"""
Tour API Investigator — Scrapling-Only
=======================================
Probes each poker tour's official website to discover native JSON API endpoints.
Uses ONLY Scrapling Fetcher (stealthy_headers=True) per skill requirements.
StealthySession + camoufox used for Cloudflare-protected sites.

Usage:
  python3 scripts/investigate_tour_apis.py
  python3 scripts/investigate_tour_apis.py --tour WPT
"""

import sys
import os
import json
import re
import hashlib
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# ─── Scrapling (MANDATORY — no requests/urllib for scraping) ───────────────────
try:
    from scrapling.fetchers import Fetcher, StealthySession
    print("[OK] Scrapling loaded")
except ImportError:
    print("[FATAL] Scrapling not installed. Run: pip install scrapling camoufox")
    sys.exit(1)

def network_available():
    """Pre-flight network check (uses urllib for INFRASTRUCTURE check only — not scraping)."""
    import urllib.request
    try:
        req = urllib.request.Request('https://1.1.1.1', method='HEAD')
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception:
        return False

def scrapling_fetch(url, use_cloudflare=False):
    """
    Fetch URL using Scrapling (ONLY authorized scraping library).
    Returns (html_bytes, status_code, sha256_hash).
    """
    print(f"  [Scrapling] {'StealthySession+camoufox' if use_cloudflare else 'Fetcher'} → {url}")
    
    if not network_available():
        print("  [WARN] Network pre-check failed — attempting anyway")
    
    if use_cloudflare:
        session = None
        for attempt in range(3):
            try:
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                resp = session.fetch(url, google_search=True)
                if resp and resp.status == 200:
                    body = resp.body if isinstance(resp.body, bytes) else (resp.body or '').encode()
                    h = hashlib.sha256(body).hexdigest()
                    print(f"  [OK] {resp.status} — {len(body):,} bytes — SHA256: {h[:16]}...")
                    return body, resp.status, h
                print(f"  [WARN] HTTP {resp.status if resp else 'None'} attempt {attempt+1}")
            except Exception as e:
                print(f"  [WARN] Attempt {attempt+1}: {e}")
                time.sleep(2 ** attempt)
            finally:
                try:
                    if session: session.close()
                    session = None
                except Exception:
                    pass
        print(f"  [FAIL] All 3 StealthySession attempts failed")
        return None, None, None
    else:
        try:
            page = Fetcher.get(url, stealthy_headers=True, follow_redirects=True)
            if page and page.status == 200:
                body = page.body if isinstance(page.body, bytes) else (page.body or '').encode()
                h = hashlib.sha256(body).hexdigest()
                print(f"  [OK] {page.status} — {len(body):,} bytes — SHA256: {h[:16]}...")
                return body, page.status, h
            print(f"  [FAIL] HTTP {page.status if page else 'None'}")
            return None, getattr(page, 'status', None), None
        except Exception as e:
            print(f"  [ERROR] Fetcher: {e}")
            return None, None, None

def probe_json_endpoints(base_domain, candidate_paths, use_cf=False):
    """
    Probe a list of JSON API endpoint paths. Returns a list of
    (url, response_dict) for any that return parseable JSON.
    """
    hits = []
    for path in candidate_paths:
        url = f"{base_domain.rstrip('/')}/{path.lstrip('/')}"
        body, status, sha = scrapling_fetch(url, use_cloudflare=use_cf)
        if not body:
            continue
        # Try to parse as JSON
        try:
            data = json.loads(body.decode('utf-8', errors='replace'))
            print(f"  [JSON HIT] {url} → {type(data).__name__} with {len(data) if isinstance(data, (list,dict)) else '?'} items")
            hits.append({
                "url": url,
                "status": status,
                "sha256": sha,
                "data_type": type(data).__name__,
                "data_preview": str(data)[:500],
                "full_data": data
            })
        except json.JSONDecodeError:
            # HTML page — check for embedded JSON / Next.js data
            html = body.decode('utf-8', errors='replace')
            embedded = extract_embedded_json(html)
            if embedded:
                print(f"  [EMBEDDED JSON] {url} → found {len(embedded)} embedded JSON blobs")
                hits.append({
                    "url": url,
                    "status": status,
                    "sha256": sha,
                    "data_type": "embedded_html_json",
                    "embedded_blobs": embedded,
                    "data_preview": str(embedded[0])[:500] if embedded else ""
                })
        time.sleep(1)
    return hits

def extract_embedded_json(html):
    """
    Extracts JSON data embedded in HTML:
    - <script id="__NEXT_DATA__"> (Next.js)
    - window.__data = {...}
    - <script type="application/ld+json">
    - Apollo cache __APOLLO_STATE__
    - window.initialData
    """
    blobs = []
    
    # Next.js __NEXT_DATA__
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if m:
        try:
            blobs.append({"source": "__NEXT_DATA__", "data": json.loads(m.group(1))})
        except Exception:
            blobs.append({"source": "__NEXT_DATA__", "data": m.group(1)[:300]})
    
    # JSON-LD structured data
    for m in re.finditer(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL):
        try:
            blobs.append({"source": "json_ld", "data": json.loads(m.group(1))})
        except Exception:
            pass
    
    # Apollo state
    m = re.search(r'window\.__APOLLO_STATE__\s*=\s*(\{.{100,}?\});?\s*</script>', html, re.DOTALL)
    if m:
        try:
            blobs.append({"source": "__APOLLO_STATE__", "data": json.loads(m.group(1))})
        except Exception:
            blobs.append({"source": "__APOLLO_STATE__", "raw": m.group(1)[:300]})
    
    # window.initialData or window.__data
    for var in ['initialData', '__data', 'appState', '__INITIAL_STATE__']:
        pattern = r'window\.' + re.escape(var) + r'\s*=\s*(\{.{50,})\s*;'
        m = re.search(pattern, html, re.DOTALL)
        if m:
            try:
                blobs.append({"source": f"window.{var}", "data": json.loads(m.group(1))})
            except Exception:
                blobs.append({"source": f"window.{var}", "raw": m.group(1)[:300]})
    
    return blobs

def save_investigation_evidence(tour_code, results):
    """Save all investigation findings to evidence directory."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    fname = EVIDENCE_DIR / f"api_investigation_{tour_code.lower()}_{ts}.json"
    # Strip full_data to keep file sizes manageable
    lean = []
    for r in results:
        entry = {k: v for k, v in r.items() if k != 'full_data'}
        if 'full_data' in r:
            entry['full_data_keys'] = list(r['full_data'].keys()) if isinstance(r['full_data'], dict) else type(r['full_data']).__name__
            entry['full_data_preview'] = str(r['full_data'])[:1000]
        lean.append(entry)
    output = {
        "tour_code": tour_code,
        "investigation_timestamp": datetime.now(timezone.utc).isoformat(),
        "results": lean,
        "hits_count": sum(1 for r in results if r.get('status') == 200),
    }
    fname.write_text(json.dumps(output, indent=2, default=str))
    print(f"  [Evidence] Saved: {fname.name}")
    return str(fname)

# ─── Tour Investigation Configs ───────────────────────────────────────────────
TOUR_PROBES = {
    "WPT": {
        "full_name": "World Poker Tour",
        "base": "https://www.worldpokertour.com",
        "cloudflare": True,
        "schedule_page": "/schedule/",
        "json_candidates": [
            "/wp-json/wp/v2/posts?per_page=100&categories=events",
            "/wp-json/wp/v2/tribe_events?per_page=100",
            "/wp-json/tribe/events/v1/events?per_page=100",
            "/wp-json/wp/v2/pages?slug=schedule",
            "/api/events",
            "/api/schedule",
            "/api/v1/events",
            "/graphql",
            "/_next/data/events.json",
        ]
    },
    "MSPT": {
        "full_name": "Mid-States Poker Tour",
        "base": "https://msptpoker.com",
        "cloudflare": False,
        "schedule_page": "/schedule/",
        "json_candidates": [
            "/wp-json/wp/v2/posts?per_page=100",
            "/wp-json/wp/v2/tribe_events?per_page=100",
            "/wp-json/tribe/events/v1/events?per_page=100&start_date=2026-01-01",
            "/wp-json/wp/v2/events",
            "/wp-json/wptgt/v1/events",
            "/wp-json/wp/v2/pages?per_page=50",
            "/feed/json",
            "/schedule/feed",
        ]
    },
    "RGPS": {
        "full_name": "RunGood Poker Series",
        "base": "https://rungoodgear.com",
        "cloudflare": False,
        "schedule_page": "/poker-series/",
        "json_candidates": [
            "/wp-json/wp/v2/posts?per_page=100&categories=2",
            "/wp-json/tribe/events/v1/events?per_page=100&start_date=2026-01-01",
            "/wp-json/wp/v2/tribe_events?per_page=100",
            "/wp-json/wp/v2/pages?search=schedule",
            "/wp-json/wp/v2/posts?per_page=50&search=poker+series",
            "/poker-series/feed",
            "/events/feed",
        ]
    },
    "CPPT": {
        "full_name": "Card Player Poker Tour",
        "base": "https://www.cardplayerpokertour.com",
        "cloudflare": False,
        "schedule_page": "/schedule",
        "json_candidates": [
            "/wp-json/wp/v2/posts?per_page=100",
            "/wp-json/tribe/events/v1/events?per_page=100",
            "/wp-json/wp/v2/tribe_events?per_page=100",
            "/wp-json/wp/v2/pages?per_page=50",
            "/api/schedule",
            "/schedule/feed",
        ]
    },
    "PGT": {
        "full_name": "PokerGO Tour",
        "base": "https://www.pokergo.com",
        "cloudflare": True,
        "schedule_page": "/series",
        "json_candidates": [
            "/api/series",
            "/api/events",
            "/api/v1/series",
            "/api/v2/series",
            "/api/schedule",
            "/_next/data/series.json",
            "/graphql",
        ]
    },
    "ROUGHRIDER": {
        "full_name": "Roughrider Poker Tour",
        "base": "https://roughriderpokertour.com",
        "cloudflare": False,
        "schedule_page": "/schedule/",
        "json_candidates": [
            "/wp-json/wp/v2/posts?per_page=100",
            "/wp-json/tribe/events/v1/events?per_page=100&start_date=2026-01-01",
            "/wp-json/wp/v2/tribe_events?per_page=100",
            "/wp-json/wp/v2/pages?search=schedule",
            "/schedule/feed",
        ]
    },
    "GCPT": {
        "full_name": "Gulf Coast Poker Tour",
        "base": "https://gulfcoastpoker.net",
        "cloudflare": False,
        "schedule_page": "/schedule/",
        "json_candidates": [
            "/wp-json/wp/v2/posts?per_page=100",
            "/wp-json/tribe/events/v1/events?per_page=100&start_date=2026-01-01",
            "/wp-json/wp/v2/tribe_events?per_page=100",
            "/wp-json/wp/v2/pages?per_page=50",
            "/schedule/feed",
            "/events/feed",
        ]
    },
    "NAPT": {
        "full_name": "North American Poker Tour (PokerStars)",
        "base": "https://www.pokerstarslive.com",
        "cloudflare": True,
        "schedule_page": "/napt/",
        "json_candidates": [
            "/api/tournaments",
            "/api/events",
            "/api/v1/tournaments",
            "/graphql",
            "/api/schedule",
            "/napt/schedule/",
        ]
    },
    "LIPS": {
        "full_name": "Ladies International Poker Series",
        "base": "https://www.lipspoker.org",
        "cloudflare": False,
        "schedule_page": "/schedule",
        "json_candidates": [
            "/wp-json/wp/v2/posts?per_page=100",
            "/wp-json/tribe/events/v1/events?per_page=100",
            "/wp-json/wp/v2/tribe_events?per_page=100",
            "/wp-json/wp/v2/pages?search=schedule",
            "/schedule/feed",
        ]
    },
}

def investigate_tour(tour_code, config):
    """Full investigation of a single tour's website for native API endpoints."""
    print(f"\n{'='*60}")
    print(f"  INVESTIGATING: {tour_code} — {config['full_name']}")
    print(f"  Base: {config['base']}")
    print(f"  CF Protected: {config['cloudflare']}")
    print(f"{'='*60}")
    
    all_results = []
    
    # Step 1: Fetch the schedule page first to understand the tech stack
    schedule_url = config['base'] + config['schedule_page']
    print(f"\n  [Step 1] Fetching schedule page: {schedule_url}")
    body, status, sha = scrapling_fetch(schedule_url, use_cloudflare=config['cloudflare'])
    
    if body:
        html = body.decode('utf-8', errors='replace')
        
        # Detect tech stack
        tech = detect_tech_stack(html)
        print(f"  [Tech Stack] {tech}")
        
        # Extract embedded JSON
        embedded = extract_embedded_json(html)
        if embedded:
            print(f"  [Found] {len(embedded)} embedded JSON blob(s)")
            for blob in embedded:
                src = blob.get('source', '?')
                data = blob.get('data', {})
                print(f"    [{src}] Keys: {list(data.keys())[:10] if isinstance(data, dict) else type(data).__name__}")
        
        # Look for API hints in the HTML
        api_hints = extract_api_hints(html)
        if api_hints:
            print(f"  [API Hints] Found: {api_hints[:5]}")
        
        all_results.append({
            "url": schedule_url,
            "type": "schedule_page",
            "status": status,
            "sha256": sha,
            "tech_stack": tech,
            "embedded_json_blobs": len(embedded),
            "api_hints": api_hints[:10],
            "embedded_blobs": [
                {"source": b.get('source'), "data_preview": str(b.get('data', ''))[:500]}
                for b in embedded
            ],
        })
    else:
        print(f"  [FAIL] Could not fetch schedule page")
        all_results.append({"url": schedule_url, "type": "schedule_page", "status": status})
    
    # Step 2: Probe JSON endpoints
    print(f"\n  [Step 2] Probing {len(config['json_candidates'])} candidate JSON endpoints...")
    json_hits = probe_json_endpoints(config['base'], config['json_candidates'], use_cf=config['cloudflare'])
    all_results.extend(json_hits)
    
    # Step 3: Save evidence
    evidence_file = save_investigation_evidence(tour_code, all_results)
    
    # Step 4: Summarize findings
    json_endpoints = [r for r in all_results if r.get('data_type') in ('dict', 'list', 'embedded_html_json')]
    
    print(f"\n  ─── FINDINGS for {tour_code} ───────────────────────────────")
    print(f"  Schedule page loaded: {'YES' if body else 'NO'}")
    print(f"  JSON endpoints found: {len(json_endpoints)}")
    for hit in json_endpoints:
        print(f"    [HIT] {hit['url']} → {hit.get('data_type')} — {hit.get('data_preview', '')[:100]}")
    
    return {
        "tour_code": tour_code,
        "full_name": config['full_name'],
        "schedule_page_loaded": body is not None,
        "json_endpoints_found": json_endpoints,
        "evidence_file": evidence_file,
    }

def detect_tech_stack(html):
    """Detect CMS/framework from HTML signatures."""
    signs = []
    if '__NEXT_DATA__' in html or '_next/' in html:
        signs.append("Next.js")
    if 'wp-content' in html or 'wp-includes' in html or 'wordpress' in html.lower():
        signs.append("WordPress")
    if 'tribe_events' in html or 'tribe-events' in html:
        signs.append("The Events Calendar (WordPress)")
    if 'react' in html.lower() and '__reactFiber' in html:
        signs.append("React SPA")
    if 'nuxt' in html.lower() or '__NUXT__' in html:
        signs.append("Nuxt.js")
    if 'gatsby' in html.lower() or 'gatsby-' in html:
        signs.append("Gatsby")
    if 'shopify' in html.lower():
        signs.append("Shopify")
    if not signs:
        signs.append("Unknown/Plain HTML")
    return ", ".join(signs)

def extract_api_hints(html):
    """Find API endpoint patterns in HTML source."""
    hints = set()
    # API endpoint patterns
    patterns = [
        r'["\'](/wp-json/[^"\']{5,80})["\']',
        r'["\'](/_next/data/[^"\']{5,80})["\']',
        r'["\'](/api/[^"\']{3,60})["\']',
        r'["\'](/graphql[^"\']{0,30})["\']',
        r'url:\s*["\']([^"\']+/api/[^"\']{3,60})["\']',
        r'fetch\(["\']([^"\']+/api/[^"\']{3,60})["\']',
    ]
    for pat in patterns:
        for m in re.finditer(pat, html, re.IGNORECASE):
            endpoint = m.group(1)
            if not any(skip in endpoint for skip in ['cdn', 'static', '.css', '.js', '.png', '.jpg', 'wp-admin']):
                hints.add(endpoint)
    return list(hints)[:20]

def main():
    parser = argparse.ArgumentParser(description="Poker Tour Native API Investigator")
    parser.add_argument("--tour", help="Investigate specific tour only")
    args = parser.parse_args()
    
    tours = {args.tour: TOUR_PROBES[args.tour]} if args.tour and args.tour in TOUR_PROBES else TOUR_PROBES
    
    print(f"\n🔍 POKER TOUR NATIVE API INVESTIGATOR")
    print(f"   Tours to investigate: {list(tours.keys())}")
    print(f"   Scrapling ONLY (no requests/urllib for scraping)")
    print(f"   StealthySession+camoufox for Cloudflare-protected sites")
    print(f"   Evidence → data/scrape-evidence/\n")
    
    master_results = {}
    for code, config in tours.items():
        result = investigate_tour(code, config)
        master_results[code] = result
        time.sleep(3)  # Respectful delay between tours
    
    # Final summary
    print(f"\n{'='*60}")
    print(f"  INVESTIGATION COMPLETE")
    print(f"{'='*60}")
    for code, res in master_results.items():
        endpoints = res.get('json_endpoints_found', [])
        print(f"  {code}: {len(endpoints)} JSON endpoint(s) found")
        for ep in endpoints:
            print(f"    → {ep.get('url', '?')}")
    
    # Save master results
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    master_file = EVIDENCE_DIR / f"tour_api_master_investigation_{ts}.json"
    master_file.write_text(json.dumps(
        {k: {x: v for x, v in r.items() if x != 'json_endpoints_found'}
         for k, r in master_results.items()},
        indent=2, default=str
    ))
    print(f"\n  Master report: {master_file.name}")

if __name__ == "__main__":
    main()
