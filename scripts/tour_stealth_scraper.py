#!/usr/bin/env python3
"""
Tour Stealth Scraper — Scrapling StealthySession + camoufox for ALL tour pages.

MANDATE (Dan, 2026-08-09): every scrape goes through Scrapling + camoufox so
Cloudflare-protected schedules (wsop.com, worldpokertour.com, pokergo.com,
pokerstarslive.com) are actually reachable. The workers-route fetch() path is
demoted to a non-CF backup; THIS script is the authoritative tour scraper.

Reads the tour list from tour_source_registry (fallback: builtin list matching
06-seed-tour-scraper-registry.sql), scrapes each schedule page, extracts stop
candidates (name + date range + venue context), and inserts NEW rows into
tour_stop_events. Existing (tour_code, normalized stop_name, start_date)
identities are never duplicated.
Registry rows get last_checked_at / scrape_status / events_count stamped so
tours_due_for_refresh finally drains.

Battle-tested patterns carried over from poker_series_scraper.py and
tournament-schedule-daemon.py, all of which failed in production without them:
  - .env.local fallback for SUPABASE_SERVICE_ROLE_KEY + loud exit(2) when absent
    (a None key silently 100%-failed series writes for months)
  - asyncio-loop clear before StealthySession.start() (the "Playwright Sync API
    inside the asyncio loop" crash that killed 3 scraper families)
  - CURRENT_SESSION holder so a mid-retry session replacement is never leaked
    as a closed handle
  - browser self-heal before first session
  - upserts verified via return=representation row counts, never assumed
  - heartbeat JSON with records_written (a fresh heartbeat is not health;
    records are health — the watchdog alerts on zero)
"""

import argparse
import html as html_lib
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR = PROJECT_ROOT / "data" / "tour-logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
HEARTBEAT = LOG_DIR / "heartbeat.json"
LOG_FILE = LOG_DIR / f"tour_stealth_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

sys.path.insert(0, str(PROJECT_ROOT / "scripts"))
from scraper_data_truth import tour_stop_identity

try:
    import browser_heal as _browser_heal
except Exception:
    _browser_heal = None


def log(msg: str):
    line = f"[{datetime.now().strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError:
        pass


# ── Supabase config ───────────────────────────────────────────────────────────
SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"


def _load_supabase_key():
    """launchd jobs do not inherit shell env; fall back to .env.local."""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if key:
        return key
    env_file = PROJECT_ROOT / ".env.local"
    try:
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    except OSError:
        pass
    return None


SUPABASE_KEY = _load_supabase_key()

SB_HDRS = {
    "apikey": SUPABASE_KEY or "",
    "Authorization": f"Bearer {SUPABASE_KEY or ''}",
    "Content-Type": "application/json",
}
SB_INSERT_HDRS = {**SB_HDRS, "Prefer": "return=representation"}
SB_PATCH_HDRS = {**SB_HDRS, "Prefer": "return=representation"}


def sb_get(path: str, params: str):
    """Return rows, or None when PostgREST could not be read.

    An unreadable identity query must never be treated as an empty table: that
    would turn a transient API failure into duplicate tour rows.
    """
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/{path}{params}", headers=SB_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read()) or []
    except Exception as e:
        log(f"  [SB_GET ERR] {path}: {str(e)[:120]}")
        return None


def sb_insert(path: str, rows: list) -> int:
    """POST rows; return the count the DB CONFIRMED writing."""
    if not rows:
        return 0
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}", data=json.dumps(rows).encode(),
        method="POST", headers=SB_INSERT_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            returned = json.loads(r.read() or b"[]")
            return len(returned) if isinstance(returned, list) else 0
    except urllib.error.HTTPError as e:
        log(f"  [INSERT ERR] HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}")
        return 0
    except Exception as e:
        log(f"  [INSERT ERR] {str(e)[:150]}")
        return 0


