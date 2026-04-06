import json
import urllib.request
import urllib.error
import urllib.parse
import re

def get_base_name(name):
    # E.g. "ACES Charity Poker - Del Rio" -> "ACES Charity Poker"
    # Or "Lodge Poker Series" -> "Lodge Poker Series"
    name = name.split(' - ')[0]
    name = name.split(' — ')[0]
    # For Lodge, let's treat "Lodge Championship Series" and "Lodge Poker Series" as special casing,
    # or just use the first 2 words if it's Lodge something.
    if name.lower().startswith('lodge '):
        return 'Lodge'
    return name.strip()

def upsert_venue_python(supabase_url, service_key, venue):
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
    }
    
    venue_name = venue.get('name', '')
    base_name = get_base_name(venue_name)
    
    # 1. Search for existing venue by base name
    # We use ilike to find venues that start with the base name
    query_name = urllib.parse.quote(f"{base_name}%")
    search_url = f"{supabase_url}/rest/v1/poker_venues?name=ilike.{query_name}&select=id,name"
    
    try:
        req = urllib.request.Request(search_url, headers=headers)
        resp = urllib.request.urlopen(req)
        existing_venues = json.loads(resp.read().decode())
    except Exception as e:
        print(f"  ❌ Error searching for existing venue: {e}")
        existing_venues = []

    clean = {k: v for k, v in venue.items() if v is not None and v != ''}
    if 'is_active' in clean:
        clean['is_active'] = True

    if len(existing_venues) > 0:
        # Match found: Update the most recent or the first matching venue
        # Sort might be arbitrary here, we'll pick the first one since it's the oldest/primary typically.
        target_venue = existing_venues[0]
        update_url = f"{supabase_url}/rest/v1/poker_venues?id=eq.{target_venue['id']}"
        try:
            body = json.dumps(clean).encode()
            req = urllib.request.Request(update_url, data=body, method='PATCH', headers=headers)
            resp = urllib.request.urlopen(req)
            resp_data = resp.read().decode()
            print(f"  🔄 Updated existing venue (ID: {target_venue['id']}): {venue_name} at {venue.get('address', '')}")
            return "updated"
        except urllib.error.HTTPError as e:
            err_body = ''
            try:
                err_body = e.read().decode()
            except:
                pass
            print(f"  ❌ Failed to update ({e.code}): {venue_name} — {err_body[:300]}")
            return "error"
    else:
        # Insert new
        insert_url = f"{supabase_url}/rest/v1/poker_venues"
        try:
            body = json.dumps(clean).encode()
            req = urllib.request.Request(insert_url, data=body, method='POST', headers=headers)
            resp = urllib.request.urlopen(req)
            resp_data = resp.read().decode()
            print(f"  ✅ Inserted new venue: {venue_name} ({venue.get('city', '')}, {venue.get('state', '')})")
            return "inserted"
        except urllib.error.HTTPError as e:
            err_body = ''
            try:
                err_body = e.read().decode()
            except:
                pass
            if '23505' in err_body or 'duplicate' in err_body.lower():
                print(f"  ⏭️  Unique constraint duplicate: {venue_name}")
                return "skipped"
            else:
                print(f"  ❌ Failed to insert ({e.code}): {venue_name} — {err_body[:300]}")
                return "error"
