"""Extract rich fields from PokerAtlas tournament detail page."""
import re, json

with open('/tmp/pa_detail.html') as f:
    html = f.read()

text = re.sub(r'<[^>]+>', '\n', html)
text = re.sub(r'\n+', '\n', text)
text = re.sub(r'[ \t]+', ' ', text)

# Find the live-tournament-structure section
struct_match = re.search(r'class="live-tournament-structure"[^>]*>(.*?)</(?:section|div)', html, re.DOTALL|re.I)
if struct_match:
    struct_html = struct_match.group(1)
    struct_text = re.sub(r'<[^>]+>', ' ', struct_html)
    struct_text = re.sub(r'\s+', ' ', struct_text).strip()
    print(f"=== STRUCTURE SECTION ({len(struct_text)} chars) ===")
    print(struct_text[:500])

# Find the chip-count-modal section 
chip_match = re.search(r'class="[^"]*chip-count-modal[^"]*"[^>]*>(.*?)</(?:section|div)', html, re.DOTALL|re.I)
if chip_match:
    chip_text = re.sub(r'<[^>]+>', ' ', chip_match.group(1))
    chip_text = re.sub(r'\s+', ' ', chip_text).strip()
    print(f"\n=== CHIP COUNT MODAL ({len(chip_text)} chars) ===")
    print(chip_text[:500])

# Find the more-details section
details_match = re.search(r'class="more-details[^"]*"[^>]*>(.*?)</(?:section|div)', html, re.DOTALL|re.I)
if details_match:
    details_text = re.sub(r'<[^>]+>', ' ', details_match.group(1))
    details_text = re.sub(r'\s+', ' ', details_text).strip()
    print(f"\n=== MORE DETAILS ({len(details_text)} chars) ===")
    print(details_text[:500])

# Look for payout table
payout_match = re.search(r'(?:Place|Position)\s+Payout(.*?)(?:</table|</div)', html, re.DOTALL|re.I)
if payout_match:
    payout_text = re.sub(r'<[^>]+>', ' ', payout_match.group(1))
    payout_text = re.sub(r'\s+', ' ', payout_text).strip()
    print(f"\n=== PAYOUT TABLE ({len(payout_text)} chars) ===")
    print(payout_text[:300])

# Look for "Late Reg" specifically
for m in re.finditer(r'Late\s*Reg[:\s]*([^\n<]{1,40})', html, re.I):
    print(f"\n  Late Reg: {m.group(1).strip()}")

# Look for structure details 
for m in re.finditer(r'(?:Starting\s*(?:Stack|Chips))[:\s]*([0-9,]+)', html, re.I):
    print(f"  Starting Stack: {m.group(1)}")

# Look for level info
for m in re.finditer(r'(\d+)\s*[,-]\s*(?:minute|min)\s*(?:level|blind)', html, re.I):
    print(f"  Level Duration: {m.group(1)} min")

# Search for ANY number near structure keywords
for line in text.split('\n'):
    line = line.strip()
    if any(kw in line.lower() for kw in ['stack', 'chip', 'level', 'blind', 'reg', 'restr', 'unlimited', 'rebuy', 'add-on', 'addon', 'payout']):
        if len(line) > 3 and len(line) < 200:
            print(f"  📍 {line}")

