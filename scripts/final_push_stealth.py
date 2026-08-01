#!/usr/bin/env python3
"""
final_push_stealth.py — StealthySession + Camoufox ONLY
========================================================
Targets the 31 remaining casino venues that block plain HTTP.
Uses StealthySession (OpenClaw + camoufox) to bypass Cloudflare.

PROVENANCE LAW:
  Every record written to DB includes:
    scrape_url         — exact URL that returned the data (re-scrapeable in future)
    scrape_source      — which strategy found it (website / pokeratlas / bravo)
    scrape_html_hash   — SHA-256 of raw response body
    scrape_timestamp   — UTC ISO timestamp
    last_scraped_at    — same timestamp (for freshness tracking)

Evidence files saved to: data/scrape-evidence/tournament-audit/
"""

import hashlib, json, re, sys, time, urllib.request, uuid
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT  = Path(__file__).resolve().parent.parent
EVIDENCE_DIR  = PROJECT_ROOT / "data" / "scrape-evidence" / "tournament-audit"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL  = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}
BATCH_ID = str(uuid.uuid4())

# ── Tournament keyword detector ──
TOURN_RE = re.compile(
    r'tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|'
    r'freeroll|freezeout|rebuy|deep.?stack|nightly poker|daily poker|'
    r'poker room schedule|holdem tournament|poker schedule|poker events|'
    r'weekly poker|monthly poker|poker series|sit.?n.?go|MTT|'
    r'guaranteed|prize pool|add-on|re-entry|satellite|poker tournament',
    re.IGNORECASE,
)

# ── Hardcoded venue list: 31 targets ──
# Each entry: (db_id, name, state, city, [urls_to_try_in_order], [pa_slug], [bravo_slug])
VENUES = [
    # ── CA ──
    (1929, "Artichoke Joe's Casino", "CA", "San Bruno",  ["https://www.artichokejoes.com/poker/tournaments", "https://www.artichokejoes.com/"], "artichoke-joes-casino-san-bruno", "artichoke-joes"),
    (1864, "Table Mountain Casino",  "CA", "Friant",     ["https://www.tablemountaincasino.com/play/poker"], "table-mountain-casino", "table-mountain-casino"),
    (2192, "Pechanga",               "CA", "Temecula",   ["http://www.pechanga.com/play/poker", "https://www.pechanga.com/play/poker/tournaments-events"], "pechanga-resort-casino", "pechanga"),
    (1857, "Casino M8trix",          "CA", "San Jose",   ["http://casinom8trix.com/poker/tournaments", "http://casinom8trix.com/"], "casino-m8trix", "casino-m8trix"),
    # ── DE ──
    (2496, "Delaware Park",    "DE", "Wilmington", ["http://www.delawarepark.com/poker/tournaments", "http://www.delawarepark.com/"], "delaware-park-racetrack-slots", "delaware-park"),
    (2498, "Harrington Raceway","DE","Harrington", ["https://www.harringtonraceway.com/casino/poker", "https://www.harringtonraceway.com"], "harrington-raceway-and-casino", "harrington-raceway"),
    # ── ID ──
    (2488, "Coeur d Alene Casino","ID","Worley",   ["http://cdacasino.com/gaming/poker.php", "https://cdacasino.com/gaming/poker"], "coeur-d-alene-casino-resort-hotel", "coeur-d-alene"),
    # ── IL ──
    (3096, "Wind Creek Chicago Southland","IL","East Hazel Crest",["https://windcreek.com/chicagosouthland/casino/poker/tournaments", "https://windcreek.com/chicagosouthland/casino/poker"], "wind-creek-chicago-southland", "wind-creek-chicago-southland"),
    (2314, "Hollywood Aurora",  "IL", "Aurora",    ["http://www.hollywoodcasinoaurora.com/Casino/Poker/Tournaments", "http://www.hollywoodcasinoaurora.com/Casino/Poker"], "hollywood-casino-aurora", "hollywood-casino-aurora"),
    # ── IN ──
    (2322, "Blue Chip",          "IN","Michigan City",["http://www.bluechipcasino.com/play/poker-room", "https://www.bluechipcasino.com/play/tournaments"], "blue-chip-casino-hotel-spa", "blue-chip-casino"),
    (2321, "Hollywood Lawrenceburg","IN","Lawrenceburg",["https://www.hollywoodindiana.com/casino/poker", "https://www.hollywoodindiana.com"], "hollywood-casino-lawrenceburg", "hollywood-casino-lawrenceburg"),
    # ── KY ──
    (1996, "Club JAQK",  "KY","Louisville",  [], "club-jaqk", "club-jaqk"),
    # ── MI ──
    (1973, "Roundtree Poker Room","MI","Ypsilanti",["http://roundtreebarandgrill.com/", "https://roundtreebarandgrill.com/poker"], "", "roundtree-poker-room"),
    # ── MN ──
    (2338, "Mystic Lake",  "MN", "Prior Lake",  ["https://www.mysticlake.com/gaming/poker", "https://www.mysticlake.com"], "mystic-lake-casino-hotel", "mystic-lake"),
    # ── MO ──
    (2344, "River City Casino","MO","St. Louis", ["http://www.rivercity.com/gaming/poker", "http://www.rivercity.com/"], "river-city-casino-hotel", "river-city-casino"),
    # ── MS ──
    (3059, "Hollywood Casino Gulf Coast","MS","Bay St. Louis",["http://www.hollywoodgulfcoast.com/casino/poker", "http://www.hollywoodgulfcoast.com/"], "hollywood-casino-gulf-coast", "hollywood-gulf-coast"),
    # ── OR ──
    (1883, "Spirit Mountain Casino","OR","Grand Ronde",["http://www.spiritmountain.com/play/poker/tournaments", "http://www.spiritmountain.com/play/poker"], "spirit-mountain-casino-grand-ronde", "spirit-mountain"),
    # ── PA ──
    (1890, "Mount Airy Casino",  "PA","Mount Pocono",["http://www.mountairycasino.com/casino/poker/tournaments", "http://www.mountairycasino.com/casino/poker"], "mount-airy-casino-resort", "mount-airy"),
    (2309, "Presque Isle Downs", "PA","Erie",        ["http://www.presqueisledowns.com/gaming/poker/tournaments", "http://www.presqueisledowns.com/gaming/poker/"], "presque-isle-downs-and-casino", "presque-isle"),
    # ── TX ──
    (2270, "Champions Poker", "TX","Houston", [], "champions-poker-club", "champions-poker-club"),
    (2263, "Legends Poker Room","TX","Houston",[], "legends-poker-room", "legends-poker-room"),
    # ── WA ──
    (1893, "Muckleshoot Casino",    "WA","Auburn", ["http://www.muckleshootcasino.com/casino/poker/tournaments", "http://www.muckleshootcasino.com/casino/poker"], "muckleshoot-casino-resort", "muckleshoot-casino"),
    (1894, "Tulalip Resort Casino", "WA","Tulalip",["http://www.tulalipcasino.com/gaming/poker/tournaments", "http://www.tulalipcasino.com/gaming/poker"], "tulalip-resort-casino", "tulalip-resort"),
]

