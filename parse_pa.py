from scrapling.fetchers import StealthySession
import re

session = StealthySession(headless=True, solve_cloudflare=True)
session.start()
resp = session.fetch("https://www.pokeratlas.com/poker-room/lucky-lodge-card-house-bryan/tournaments", wait_until='domcontentloaded')
html = resp.body.decode('utf-8', errors='ignore')

# Print the visible text where buyin or $ is mentioned
text = re.sub(r'<[^>]+>', ' ', html)
text = re.sub(r'\s+', ' ', text)

for chunk in text.split('Buy-in'):
    print("CHUNK:", chunk[:300])