def sb_patch(path: str, filt: str, patch: dict) -> bool:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}?{filt}", data=json.dumps(patch).encode(),
        method="PATCH", headers=SB_PATCH_HDRS)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            returned = json.loads(r.read() or b"[]")
        if not isinstance(returned, list) or len(returned) != 1:
            log(f"  [PATCH ERR] {path}: expected one exact row, confirmed {len(returned) if isinstance(returned, list) else 0}")
            return False
        return True
    except Exception as e:
        log(f"  [PATCH ERR] {path}: {str(e)[:120]}")
        return False


def sb_patch_exact_ids(path: str, ids: list[str], patch: dict) -> bool:
    """Patch an already-read exact UUID set and verify every returned row."""

    if not ids:
        return True
    encoded = ",".join(urllib.parse.quote(str(row_id), safe="-") for row_id in ids)
    return sb_patch(path, f"id=in.({encoded})", patch) if len(ids) == 1 else _sb_patch_many(
        path, f"id=in.({encoded})", patch, len(ids)
    )


def _sb_patch_many(path: str, filt: str, patch: dict, expected: int) -> bool:
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}?{filt}",
        data=json.dumps(patch).encode(),
        method="PATCH",
        headers=SB_PATCH_HDRS,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            returned = json.loads(response.read() or b"[]")
        if not isinstance(returned, list) or len(returned) != expected:
            log(
                f"  [PATCH ERR] {path}: expected {expected} exact rows, "
                f"confirmed {len(returned) if isinstance(returned, list) else 0}"
            )
            return False
        return True
    except Exception as exc:
        log(f"  [PATCH ERR] {path}: {str(exc)[:120]}")
        return False


# ── Network / session (proven patterns) ───────────────────────────────────────
def network_ok() -> bool:
    try:
        req = urllib.request.Request("https://1.1.1.1", method="HEAD")
        with urllib.request.urlopen(req, timeout=10):
            return True
    except urllib.error.HTTPError:
        # Any HTTP status IS a network response. 1.1.1.1 began returning 403
        # (2026-08); treating that as "no network" killed every scrape run.
        return True
    except Exception:
        return False


CURRENT_SESSION = None


def create_session():
    """New StealthySession with network pre-check + asyncio-loop guard."""
    global CURRENT_SESSION
    if not network_ok():
        raise ConnectionError("Network unavailable - cannot start StealthySession")
    if _browser_heal is not None:
        _browser_heal.ensure_browser(log=log)

    # CRITICAL: clear any dangling asyncio event loop before starting Playwright.
    # Scrapling's StealthySession.start() calls sync_playwright().start(), which
    # raises "Playwright Sync API inside the asyncio loop" if a loop is set on
    # this thread. Same guard as every other daemon in this repo.
    import asyncio
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        asyncio.set_event_loop_policy(asyncio.DefaultEventLoopPolicy())
        asyncio.set_event_loop(None)
    else:
        raise RuntimeError("cannot start sync Playwright inside a running event loop")

    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    CURRENT_SESSION = session
    return session


