#!/usr/bin/env python3
"""
Verify questionable buy-in amounts for specific venues.
Uses Scrapling+Camoufox to bypass Cloudflare.
"""
import sys, time, hashlib, json
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

def network_ok():
    try:
        import urllib.request
        urllib.request.urlopen('https://www.google.com', timeout=5)
        return True
    except:
        return False

VENUES_TO_CHECK = [
    {
        "name": "Deadwood Mountain Grand",
        "urls": [
            "https://www.pokeratlas.com/poker-room/deadwood-mountain-grand-deadwood/tournaments",
            "https://deadwoodmountaingrand.com/entertainment/poker",
            "https://www.bravopokerlive.com/poker-rooms/deadwood-mountain-grand/"
        ],
        "check_buyin": [202, 50, 100, 150, 200, 300, 500]
    },
    {
        "name": "Oxford Downs Poker Room",
        "urls": [
            "https://www.pokeratlas.com/poker-room/oxford-downs-summerfield/tournaments",
            "https://www.bravopokerlive.com/poker-rooms/oxford-downs/"
        ],
        "check_buyin": [599, 100, 200, 300]
    },
    {
        "name": "Santa Fe Station",
        "urls": [
            "https://www.pokeratlas.com/poker-room/santa-fe-station-las-vegas/tournaments",
            "https://www.stationcasinos.com/santa-fe/poker/"
        ],
        "check_buyin": [599, 125, 250]
    },
    {
        "name": "Card House Port St. Lucie",
        "urls": [
            "https://www.pokeratlas.com/poker-room/card-house-port-st-lucie/tournaments",
            "https://www.bravopokerlive.com/poker-rooms/card-house-port-st-lucie/"
        ],
        "check_buyin": [599, 100, 200]
    }
]

def main():
    if not network_ok():
        print("❌ Network not available")
        return

    try:
        from scrapling.fetchers import StealthySession
    except ImportError:
        print("❌ Scrapling not installed. Run: source .venv/bin/activate")
        return

    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    print("✅ StealthySession started\n")

    results = {}

    for venue in VENUES_TO_CHECK:
        name = venue["name"]
        print(f"=== Checking: {name} ===")
        html = None
        used_url = None

        for url in venue["urls"]:
            for attempt in range(2):
                try:
                    print(f"  Fetching: {url}")
                    resp = session.fetch(url, google_search=True, timeout=45000)
                    if resp and resp.status == 200:
                        body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
                        html = body.decode("utf-8", "ignore")
                        used_url = url
                        print(f"  ✅ Got {len(html)} chars")
                        break
                    else:
                        print(f"  HTTP {getattr(resp, 'status', '?')}")
                except Exception as e:
                    print(f"  ERR: {str(e)[:80]}")
                    if attempt == 0:
                        time.sleep(2)
                        # restart session on error
                        try:
                            session.close()
                            session = StealthySession(headless=True, solve_cloudflare=True)
                            session.start()
                        except:
                            pass
            if html:
                break

        if not html:
            print(f"  ❌ Could not fetch any URL for {name}\n")
            results[name] = {"error": "Could not fetch", "urls_tried": venue["urls"]}
            continue

        # Save evidence
        html_hash = hashlib.sha256(html.encode("utf-8", "ignore")).hexdigest()
        ev = {
            "venue": name,
            "scrape_url": used_url,
            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
            "scrape_html_hash": html_hash,
            "scrape_byte_count": len(html),
        }
        ev_path = EVIDENCE_DIR / f"buyin_verify_{name.replace(' ','_')}_{int(time.time())}.json"
        with open(ev_path, "w") as f:
            json.dump(ev, f, indent=2)

        # Extract all dollar amounts from the page
        import re
        dollar_amounts = []
        for m in re.finditer(r'\$(\d{1,5}(?:,\d{3})?)', html):
            amt = int(m.group(1).replace(',', ''))
            if 15 <= amt <= 50000:
                dollar_amounts.append(amt)

        # Also look for time patterns
        time_patterns = re.findall(r'\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)', html)

        # Count occurrences of specific amounts
        amount_counts = {}
        for amt in set(dollar_amounts):
            count = dollar_amounts.count(amt)
            if count >= 1:
                amount_counts[amt] = count

        print(f"  Buy-in amounts found on page: {sorted(set(dollar_amounts))[:30]}")
        print(f"  Check targets: {venue['check_buyin']}")
        for buyin in venue["check_buyin"]:
            found = amount_counts.get(buyin, 0)
            status = "✅ CONFIRMED" if found > 0 else "❌ NOT FOUND"
            print(f"    ${buyin}: {status} (appears {found}x)")

        results[name] = {
            "url": used_url,
            "html_hash": html_hash,
            "all_buyins_found": sorted(set(dollar_amounts)),
            "check_results": {
                str(b): amount_counts.get(b, 0) > 0 
                for b in venue["check_buyin"]
            },
            "sample_times": time_patterns[:10]
        }
        print()

    session.close()
    
    # Final summary
    print("\n=== VERIFICATION SUMMARY ===")
    for name, result in results.items():
        if "error" in result:
            print(f"{name}: ❌ {result['error']}")
        else:
            checks = result.get("check_results", {})
            confirmed = [f"${k}" for k,v in checks.items() if v]
            not_found = [f"${k}" for k,v in checks.items() if not v]
            print(f"{name}:")
            if confirmed:
                print(f"  ✅ REAL: {', '.join(confirmed)}")
            if not_found:
                print(f"  ❌ NOT FOUND: {', '.join(not_found)}")

    # Save full results
    out = PROJECT_ROOT / "tmp" / "buyin_verification_results.json"
    out.parent.mkdir(exist_ok=True)
    with open(out, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {out}")

if __name__ == "__main__":
    main()
