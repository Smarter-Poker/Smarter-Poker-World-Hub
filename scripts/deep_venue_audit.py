import urllib.request, json, collections, math, re

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

req = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/poker_venues?select=*',
    headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}', 'Prefer': 'count=exact'}
)

try:
    resp = urllib.request.urlopen(req)
    venues = json.loads(resp.read().decode())
except Exception as e:
    print(f"Failed to fetch data: {e}")
    exit(1)

total = len(venues)
print(f"==================================================")
print(f"🚀 DEEP DATA INTEGRITY AUDIT: {total} RECORDS")
print(f"==================================================\n")

# --- 1. DATA COMPLETENESS METRICS ---
missing_metrics = collections.defaultdict(int)
sources = collections.defaultdict(int)
qualities = collections.defaultdict(int)

for v in venues:
    if not v.get('address'): missing_metrics['address'] += 1
    if not v.get('phone'): missing_metrics['phone'] += 1
    if not v.get('website'): missing_metrics['website'] += 1
    if not v.get('logo_url'): missing_metrics['logo_url'] += 1
    if not v.get('scrape_html_hash'): missing_metrics['scrape_html_hash'] += 1
    if not v.get('latitude') or not v.get('longitude'): missing_metrics['coordinates'] += 1

    sources[v.get('scrape_source')] += 1
    qualities[v.get('data_quality')] += 1

print("--- 📊 COMPLETENESS METRICS ---")
print(f"✅ Venues WITH Phone: {total - missing_metrics['phone']} ({(total - missing_metrics['phone'])/total*100:.1f}%)")
print(f"✅ Venues WITH Address: {total - missing_metrics['address']} ({(total - missing_metrics['address'])/total*100:.1f}%)")
print(f"✅ Venues WITH Coordinates: {total - missing_metrics['coordinates']} ({(total - missing_metrics['coordinates'])/total*100:.1f}%)")
print(f"✅ Venues WITH Website: {total - missing_metrics['website']} ({(total - missing_metrics['website'])/total*100:.1f}%)")
print(f"✅ Venues WITH Logo URL: {total - missing_metrics['logo_url']} ({(total - missing_metrics['logo_url'])/total*100:.1f}%)")
print(f"✅ Venues WITH Cryptographic Hash (Proof of Scrape): {total - missing_metrics['scrape_html_hash']} ({(total - missing_metrics['scrape_html_hash'])/total*100:.1f}%)\n")

print("--- 🔍 SOURCE OF TRUTH BREAKDOWN ---")
for src, count in sorted(sources.items(), key=lambda item: item[1], reverse=True):
    print(f"  - {src or 'UNKNOWN'}: {count}")
print()
print("--- 🛡️ DATA QUALITY GATES ---")
for qual, count in sorted(qualities.items(), key=lambda item: item[1], reverse=True):
    print(f"  - {qual or 'UNKNOWN'}: {count}")
print()

# --- 2. DEEP DUPLICATION SCAN (Address / Coordinates / Fuzzy Name + City) ---
def haversine(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2): return float('inf')
    R = 6371 # km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def normalize(n): return ''.join(c.lower() for c in (n or '') if c.isalnum())

dupe_alerts = []
for i in range(len(venues)):
    for j in range(i+1, len(venues)):
        v1, v2 = venues[i], venues[j]
        
        # Exact Name + Exact State
        n1, n2 = normalize(v1.get('name')), normalize(v2.get('name'))
        msg = None
        
        if n1 and n2 and n1 == n2:
            if normalize(v1.get('state')) == normalize(v2.get('state')):
                msg = "EXACT NAME + STATE MATCH"
        
        # Extremely close coordinates (under 200 meters)
        if not msg:
            dist = haversine(v1.get('latitude'), v1.get('longitude'), v2.get('latitude'), v2.get('longitude'))
            if dist < 0.2:
                # Require name similarity if coords match (they could be separate venues in same giant casino complex, though rare)
                if (n1[:6] == n2[:6]) or (n1 in n2) or (n2 in n1):
                    msg = f"OVERLAPPING COORDINATES ({dist*1000:.0f}m) + SIMILAR NAME"

        if msg:
            dupe_alerts.append(f"  🚨 {msg}: '{v1['name']}' [{str(v1['id'])[:5]}...] vs '{v2['name']}' [{str(v2['id'])[:5]}...]")

print(f"--- 👯 DEEP DUPLICATE SCAN ---")
if dupe_alerts:
    print(f"⚠️ FOUND {len(dupe_alerts)} POTENTIAL DUPLICATES:")
    for alert in dupe_alerts[:20]:
        print(alert)
else:
    print("✅ ZERO DUPLICATES FOUND across Names, States, and GPS Coordinates!")
print(f"==================================================")
