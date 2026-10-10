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
  - configured runtime injects SUPABASE_SERVICE_ROLE_KEY; loud exit(2) when absent
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
from scraper_data_truth import tour_stop_identity, US_STATE_NAME_TO_CODE

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
    """Only the configured runtime may supply the canonical service identity."""
    return os.environ.get("SUPABASE_SERVICE_ROLE_KEY")


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
    r"(?P<m1>[A-Za-z]{3,9})\.?\s+(?P<d1>\d{1,2})(?:\s*,?\s*(?P<y1>20\d{2}))?\s*(?:-|–|—|to|through)\s*"
    r"(?:(?P<m2>[A-Za-z]{3,9})\.?\s+)?(?P<d2>\d{1,2})(?:\s*,?\s*(?P<y2>20\d{2}))?", re.I)

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


def seminole_schedule_title(page_html: str) -> str | None:
    """The persisted SEMINOLE family and older SHRPO alias share this source."""
    titles = [normalize_stop_name(value) for value in re.findall(
        r'<h1\b[^>]*>(.*?)</h1>', page_html or '', re.I | re.S,
    )]
    return next((value for value in titles if re.fullmatch(
        r'20\d{2} Rock .N. Roll Poker Open Schedule', value,
    )), None)


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
    if (expected_code in {'seminole', 'shrpo'}
            and final_identity[0] == 'seminolehardrockpokeropen.com'
            and seminole_schedule_title(page_html)):
        return True, 'source_owned_seminole_schedule'
    if (expected_code == 'tch'
            and final_identity[0] == 'trailblazer.texascardhouse.com'
            and 'trailblazer poker tour' in label
            and re.search(r'<script\b[^>]*class=[\"\']ts-data[\"\']', page_html or '', re.I)):
        return True, 'source_owned_trailblazer_stops'
    if (expected_code == 'wsopc' and final_identity[0] in {'wsop.com', 'www.wsop.com'}
            and re.search(r'<li\b[^>]*data-competition-type=[\"\']circuit[\"\']', page_html or '', re.I)
            and re.search(r'WSOP Circuit\s*-', page_html or '', re.I)):
        return True, 'source_owned_circuit_cards'
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
        return None
    try:
        datetime(year, m, day)
    except ValueError:
        return None
    return f"{year}-{m:02d}-{day:02d}"


