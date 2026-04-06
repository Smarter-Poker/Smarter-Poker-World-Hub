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

    Returns: 'inserted', 'updated', 'skipped', or 'error'
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

    # Clean out None/empty values
    clean = {k: v for k, v in tournament.items() if v is not None and v != ''}

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
    """
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
    }

    encoded_name = urllib.parse.quote(f"%{venue_name}%")
    url = f"{supabase_url}/rest/v1/poker_venues?name=ilike.{encoded_name}&select=id,name,state&limit=5"
    if venue_state:
        url += f"&state=ilike.{urllib.parse.quote(venue_state)}"

    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req)
        results = json.loads(resp.read().decode())
        if results:
            # Prefer exact name match, else first result
            for r in results:
                if r['name'].lower() == venue_name.lower():
                    return r['id']
            return results[0]['id']
    except Exception as e:
        print(f"  ⚠️  Venue lookup failed for '{venue_name}': {e}")

    return None
