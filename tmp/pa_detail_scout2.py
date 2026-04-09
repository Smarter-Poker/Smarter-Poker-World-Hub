"""Scout PokerAtlas tournament detail page structure."""
import re, json, sys
sys.path.insert(0, '.')
from scrapling.fetchers import StealthySession

session = StealthySession(headless=True, solve_cloudflare=True)
session.start()

# Fetch WITHOUT networkidle to preserve __NEXT_DATA__
url = "https://www.pokeratlas.com/poker-room/thunder-valley-lincoln/tournaments"
resp = session.fetch(url, timeout=25000, wait_until="domcontentloaded")
html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')

# Extract __NEXT_DATA__ 
m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
if not m:
    m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
if not m:
    print("No __NEXT_DATA__ found either way")
    # Check HTML length
    print(f"HTML length: {len(html)}")
    print(f"Has tournament keyword: {'tournament' in html.lower()}")
    # Try to find detail urls directly from HTML
    detail_urls = re.findall(r'href="(/poker-tournament/[^"]+)"', html)
    print(f"Detail URLs: {len(detail_urls)}")
    for u in detail_urls[:5]:
        print(f"  {u}")
    
    # Also check the raw response body
    body = resp.body if hasattr(resp, 'body') and resp.body else b''
    if body:
        body_str = body.decode('utf-8', 'ignore')
        m2 = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', body_str, re.DOTALL)
        if m2:
            print("Found in raw body!")
            nd = json.loads(m2.group(1))
            # Find tournament objects
            def show_tourney(obj, path="", depth=0):
                if depth > 8: return
                if isinstance(obj, dict):
                    if obj.get("buyIn") or obj.get("startTime"):
                        print(f"\n=== TOURNAMENT at {path} ===")
                        for k, v in sorted(obj.items()):
                            print(f"  {k}: {str(v)[:80]}")
                        return  # Just show first one
                    for k, v in obj.items():
                        show_tourney(v, f"{path}.{k}", depth+1)
                elif isinstance(obj, list):
                    for i, item in enumerate(obj[:3]):
                        show_tourney(item, f"{path}[{i}]", depth+1)
            show_tourney(nd)
else:
    print("Found __NEXT_DATA__!")
    nd = json.loads(m.group(1))
    def show_tourney(obj, path="", depth=0):
        if depth > 8: return
        if isinstance(obj, dict):
            if obj.get("buyIn") or obj.get("startTime"):
                print(f"\n=== TOURNAMENT at {path} ===")
                for k, v in sorted(obj.items()):
                    print(f"  {k}: {str(v)[:120]}")
                return
            for k, v in obj.items():
                show_tourney(v, f"{path}.{k}", depth+1)
        elif isinstance(obj, list):
            for i, item in enumerate(obj[:3]):
                show_tourney(item, f"{path}[{i}]", depth+1)
    show_tourney(nd)

# Also try to find detail links in the HTML
detail_links = re.findall(r'href="(/poker-tournament/[^"]+)"', html)
if detail_links:
    print(f"\n=== FOUND {len(detail_links)} detail links ===")
    for l in detail_links[:3]:
        print(f"  {l}")

session.close()
