from scrapling.fetchers import StealthySession
session = StealthySession(headless=True, solve_cloudflare=True)
session.start()
resp = session.fetch("https://www.pokeratlas.com/poker-tournament-series/2026-spring-staycation-weekeend-talking-stick-resort-scottsdale-2026")
html = resp.body.decode()
print("Dates in HTML:")
import re
for m in re.finditer(r'.{0,30}2026.{0,30}', html[:30000]):
    print(m.group(0))
