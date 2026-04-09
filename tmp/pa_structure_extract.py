"""Extract the blind structure table from PokerAtlas detail page."""
import re

with open('/tmp/pa_detail.html') as f:
    html = f.read()

# The structure table uses specific CSS classes. Let me look for table/tbody with blind levels
# Find all table rows that contain level numbers and blind values  
# Pattern: <tr><td>Level N</td><td>X</td><td>Y</td><td>Z</td></tr>
table_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL|re.I)
level_rows = []
for row in table_rows:
    cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL|re.I)
    clean_cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
    if any('Level' in c for c in clean_cells):
        level_rows.append(clean_cells)

print(f"=== LEVEL ROWS: {len(level_rows)} ===")
for r in level_rows[:10]:
    print(f"  {r}")

# Also look for JSON data in scripts that might have structure details
json_blocks = re.findall(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL|re.I)
print(f"\n=== JSON-LD BLOCKS: {len(json_blocks)} ===")
for j in json_blocks:
    try:
        data = __import__('json').loads(j)
        print(f"  Type: {data.get('@type')}")
        # Print all keys
        for k, v in data.items():
            if k != '@context':
                print(f"    {k}: {str(v)[:100]}")
    except:
        print(f"  (parse error)")

# Find the payout section more precisely
# Look for "Place" header followed by payout rows
payout_section = re.search(r'Place.*?Payout(.*?)(?:</table|</tbody|class=")', html, re.DOTALL|re.I)
if payout_section:
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', payout_section.group(1), re.DOTALL|re.I)
    print(f"\n=== PAYOUT ROWS: {len(rows)} ===")
    for r in rows[:8]:
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.DOTALL|re.I)]
        if cells:
            print(f"  {cells}")

# Find "Late Reg" value
late_reg = re.search(r'Late\s*Reg(?:istration)?[:\s]*(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)', html, re.I)
if late_reg:
    print(f"\n=== LATE REG: {late_reg.group(1)} ===")