def fetch_page(session, url: str, retries: int = 3):
    """Fetch with retry; publishes any replacement session to CURRENT_SESSION."""
    global CURRENT_SESSION
    resp = None
    for attempt in range(retries):
        try:
            resp = session.fetch(url, google_search=False, timeout=60000,
                                 wait_until="domcontentloaded")
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8", "ignore")
                final_url = str(getattr(resp, "url", None) or url)
                return html, hashlib.sha256(body).hexdigest(), session, final_url
            if resp:
                log(f"    [FETCH] attempt {attempt + 1}: HTTP {resp.status}")
        except Exception as e:
            log(f"    [FETCH] attempt {attempt + 1}: {str(e)[:100]}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                try:
                    session.close()
                except Exception:
                    pass
                session = create_session()
    return "", "", session, ""


# ── Extraction ────────────────────────────────────────────────────────────────
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

# "Aug 6 - 17, 2026" | "Aug 6 - Sep 2, 2026" | "August 6-17" | "Aug. 6 to 17, 2026"
DATE_RANGE = re.compile(
    r"([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*(?:-|–|—|to|through)\s*"
    r"(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2})(?:\s*,?\s*(\d{4}))?", re.I)

TAG_STRIP = re.compile(r"<[^>]+>")
NAV_WORDS = re.compile(
    r"^(home|menu|schedule|login|sign|search|results|news|about|contact|shop|"
    r"cookie|privacy|terms|share|follow|subscribe|more|next|prev)", re.I)

STOP_NAME_NOISE = re.compile(
    r"(?:giveaway|drawing|sweepstakes|jackpot|promotion|bonus|learn more|"
    r"sign up|register now|buy tickets|hotel offer|room offer|chip counts?|"
    r"redraws?|live updates?|event results?|view results?|payouts?|"
    r"structure sheets?|view schedules?|leaderboards?)", re.I)
MONEY_ONLY_STOP = re.compile(
    r"^\s*\$[\d,.]+\s*(?:k|m|million)?\s*(?:gtd|guaranteed)?\s*$", re.I)


def normalize_stop_name(value: object) -> str:
    text = html_lib.unescape(TAG_STRIP.sub(" ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()


def is_plausible_tour_stop_name(value: object) -> bool:
    """Conservative guard against casino promotions becoming tour stops."""

    name = normalize_stop_name(value)
    if len(name) < 4 or len(name) > 90 or NAV_WORDS.match(name):
        return False
    if STOP_NAME_NOISE.search(name) or MONEY_ONLY_STOP.match(name):
        return False
    if re.match(r"^\$[\d,.]+", name) and re.search(r"\b(?:gtd|guaranteed)\b", name, re.I):
        return False
    words = re.findall(r"[A-Za-z]{2,}", name)
    return len(words) >= 2


def response_preserves_schedule_context(requested_url: str, final_url: str) -> bool:
    """Reject a schedule URL that silently redirects to a generic home page."""

    if not final_url:
        return False
    requested = urllib.parse.urlsplit(requested_url)
    final = urllib.parse.urlsplit(final_url)
    requested_path = requested.path.rstrip("/").lower()
    final_path = final.path.rstrip("/").lower()
    context_words = ("schedule", "tournament", "tour", "circuit", "event", "poker")
    requested_has_context = any(word in requested_path for word in context_words)
    final_has_context = any(word in final_path for word in context_words)
    if requested_has_context and not final_has_context:
        return False

    requested_host = (requested.hostname or "").lower()
    final_host = (final.hostname or "").lower()
    if not requested_host or not final_host:
        return False
    if requested_host != final_host:
        host_noise = {
            "www", "com", "net", "org", "co", "us", "uk", "ca", "io",
            "ai", "app", "test", "local", "tour", "poker", "casino",
            "schedule", "events", "event", "official", "live",
        }

        def host_tokens(host: str) -> set[str]:
            tokens = {
                token for token in re.findall(r"[a-z0-9]+", host)
                if token not in host_noise and len(token) > 2
            }
            tokens.update(
                token[3:] for token in list(tokens)
                if token.startswith("the") and len(token) > 6
            )
            return tokens

        if not (host_tokens(requested_host) & host_tokens(final_host)):
            return False
    return True


def tour_page_identity(code: str, tour_name: str, requested_url: str,
                       final_url: str, page_html: str) -> tuple[bool, str]:
    """Prove that a fetched schedule still belongs to the requested tour."""
    if not response_preserves_schedule_context(requested_url, final_url):
        return False, "schedule_context_mismatch"

    def url_identity(value: str) -> tuple[str, str]:
        parsed = urllib.parse.urlsplit(str(value or ""))
        host = (parsed.hostname or "").lower()
        if host.startswith("www."):
            host = host[4:]
        return host, parsed.path.rstrip("/").lower()

    requested_identity = url_identity(requested_url)
    final_identity = url_identity(final_url)
    canonical = ""
    for tag in re.findall(r"<link\b[^>]*>", page_html or "", re.I):
        attrs = {
            key.lower(): value
            for key, _quote, value in re.findall(
                r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", tag, re.I | re.DOTALL,
            )
        }
        if "canonical" in attrs.get("rel", "").lower():
            canonical = urllib.parse.urljoin(final_url, attrs.get("href", ""))
            break
    canonical_identity = url_identity(canonical) if canonical else ("", "")
    exact_route = requested_identity == final_identity
    canonical_contract = (
        not canonical or canonical_identity in {requested_identity, final_identity}
    )
    route_words = {
        word for word in re.findall(r"[a-z0-9]+", final_identity[1])
        if word not in {
            "casino", "event", "events", "html", "poker", "schedule",
            "schedules", "the", "tour", "tournament", "tournaments",
        }
    }
    # Exact equality to a generic route such as /tournaments/ proves only that
    # the request did not redirect; it does not prove which tour owns the
    # schedule. Generic routes must still name the requested tour in a
    # source-owned title or heading below.
    if exact_route and canonical_contract and route_words:
        return True, "exact_route"

    labels = []
    for tag_name in ("title", "h1", "h2", "h3"):
        labels.extend(
            normalize_stop_name(match.group(1))
            for match in re.finditer(
                rf"<{tag_name}\b[^>]*>(.*?)</{tag_name}>",
                page_html or "", re.I | re.DOTALL,
            )
        )
    for tag in re.findall(r"<meta\b[^>]*>", page_html or "", re.I):
        attrs = {
            key.lower(): value
            for key, _quote, value in re.findall(
                r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", tag, re.I | re.DOTALL,
            )
        }
        if attrs.get("property", "").lower() in ("og:title", "twitter:title"):
            labels.append(attrs.get("content", ""))

    label = " ".join(labels).lower()
    label_words = set(re.findall(r"[a-z0-9]+", label))
    expected_code = re.sub(r"[^a-z0-9]", "", str(code or "").lower())
    if expected_code and expected_code in label_words:
        return True, "source_owned_tour_code"

    name_words = [
        word for word in re.findall(r"[a-z0-9]+", str(tour_name or "").lower())
        if word not in {
            "the", "of", "and", "world", "poker", "tour", "series",
            "schedule", "events", "event", "tournament", "tournaments",
        }
    ]
    # Common source spelling for the registry's WSOPC code.
    if expected_code == "wsopc":
        name_words = list(dict.fromkeys(["wsop", "circuit", *name_words]))
    if name_words and all(word in label_words for word in set(name_words)):
        return True, "source_owned_tour_name"
    return False, "tour_identity_mismatch"


def _iso(month_name: str, day: int, year):
    m = MONTHS.get(month_name[:3].lower())
    if not m or not (1 <= day <= 31):
        return None
    if year is None:
        now = datetime.now(timezone.utc)
        year = now.year
        try:
            cand = datetime(year, m, day, tzinfo=timezone.utc)
            if (now - cand).days > 182:  # >6 months past -> next year's schedule
                year += 1
        except ValueError:
            return None
    try:
        datetime(year, m, day)
    except ValueError:
        return None
    return f"{year}-{m:02d}-{day:02d}"


def extract_stops(html: str, base_url: str, today: date = None) -> list:
    """Generic stop extractor: date-range matches paired with the nearest
    preceding heading/link text. Conservative by design - a missed stop is
    recoverable on the next run, a garbage stop pollutes the calendar."""
    stops, seen = [], set()
    cutoff = (today or datetime.now(timezone.utc).date()) - timedelta(days=14)
    # Date-like copy in scripts, image alt text, element IDs, analytics payloads,
    # and link URLs is not a visible schedule row.  Scanning raw attributes let
    # a Wynn image alt date inherit the preceding CHIP COUNTS/REDRAWS CTA as a
    # stop name.  Preserve tag boundaries/text while discarding those hidden
    # attribute and script surfaces before pairing headings with dates.
    scan_html = re.sub(
        r"<(?:script|style|noscript)\b[^>]*>.*?</(?:script|style|noscript)>",
        " ",
        html,
        flags=re.I | re.DOTALL,
    )
    scan_html = re.sub(
        r"<([A-Za-z][A-Za-z0-9]*)\b[^>]*>",
        r"<\1>",
        scan_html,
    )
    prev_end = 0
    for m in DATE_RANGE.finditer(scan_html):
        m1, d1, m2, d2, yr = m.group(1), int(m.group(2)), m.group(3), int(m.group(4)), m.group(5)
        year = int(yr) if yr else None
        start = _iso(m1, d1, year)
        end = _iso(m2 or m1, d2, year)
        if not start or not end:
            continue
        if end < start:  # range wrapped a year boundary (Dec 28 - Jan 4)
            y, mo, dd = end.split("-")
            end = f"{int(y) + 1}-{mo}-{dd}"
        if datetime.strptime(end, "%Y-%m-%d").date() < cutoff:
            continue
        # walk back for the nearest heading/anchor text - but never past the
        # previous date match, or a rejected nav heading lets the walker steal
        # an OLDER stop's name and mispair it with this date range.
        ctx = scan_html[max(0, m.start() - 1200, prev_end):m.start()]
        prev_end = m.end()
        name = None
        for hm in reversed(list(re.finditer(
                r"<(?:h[1-6]|a|strong|b|span|div|td)[^>]*>([^<>]{4,90})</", ctx, re.I))):
            cand = normalize_stop_name(hm.group(1))
            if not is_plausible_tour_stop_name(cand):
                continue
            if not re.search(r"[A-Za-z]{3}", cand):
                continue
            if DATE_RANGE.search(cand):
                continue
            name = cand[:90]
            break
        if not name:
            continue
        key = (name.lower(), start)
        if key in seen:
            continue
        seen.add(key)
        stops.append({"stop_name": name, "start": start, "end": end})
    return stops


def build_stop_row(code: str, stop: dict, source_url: str,
                   html_hash: str, scraped_at: str) -> dict:
    """Build one explicitly inferred stop-summary row with full provenance."""

    return {
        "tour_code": code,
        "stop_name": stop["stop_name"],
        "event_name": stop["stop_name"],
        "stop_start_date": stop["start"],
        "stop_end_date": stop["end"],
        "start_date": stop["start"],
        "source_url": source_url,
        "scrape_url": source_url,
        "scrape_html_hash": html_hash,
        "scrape_timestamp": scraped_at,
        "scrape_script": "tour_stealth_scraper.py",
        "data_quality": "scraped_inferred",
        "notes": f"Auto-extracted from {source_url} on {scraped_at[:10]}; "
                 "generic date-range extractor; venue/city remain unverified.",
    }


def retirable_stop_ids(existing_rows: list[dict], current_stops: list[dict],
                       source_url: str, today: date = None) -> list[str]:
    """Return future/current inferred rows disproved by a complete source page.

    Only rows emitted by this exact scraper/source are eligible. Curated rows,
    event-detail rows, other sources, and undated history remain untouched.
    """

    if not current_stops or not source_url:
        return []
    current = {
        tour_stop_identity({
            "stop_name": stop.get("stop_name"),
            "stop_start_date": stop.get("start"),
        })
        for stop in current_stops
    }
    cutoff = (today or datetime.now(timezone.utc).date()) - timedelta(days=14)
    retire = []
    for row in existing_rows or []:
        if row.get("data_quality") != "scraped_inferred":
            continue
        if row.get("scrape_script") != "tour_stealth_scraper.py":
            continue
        if str(row.get("source_url") or "").rstrip("/") != source_url.rstrip("/"):
            continue
        raw_end = str(row.get("stop_end_date") or "")[:10]
        try:
            end_date = datetime.strptime(raw_end, "%Y-%m-%d").date()
        except ValueError:
            continue
        if end_date < cutoff or tour_stop_identity(row) in current:
            continue
        if row.get("id"):
            retire.append(str(row["id"]))
    return retire


def reactivatable_stop_matches(existing_rows: list[dict], current_stops: list[dict],
                               source_url: str) -> list[tuple[dict, dict]]:
    """Pair exact stale scraper rows with current source-owned stop evidence."""

    if not current_stops or not source_url:
        return []
    current_by_identity = {
        tour_stop_identity({
            "stop_name": stop.get("stop_name"),
            "stop_start_date": stop.get("start"),
        }): stop
        for stop in current_stops
    }
    expected_source = source_url.rstrip("/")
    # A curated or already-current row with the same normalized name/date owns
    # the public identity. Do not revive an older scraper row beside it and
    # recreate the duplicate that the quarantine removed.
    servable_qualities = {
        "scraped_verified", "scraped_inferred", "manual_research",
    }
    current_existing_identities = {
        tour_stop_identity(row)
        for row in existing_rows or []
        if row.get("data_quality") in servable_qualities
    }
    matches = []
    for row in existing_rows or []:
        if row.get("data_quality") != "stale" or not row.get("id"):
            continue
        if row.get("scrape_script") != "tour_stealth_scraper.py":
            continue
        if str(row.get("source_url") or "").rstrip("/") != expected_source:
            continue
        identity = tour_stop_identity(row)
        if identity in current_existing_identities:
            continue
        current = current_by_identity.get(identity)
        if current:
            matches.append((row, current))
    return matches


def verify_html(html: str) -> bool:
    if not html or len(html) < 1000:
        return False
    low = html.lower()
    if "access denied" in low or "captcha" in low[:5000]:
        return False
    return sum(1 for k in ("poker", "tournament", "buy-in", "event", "schedule",
                           "main event") if k in low) >= 2


# ── Tour registry ─────────────────────────────────────────────────────────────
BUILTIN_TOURS = [
    ("WSOPC", "WSOP Circuit", "https://www.wsop.com/circuit/"),
    ("WSOP", "World Series of Poker", "https://www.wsop.com/tournaments/"),
    ("WPT", "World Poker Tour", "https://www.worldpokertour.com/schedule/"),
    ("MSPT", "Mid-States Poker Tour", "https://msptpoker.com/schedule/"),
    ("RGPS", "RunGood Poker Series", "https://rungoodgear.com/poker-series/"),
    ("CPPT", "Card Player Poker Tour", "https://www.cardplayerpokertour.com/schedule/"),
    ("PGT", "PokerGO Tour", "https://www.pgt.com/schedule"),
    ("NAPT", "North American Poker Tour", "https://www.pokerstarslive.com/napt/schedule/"),
    ("GCPT", "Gulf Coast Poker Tour", "https://gulfcoastpoker.net/schedule/"),
    ("FPN", "Free Poker Network", "https://freepokernet.com/schedule"),
    ("LIPS", "Ladies International Poker Series", "https://www.lipspoker.org/schedule"),
    ("ROUGHRIDER", "Roughrider Poker Tour", "https://roughriderpokertour.com/schedule/"),
    ("PAT", "PokerAtlas Tour", "https://pokeratlastour.com/schedule"),
    ("SHRPO", "Seminole Hard Rock Poker Open", "https://www.seminolehardrockpokeropen.com/schedule/"),
    ("VENETIAN", "Venetian DeepStack", "https://www.venetianlasvegas.com/casino/poker/tournaments.html"),
    ("BORGATA", "Borgata Poker Series", "https://www.theborgata.com/casino/poker/tournaments"),
    ("LODGE", "Lodge Championship Series", "https://thelodgepokerclub.com/austin/lcs/"),
    ("TCH", "Texas Card House Series", "https://texascardhouse.com/tournaments/"),
]


def load_tours() -> list:
    rows = sb_get("tour_source_registry",
                  "?select=tour_code,tour_name,schedule_url,official_website&is_active=eq.true")
    if rows is None:
        log("  [REGISTRY] tour_source_registry unreadable; refusing stale fallback sources")
        return []
    tours = []
    seen_codes = set()
    for r in rows or []:
        url = r.get("schedule_url") or r.get("official_website")
        code = str(r.get("tour_code") or "").strip().upper()
        if code and url and code not in seen_codes:
            tours.append((code, r.get("tour_name") or code, url))
            seen_codes.add(code)
    if tours:
        # The database registry is authoritative. Mixing its current URLs with
        # the builtin fallback used to scrape duplicate tour families under
        # different codes and retry retired URLs in the same run.
        return tours
    log("  [REGISTRY] tour_source_registry is confirmed empty - using builtin list")
    return list(BUILTIN_TOURS)


def write_heartbeat(**kw):
    hb = {"daemon": "tour-stealth-scraper", "pid": os.getpid(),
          "timestamp": datetime.now(timezone.utc).isoformat(), **kw}
    try:
        HEARTBEAT.write_text(json.dumps(hb, indent=2))
    except OSError:
        pass


def update_tour_registry(code: str, checked_at: str, status: str,
                         events_count: int) -> bool:
    """Persist registry health without stamping success before it is proven."""
    filt = f"tour_code=eq.{urllib.parse.quote(code)}"
    if not sb_patch(
        "tour_source_registry", filt,
        {
            "last_checked_at": checked_at,
            "scrape_status": status,
            "events_count": events_count,
        },
    ):
        return False
    if status != "active":
        return True
    if sb_patch(
        "tour_source_registry", filt,
        {"last_successful_scrape": checked_at},
    ):
        return True

    # The response to the success timestamp write may have been lost after the
    # database applied it. Clear only this run's exact timestamp, then make the
    # registry status fail closed. These are compensating, non-destructive
    # updates; a prior known-good last_successful value is preserved.
    encoded_time = urllib.parse.quote(checked_at, safe="")
    sb_patch(
        "tour_source_registry",
        f"{filt}&last_successful_scrape=eq.{encoded_time}",
        {"last_successful_scrape": None, "scrape_status": "error"},
    )
    sb_patch(
        "tour_source_registry", filt, {"scrape_status": "error"},
    )
    return False


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    global CURRENT_SESSION
    ap = argparse.ArgumentParser(description="Stealth tour schedule scraper")
    ap.add_argument("--tour", default="", help="Single tour code (e.g. WSOPC)")
    ap.add_argument("--dry-run", action="store_true", help="No DB writes")
    args = ap.parse_args()

    if not SUPABASE_KEY:
        log("FATAL: SUPABASE_SERVICE_ROLE_KEY is missing; refusing an unverifiable run")
        raise SystemExit(2)

    tours = load_tours()
    if args.tour:
        tours = [t for t in tours if t[0] == args.tour.upper()]
    if not tours:
        log("FATAL: no matching active tour sources")
        raise SystemExit(2)
    log("=" * 70)
    log(f"TOUR STEALTH SCRAPER - {len(tours)} tours, Scrapling StealthySession + camoufox")
    log(f"  DB writes: {'DRY RUN' if args.dry_run else 'LIVE'}")
    log("=" * 70)

    session = create_session()
    total_stops = total_attempted = total_written = total_rejected = tours_ok = 0
    source_errors = 0
    write_heartbeat(
        status="running", run_status="progress", tours_done=0, stops_found=0,
        records_attempted=0, records_written=0, records_rejected=0, errors=0,
    )

    for i, (code, name, url) in enumerate(tours):
        tour_errors_before = source_errors
        if CURRENT_SESSION is not None and CURRENT_SESSION is not session:
            session = CURRENT_SESSION
        if i > 0 and i % 6 == 0:
            log(f"  Session recycle at tour #{i}")
            try:
                session.close()
            except Exception:
                pass
            session = create_session()

        log(f"[{i + 1}/{len(tours)}] {code} - {name}")
        log(f"    {url}")
        html, hhash, session, final_url = fetch_page(session, url)
        status = "error"
        found = attempted = written = rejected = 0
        now_iso = datetime.now(timezone.utc).isoformat()
        source_context_ok, source_context_reason = tour_page_identity(
            code, name, url, final_url, html,
        )
        if verify_html(html) and source_context_ok:
            stops = extract_stops(html, url)
            found = len(stops)
            total_stops += found
            log(f"    {found} stop candidate(s)")
            for stop in stops:
                log(
                    f"      candidate: {stop['stop_name']} | "
                    f"{stop['start']} to {stop['end']}"
                )
            if not stops:
                source_errors += 1
                log(
                    "    parser returned no source-owned stop rows; treating "
                    "this as an unresolved source, not a successful empty schedule"
                )
            elif not args.dry_run:
                existing_rows = sb_get(
                    "tour_stop_events",
                    f"?select=id,stop_name,stop_start_date,stop_end_date,start_date,"
                    f"data_quality,scrape_script,source_url&tour_code=eq."
                    f"{urllib.parse.quote(code)}",
                )
                if existing_rows is None:
                    attempted = len(stops)
                    rejected = len(stops)
                    source_errors += 1
                    log("    identity read failed; refusing duplicate-prone writes")
                else:
                    effective_source_url = final_url or url
                    existing = {tour_stop_identity(row) for row in existing_rows}
                    fresh = [s for s in stops if tour_stop_identity({
                        "stop_name": s["stop_name"], "stop_start_date": s["start"],
                    }) not in existing]
                    reactivations = reactivatable_stop_matches(
                        existing_rows, stops, effective_source_url,
                    )
                    rows = [
                        build_stop_row(code, s, effective_source_url, hhash, now_iso)
                        for s in fresh
                    ]
                    attempted = len(rows) + len(reactivations)
                    written = sb_insert("tour_stop_events", rows)
                    for stale_row, current_stop in reactivations:
                        patch = build_stop_row(
                            code, current_stop, effective_source_url, hhash, now_iso,
                        )
                        if sb_patch_exact_ids(
                            "tour_stop_events", [str(stale_row["id"])], patch,
                        ):
                            written += 1
                    rejected = attempted - written
                    log(f"    {written}/{attempted} new or reactivated row(s) confirmed "
                        f"({len(stops) - len(fresh) - len(reactivations)} active exact "
                        "name/date identities already present)")
                    if rejected:
                        source_errors += 1
                    else:
                        retire_ids = retirable_stop_ids(
                            existing_rows, stops, final_url or url,
                        )
                        if retire_ids:
                            if sb_patch_exact_ids(
                                "tour_stop_events", retire_ids,
                                {"data_quality": "stale"},
                            ):
                                log(
                                    f"    retired {len(retire_ids)} inferred stop(s) "
                                    "no longer present on the complete source page"
                                )
                            else:
                                source_errors += 1
            total_attempted += attempted
            total_written += written
            total_rejected += rejected
            # Registry CHECK vocabulary is pending/active/stale/error/manual/defunct.
            # "complete"/"no_data" violated it (23514) and EVERY telemetry PATCH
            # failed silently since the registry was created -- which is why all
            # rows still said "pending" while stops were being written.
            status = "error" if (
                not found or rejected or source_errors > tour_errors_before
            ) else "active"
            if status == "active":
                tours_ok += 1
        else:
            source_errors += 1
            if html and not source_context_ok:
                log(
                    f"    verification failed ({source_context_reason}): "
                    f"{url} -> {final_url}"
                )
            else:
                log("    verification failed (empty/blocked/non-poker page)")

        if not args.dry_run:
            # tour_source_registry is the authoritative registry loaded above.
            # The older tour_scrape_registry contains a different 13-code seed
            # and silently matched no row for half of the active tour catalog.
            if not update_tour_registry(code, now_iso, status, found):
                source_errors += 1
        heartbeat_status = "degraded" if source_errors else "running"
        write_heartbeat(status=heartbeat_status, tours_done=i + 1, stops_found=total_stops,
                        records_attempted=total_attempted, records_written=total_written,
                        records_rejected=total_rejected, errors=source_errors,
                        run_status="progress")
        time.sleep(4)

    try:
        session.close()
    except Exception:
        pass
    final_status = "degraded" if (
        source_errors or total_rejected or tours_ok != len(tours)
    ) else "idle"
    final_run_status = (
        "success" if final_status == "idle"
        else "partial" if tours_ok > 0
        else "failed"
    )
    write_heartbeat(status=final_status, tours_done=len(tours), stops_found=total_stops,
                    records_attempted=total_attempted, records_written=total_written,
                    records_rejected=total_rejected, errors=source_errors,
                    run_status=final_run_status)
    log("=" * 70)
    log(f"DONE - {tours_ok}/{len(tours)} tours fetched, {total_stops} stops found, "
        f"{total_written}/{total_attempted} new rows written, "
        f"{total_rejected} rejected, {source_errors} source/write errors")
    log("=" * 70)
    # Non-zero exit when the run wrote nothing AND found nothing - the launcher
    # and watchdog treat that as a failed run, not a quiet success.
    if tours_ok == 0 or total_rejected > 0 or source_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