def extract_stops(html: str, base_url: str, today: date = None, tour_code: str = None) -> list:
    """Generic stop extractor: date-range matches paired with the nearest
    preceding heading/link text. Conservative by design - a missed stop is
    recoverable on the next run, a garbage stop pollutes the calendar."""
    code = str(tour_code or '').upper()
    host = urllib.parse.urlparse(base_url).hostname
    if code == 'TCH' and host == 'trailblazer.texascardhouse.com':
        stops, seen = [], set()
        cutoff = (today or datetime.now(timezone.utc).date()) - timedelta(days=14)
        for attrs, raw in re.findall(r'<script\b([^>]*)>(.*?)</script>', html, re.I | re.S):
            if (not re.search(r'\btype=[\"\']application/json[\"\']', attrs, re.I)
                    or not re.search(r'\bclass=[\"\']ts-data[\"\']', attrs, re.I)):
                continue
            try:
                payload = json.loads(raw)
            except (TypeError, ValueError):
                continue
            if not isinstance(payload, list):
                continue
            for entry in payload:
                if not isinstance(entry, dict):
                    continue
                name = normalize_stop_name(entry.get('name'))
                number = entry.get('stop')
                named_number = re.match(r'^Stop (\d+)\b', name)
                if (not isinstance(number, (float, int)) or isinstance(number, bool)
                        or number <= 0 or int(number) != number or not named_number
                        or int(named_number[1]) != number or not is_plausible_tour_stop_name(name)):
                    continue
                start, end = entry.get('start_iso'), entry.get('end_iso')
                if not all(isinstance(value, str) and re.fullmatch(r'20\d{2}-\d{2}-\d{2}', value) for value in (start, end)):
                    continue
                try:
                    start_day, end_day = date.fromisoformat(start), date.fromisoformat(end)
                except ValueError:
                    continue
                if end_day < start_day or end_day < cutoff or (name, start) in seen:
                    continue
                seen.add((name, start))
                stop = {'stop_name': name, 'start': start, 'end': end,
                        'source_scope': 'announced festival span'}
                if entry.get('venues'):
                    stop['venue'] = normalize_stop_name(entry['venues'])
                if entry.get('schedule_published') in (0, 1, False, True):
                    stop['schedule_published'] = bool(entry['schedule_published'])
                stops.append(stop)
        return stops
    if code == 'VENETIAN' and host in {'www.venetianlasvegas.com', 'venetianlasvegas.com'}:
        # Series labels and ranges are adjacent visible lines in one paragraph.
        # A nearest-heading scan steals the surrounding marketing header or CTA.
        stops = []
        for paragraph in re.findall(r'<p\b[^>]*>(.*?)</p>', html, re.I | re.S):
            if not re.match(r'\s*<b\b[^>]*>\s*(?:Current|Next) Series:', paragraph, re.I):
                continue
            content = re.sub(r'^\s*<b\b[^>]*>.*?</b>', '', paragraph, count=1, flags=re.I | re.S)
            lines = [normalize_stop_name(line) for line in re.split(r'<br\s*/?>', content, flags=re.I)]
            lines = [line for line in lines if line]
            if len(lines) < 2 or not DATE_RANGE.fullmatch(lines[1]):
                continue  # "May-July TBD" is not a dated stop.
            stops.extend(extract_stops(
                f'<h2>{html_lib.escape(lines[0])}</h2><p>{html_lib.escape(lines[1])}</p>',
                base_url, today,
            ))
        return stops
    if code == 'RGPS' and host in {'www.rungood.com', 'rungood.com'}:
        stops = []
        # Scope the explicit year to the schedule heading and its adjacent table;
        # archived navigation, JSON app data and copyright cannot supply a year.
        for year, table in re.findall(
            r'<h2\b[^>]*>\s*(20\d{2}) RunGood Poker Series Fall Schedule\s*</h2>\s*<table\b[^>]*>(.*?)</table>',
            html, re.I | re.S,
        ):
            headings = [normalize_stop_name(cell).lower() for cell in re.findall(r'<th\b[^>]*>(.*?)</th>', table, re.I | re.S)]
            if headings != ['dates', 'venue', 'location']:
                continue
            for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table, re.I | re.S):
                cells = [normalize_stop_name(cell) for cell in re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.I | re.S)]
                if len(cells) != 3 or not DATE_RANGE.fullmatch(cells[0]):
                    continue
                location = re.fullmatch(r'(.+),\s*([^,]+)', cells[2])
                state = US_STATE_NAME_TO_CODE.get(location[2].upper()) if location else None
                if not state:
                    continue  # International stops are outside the US discovery scope.
                candidates = extract_stops(
                    f'<h1>{year} Schedule</h1><h2>{html_lib.escape(cells[1])}</h2><p>{html_lib.escape(cells[0])}</p>',
                    base_url, today,
                )
                for stop in candidates:
                    stop.update({'venue': cells[1], 'city': location[1], 'state': state})
                    stops.append(stop)
        return stops
    if code in {'SEMINOLE', 'SHRPO'} and host in {'www.seminolehardrockpokeropen.com', 'seminolehardrockpokeropen.com'}:
        # This official schedule publishes dated individual rows, not stop ranges.
        # Derive only the source-owned series envelope, without inventing a Main
        # Event, buy-in, venue, time or a fabricated aggregate tournament number.
        title = seminole_schedule_title(html)
        dates = []
        if title:
            for table in re.findall(r'<table\b[^>]*>(.*?)</table>', html, re.I | re.S):
                headings = [normalize_stop_name(cell).lower() for cell in re.findall(r'<th\b[^>]*>(.*?)</th>', table, re.I | re.S)]
                if headings != ['event', 'date', 'time', 'buy-in', 'tournament description', 'details']:
                    continue
                for row in re.findall(r'<tr\b[^>]*>(.*?)</tr>', table, re.I | re.S):
                    cells = [normalize_stop_name(cell) for cell in re.findall(r'<td\b[^>]*>(.*?)</td>', row, re.I | re.S)]
                    if len(cells) != 6 or not re.fullmatch(r'\d+[A-Z]?', cells[0]):
                        continue
                    match = re.fullmatch(r'[A-Za-z]+,\s*([A-Za-z]+) (\d{1,2}), (20\d{2})', cells[1])
                    if match and match[3] == title[:4]:
                        iso = _iso(match[1], int(match[2]), int(match[3]))
                        if iso:
                            dates.append(iso)
        if dates and date.fromisoformat(max(dates)) >= (today or datetime.now(timezone.utc).date()) - timedelta(days=14):
            return [{'stop_name': title.removesuffix(' Schedule'), 'start': min(dates), 'end': max(dates), 'source_scope': 'dated schedule envelope'}]
        return []
    if (str(tour_code or '').upper() == 'PGT'
            and urllib.parse.urlparse(base_url).hostname in {'www.pgt.com', 'pgt.com'}):
        stops, seen = [], set()
        cutoff = (today or datetime.now(timezone.utc).date()) - timedelta(days=14)
        def walk(value):
            if isinstance(value, list):
                for entry in value:
                    yield from walk(entry)
            elif isinstance(value, dict):
                if value.get('@type') == 'Event':
                    yield value
                for entry in value.values():
                    if isinstance(entry, (dict, list)):
                        yield from walk(entry)
        for raw in re.findall(r'<script\b[^>]*type=[\"\']application/ld\+json[\"\'][^>]*>(.*?)</script>', html, re.I | re.S):
            try:
                payload = json.loads(raw)
            except (TypeError, ValueError):
                continue
            for event in walk(payload):
                organizer = event.get('organizer') or {}
                if not isinstance(organizer, dict) or organizer.get('name') != 'PokerGO Tour':
                    continue
                name = normalize_stop_name(str(event.get('name') or ''))
                raw_start = str(event.get('startDate') or '')
                if not re.fullmatch(r'20\d{2}-\d{2}-\d{2}(?:T.*)?', raw_start) or not is_plausible_tour_stop_name(name):
                    continue
                try:
                    start = date.fromisoformat(raw_start[:10])
                except ValueError:
                    continue
                if start < cutoff or (name, start) in seen:
                    continue
                seen.add((name, start))
                stop = {'stop_name': name, 'start': start.isoformat(), 'end': start.isoformat(), 'start_only': True}
                location = event.get('location') or {}
                if isinstance(location, dict) and location.get('name'):
                    stop['venue'] = str(location['name'])
                stops.append(stop)
        return stops
    if (str(tour_code or '').upper() == 'WSOPC'
            and urllib.parse.urlparse(base_url).hostname in {'www.wsop.com', 'wsop.com'}):
        stops = []
        for card in re.findall(r'<li\b[^>]*data-competition-type=[\"\']circuit[\"\'][^>]*>(.*?)</li>', html, re.I | re.S):
            location = re.search(r'<span\b[^>]*class=[\"\']location[\"\'][^>]*>(.*?)</span>', card, re.I | re.S)
            location_text = normalize_stop_name(location[1]) if location else ''
            match = re.fullmatch(r'(.+),\s*([^,]+),\s*United States', location_text, re.I)
            if not match:
                continue
            state = {'Arizona': 'AZ', 'Ohio': 'OH'}.get(match[2], match[2])
            if not re.fullmatch('[A-Z]{2}', state):
                continue
            for stop in extract_stops(card, base_url, today):
                if not stop['stop_name'].startswith('WSOP Circuit -'):
                    continue
                stop.update({'venue': stop['stop_name'].removeprefix('WSOP Circuit - ').strip(),
                             'city': match[1], 'state': state})
                stops.append(stop)
        return stops
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
    # Visible schedule-year headings qualify yearless rows; copyright years do not.
    headings = re.findall(r'<h[1-6]>([^<>]+)</h[1-6]>', scan_html, re.I)
    schedule_years = {
        int(year) for heading in headings
        if re.search(r'\b(schedule|calendar)\b', heading, re.I)
        for year in re.findall(r'\b(20\d{2})\b', heading)
    }
    anchor_year = next(iter(schedule_years)) if len(schedule_years) == 1 else None
    prev_end = 0
    for m in DATE_RANGE.finditer(scan_html):
        context_start = prev_end
        prev_end = m.end()
        m1, d1, m2, d2, yr = m['m1'], int(m['d1']), m['m2'], int(m['d2']), m['y2']
        year = int(yr) if yr else int(m['y1']) if m['y1'] else anchor_year
        # A trailing explicit year belongs to the ending date of a crossing
        # range, while a schedule-heading anchor belongs to its starting year.
        crosses_year = bool(m2 and MONTHS.get(m2[:3].lower(), 0) < MONTHS.get(m1[:3].lower(), 0))
        start_year = int(m['y1']) if m['y1'] else year - 1 if year and yr and crosses_year else year
        start = _iso(m1, d1, start_year)
        end = _iso(m2 or m1, d2, year)
        if not start or not end:
            continue
        if end < start and yr:
            continue  # An explicitly contradictory end year is never repaired.
        if end < start:  # yearless end range wrapped (Dec 28 - Jan 4)
            y, mo, dd = end.split("-")
            end = f"{int(y) + 1}-{mo}-{dd}"
        if datetime.strptime(end, "%Y-%m-%d").date() < cutoff:
            continue
        # walk back for the nearest heading/anchor text - but never past the
        # previous date match, or a rejected nav heading lets the walker steal
        # an OLDER stop's name and mispair it with this date range.
        ctx = scan_html[max(0, m.start() - 1200, context_start):m.start()]
        name = None
        for hm in reversed(list(re.finditer(
                r"<(?:h[1-6]|a|strong|b|span|div|td|p)[^>]*>([^<>]{4,90})</", ctx, re.I))):
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

    row = {
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
    for field in ('venue', 'city', 'state'):
        if stop.get(field):
            row['stop_' + field] = stop[field]
    if stop.get('city') and stop.get('state'):
        row['notes'] = f"Source-owned stop summary from {source_url} on {scraped_at[:10]}; not an individual tournament or priced event."
    if stop.get('start_only'):
        row['notes'] = f"Source-owned JSON-LD event-start summary from {source_url} on {scraped_at[:10]}; calendar point date only, duration and event pricing not published."
    if stop.get('source_scope') == 'dated schedule envelope':
        row['notes'] = f"Source-owned series summary from dated schedule rows at {source_url} on {scraped_at[:10]}; schedule date envelope, not an individual tournament or priced event."
    if stop.get('source_scope') == 'announced festival span':
        publication = ('individual schedule published' if stop.get('schedule_published') is True
                       else 'individual schedule unpublished' if stop.get('schedule_published') is False
                       else 'individual schedule publication unknown')
        row['notes'] = f"Source-owned announced festival span from {source_url} on {scraped_at[:10]}; {publication}; source-reported venue labels, address/city unverified; not an individual tournament or priced event."
    return row


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


def refreshable_stop_matches(existing_rows: list[dict], current_stops: list[dict],
                             source_url: str) -> list[tuple[dict, dict]]:
    """Select only exact active stop summaries owned by this source/writer.

    Re-observation refreshes provenance, not manually researched records, event
    details, dates or identity. A curated equivalent remains the public owner.
    """
    current = {tour_stop_identity({'stop_name': stop.get('stop_name'),
                                   'stop_start_date': stop.get('start')}): stop
               for stop in current_stops}
    curated = {tour_stop_identity(row) for row in existing_rows
               if row.get('data_quality') in {'scraped_verified', 'manual_research'}}
    matches = []
    for row in existing_rows:
        identity = tour_stop_identity(row)
        stop = current.get(identity)
        if (not stop or identity in curated or not row.get('id')
                or row.get('data_quality') != 'scraped_inferred'
                or row.get('scrape_script') != 'tour_stealth_scraper.py'
                or str(row.get('source_url') or '').rstrip('/') != source_url.rstrip('/')
                or row.get('event_number') is not None
                or str(row.get('stop_end_date') or '')[:10] != stop.get('end')):
            continue
        matches.append((row, stop))
    return matches


def refresh_stop_provenance(code: str, row: dict, stop: dict, source_url: str,
                            html_hash: str, scraped_at: str) -> bool:
    """CAS the observed source preimage and require exact persisted readback.

    A lost response remains unconfirmed. A later scrape rereads the durable
    preimage and refreshes the same ID, never inserts a duplicate or retries an
    unknown write blindly. Dates and public identity are deliberately omitted.
    """
    if not refreshable_stop_matches([row], [stop], source_url):
        return False
    proof = build_stop_row(code, stop, source_url, html_hash, scraped_at)
    patch = {key: proof[key] for key in (
        'scrape_url', 'scrape_html_hash', 'scrape_timestamp', 'scrape_script',
        'notes',
    )}
    expected = {key: row.get(key) for key in (
        'id', 'stop_name', 'stop_start_date', 'stop_end_date', 'data_quality',
        'scrape_script', 'source_url', 'scrape_timestamp', 'scrape_html_hash',
        'event_number',
    )}
    expected['tour_code'] = code
    filt = '&'.join(
        f'{key}=is.null' if value is None else
        f'{key}=eq.{urllib.parse.quote(str(value), safe="")}'
        for key, value in expected.items()
    )
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/tour_stop_events?{filt}',
        data=json.dumps(patch).encode(), method='PATCH', headers=SB_PATCH_HDRS,
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            returned = json.loads(response.read() or b'[]')
        if not isinstance(returned, list) or len(returned) != 1:
            return False
        actual = returned[0]
        if not isinstance(actual, dict) or str(actual.get('id')) != str(row['id']):
            return False
        if any(actual.get(key) != value for key, value in expected.items() if key not in patch):
            return False
        for key, value in patch.items():
            if key == 'scrape_timestamp':
                if datetime.fromisoformat(str(actual.get(key)).replace('Z', '+00:00')) != datetime.fromisoformat(value.replace('Z', '+00:00')):
                    return False
            elif actual.get(key) != value:
                return False
        return True
    except Exception as exc:
        log(f'  [REFRESH ERR] tour_stop_events: {type(exc).__name__}')
        return False


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
    ("RGPS", "RunGood Poker Series", "https://www.rungood.com/blogs/tour-news-1/rungood-poker-series-announces-2026-fall-season-golden-expedition"),
    ("CPPT", "Card Player Poker Tour", "https://www.cardplayerpokertour.com/schedule/"),
    ("PGT", "PokerGO Tour", "https://www.pgt.com/schedule"),
    ("NAPT", "North American Poker Tour", "https://www.pokerstarslive.com/napt/schedule/"),
    ("GCPT", "Gulf Coast Poker Tour", "https://gulfcoastpoker.net/schedule/"),
    ("FPN", "Free Poker Network", "https://freepokernet.com/schedule"),
    ("LIPS", "Ladies International Poker Series", "https://www.lipspoker.org/schedule"),
    ("ROUGHRIDER", "Roughrider Poker Tour", "https://roughriderpokertour.com/schedule/"),
    ("PAT", "PokerAtlas Tour", "https://pokeratlastour.com/schedule"),
    ("SHRPO", "Seminole Hard Rock Poker Open", "https://www.seminolehardrockpokeropen.com/2026-rock-n-roll-poker-open-schedule/"),
    ("VENETIAN", "Venetian DeepStack", "https://www.venetianlasvegas.com/resort/casino/poker/deepstack-extravaganza-poker-tournament.html"),
    ("BORGATA", "Borgata Poker Series", "https://www.theborgata.com/casino/poker/tournaments"),
    ("LODGE", "Lodge Championship Series", "https://thelodgepokerclub.com/austin/lcs/"),
    ("TCH", "Texas Card House Series", "https://trailblazer.texascardhouse.com/"),
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
            stops = extract_stops(html, final_url or url, tour_code=code)
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
                    f"data_quality,scrape_script,source_url,scrape_timestamp,"
                    f"scrape_html_hash,event_number&tour_code=eq."
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
                    refreshes = refreshable_stop_matches(
                        existing_rows, stops, effective_source_url,
                    )
                    rows = [
                        build_stop_row(code, s, effective_source_url, hhash, now_iso)
                        for s in fresh
                    ]
                    attempted = len(rows) + len(reactivations) + len(refreshes)
                    written = sb_insert("tour_stop_events", rows)
                    for stale_row, current_stop in reactivations:
                        patch = build_stop_row(
                            code, current_stop, effective_source_url, hhash, now_iso,
                        )
                        if sb_patch_exact_ids(
                            "tour_stop_events", [str(stale_row["id"])], patch,
                        ):
                            written += 1
                    for observed_row, current_stop in refreshes:
                        if refresh_stop_provenance(
                            code, observed_row, current_stop,
                            effective_source_url, hhash, now_iso,
                        ):
                            written += 1
                    rejected = attempted - written
                    log(f"    {written}/{attempted} new, reactivated or refreshed row(s) confirmed "
                        f"({len(stops) - len(fresh) - len(reactivations) - len(refreshes)} other exact "
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
        f"{total_written}/{total_attempted} persisted rows confirmed, "
        f"{total_rejected} rejected, {source_errors} source/write errors")
    log("=" * 70)
    # Non-zero exit when the run wrote nothing AND found nothing - the launcher
    # and watchdog treat that as a failed run, not a quiet success.
    if tours_ok == 0 or total_rejected > 0 or source_errors > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
