import urllib.request, json, collections, math

SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co'
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

def haversine(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2): return float('inf')
    R = 6371 # km
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def normalize(n):
    return ''.join(c.lower() for c in (n or '') if c.isalnum())

req = urllib.request.Request(
    f'{SUPABASE_URL}/rest/v1/poker_venues?select=*',
    headers={'apikey': KEY, 'Authorization': f'Bearer {KEY}'}
)
venues = json.loads(urllib.request.urlopen(req).read().decode())
print(f'Total venues: {len(venues)}')

# Group by normalized State to limit search space
by_state = collections.defaultdict(list)
for v in venues:
    state = v.get('state') or 'UNKNOWN'
    by_state[state].append(v)

to_delete = set()
for state, state_venues in by_state.items():
    for i in range(len(state_venues)):
        for j in range(i+1, len(state_venues)):
            v1 = state_venues[i]
            v2 = state_venues[j]
            
            # Check name similarity (first 8 chars must be same at least, or distance < 2km)
            n1 = normalize(v1.get('name'))
            n2 = normalize(v2.get('name'))
            
            if not n1 or not n2: continue
            
            names_match = (n1 in n2) or (n2 in n1) or (n1[:8] == n2[:8])
            dist = haversine(v1.get('latitude'), v1.get('longitude'), v2.get('latitude'), v2.get('longitude'))
            
            # Additional check: if same name but dist is inf (missing coords) or different city -> check exact string address
            address_match = False
            a1 = normalize(v1.get('address'))
            a2 = normalize(v2.get('address'))
            if a1 and a2 and a1 == a2:
                address_match = True
                
            if (names_match and dist < 10) or (names_match and address_match):
                # We have a duplicate!
                id1, id2 = v1['id'], v2['id']
                if id1 in to_delete or id2 in to_delete: continue
                
                # Winner selection logic:
                # 1. pokeratlas > pending
                # 2. has slug > no slug
                score1 = (v1.get('scrape_source') == 'pokeratlas') * 10 + bool(v1.get('slug')) * 5
                score2 = (v2.get('scrape_source') == 'pokeratlas') * 10 + bool(v2.get('slug')) * 5
                
                if score1 == score2:
                    score1 += (v1.get('data_quality') == 'scraped_verified') * 2
                    score2 += (v2.get('data_quality') == 'scraped_verified') * 2
                
                if score1 >= score2:
                    winner = v1; loser = v2
                else:
                    winner = v2; loser = v1
                    
                print(f"DUPE FOUND: '{winner['name']}' [{winner['id']}] (WINNER) vs '{loser['name']}' [{loser['id']}] (LOSER)")
                print(f"  Winner src: {winner.get('scrape_source')} | Loser src: {loser.get('scrape_source')} | Dist: {dist:.1f}km")
                to_delete.add(loser['id'])

print(f'\nTotal to delete: {len(to_delete)}')
with open('/tmp/dupes_to_delete.json', 'w') as f:
    json.dump(list(to_delete), f)