PA_BASE    = "https://www.pokeratlas.com/poker-room"
BRAVO_BASE = "https://bravo.poker/poker-rooms"


# ── Helpers ──

def _network_available():
    """Try multiple targets — returns True if any responds."""
    for url in ["https://www.google.com", "https://api.ipify.org", "https://1.1.1.1"]:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            urllib.request.urlopen(req, timeout=8)
            return True
        except Exception:
            continue
    return False

def sb_patch(venue_id, patch):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{venue_id}",
            data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS,
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status in (200, 204)
    except Exception as e:
        print(f"    ⚠️  DB PATCH failed: {e}")
        return False

def save_evidence(name, state, data):
    safe = re.sub(r"[^a-zA-Z0-9]", "_", name)[:40]
    path = EVIDENCE_DIR / f"stealth_{state}_{safe}_{int(time.time())}.json"
    path.write_text(json.dumps(data, indent=2))
    return str(path)

def try_confirm(venue_id, name, state, city, url, source_label, body_bytes):
    """Check for tournament keywords, save evidence, and patch DB if found."""
    html = body_bytes.decode("utf-8", errors="ignore")
    if not TOURN_RE.search(html):
        return False

    ts   = datetime.now(timezone.utc).isoformat()
    h    = hashlib.sha256(body_bytes).hexdigest()
    bc   = len(body_bytes)

    ev = {
        "venue_name":        name,
        "state":             state,
        "city":              city,
        "scrape_url":        url,         # ← source of truth — re-scrapeable
        "scrape_source":     source_label,
        "scrape_http_status": 200,
        "scrape_html_hash":  h,
        "scrape_byte_count": bc,
        "scrape_timestamp":  ts,
        "scrape_batch_id":   BATCH_ID,
        "db_id":             venue_id,
        "keywords_matched":  [m.group(0) for m in list(TOURN_RE.finditer(html))[:5]],
    }
    epath = save_evidence(name, state, ev)
    print(f"    ✅ CONFIRMED via [{source_label}]  hash={h[:12]}…")
    print(f"    📄 Evidence → {epath}")

    ok = sb_patch(venue_id, {
        "has_tournaments":  True,
        "scrape_url":       url,         # stored for future re-scrapes
        "scrape_source":    source_label,
        "scrape_html_hash": h,
        "scrape_timestamp": ts,
        "last_scraped_at":  ts,
    })
    print(f"    {'✅ DB updated' if ok else '⚠️ DB FAILED'} (id={venue_id})")
    return True


