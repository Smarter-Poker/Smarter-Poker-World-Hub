import urllib.request
import json
import ssl
from datetime import datetime, timezone
import hashlib

def fetch_json(url):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
    })
    try:
        resp = urllib.request.urlopen(req, context=ctx, timeout=15)
        raw_bytes = resp.read()
        return json.loads(raw_bytes.decode()), raw_bytes
    except Exception as e:
        print(f"  [ERROR] Native fetch failed for {url}: {e}")
        return None, None

def scrape_wsop_native(tour_code, base_prov):
    """
    Directly hits WSOP's native React JSON APIs to extract the full 365-day schedule.
    Bypasses text extraction entirely. Handles both WSOP and WSOPC.
    Returns: (events_list, updated_provenance, all_raw_bytes)
    """
    print(f"  [NATIVE API] Intercepting WSOP JSON API...")
    master_url = "https://www.wsop.com/api/tournaments?type=live-upcoming"
    stops, master_bytes = fetch_json(master_url)
    
    if not stops:
        return [], base_prov, b""
        
    events = []
    total_bytes = b""
    if master_bytes:
        total_bytes += master_bytes
        
    # WSOP specific string matches
    target_slug_keyword = "circuit" if tour_code == "WSOPC" else "wsop"

    # Filter stops for the specific tour
    matched_stops = []
    for stop in stops:
        title = stop.get('title', '').lower()
        slug = stop.get('slug', '').lower()
        
        if tour_code == "WSOPC":
            if "circuit" in title or "circuit" in slug:
                matched_stops.append(stop)
        elif tour_code == "WSOP":
            # Exclude circuit, WSOP Europe/Paradise might be separate but usually "wsop-20"
            if "circuit" not in title and "circuit" not in slug:
                matched_stops.append(stop)

    print(f"  [NATIVE API] Found {len(matched_stops)} stops for {tour_code} out of {len(stops)} total stops.")
    
    for stop in matched_stops:
        slug = stop.get('slug')
        venue_name = stop.get('venue', {}).get('title', 'Unknown Venue')
        city = stop.get('venue', {}).get('city', '')
        state = stop.get('venue', {}).get('state', '')
        
        stop_url = f"https://www.wsop.com/api/tournaments/{slug}"
        print(f"  [NATIVE API] Fetching schedule: {venue_name} ({slug})")
        
        schedule, schedule_bytes = fetch_json(stop_url)
        if not schedule or 'events' not in schedule:
            continue
            
        if schedule_bytes:
            total_bytes += schedule_bytes
            
        for ext in schedule['events']:
            raw_title = ext.get('title', '')
            
            # Infer game type from title
            t_lower = raw_title.lower()
            game = "NLH"
            if "omaha" in t_lower or "plo" in t_lower: game = "PLO"
            if "o8" in t_lower or "hi-lo" in t_lower: game = "O8"
            if "horse" in t_lower: game = "HORSE"
            if "mixed" in t_lower or "8-game" in t_lower: game = "Mixed"
            
            # Extract buy-in
            buy_in_raw = ext.get('buyin')
            buy_in = 0
            if buy_in_raw:
                try:
                    buy_in = int(float(str(buy_in_raw).replace(',','').replace('$','')))
                except:
                    pass

            # Some events don't have start_datetime, fallback to stop start
            start_dt = ext.get('start_datetime')
            
            event_doc = {
                "tour_code": tour_code,
                "stop_name": f"{tour_code} — {venue_name}",
                "stop_venue": venue_name,
                "stop_city": city,
                "stop_state": state,
                "stop_start_date": stop.get('start_date'),
                "stop_end_date": stop.get('end_date'),
                "event_number": ext.get('numbering', len(events)+1),
                "event_name": raw_title,
                "game_type": game,
                "buy_in": buy_in if buy_in > 0 else None,
                "is_main_event": "main event" in t_lower,
                "source_url": stop_url,
                **base_prov
            }
            # Remove prov keys to not override during creation, will be added in parent securely
            events.append(event_doc)

    print(f"  [NATIVE API] Successfully extracted {len(events)} events for {tour_code} natively.")
    
    # Update provenance with JSON hashes instead of HTML
    updated_prov = base_prov.copy()
    updated_prov["source_url"] = master_url
    updated_prov["scrape_http_status"] = 200
    updated_prov["scrape_script"] = __file__
    updated_prov["scrape_timestamp"] = datetime.now(timezone.utc).isoformat()
    updated_prov["scrape_byte_count"] = len(total_bytes)
    updated_prov["scrape_html_hash"] = hashlib.sha256(total_bytes).hexdigest()

    return events, updated_prov, total_bytes
