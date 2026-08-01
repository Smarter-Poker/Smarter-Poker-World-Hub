#!/usr/bin/env python3
"""
ENRICH VENUE LOGOS Pipeline
Scans the database and injects high-res logo_urls utilizing Google's Favicon Resolver
for any venue possessing a verified website domain but missing a logo.
"""
import urllib.request, json, collections, math, re, time

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def get_venues():
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/poker_venues?select=id,name,website,logo_url',
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
    )
    venues = json.loads(urllib.request.urlopen(req).read().decode())
    return [v for v in venues if v.get('website') and not v.get('logo_url')]

def update_logo(venue_id, logo_url):
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{venue_id}',
        data=json.dumps({'logo_url': logo_url}).encode(),
        method='PATCH',
        headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Content-Type': 'application/json'}
    )
    urllib.request.urlopen(req)

def main():
    venues = get_venues()
    print(f"Found {len(venues)} venues with a website but NO logo_url.")
    
    success = 0
    for i, v in enumerate(venues):
        website = v.get('website', '')
        # Extract base domain
        match = re.search(r'https?://(?:www\.)?([^/]+)', website)
        if not match:
            continue
            
        domain = match.group(1)
        logo_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=256"
        
        try:
            update_logo(v['id'], logo_url)
            success += 1
            if success % 50 == 0:
                print(f"  ... enriched {success} logos ...")
        except Exception as e:
            print(f"Failed to update {v['name']}: {e}")
            
        # Small delay to respect API limits if needed, though Supabase is doing fine
        time.sleep(0.01)

    print(f"✅ Logo Pipeline Complete: Injected {success} high-res logos.")

if __name__ == '__main__':
    main()