def scrape_venue(session, venue_row):
    """
    Try every URL for this venue with StealthySession.
    Returns True if tournaments confirmed, False otherwise.
    """
    vid, name, state, city, direct_urls, pa_slug, bravo_slug = venue_row

    print(f"\n  [{state}] {name} ({city})  id={vid}")
    ts_now = datetime.now(timezone.utc).isoformat()

    # Build ordered URL candidates
    candidates = []  # (url, source_label)

    for u in direct_urls:
        candidates.append((u, "venue-website"))

    if pa_slug:
        candidates.append((f"{PA_BASE}/{pa_slug}", "pokeratlas"))
        candidates.append((f"{PA_BASE}/{pa_slug}/tournaments", "pokeratlas-tournaments"))

    if bravo_slug:
        candidates.append((f"{BRAVO_BASE}/{bravo_slug}", "bravo"))

    if not candidates:
        print(f"    ⚠️  No URLs to try — nothing to scrape")
        sb_patch(vid, {"scrape_timestamp": ts_now, "last_scraped_at": ts_now, "scrape_source": "no_urls"})
        return False

    for url, label in candidates:
        print(f"    [{label}] {url[:90]}")
        try:
            resp = session.fetch(url, google_search=True)
            status = getattr(resp, "status", 0)
            print(f"    [{status}]", end="  ")

            if status != 200:
                print(f"skip")
                time.sleep(1)
                continue

            body = resp.body if isinstance(resp.body, bytes) else (resp.body or b"")
            if not body:
                body = (resp.text or "").encode("utf-8", errors="ignore")

            if len(body) < 200:
                print(f"empty body — skip")
                continue

            print(f"{len(body):,} bytes")

            if try_confirm(vid, name, state, city, url, label, body):
                return True

            print(f"    [no tournament keywords]")
            time.sleep(2)

        except Exception as e:
            print(f"    ❌ {e}")
            time.sleep(2)
            continue

    # Mark as exhausted
    print(f"    ⚠️  No evidence found — staying false")
    sb_patch(vid, {
        "scrape_timestamp": ts_now,
        "last_scraped_at":  ts_now,
        "scrape_source":    "stealth_exhausted",
    })
    return False


def main():
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--state",  default="", help="Filter to a single state (e.g. NV)")
    p.add_argument("--name",   default="", help="Filter by venue name substring")
    p.add_argument("--limit",  type=int, default=0)
    args = p.parse_args()

    print("=" * 70)
    print("FINAL PUSH — StealthySession + Camoufox (OpenClaw)")
    print(f"  Batch ID : {BATCH_ID}")
    print(f"  Targets  : {len(VENUES)} venues")
    print("=" * 70)

    if not _network_available():
        print("❌ Network unavailable — aborting")
        sys.exit(1)

    # Filter
    targets = list(VENUES)
    if args.state:
        targets = [v for v in targets if v[2].upper() == args.state.upper()]
    if args.name:
        targets = [v for v in targets if args.name.lower() in v[1].lower()]
    if args.limit:
        targets = targets[:args.limit]

    print(f"  Running against {len(targets)} venue(s)…\n")

    from scrapling.fetchers import StealthySession

    # Single persistent session — CF cookies bound to this browser fingerprint
    session = StealthySession(headless=True, solve_cloudflare=True)
    print("  🚀 Launching StealthySession (camoufox)…")
    session.start()
    print("  ✅ Session ready\n")

    confirmed = not_found = errors = 0
    try:
        for i, v in enumerate(targets):
            print(f"\n[{i+1}/{len(targets)}]", end="")
            try:
                found = scrape_venue(session, v)
                if found:
                    confirmed += 1
                else:
                    not_found += 1
            except Exception as e:
                print(f"  ❌ Unhandled: {e}")
                errors += 1

            # Pace between venues (avoid rate-limiting)
            time.sleep(3)
    finally:
        try:
            session.close()
        except Exception:
            pass

    print("\n" + "=" * 70)
    print("FINAL PUSH COMPLETE")
    print(f"  ✅ Confirmed new : {confirmed}")
    print(f"  ⚠️  Not found    : {not_found}")
    print(f"  ❌ Errors        : {errors}")
    print(f"  Evidence dir     : {EVIDENCE_DIR}")
    print("=" * 70)


if __name__ == "__main__":
    main()
