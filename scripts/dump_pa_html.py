#!/usr/bin/env python3
"""Dump raw PokerAtlas HTML sections for inspection."""
import re, sys
sys.path.insert(0, '.')

from scrapling.fetchers import StealthySession

url = "https://www.pokeratlas.com/poker-room/aggieland-poker-club-college-station/tournaments"
s = StealthySession(headless=True, solve_cloudflare=True)
s.start()

try:
    resp = s.fetch(url, timeout=30000, wait_until="networkidle")
    body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
    html = body.decode("utf-8", "ignore")
    
    # Save raw HTML
    with open("/tmp/pa_probe.html", "w") as f:
        f.write(html)
    print(f"Saved {len(html)} bytes to /tmp/pa_probe.html")
    
    # Search for tournament-related keywords in context
    for kw in ["tournament", "buy-in", "schedule", "$", "buyin", "buy_in", "Monday", "Tuesday"]:
        idxs = [m.start() for m in re.finditer(kw, html, re.I)][:3]
        for idx in idxs:
            snippet = html[max(0,idx-30):idx+80].replace("\n"," ")
            print(f"[{kw}] ...{snippet}...")

    # Print lines containing $ amounts
    lines_with_dollar = [l.strip() for l in html.split("\n") if "$" in l and len(l.strip()) < 300]
    print(f"\nLines with $ (first 20):")
    for l in lines_with_dollar[:20]:
        print(f"  {l[:150]}")
finally:
    try: s.close()
    except: pass
