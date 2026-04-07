from scrapling.fetchers import StealthySession
session = StealthySession(headless=True, solve_cloudflare=True)
session.start()
resp = session.fetch("https://www.pokeratlas.com/poker-room/lucky-lodge-card-house-bryan/tournaments")
body = resp.body.decode('utf-8')
print(body[ body.find('<table'):body.find('</table') + 8 ]) if '<table' in body else print(body[:2000])
