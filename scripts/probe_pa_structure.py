#!/usr/bin/env python3
"""Quick probe: fetch one PokerAtlas page via StealthySession and inspect structure."""
import re, json, sys
sys.path.insert(0, '.')

from scrapling.fetchers import StealthySession

url = "https://www.pokeratlas.com/poker-room/aggieland-poker-club-college-station/tournaments"
print(f"Fetching: {url}")

s = StealthySession(headless=True, solve_cloudflare=True)
s.start()

try:
    resp = s.fetch(url, timeout=30000, wait_until="networkidle")
    print(f"Status: {resp.status}")
    body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
    html = body.decode("utf-8", "ignore")
    print(f"HTML length: {len(html)}")

    # Check for __NEXT_DATA__
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if m:
        print(f"\n✅ __NEXT_DATA__ found! JSON length: {len(m.group(1))}")
        try:
            nd = json.loads(m.group(1))
            # Find all keys recursively
            def find_keys(obj, depth=0, path=""):
                if depth > 6: return
                if isinstance(obj, dict):
                    for k, v in obj.items():
                        if k in ("buyIn","startTime","scheduledDays","tournaments","schedule"):
                            print(f"  KEY FOUND: {path}.{k} = {str(v)[:100]}")
                        find_keys(v, depth+1, f"{path}.{k}")
                elif isinstance(obj, list) and obj:
                    find_keys(obj[0], depth+1, f"{path}[0]")
            find_keys(nd)
            # Print top-level keys
            print(f"\nTop-level keys: {list(nd.keys())[:10]}")
            if "props" in nd:
                print(f"props keys: {list(nd['props'].keys())[:10]}")
                if "pageProps" in nd["props"]:
                    pp = nd["props"]["pageProps"]
                    print(f"pageProps keys: {list(pp.keys())[:15]}")
        except Exception as e:
            print(f"JSON parse error: {e}")
            print(f"Preview: {m.group(1)[:500]}")
    else:
        print("\n❌ No __NEXT_DATA__ found")
        # Check for any JSON with tournament data
        matches = re.findall(r'"buyIn":\s*\d+', html)
        print(f"buyIn mentions: {len(matches)}, first: {matches[:3]}")
        matches2 = re.findall(r'"startTime"[^,]{0,50}', html)
        print(f"startTime mentions: {len(matches2)}, first: {matches2[:3]}")
        # Show first 1000 chars of HTML
        print(f"\nHTML preview:\n{html[:1000]}")
finally:
    try: s.close()
    except: pass
