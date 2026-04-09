"""Fetch one PokerAtlas tournament detail page to map rich field locations."""
import re, json, sys
sys.path.insert(0, '.')
from scrapling.fetchers import StealthySession

session = StealthySession(headless=True, solve_cloudflare=True)
session.start()

detail_url = "https://www.pokeratlas.com/poker-tournament/thunder-valley-lincoln-150-530pm-nl-holdem-150-nlh-stacked-unlimited-poker-tournament-0f426463-6b7f-4128-848c-e2285ae305b9?topid=271201-2026-04-08"
resp = session.fetch(detail_url, timeout=25000, wait_until="domcontentloaded")
html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')

print(f"HTML length: {len(html)}")

# Check for rich fields in the HTML
for pattern, label in [
    (r'(?:starting.?stack|chips)[:\s]*([0-9,]+)', 'starting_stack'),
    (r'(?:level.?duration|minutes?.?per.?level)[:\s]*(\d+)', 'level_duration'),
    (r'(?:guaranteed|gtd|guarantee)[^$]*\$?([0-9,]+)', 'guaranteed'),
    (r'(?:late.?reg(?:istration)?)[:\s]*([^\n<]{3,50})', 'late_registration'),
    (r'(?:re.?buy|add.?on)[:\s$]*([^\n<]{3,50})', 'rebuy_addon'),
    (r'(?:bounty|bounties)[:\s$]*\$?([0-9,]+)', 'bounty'),
    (r'(?:max.?entr|field.?cap|cap)[:\s]*(\d+)', 'max_entries'),
    (r'(?:structure|blind)', 'structure_mention'),
    (r'(?:payout|pays|paid)', 'payout_mention'),
]:
    found = re.findall(pattern, html, re.I)
    if found:
        print(f"  ✅ {label}: {found[:3]}")
    else:
        print(f"  ❌ {label}: NOT FOUND")

# Look for structured sections
sections = re.findall(r'class="([^"]*(?:detail|info|structure|tournament|schedule|spec)[^"]*)"', html, re.I)
print(f"\nStructured sections: {sections[:10]}")

# Extract text blocks near "structure" or "starting"
text = re.sub(r'<[^>]+>', ' ', html)
text = re.sub(r'\s+', ' ', text)

# Find sections around key terms
for term in ['starting stack', 'starting chips', 'blind level', 'guaranteed', 'late reg', 'rebuy', 'bounty', 'payout']:
    idx = text.lower().find(term)
    if idx >= 0:
        snippet = text[max(0,idx-40):idx+80].strip()
        print(f"\n  📍 '{term}' context: ...{snippet}...")

# Save full HTML for inspection
with open('/tmp/pa_detail.html', 'w') as f:
    f.write(html)
print(f"\nFull HTML saved to /tmp/pa_detail.html")

session.close()
