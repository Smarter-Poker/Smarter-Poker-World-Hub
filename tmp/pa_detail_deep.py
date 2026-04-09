"""Deep-parse PokerAtlas detail page for blind structure table and payout info."""
import re, json

with open('/tmp/pa_detail.html') as f:
    html = f.read()

# Find the blind level table
# Pattern: Level N with Small Blind / Big Blind values
levels = re.findall(r'Level\s+(\d+).*?(\d[\d,]*)\s*/\s*(\d[\d,]*)', html, re.DOTALL)
print(f"=== BLIND LEVELS FOUND: {len(levels)} ===")
for l in levels[:5]:
    print(f"  Level {l[0]}: {l[1]}/{l[2]}")
if levels:
    print(f"  ... total {len(levels)} levels")

# Find starting chips from the structure  
# Look for chip-count containers
chips_match = re.findall(r'class="[^"]*chips[^"]*"[^>]*>\s*([^<]+)', html, re.I)
print(f"\n=== CHIP VALUES ===")
for c in chips_match[:10]:
    c = c.strip()
    if c and len(c) < 30:
        print(f"  {c}")

# Payout table
payout_rows = re.findall(r'(\d+)\w*\s*\$([0-9,]+)', html)
print(f"\n=== PAYOUT VALUES ===")
for p in payout_rows[:10]:
    print(f"  Place {p[0]}: ${p[1]}")

# Look for place/payout pattern from the text
text = re.sub(r'<[^>]+>', '\n', html)
for line in text.split('\n'):
    line = line.strip()
    if 'Place' in line and 'Payout' in line:
        print(f"\n  Payout header: {line}")
    if re.match(r'^\d+\w*\s+\$', line):
        print(f"  Payout row: {line}")

# Check for "Unlimited" or "Stacked" in tournament name (format hints)
format_hints = re.findall(r'(?:unlimited|stacked|bounty|freezeout|turbo|deep.?stack|satellite|mystery|progressive)', html, re.I)
if format_hints:
    print(f"\n=== FORMAT HINTS: {list(set(f.lower() for f in format_hints))} ===")

# Look specifically for the tournament info block that has Late Reg and other details
info_block = re.search(r'STACKED UNLIMITED.*?(?:Sign In|</section)', html, re.DOTALL|re.I)
if info_block:
    ib_text = re.sub(r'<[^>]+>', ' ', info_block.group())
    ib_text = re.sub(r'\s+', ' ', ib_text).strip()
    print(f"\n=== TOURNAMENT INFO BLOCK ===")
    print(ib_text[:400])

