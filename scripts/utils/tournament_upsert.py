"""
TOURNAMENT UPSERT UTILITY — REST API Only (Trigger-Safe)
=========================================================
Inserts/updates venue_daily_tournaments via PostgREST.
Ensures all provenance fields are present (Layer 4 enforcement).

NEVER use exec_sql RPC — triggers only fire via REST API.
"""

import json
import urllib.request
import urllib.error
import urllib.parse


# ── SUPPRESSION HELPERS ─────────────────────────────────────────────────────

# In-process cache: {venue_id: True/False} so we don't re-check the same venue
# repeatedly during a single scraper run.
_SUPPRESSION_CACHE: dict = {}

def is_venue_suppressed(supabase_url: str, service_key: str, venue_id: int) -> bool:
    """
    Returns True if the venue has is_suppressed=true OR is_active=false.
    Results are cached per process run to avoid N+1 DB calls.
    """
    if venue_id in _SUPPRESSION_CACHE:
        return _SUPPRESSION_CACHE[venue_id]

    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
    }
    url = f"{supabase_url}/rest/v1/poker_venues?id=eq.{venue_id}&select=id,is_suppressed,is_active"
    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req, timeout=10)
        rows = json.loads(resp.read().decode())
        if rows:
            suppressed = rows[0].get('is_suppressed', False) or not rows[0].get('is_active', True)
            _SUPPRESSION_CACHE[venue_id] = suppressed
            return suppressed
    except Exception:
        pass
    _SUPPRESSION_CACHE[venue_id] = False
    return False

# ── MAIN UPSERT ─────────────────────────────────────────────────────────────

def upsert_tournament_python(supabase_url, service_key, tournament):
    """
    Insert or update a venue_daily_tournaments record via REST API.

    Required fields:
        - venue_id (int)
        - day_of_week (str: monday, tuesday, ..., sunday)
        - start_time (str: e.g. '7:00 PM')
        - data_quality (str: 'scraped_verified')
        - scrape_html_hash (str: SHA-256 of source HTML)
        - scrape_timestamp (str: ISO 8601 UTC)

    Returns: 'inserted', 'updated', 'skipped', 'suppressed', or 'error'
    """
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }

    venue_id = tournament.get('venue_id')
    day = tournament.get('day_of_week', '').lower()
    start_time = tournament.get('start_time', '')

    if not venue_id or not day:
        print(f"  ⚠️  Missing venue_id or day_of_week — skipped")
        return "error"

    # ── SUPPRESSION GUARD ────────────────────────────────────────────────────
    if is_venue_suppressed(supabase_url, service_key, venue_id):
        print(f"  🚫 SUPPRESSED — skipping tournament for venue_id={venue_id} ({day} {start_time})")
        return "suppressed"
    # ─────────────────────────────────────────────────────────────────────────

    # Mandatory provenance check (Layer 4)
    if not tournament.get('scrape_html_hash') or not tournament.get('scrape_timestamp'):
        print(f"  🚨 REJECTED: Missing provenance (scrape_html_hash or scrape_timestamp)")
        return "error"

    # 1. Check for existing record (venue_id + day_of_week + start_time)
    filters = f"venue_id=eq.{venue_id}&day_of_week=eq.{urllib.parse.quote(day)}"
    if start_time:
        filters += f"&start_time=eq.{urllib.parse.quote(start_time)}"

    search_url = f"{supabase_url}/rest/v1/venue_daily_tournaments?{filters}&select=id,venue_id,day_of_week,start_time"

    try:
        req = urllib.request.Request(search_url, headers=headers)
        resp = urllib.request.urlopen(req)
        existing = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        err_body = ''
        try:
            err_body = e.read().decode()
        except:
            pass
        print(f"  ❌ Search failed ({e.code}): {err_body[:200]}")
        return "error"
    except Exception as e:
        print(f"  ❌ Search error: {e}")
        existing = []

    # Clean out None/empty values — never pass is_suppressed from scrapers
    clean = {k: v for k, v in tournament.items() if v is not None and v != ''}
    clean.pop('is_suppressed', None)  # scrapers cannot set this field

    # Force required fields
    clean.setdefault('is_active', True)
    clean.setdefault('data_quality', 'scraped_verified')

    if len(existing) > 0:
        # Update existing record
        target = existing[0]
        update_url = f"{supabase_url}/rest/v1/venue_daily_tournaments?id=eq.{target['id']}"
        try:
            body = json.dumps(clean).encode()
            req = urllib.request.Request(update_url, data=body, method='PATCH', headers=headers)
            urllib.request.urlopen(req)
            print(f"  🔄 Updated tournament (ID: {target['id']}): {day} {start_time}")
            return "updated"
        except urllib.error.HTTPError as e:
            err_body = ''
            try:
                err_body = e.read().decode()
            except:
                pass
            print(f"  ❌ Update failed ({e.code}): {err_body[:300]}")
            return "error"
    else:
        # Insert new record
        insert_url = f"{supabase_url}/rest/v1/venue_daily_tournaments"
        try:
            body = json.dumps(clean).encode()
            req = urllib.request.Request(insert_url, data=body, method='POST', headers=headers)
            urllib.request.urlopen(req)
            name = clean.get('tournament_name', f"{day} {start_time}")
            print(f"  ✅ Inserted tournament: {name} ({day})")
            return "inserted"
        except urllib.error.HTTPError as e:
            err_body = ''
            try:
                err_body = e.read().decode()
            except:
                pass
            if '23505' in err_body or 'duplicate' in err_body.lower():
                print(f"  ⏭️  Duplicate: {day} {start_time}")
                return "skipped"
            else:
                print(f"  ❌ Insert failed ({e.code}): {err_body[:300]}")
                return "error"


def lookup_venue_id(supabase_url, service_key, venue_name, venue_state=None):
    """
    Find a poker_venues record by name (ilike) to get the venue_id FK.
    Returns int venue_id or None.
    Automatically returns None for suppressed / inactive venues.
    """
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
    }

    encoded_name = urllib.parse.quote(f"%{venue_name}%")
    url = f"{supabase_url}/rest/v1/poker_venues?name=ilike.{encoded_name}&select=id,name,state,is_suppressed,is_active&limit=5"
    if venue_state:
        url += f"&state=ilike.{urllib.parse.quote(venue_state)}"

    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req)
        results = json.loads(resp.read().decode())
        if results:
            # Filter out suppressed / inactive venues before returning an ID
            active_results = [
                r for r in results
                if not r.get('is_suppressed') and r.get('is_active', True)
            ]
            if not active_results:
                print(f"  🚫 All matches for '{venue_name}' are suppressed or inactive — skipping.")
                return None
            # Prefer exact name match, else first active result
            for r in active_results:
                if r['name'].lower() == venue_name.lower():
                    return r['id']
            return active_results[0]['id']
    except Exception as e:
        print(f"  ⚠️  Venue lookup failed for '{venue_name}': {e}")

    return None
