from scrapling.fetchers import Fetcher
import json
resp = Fetcher.get("https://www.pokeratlas.com/poker-room/lucky-lodge-card-house-bryan/tournaments", stealthy_headers=True)
if resp.status == 200:
    for line in resp.text.split('\n'):
        if 'application/ld+json' in line:
            print("Found JSON-LD!")
        if 'buy-in' in line.lower() or 'guarantee' in line.lower() or '<table' in line:
            print(line.strip()[:100])
