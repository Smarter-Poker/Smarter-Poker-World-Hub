#!/usr/bin/env python3
"""
TOUR LOGO DOWNLOADER — Direct URL sourcing for known poker tour brands
=====================================================================
Uses verified CDN/static URLs for major poker tour logos.
Falls back to favicon.ico when logo unavailable.

Usage:
  source .venv/bin/activate
  python3 scripts/download_tour_logos.py
"""

import hashlib
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOGO_DIR = PROJECT_ROOT / "public" / "images" / "tours"
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence"
LOGO_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

BATCH_ID = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

# ── Known logo URLs for each tour (manually verified CDN/social/favicon sources) ──
TOUR_LOGO_SOURCES = {
    "wsop": [
        "https://www.wsop.com/imgs/wsop-logo.png",
        "https://www.wsop.com/apple-touch-icon.png",
        "https://www.wsop.com/favicon.ico",
        "https://pbs.twimg.com/profile_images/1590024810505801728/Z-v3bG3A_400x400.jpg",  # Twitter @WSOP
    ],
    "wpt": [
        "https://www.worldpokertour.com/wp-content/themes/wpt/images/wpt-logo.png",
        "https://www.worldpokertour.com/apple-touch-icon.png",
        "https://pbs.twimg.com/profile_images/1746280785822519296/FfP7eEfO_400x400.jpg",  # Twitter @WPT
    ],
    "wsopc": [
        "https://www.wsop.com/imgs/wsop-logo.png",
        "https://www.wsop.com/apple-touch-icon.png",
    ],
    "mspt": [
        "https://msptpoker.com/wp-content/themes/mspt/images/mspt-logo.png",
        "https://msptpoker.com/apple-touch-icon.png",
        "https://pbs.twimg.com/profile_images/1408844523441496064/Ib-lqnF__400x400.jpg",  # Twitter @MSPTPoker
    ],
    "rgps": [
        "https://rungoodgear.com/wp-content/uploads/RunGood-Logo.png",
        "https://pbs.twimg.com/profile_images/1558891165431087104/Fy0s3zk4_400x400.jpg",  # Twitter @RunGoodPoker
    ],
    "pgt": [
        "https://www.pokergo.com/apple-touch-icon.png",
        "https://pbs.twimg.com/profile_images/1505222880324120577/Z3w4z28c_400x400.jpg",  # Twitter @PokerGO
    ],
    "triton": [
        "https://www.triton-series.com/wp-content/themes/triton/images/triton-logo.png",
        "https://pbs.twimg.com/profile_images/1487478899414523904/8RgAZ1-G_400x400.jpg",  # Twitter @triaborning
    ],
    "napt": [
        "https://www.pokerstarslive.com/apple-touch-icon.png",
        "https://pbs.twimg.com/profile_images/1463975168073691137/4kB6d8YT_400x400.jpg",  # Twitter @PokerStars
    ],
    "cppt": [
        "https://www.cardplayer.com/apple-touch-icon.png",
        "https://pbs.twimg.com/profile_images/829447218817695744/-R_AZVYg_400x400.jpg",  # Twitter @CardPlayerMedia
    ],
    "roughrider": [
        "https://roughriderpokertour.com/wp-content/uploads/roughrider-logo.png",
        "https://roughriderpokertour.com/apple-touch-icon.png",
    ],
    "bpo": [
        "https://barpokeropen.com/wp-content/themes/bpo/images/bpo-logo.png",
        "https://barpokeropen.com/apple-touch-icon.png",
        "https://pbs.twimg.com/profile_images/1503430453020299264/Vm0glXC8_400x400.jpg",  # Twitter @BarPokerOpen
    ],
    "fpn": [
        "https://freepokernetwork.com/apple-touch-icon.png",
        "https://freepokernetwork.com/favicon.ico",
    ],
    "lips": [
        "https://www.lipspoker.com/apple-touch-icon.png",
        "https://pbs.twimg.com/profile_images/697181098539610112/pVhlGIxI_400x400.jpg",  # Twitter @LIPSTour
    ],
    "card_player_cruises": [
        "https://www.cardplayercruises.com/apple-touch-icon.png",
        "https://www.cardplayercruises.com/favicon.ico",
    ],
    "hpt": [
        "https://www.hptpoker.com/apple-touch-icon.png",
    ],
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
}


def download_logo(tour_code, urls):
    """Try each URL in order until one succeeds."""
    for url in urls:
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            resp = urllib.request.urlopen(req, timeout=15)
            data = resp.read()

            if len(data) < 100:
                print(f"  ⚠ Too small ({len(data)} bytes): {url}")
                continue

            content_type = resp.headers.get("Content-Type", "")

            # Determine extension
            ext = ".png"
            if "jpeg" in content_type or "jpg" in content_type or url.endswith((".jpg", ".jpeg")):
                ext = ".jpg"
            elif "webp" in content_type or url.endswith(".webp"):
                ext = ".webp"
            elif "svg" in content_type or url.endswith(".svg"):
                ext = ".svg"
            elif url.endswith(".ico"):
                ext = ".png"  # Save ICO as png

            filename = f"{tour_code}{ext}"
            filepath = LOGO_DIR / filename
            filepath.write_bytes(data)

            sha = hashlib.sha256(data).hexdigest()
            print(f"  ✓ Downloaded: {filename} ({len(data):,} bytes) from {url[:60]}...")

            # Save evidence
            evidence = {
                "tour_code": tour_code.upper(),
                "source_url": url,
                "http_status": resp.status,
                "content_type": content_type,
                "bytes": len(data),
                "sha256": sha,
                "filename": filename,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "batch_id": BATCH_ID,
                "script": "scripts/download_tour_logos.py",
            }
            ev_path = EVIDENCE_DIR / f"logo_{tour_code}_{BATCH_ID}.json"
            ev_path.write_text(json.dumps(evidence, indent=2))

            return f"/images/tours/{filename}"

        except Exception as e:
            print(f"  ✗ Failed: {url[:60]}... ({e})")
            continue

    return None


def main():
    print("=" * 60)
    print("TOUR LOGO DOWNLOADER")
    print(f"Batch: {BATCH_ID}")
    print(f"Tours: {len(TOUR_LOGO_SOURCES)}")
    print("=" * 60)

    results = {}
    for code, urls in TOUR_LOGO_SOURCES.items():
        print(f"\n[{code.upper()}]")
        path = download_logo(code, urls)
        results[code] = path
        time.sleep(0.5)  # Rate limit

    print(f"\n{'=' * 60}")
    print("DOWNLOAD SUMMARY")
    print(f"{'=' * 60}")
    success = sum(1 for v in results.values() if v)
    print(f"Downloaded: {success}/{len(results)}")

    for code, path in results.items():
        emoji = "✓" if path else "✗"
        print(f"  {emoji} {code.upper().ljust(25)} {path or 'MISSING'}")

    # Save logo manifest
    manifest_path = LOGO_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(results, indent=2))
    print(f"\nManifest: {manifest_path}")

    return results


if __name__ == "__main__":
    main()
