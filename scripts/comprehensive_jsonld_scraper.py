#!/usr/bin/env python3
"""
Comprehensive JSON-LD Scraper (Layer 1-3 Data Integrity)
Strictly extracts JSON-LD event data from Tour and Charity pages.
Produces verifiable scrape evidence in data/scrape-evidence/
"""

import sys
import json
import hashlib
import asyncio
import uuid
import os
from datetime import datetime, timezone
from bs4 import BeautifulSoup
from scrapling.fetchers import AsyncStealthySession, Fetcher

EVIDENCE_DIR = "data/scrape-evidence"
os.makedirs(EVIDENCE_DIR, exist_ok=True)

async def scrape_source(url: str, source_name: str, batch_id: str):
    """
    Downloads URL via Scrapling, enforces 200 OK status, and extracts JSON-LD.
    """
    print(f"[🔍] Starting strict JSON-LD extraction for {source_name}: {url}")
    
    # Layer 1: Scrape-Time Checks
    try:
        # Use stealthy session to bypass cloudflare seamlessly
        async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
            page = await session.fetch(url, google_search=False)
    except Exception as e:
        print(f"[❌] Error fetching {url}: {str(e)}")
        return None
        
    http_status = page.status
    if http_status != 200:
        print(f"[🚨] Validation Failure: HTTP {http_status} for {url}. Dropping pipeline.")
        return None
        
    body_content = page.body if isinstance(page.body, bytes) else page.body.encode('utf-8')
    html_hash = hashlib.sha256(body_content).hexdigest()
    scrape_timestamp = datetime.now(timezone.utc).isoformat()
    byte_count = len(body_content)
    
    print(f"[✅] Fetched HTTP 200. SHA-256 Hash Generated.")

    # Layer 2: Extraction Checks
    soup = BeautifulSoup(page.text, "html.parser")
    json_ld_scripts = soup.find_all("script", type="application/ld+json")
    
    extracted_events = []
    
    for script in json_ld_scripts:
        try:
            data = json.loads(script.string)
            # Handle arrays of JSON-LD
            if isinstance(data, dict):
                data = [data]
                
            for item in data:
                # We only care about explicit scheduled events
                if item.get("@type") in ("Event", "SportsEvent", "PokerTournament", "CourseInstance"):
                    
                    # Strict validation: MUST have address
                    location = item.get("location", {})
                    address = location.get("address", {}) if isinstance(location, dict) else {}
                    
                    if not address and not isinstance(location, str):
                        print(f"  [⚠️] Dropped event '{item.get('name')}': Missing address data.")
                        continue
                        
                    event_data = {
                        "name": item.get("name"),
                        "description": item.get("description", ""),
                        "start_date": item.get("startDate"),
                        "end_date": item.get("endDate"),
                        "location_name": location.get("name") if isinstance(location, dict) else location,
                        "address": address.get("streetAddress", "") if isinstance(address, dict) else address,
                        "state": address.get("addressRegion", "") if isinstance(address, dict) else "",
                        "url": item.get("url", url),
                        "performer": item.get("performer", {}).get("name") if isinstance(item.get("performer"), dict) else ""
                    }
                    extracted_events.append(event_data)
        except Exception as e:
            print(f"  [⚠️] Failed to parse a JSON-LD block on {url}: {e}")
            continue

    print(f"[📦] Extracted {len(extracted_events)} strictly formatted schema events.")
    
    # Layer 3: Evidence Capture
    evidence_payload = {
        "scrape_url": url,
        "scrape_http_status": http_status,
        "scrape_html_hash": html_hash,
        "scrape_byte_count": byte_count,
        "scrape_timestamp": scrape_timestamp,
        "scrape_script": __file__,
        "source_name": source_name,
        "records_extracted": len(extracted_events),
        "batch_id": batch_id,
        "data": extracted_events
    }
    
    evidence_filename = f"{EVIDENCE_DIR}/jsonld_scrape_{batch_id}_{source_name.lower().replace(' ', '_')}.json"
    with open(evidence_filename, "w") as f:
        json.dump(evidence_payload, f, indent=2)
        
    print(f"[🛡️] Evidence successfully captured: {evidence_filename}\n")
    return evidence_payload

async def main():
    batch_id = str(uuid.uuid4())
    print(f"\n=============================================")
    print(f"🚀 COMPREHENSIVE JSON-LD SCRAPER INITIALIZED")
    print(f"BATCH ID: {batch_id}")
    print(f"=============================================\n")
    
    # Example targets (Loaded from registries in production)
    targets = [
        {"name": "WSOP Offical Events", "url": "https://www.wsop.com/tournaments/"},
        {"name": "PokerAtlas PA", "url": "https://www.pokeratlas.com/poker-tournaments"},
    ]
    
    # We load dynamic targets from registry if it exists
    registry_path = "data/tour-source-registry.json"
    try:
        with open(registry_path, "r") as f:
            registry = json.load(f)
            for tour_id, tour_data in registry.get("tours", {}).items():
                if tour_data.get("is_active", True):
                    urls = tour_data.get("source_urls", {})
                    if urls.get("primary"):
                        targets.append({"name": tour_data.get("tour_name", tour_id), "url": urls["primary"]})
    except Exception:
        pass
        
    # Deduplicate targets by url to prevent spam
    seen_urls = set()
    unique_targets = []
    for t in targets:
        if t["url"] not in seen_urls:
            unique_targets.append(t)
            seen_urls.add(t["url"])

    for target in unique_targets[:5]: # Let's run a batch of top 5 for the test
        await scrape_source(target["url"], target["name"], batch_id)
        await asyncio.sleep(2) # rate limit

if __name__ == "__main__":
    asyncio.run(main())
