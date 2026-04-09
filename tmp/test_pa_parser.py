import json
import re
from scrapling.fetchers import Fetcher

url = 'https://www.pokeratlas.com/poker-tournament-series/rgps-passport-season-eastern-pa-hollywood-penn-natl-grantville-2026'

page = Fetcher.get(url, stealthy_headers=True)
html = page.body.decode('utf-8', errors='ignore')

m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.DOTALL)
if m:
    data = json.loads(m.group(1))
    props = data.get('props', {}).get('pageProps', {})
    print("Keys in pageProps:", props.keys())
    
    if 'series' in props:
        print("Keys in series:", props['series'].keys())
    if 'tournaments' in props:
        print(f"Tournaments: {len(props['tournaments'])}")
        if props['tournaments']:
            print("Tournament keys (first):", props['tournaments'][0].keys())
else:
    print("No next data found")
