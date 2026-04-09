"""Scout PokerAtlas tournament detail page structure to understand rich field availability."""
import re, json, sys
sys.path.insert(0, '.')
from scrapling.fetchers import StealthySession

session = StealthySession(headless=True, solve_cloudflare=True)
session.start()

# Fetch the Thunder Valley tournament listing to find detail links
url = "https://www.pokeratlas.com/poker-room/thunder-valley-lincoln/tournaments"
resp = session.fetch(url, timeout=25000, wait_until="networkidle")
html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')

# Extract __NEXT_DATA__ 
m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
if not m:
    print("No __NEXT_DATA__ found")
    session.close()
    exit(1)

nd = json.loads(m.group(1))

def find_tournament_keys(obj, path="", depth=0):
    """Recursively find all keys that look tournament-related."""
    if depth > 8: return
    if isinstance(obj, dict):
        if obj.get("buyIn") or obj.get("buy_in"):
            print(f"\n=== TOURNAMENT OBJECT at {path} ===")
            for k, v in obj.items():
                val_preview = str(v)[:100] if v is not None else "null"
                print(f"  {k}: {val_preview}")
        for k, v in obj.items():
            find_tournament_keys(v, f"{path}.{k}", depth+1)
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            find_tournament_keys(item, f"{path}[{i}]", depth+1)

find_tournament_keys(nd)

# Also look for detail URLs / hrefs
detail_urls = re.findall(r'href="(/poker-tournament/[^"]+)"', html)
print(f"\n=== DETAIL URLs FOUND: {len(detail_urls)} ===")
for u in detail_urls[:5]:
    print(f"  {u}")

# If we found detail URLs, fetch one to see its structure
if detail_urls:
    detail_url = f"https://www.pokeratlas.com{detail_urls[0]}"
    print(f"\n=== FETCHING DETAIL PAGE: {detail_url} ===")
    resp2 = session.fetch(detail_url, timeout=25000, wait_until="networkidle")
    dhtml = resp2.html_content or (resp2.body.decode('utf-8','ignore') if getattr(resp2,'body',None) else '')
    m2 = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', dhtml, re.DOTALL)
    if m2:
        nd2 = json.loads(m2.group(1))
        print("\n=== DETAIL PAGE __NEXT_DATA__ KEYS ===")
        find_tournament_keys(nd2)
    else:
        # Check for structured data in the HTML
        print("No __NEXT_DATA__ on detail page. Checking HTML structure...")
        # Look for specific fields in the HTML
        for pattern, label in [
            (r'(?:starting.?stack|chips)[:\s]*([0-9,]+)', 'starting_stack'),
            (r'(?:level.?duration|minutes?.?per.?level)[:\s]*(\d+)', 'level_duration'),
            (r'(?:guaranteed|gtd)[^$]*\$?([0-9,]+)', 'guaranteed'),
            (r'(?:late.?reg)[:\s]*([^\n<]{3,50})', 'late_registration'),
            (r'(?:re.?buy|add.?on)[:\s$]*([^\n<]{3,50})', 'rebuy_addon'),
            (r'(?:bounty)[:\s$]*\$?([0-9,]+)', 'bounty'),
            (r'(?:max.?entr|cap)[:\s]*(\d+)', 'max_entries'),
        ]:
            found = re.findall(pattern, dhtml, re.I)
            if found:
                print(f"  {label}: {found[:3]}")
            else:
                print(f"  {label}: NOT FOUND")

session.close()
