from __future__ import annotations
from typing import Optional
#!/usr/bin/env python3
"""
poker_series_scraper.py — Poker Series Tournament Event Scraper
================================================================
Cloned from daily_venue_scraper.py, adapted for Poker Series context.

Merges the checked-in poker-series catalog with the current PokerAtlas listing,
then scrapes each series page for tournament events using Scrapling
StealthySession + camoufox (Cloudflare bypass), and upserts to the
poker_events + poker_series Supabase tables.

MANDATORY: Scrapling StealthySession ONLY — no urllib/requests for data.
MANDATORY: 6-Layer Data Integrity Framework compliance.
MANDATORY: SHA-256 provenance on every record.
MANDATORY: Evidence files saved before any DB write.
MANDATORY: Anti-hallucination guards enforced.

Usage:
    .venv/bin/python3 scripts/poker_series_scraper.py                       # all unscraped
    .venv/bin/python3 scripts/poker_series_scraper.py --enrich              # re-scrape low-score
    .venv/bin/python3 scripts/poker_series_scraper.py --force               # re-scrape ALL
    .venv/bin/python3 scripts/poker_series_scraper.py --series <slug>       # single series
    .venv/bin/python3 scripts/poker_series_scraper.py --limit 10            # first N only
    .venv/bin/python3 scripts/poker_series_scraper.py --state NV            # filter by state
    .venv/bin/python3 scripts/poker_series_scraper.py --dry-run             # no DB writes
    .venv/bin/python3 scripts/poker_series_scraper.py --min-score 40        # enrich threshold
"""

import argparse, hashlib, html as html_lib, io, json, os, re, sys, time, uuid, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta, date as date_cls
from pathlib import Path

import os as _bh_os, sys as _bh_sys
_bh_sys.path.insert(0, _bh_os.path.dirname(_bh_os.path.abspath(__file__)))
from scraper_data_truth import is_poker_tournament_event_text

# Browser self-heal — launchd runs this daemon directly, so shell-level healing
# in the launchers never fires. See scripts/browser_heal.py for the 2026-07-26
# incident where a missing chromium revision kept this daemon down for days.
try:
    import browser_heal as _browser_heal
except Exception:  # pragma: no cover - heal is best-effort
    _browser_heal = None


try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR      = PROJECT_ROOT / "data" / "tournament-logs"
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence" / "series-scraper"
MASTER_LIST  = PROJECT_ROOT / "data" / "master_poker_series_list.json"
LOG_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
def _load_supabase_key():
    """launchd jobs do not inherit shell env; the old fallback chain read the
    SAME env var twice, so a missing var became SUPABASE_KEY=None and every
    PostgREST call failed with urllib's 'expected string or bytes-like object'
    (None header) - 689 scraped event rows were dropped PER RUN with the
    scrape itself reporting success. Fall back to parsing .env.local."""
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
if not SUPABASE_KEY:
    print("FATAL: SUPABASE_SERVICE_ROLE_KEY not in environment or .env.local - "
          "every DB write would silently fail. Exiting.", flush=True)
    raise SystemExit(2)
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

# Upsert needs the written rows back so we can verify the DB actually accepted
# every record — `return=minimal` makes partial rejections invisible.
SB_UPSERT_HDRS = {
    **SB_HDRS,
    "Prefer": "resolution=merge-duplicates,return=representation",
}

EVENT_ON_CONFLICT = "event_uid"

# Run-level error counters — a run that lost rows must NOT exit 0.
# `series_errors` counts THIRD-PARTY fetch failures; the other three count OUR
# faults. The exit gate at the foot of this file treats them differently for
# that reason - see the note there.
RUN_ERRORS = {"upsert_failed": 0, "rows_lost": 0, "patch_failed": 0, "series_errors": 0}

# PRODUCTIVITY IS NOT AN ERROR, AND MUST NOT LIVE IN RUN_ERRORS.
#
# `series_resolved` was briefly a key in RUN_ERRORS, and the daemon computes
# `degraded = any(bool(value) for value in run_errors.values())` - so a
# PERFECT cycle that resolved 40 series set degraded=True, dropped the sleep
# from 21600s to 300s, and never reset the error streak. Four extra full
# third-party sweeps an hour, every hour, plus "Run completed with integrity
# errors" on a healthy run.
RUN_STATS = {"series_resolved": 0}

# Extraction-path → (data_quality, scrape_confidence).
# Structured JSON is trustworthy; regex scraped off raw HTML/PDF is not, and must
# never be stamped 'scraped_verified'/'high' alongside it.
SOURCE_QUALITY = {
    "pokeratlas":      ("scraped_verified", "high"),
    "hendonmob":       ("scraped_inferred", "medium"),
    "cardplayer":      ("scraped_inferred", "medium"),
    "pokeratlas_html": ("scraped_inferred", "low"),
    "html_fallback":   ("scraped_inferred", "low"),
    "source_url":      ("scraped_inferred", "low"),
    "pdf_fallback":    ("scraped_inferred", "low"),
    "bravo_venue":     ("scraped_inferred", "low"),
    "venue_website":   ("scraped_inferred", "low"),
    "venue_subpage":   ("scraped_inferred", "low"),
}

# Programming defects must never be swallowed as "this source had no events" —
# that is how a NameError silently killed the entire HendonMob source.
CODE_DEFECTS = (NameError, TypeError, AttributeError, IndexError, KeyError,
                ImportError, UnboundLocalError)

def quality_for(source: str) -> tuple:
    return SOURCE_QUALITY.get(source or "", ("scraped_inferred", "low"))

def stamp_source(records: list, source: str) -> list:
    """Set source AND the matching provenance markers on every record.
    Callers that re-label a batch (e.g. html_fallback rows fetched from Bravo)
    must go through here so data_quality never drifts from the real path."""
    dq, conf = quality_for(source)
    for r in records:
        r["source"] = source
        r["data_quality"] = dq
        r["scrape_confidence"] = conf
    return records

CHUNK_SIZE    = 10
SERIES_RATE_S = 3.0
PAGE_RECYCLE  = 25
SESSION_MAX   = 21600
CIRCUIT_MAX   = 5
ENRICH_FAIL_MAX = 5  # after 5 fails, flag as permanently_ungettable
REFRESH_AFTER_HOURS = 24   # re-scrape a series whose last_scraped is older than this
PA_SERIES_LISTING_URL = "https://www.pokeratlas.com/poker-tournament-series"
DAEMON_NORMAL_SLEEP_SECONDS = 6 * 60 * 60
DAEMON_ERROR_BACKOFF_SECONDS = (300, 900, 1800, 3600, 6 * 60 * 60)


def daemon_cycle_control(rows_written: object, run_errors: dict,
                         previous_error_streak: int) -> dict:
    """Choose in-process daemon recovery without hiding a degraded cycle.

    One-shot callers still exit non-zero from the CLI guard below. Continuous
    mode instead keeps the same observable process alive and applies a bounded
    producer backoff. Confirmed writes refresh watchdog liveness even when some
    sources failed, but they do not make that cycle healthy or reset backoff.
    """

    try:
        confirmed_rows = max(0, int(rows_written or 0))
    except (TypeError, ValueError):
        confirmed_rows = 0
    degraded = any(bool(value) for value in (run_errors or {}).values())
    if degraded:
        error_streak = max(0, int(previous_error_streak or 0)) + 1
        delay_index = min(error_streak - 1, len(DAEMON_ERROR_BACKOFF_SECONDS) - 1)
        sleep_seconds = DAEMON_ERROR_BACKOFF_SECONDS[delay_index]
    else:
        error_streak = 0
        sleep_seconds = DAEMON_NORMAL_SLEEP_SECONDS
    return {
        "degraded": degraded,
        "refresh_liveness": confirmed_rows > 0,
        "error_streak": error_streak,
        "sleep_seconds": sleep_seconds,
    }

# Words that describe almost every series page and therefore cannot prove that
# a fetched page belongs to the requested series.  Identity is established from
# the remaining name/slug tokens or from an exact canonical series URL.
SERIES_IDENTITY_NOISE = {
    "and", "at", "casino", "club", "event", "events", "hotel", "in",
    "of", "open", "poker", "resort", "series", "the", "tournament",
}


def _visible_text(value: str) -> str:
    return re.sub(
        r"\s+", " ", re.sub(r"<[^>]+>", " ", html_lib.unescape(value or ""))
    ).strip()


def sanitize_series_event_name(value: object) -> Optional[str]:
    """Return decoded visible event text, or None for parser/DOM artifacts."""

    raw = str(value or "").strip()
    if not raw or "<" in raw or ">" in raw:
        return None
    name = re.sub(r"[\u2012-\u2015]", " - ", html_lib.unescape(raw))
    name = re.sub(r"\s+", " ", name).strip()
    if "<" in name or ">" in name:
        return None
    lowered = name.lower()
    if lowered in {
        "script", "id=", "content", "true", "false", "null", "undefined",
    }:
        return None
    if re.fullmatch(r"https?://\S+", name, re.I):
        return None
    if any(marker in lowered for marker in (
        "charset=", "class=", "href=", "src=", "style=", "wixui-",
        "addthis_tool", "eventattendancemode",
    )):
        return None
    return name[:150]


def _series_identity_tokens(value: str) -> set[str]:
    tokens = set(re.findall(r"[a-z0-9]+", html_lib.unescape(value or "").lower()))
    return {
        token for token in tokens
        if token not in SERIES_IDENTITY_NOISE
        and not re.fullmatch(r"20\d{2}", token)
        and len(token) > 1
    }


def source_series_identity_matches(series_name: str, candidate: str) -> bool:
    """Require a source-owned label to preserve the series identity."""

    expected = _series_identity_tokens(series_name)
    observed = _series_identity_tokens(candidate)
    if not expected or not observed:
        return False
    overlap = expected & observed
    required = len(expected) if len(expected) <= 2 else max(2, (len(expected) + 1) // 2)
    return len(overlap) >= required


def select_physical_series_venue(series_name: str, series_state: str,
                                 venues: list[dict]) -> Optional[dict]:
    """Find one unambiguous physical venue referenced by a series name."""

    expected = _series_identity_tokens(series_name)
    if not expected:
        return None
    effective_state = str(series_state or "").upper()
    if not effective_state:
        # Legacy poker_series rows often lack state, while the historical venue
        # catalog still carries an exact non-physical series identity. Use that
        # state only as a matching constraint; never scrape the series row itself.
        normalized_name = _visible_text(series_name).casefold()
        catalog_states = {
            str(venue.get("state") or "").upper()
            for venue in venues
            if str(venue.get("venue_type") or "").lower() not in {
                "casino", "charity", "poker_club",
            }
            and _visible_text(str(venue.get("name") or "")).casefold() == normalized_name
            and venue.get("state")
        }
        if len(catalog_states) == 1:
            effective_state = next(iter(catalog_states))
    ranked = []
    for venue in venues:
        if str(venue.get("venue_type") or "").lower() not in {
            "casino", "charity", "poker_club",
        }:
            continue
        venue_state = str(venue.get("state") or "").upper()
        if effective_state and venue_state != effective_state:
            continue
        venue_tokens = _series_identity_tokens(str(venue.get("name") or ""))
        overlap = expected & venue_tokens
        minimum_overlap = 1 if effective_state or len(expected) == 1 else 2
        if len(overlap) < minimum_overlap:
            continue
        expected_coverage = len(overlap) / len(expected)
        venue_coverage = len(overlap) / len(venue_tokens) if venue_tokens else 0
        if max(expected_coverage, venue_coverage) < 0.5:
            continue
        first = next(iter(re.findall(r"[a-z0-9]+", str(venue.get("name") or "").lower())), "")
        ranked.append(((len(overlap), expected_coverage, venue_coverage, int(first in expected)), venue))
    if not ranked:
        return None
    ranked.sort(key=lambda item: item[0], reverse=True)
    if len(ranked) > 1 and ranked[0][0] == ranked[1][0]:
        return None
    return ranked[0][1]


def venue_page_confirms_series(series_name: str, venue_name: str, page_html: str) -> bool:
    """Require source-owned, phrase-level series identity on a venue page.

    Arbitrary body token overlap is not identity. A Wynn page mentioning
    ``signature cocktails`` or a Choctaw page containing unrelated ``daily``
    and ``classic`` words must not become a named poker series. Accept the
    series phrase only in title/heading/canonical surfaces or beside a concrete
    schedule date in one bounded event container.
    """

    def words(value: str) -> list[str]:
        return [
            token for token in re.findall(
                r"[a-z0-9]+", html_lib.unescape(str(value or "")).lower(),
            )
            if not re.fullmatch(r"20\d{2}", token)
        ]

    series_words = words(series_name)
    venue_words = set(words(venue_name))
    specific_words = [
        word for word in series_words
        if word not in venue_words and word not in {"at", "of", "the", "in"}
    ]
    phrases = []
    if len(specific_words) >= 2:
        phrases.append(" ".join(specific_words))
    if len(series_words) >= 2:
        phrases.append(" ".join(series_words))
    phrases = list(dict.fromkeys(phrase for phrase in phrases if phrase))
    if not phrases:
        return False

    def phrase_matches(value: str) -> bool:
        candidate = " ".join(words(value))
        return any(
            re.search(rf"(?:^| ){re.escape(phrase)}(?: |$)", candidate)
            for phrase in phrases
        )

    source_owned = []
    for tag_name in ("title", "h1", "h2", "h3", "h4", "caption"):
        source_owned.extend(
            _visible_text(match.group(1))
            for match in re.finditer(
                rf"<{tag_name}\b[^>]*>(.*?)</{tag_name}>",
                page_html or "", re.I | re.DOTALL,
            )
        )
    for tag in re.findall(r"<(?:meta|link)\b[^>]*>", page_html or "", re.I):
        attrs = {
            key.lower(): value
            for key, _quote, value in re.findall(
                r"([:\w-]+)\s*=\s*(['\"])(.*?)\2", tag, re.I | re.DOTALL,
            )
        }
        prop = attrs.get("property", "").lower()
        name = attrs.get("name", "").lower()
        rel = attrs.get("rel", "").lower()
        if prop in ("og:title", "twitter:title") or name in (
            "og:title", "twitter:title",
        ):
            source_owned.append(attrs.get("content", ""))
        if "canonical" in rel and attrs.get("href"):
            source_owned.append(
                urllib.parse.urlsplit(attrs["href"]).path.replace("-", " ")
            )
    if any(phrase_matches(candidate) for candidate in source_owned):
        return True

    date_pattern = re.compile(
        r"\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
        r"jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|"
        r"nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}\b|"
        r"\b20\d{2}-\d{2}-\d{2}\b|\b\d{1,2}/\d{1,2}/20\d{2}\b",
        re.I,
    )
    for match in re.finditer(
        r"<(?:article|li|tr|section|div)\b[^>]*>(.*?)</(?:article|li|tr|section|div)>",
        page_html or "", re.I | re.DOTALL,
    ):
        candidate = _visible_text(match.group(1))
        if len(candidate) <= 600 and date_pattern.search(candidate) \
                and phrase_matches(candidate):
            return True
    return False


def extract_pa_series_listing(page_html: str) -> list[dict]:
    """Return canonical series entries from the live PokerAtlas listing.

    The listing is a discovery source only.  Event facts are still accepted
    solely from each individual series page, with their own hash/timestamp.
    """
    entries: list[dict] = []
    seen: set[str] = set()
    anchor_re = re.compile(
        r'<a\b[^>]*href=["\'](?:https?://(?:www\.)?pokeratlas\.com)?'
        r'/poker-tournament-series/([a-z0-9][a-z0-9-]{5,})'
        r'(?:[?#][^"\']*)?["\'][^>]*>(.*?)</a>',
        re.I | re.S,
    )
    for match in anchor_re.finditer(page_html or ""):
        slug = match.group(1).strip("-").lower()
        if slug in seen or "-" not in slug:
            continue
        # Navigation/filter artifacts have little or no identity-bearing text.
        slug_tokens = _series_identity_tokens(slug.replace("-", " "))
        if len(slug_tokens) < 2:
            continue
        seen.add(slug)
        label = _visible_text(match.group(2))
        if len(_series_identity_tokens(label)) < 1:
            label = " ".join(part.capitalize() for part in slug.split("-"))
        entries.append({
            "id": f"pa_{slug}",
            "name": label,
            "source_url": f"{PA_SERIES_LISTING_URL}/{slug}",
            "schedule_status": "published",
            "scrape_source": "pokeratlas_live_listing",
        })
    return entries


def merge_series_catalog(master: list[dict], discovered: list[dict]) -> list[dict]:
    """Put live discoveries first, then retain unique legacy/master entries."""
    master_by_id = {str(row.get("id", "")): row for row in master}
    merged: list[dict] = []
    seen: set[str] = set()
    for live in discovered:
        sid = str(live.get("id", ""))
        if not sid or sid in seen:
            continue
        # Retain curated metadata while making the current canonical URL/name
        # authoritative for this run.
        row = {**master_by_id.get(sid, {}), **live}
        merged.append(row)
        seen.add(sid)
    for row in master:
        sid = str(row.get("id", ""))
        if sid and sid not in seen:
            merged.append(row)
            seen.add(sid)
    return merged


def pa_series_page_matches(series: dict, page_html: str, requested_url: str) -> bool:
    """Reject generic redirects and stale URLs that resolve to another series."""
    if not page_html:
        return False
    expected_uid = str(series.get("id") or "")
    expected_slug = expected_uid[3:] if expected_uid.startswith("pa_") else ""

    canonical_match = re.search(
        r'<link\b[^>]*rel=["\'][^"\']*canonical[^"\']*["\'][^>]*'
        r'href=["\']([^"\']+)["\']|'
        r'<link\b[^>]*href=["\']([^"\']+)["\'][^>]*'
        r'rel=["\'][^"\']*canonical[^"\']*["\']',
        page_html,
        re.I,
    )
    canonical_url = next((g for g in canonical_match.groups() if g), "") if canonical_match else ""
    canonical_slug_match = re.search(
        r"^/poker-tournament-series/([a-z0-9-]+)/?$",
        urllib.parse.urlsplit(urllib.parse.urljoin(requested_url, canonical_url)).path,
        re.I,
    ) if canonical_url else None
    canonical_slug = canonical_slug_match.group(1).lower() if canonical_slug_match else ""
    # A PokerAtlas room, directory, or generic tournaments canonical is
    # explicit evidence that the response is not a series detail page. Never
    # let generic title overlap override that source-owned route identity.
    if canonical_url and not canonical_slug_match:
        return False
    if expected_slug and canonical_slug:
        return canonical_slug == expected_slug.lower()

    headings = []
    for pattern in (
        r'<h1\b[^>]*>(.*?)</h1>',
        r'<meta\b[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)',
        r'<title\b[^>]*>(.*?)</title>',
    ):
        found = re.search(pattern, page_html, re.I | re.S)
        if found:
            headings.append(_visible_text(found.group(1)))
    # Without an exact canonical slug, accept only a complete, multi-token
    # identity in one source-owned title/heading. One generic token (for
    # example "Classic") or venue-only overlap ("Wynn") is not a series
    # identity and must not authorize event writes.
    expected_identities = []
    for value in (series.get("name") or "", expected_slug.replace("-", " ")):
        tokens = _series_identity_tokens(value)
        if len(tokens) >= 2 and tokens not in expected_identities:
            expected_identities.append(tokens)
    if not expected_identities:
        return False
    for heading in headings:
        observed = _series_identity_tokens(heading)
        if any(expected <= observed for expected in expected_identities):
            return True
    return False


def extract_pa_series_page_name(page_html: str, fallback: str) -> str:
    """Extract a concise source-owned series name after identity validation."""
    for pattern in (
        r'<h1\b[^>]*>(.*?)</h1>',
        r'<meta\b[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)',
        r'<title\b[^>]*>(.*?)</title>',
    ):
        found = re.search(pattern, page_html or "", re.I | re.S)
        if not found:
            continue
        candidate = re.sub(r"\s*[|:-]\s*PokerAtlas\s*$", "", _visible_text(found.group(1)), flags=re.I)
        if candidate and _series_identity_tokens(candidate):
            return candidate[:180]
    return _visible_text(fallback)[:180] or "Poker tournament series"

# State → timezone map
STATE_TZ = {
    "AK":"America/Anchorage","HI":"Pacific/Honolulu",
    "CA":"America/Los_Angeles","NV":"America/Los_Angeles","WA":"America/Los_Angeles",
    "OR":"America/Los_Angeles","AZ":"America/Phoenix",
    "MT":"America/Denver","ID":"America/Denver","WY":"America/Denver",
    "UT":"America/Denver","CO":"America/Denver","NM":"America/Denver",
    "TX":"America/Chicago","OK":"America/Chicago","KS":"America/Chicago",
    "NE":"America/Chicago","SD":"America/Chicago","ND":"America/Chicago",
    "MN":"America/Chicago","IA":"America/Chicago","MO":"America/Chicago",
    "WI":"America/Chicago","IL":"America/Chicago","MS":"America/Chicago",
    "LA":"America/Chicago","AR":"America/Chicago","AL":"America/Chicago",
    "TN":"America/Chicago","MI":"America/Detroit",
    "ME":"America/New_York","NH":"America/New_York","VT":"America/New_York",
    "MA":"America/New_York","RI":"America/New_York","CT":"America/New_York",
    "NY":"America/New_York","NJ":"America/New_York","PA":"America/New_York",
    "DE":"America/New_York","MD":"America/New_York","DC":"America/New_York",
    "VA":"America/New_York","WV":"America/New_York","NC":"America/New_York",
    "SC":"America/New_York","GA":"America/New_York","FL":"America/New_York",
    "OH":"America/New_York","IN":"America/Indiana/Indianapolis",
    "KY":"America/New_York",
}

log_path = LOG_DIR / f"poker_series_scraper_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(log_path, "a") as f: f.write(line + "\n")
    except: pass

def sha256h(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[''`]", "", s).lower()).strip("-")

def stable_event_uid(series_uid: str, event_name, start_date, buy_in,
                     prefix: str = "e", start_time=None) -> str:
    """Deterministic event_uid built from stable CONTENT only.

    The upsert conflicts on event_uid, so the id must be reproducible across
    re-scrapes — anything derived from parse ordering (a running match counter)
    turns every re-scrape into a duplicate INSERT instead of an UPDATE.

    start_time is part of the seed because a venue routinely runs the SAME
    name/date/buy-in tournament twice in one day (noon + evening). Without it
    both rows hash to one uid, and two identical conflict targets inside a single
    PostgREST batch make Postgres raise 21000 ("ON CONFLICT DO UPDATE command
    cannot affect row a second time"), which rejects the whole 100-row chunk.
    """
    norm_name = re.sub(r"\s+", " ", str(event_name or "").strip().lower())[:80]
    seed = (f"{series_uid}|{norm_name}|{start_date or ''}|{buy_in or ''}"
            f"|{start_time or ''}")
    return f"{series_uid}_{prefix}_{hashlib.md5(seed.encode()).hexdigest()[:12]}"

# ── Scrapling Fetcher for non-Cloudflare sites (MANDATORY per Data Integrity) ──
def scrapling_fetch(url: str, timeout: int = 15) -> tuple:
    """Fetch non-Cloudflare source data with Scrapling, or fail closed."""
    try:
        from scrapling.fetchers import Fetcher
        page = Fetcher.get(url, stealthy_headers=True, timeout=timeout)
        body = page.body or (page.text.encode() if page.text else b'')
        html_str = body.decode('utf-8', errors='replace') if isinstance(body, bytes) else str(body)
        h = sha256h(body if isinstance(body, bytes) else html_str.encode('utf-8'))
        return html_str, page.status, body, h
    except ImportError as exc:
        RUN_ERRORS["series_errors"] += 1
        log(
            "      [SOURCE ERR] Scrapling Fetcher unavailable; refusing "
            f"unsanctioned urllib source fallback: {exc}"
        )
        return "", 0, b"", ""
    except Exception as e:
        RUN_ERRORS["series_errors"] += 1
        log(f"      [SOURCE ERR] Scrapling Fetcher failed: {type(e).__name__}: {str(e)[:160]}")
        return "", 0, b"", ""

# ── Network pre-check (MANDATORY per Scrapling skill) ─────────────────────────
def network_ok() -> bool:
    """HEAD https://1.1.1.1 — MUST pass before any StealthySession.start()."""
    for url in ("https://1.1.1.1", "https://www.google.com"):
        try:
            req = urllib.request.Request(url, method="HEAD")
            urllib.request.urlopen(req, timeout=5)
            return True
        except: continue
    return False

# ── Date/time helpers ─────────────────────────────────────────────────────────
MONTHS = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
    "sep":9,"oct":10,"nov":11,"dec":12,
}
DAYS_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Daily"]
DAY_MAP   = {"mon":"Monday","tue":"Tuesday","wed":"Wednesday","thu":"Thursday",
             "fri":"Friday","sat":"Saturday","sun":"Sunday","daily":"Daily",
             "nightly":"Daily","weekday":"Monday","weekend":"Saturday"}
_PA_DAYS  = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
DAY_NUM   = {"Monday":0,"Tuesday":1,"Wednesday":2,"Thursday":3,
             "Friday":4,"Saturday":5,"Sunday":6}

def parse_date(text: str) -> Optional[str]:
    now = datetime.now(timezone.utc)
    m = re.search(r"\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b", text)
    if m: return m.group(0)
    m2 = re.search(r"\b("+"|".join(MONTHS)+r")\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?", text, re.I)
    if m2:
        mo,day,yr = MONTHS[m2.group(1).lower()], int(m2.group(2)), int(m2.group(3) or now.year)
        try:
            dt = datetime(yr,mo,day,tzinfo=timezone.utc)
            if dt < now - timedelta(days=1): dt = dt.replace(year=yr+1)
            return dt.strftime("%Y-%m-%d")
        except: pass
    m3 = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", text)
    if m3:
        mo,day = int(m3.group(1)), int(m3.group(2))
        yr = int(m3.group(3) or now.year)
        if yr < 100: yr += 2000
        if 1<=mo<=12 and 1<=day<=31:
            try:
                dt = datetime(yr,mo,day,tzinfo=timezone.utc)
                if dt < now - timedelta(days=1): dt = dt.replace(year=yr+1)
                return dt.strftime("%Y-%m-%d")
            except: pass
    return None

def parse_date_series(text: str, series_year: int = 0) -> Optional[str]:
    """
    Series-aware date parser — NEVER rolls dates forward.
    Series events have fixed dates; Mar 25 2026 stays 2026 even if past.
    Uses series_year hint from series uid e.g. 'pa_2026-spring-classic' -> 2026.
    """
    now = datetime.now(timezone.utc)
    # Full ISO date wins always
    m = re.search(r"\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b", text)
    if m: return m.group(0)
    yr_hint = series_year
    if not yr_hint:
        yh = re.search(r"\b(202[3-9])\b", text)
        if yh: yr_hint = int(yh.group(1))
    if not yr_hint:
        yr_hint = now.year
    m2 = re.search(r"\b("+"|".join(MONTHS)+r")\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?", text, re.I)
    if m2:
        mo = MONTHS[m2.group(1).lower()]
        day = int(m2.group(2))
        yr = int(m2.group(3) or yr_hint)
        try:
            return datetime(yr, mo, day, tzinfo=timezone.utc).strftime("%Y-%m-%d")
        except: pass
    m3 = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", text)
    if m3:
        mo, day = int(m3.group(1)), int(m3.group(2))
        yr = int(m3.group(3) or yr_hint)
        if yr < 100: yr += 2000
        if 1<=mo<=12 and 1<=day<=31:
            try:
                return datetime(yr, mo, day, tzinfo=timezone.utc).strftime("%Y-%m-%d")
            except: pass
    return None

def extract_series_year(series_uid: str) -> int:
    """Extract year from a series uid like 'pa_2026-spring-classic' -> 2026."""
    m = re.search(r"\b(202[3-9])\b", series_uid)
    if m: return int(m.group(1))
    return 0

def normalize_day(text: str) -> str:
    tl = text.lower()
    for d in DAYS_FULL:
        if d.lower() in tl: return d
    for k,v in DAY_MAP.items():
        if re.search(rf"\b{k}\b", tl): return v
    return "Daily"

def normalize_time(raw: str) -> str:
    m = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))\b", str(raw))
    if not m: return ""
    t = m.group(1).upper().strip()
    if t.endswith("A"): t += "M"
    if t.endswith("P"): t += "M"
    return t

def normalize_time_to_24h(raw: str) -> Optional[str]:
    """Convert '11:00am' / '6:00 PM' → '11:00:00' (24h HH:MM:SS for DB)."""
    if not raw: return None
    raw = raw.strip().upper().replace("A.M.","AM").replace("P.M.","PM")
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)?", raw)
    if not m: return None
    h, mi = int(m.group(1)), int(m.group(2))
    ampm = m.group(3)
    if ampm == "PM" and h < 12: h += 12
    if ampm == "AM" and h == 12: h = 0
    return f"{h:02d}:{mi:02d}:00"

def game_from(text: str) -> str:
    u = text.upper()
    if "PLO" in u or "OMAHA" in u: return "PLO"
    if "MIXED" in u or "HORSE" in u or "8-GAME" in u: return "Mixed"
    if "STUD" in u: return "Stud"
    if "RAZZ" in u: return "Razz"
    return "NLH"

def game_from_pa(text: str) -> str:
    """Map PokerAtlas game_type strings to normalized game types."""
    u = text.upper()
    if "NL HOLDEM" in u or "NO LIMIT HOLD" in u or "NLH" in u: return "NL Holdem"
    if "PLO" in u or "POT LIMIT OMAHA" in u: return "PLO"
    if "OMAHA" in u and "HI-LO" in u: return "Omaha Hi-Lo"
    if "OMAHA" in u: return "PLO"
    if "MIXED" in u or "HORSE" in u or "8-GAME" in u: return "Mixed"
    if "STUD" in u: return "Stud"
    if "RAZZ" in u: return "Razz"
    if "LIMIT HOLD" in u and "NO LIMIT" not in u: return "Limit Holdem"
    return text[:50] if text else "NL Holdem"

# The normalized values game_from_pa() is allowed to produce. Anything else is
# its pass-through branch echoing raw source text, which must never be written
# into game_type when the input was a whole table cell rather than a game label.
KNOWN_GAME_TYPES = frozenset({
    "NL Holdem", "PLO", "Omaha Hi-Lo", "Mixed", "Stud", "Razz", "Limit Holdem",
})

def fmt_from(text: str) -> Optional[str]:
    for f,pat in [
        ("Mystery Bounty","mystery.?bounty"),("Progressive KO","progressive|PKO"),
        ("Bounty","bounty"),("Deep Stack","deep.?stack"),("Turbo","turbo"),
        ("Rebuy","rebuy"),("Freezeout","freezeout"),("Satellite","satellite"),
        ("Freeroll","freeroll"),("Shootout","shootout"),("Hyper","hyper"),
        ("Multi-Flight","multi.?flight"),("6-Max","6.?max"),("8-Max","8.?max"),
    ]:
        if re.search(pat, text, re.I): return f
    return None

def safe_int(obj: dict, keys: list, default=None):
    for k in keys:
        v = obj.get(k)
        if v is None: continue
        try:
            if isinstance(v, str): v = re.sub(r"[^0-9]","",v)
            i = int(float(v))
            if i > 0: return i
        except: pass
    return default

def safe_int_text(txt: str, pattern: str) -> int | None:
    m = re.search(pattern, txt, re.I)
    if not m: return None
    try: return int(m.group(1).replace(",",""))
    except: return None

# ── Completeness scoring (matches daily_venue_scraper formula) ─────────────────
def compute_completeness(rec: dict) -> int:
    """Score 0-100 based on how many key fields are populated.
    Rich fields (70%): starting_stack, level_duration_minutes, rebuy_addon,
        late_reg_levels, guarantee, format, max_entries, bounty_amount,
        structure_sheet_url, payout_levels, timezone, blind_levels
    Base fields (30%): event_name, buy_in, game_type, start_date, start_time
    """
    rich_fields = [
        "starting_stack", "level_duration_minutes", "rebuy_addon",
        "late_reg_levels", "guarantee", "format", "max_entries",
        "bounty_amount", "structure_sheet_url", "payout_levels",
        "timezone", "blind_levels",
    ]
    filled = sum(1 for f in rich_fields if rec.get(f) not in (None, "", 0, False))

    base_fields = ["event_name", "buy_in", "game_type", "start_date", "start_time"]
    base_score = sum(1 for f in base_fields if rec.get(f) not in (None, "", 0))
    return min(100, round((filled / len(rich_fields)) * 70 + (base_score / len(base_fields)) * 30))

TOURN_KW = re.compile(
    r"tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|freeroll|"
    r"freezeout|rebuy|deep.?stack|daily poker|poker schedule|nlh|no.limit|"
    r"weekly poker|event schedule|holdem|poker room", re.I
)
def has_tourn(html: str) -> bool:
    return bool(TOURN_KW.search(html[:60000]))

# ── Anti-hallucination guard ───────────────────────────────────────────────────
def anti_hallucination_ok(records: list) -> bool:
    """Reject suspicious AI-generated patterns."""
    if len(records) < 2: return True
    buyins = [r["buy_in"] for r in records if r.get("buy_in")]

    # Red flag 1: >95% buy-ins are round $100 multiples.
    # NOT a rejection on its own — real series buy-ins ($200/$400/$1,100/$10,000)
    # are legitimately all $100 multiples. Logged so it shows up in the run log.
    if len(buyins) >= 5 and sum(1 for b in buyins if b % 100 == 0) / len(buyins) > 0.95:
        log("      ⚠️  [ANTI-HALLU] every buy-in is a round $100 multiple — review batch")

    # Red flag 2: slots have identical date-time-buyin (copy-paste ghost).
    # Threshold stays at >5. This check IGNORES the event name, and a real
    # 3-4 event mini-series legitimately shares one date and one buy-in (three
    # $200 flights on a Saturday, times unparsed => start_time None for all).
    # Dropping those would discard the whole series and mark it failed.
    # Genuinely fabricated small batches are caught by red flag 3 below, which
    # also requires the NAME to be identical.
    slots = [f"{r.get('start_date')}-{r.get('start_time')}-{r.get('buy_in')}" for r in records]
    if len(slots) > 5 and len(set(slots)) == 1:
        return False

    # Red flag 3: every record identical on name+date+buy-in (regex re-matched one
    # block N times). Distinct from flag 2 which ignores the name.
    full = [f"{r.get('event_name')}|{r.get('start_date')}|{r.get('buy_in')}" for r in records]
    if len(full) >= 3 and len(set(full)) == 1:
        return False

    return True

# ── Supabase REST helpers (via PostgREST — triggers fire) ──────────────────────
def sb_get_paged(path: str, base_params: str, limit: int = 1000) -> Optional[list]:
    """Return all pages, or ``None`` when any page cannot be verified."""
    all_rows, offset = [], 0
    while True:
        params = f"{base_params}&limit={limit}&offset={offset}"
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{path}{params}",
            headers={"apikey":SUPABASE_KEY,"Authorization":f"Bearer {SUPABASE_KEY}"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                rows = json.loads(r.read()) or []
        except Exception as e:
            RUN_ERRORS["series_errors"] += 1
            log(f"  [SB_GET ERR] {path} offset {offset}: {e}")
            return None
        if not isinstance(rows, list):
            RUN_ERRORS["series_errors"] += 1
            log(f"  [SB_GET ERR] {path} offset {offset}: expected row array")
            return None
        all_rows.extend(rows)
        if len(rows) < limit: break
        offset += limit
    return all_rows

def sb_upsert_events_confirmed(records: list) -> set[str]:
    """Upsert events and return the exact ``event_uid`` values confirmed.

    Reconciliation is destructive metadata work: a count alone cannot prove
    which rows survived a partial/malformed response.  Keep the exact identities
    from PostgREST's representation payload so callers can prove that every
    current event for one series landed before retiring anything older.
    """
    if not records:
        return set()
    expected = {
        str(record.get("event_uid") or "")
        for record in records
        if record.get("event_uid")
    }
    try:
        url = f"{SUPABASE_URL}/rest/v1/poker_events?on_conflict={EVENT_ON_CONFLICT}"
        req = urllib.request.Request(
            url, data=json.dumps(records).encode(), method="POST", headers=SB_UPSERT_HDRS
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            if r.status not in (200, 201):
                log(f"  [UPSERT ERR] unexpected HTTP {r.status}")
                RUN_ERRORS["upsert_failed"] += 1
                RUN_ERRORS["rows_lost"] += len(records)
                return set()
            try:
                returned = json.loads(r.read() or b"[]")
            except Exception:
                returned = []
            confirmed = {
                str(row.get("event_uid") or "")
                for row in returned
                if isinstance(row, dict) and row.get("event_uid") in expected
            } if isinstance(returned, list) else set()
            missing = expected - confirmed
            if missing or len(confirmed) != len(records):
                lost = max(len(missing), len(records) - len(confirmed))
                log(f"  [UPSERT WARN] sent {len(records)} rows, DB confirmed "
                    f"{len(confirmed)} exact event_uid value(s); {lost} row(s) "
                    "are persistence-unverified")
                RUN_ERRORS["rows_lost"] += max(0, lost)
            return confirmed
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8","ignore")[:400]
        log(f"  [UPSERT ERR] HTTP {e.code}: {body}")
        RUN_ERRORS["upsert_failed"] += 1
        RUN_ERRORS["rows_lost"] += len(records)
        return set()
    except Exception as e:
        log(f"  [UPSERT ERR] {e}")
        RUN_ERRORS["upsert_failed"] += 1
        RUN_ERRORS["rows_lost"] += len(records)
        return set()


def sb_upsert_events(records: list) -> int:
    """Backward-compatible count wrapper for non-reconciling callers/tests."""
    return len(sb_upsert_events_confirmed(records))


def build_series_parent_record(series_result: dict, batch_id: str) -> Optional[dict]:
    """Build the minimum provenance-complete parent required by event FKs."""
    events = series_result.get("events") or []
    if not series_result.get("found") or not events:
        return None
    hashes = [str(event.get("scrape_html_hash") or "") for event in events]
    source_hash = next((value for value in hashes if re.fullmatch(r"[0-9a-f]{64}", value)), "")
    timestamps = [str(event.get("scrape_timestamp") or "") for event in events]
    source_timestamp = next((value for value in timestamps if value), "")
    if not source_hash or not source_timestamp:
        return None
    source = str(series_result.get("source") or events[0].get("source") or "source_url")
    data_quality, confidence = quality_for(source)
    buyins = [event["buy_in"] for event in events if event.get("buy_in")]
    dates = [event["start_date"] for event in events if event.get("start_date")]
    resolved_url = str(series_result.get("resolved_url") or "")
    record = {
        "series_uid": str(series_result.get("series_uid") or ""),
        "series_name": str(
            series_result.get("canonical_series_name")
            or series_result.get("series_name")
            or "Poker tournament series"
        )[:180],
        "source": source,
        "source_url": resolved_url or None,
        "scrape_url": resolved_url or None,
        "events_scraped": True,
        "events_count": len(events),
        "event_count": len(events),
        "last_scraped": source_timestamp,
        "scrape_status": "events_scraped",
        "data_quality": data_quality,
        "scrape_html_hash": source_hash,
        "scrape_timestamp": source_timestamp,
        "scrape_confidence": confidence,
        "scrape_batch_id": batch_id,
        "start_date": min(dates) if dates else None,
        "end_date": max(dates) if dates else None,
        "buy_in_min": min(buyins) if buyins else None,
        "buy_in_max": max(buyins) if buyins else None,
    }
    if not record["series_uid"]:
        return None
    return record


def build_series_parent_refresh_patch(series_result: dict, batch_id: str,
                                      preserve_manual: bool = False) -> Optional[dict]:
    """Build a provenance-coherent refresh patch for an existing parent."""
    parent = build_series_parent_record(series_result, batch_id)
    if not parent:
        return None
    if not preserve_manual:
        return {
            key: value for key, value in parent.items()
            if key != "series_uid"
        }

    # A manually researched parent owns its own evidence. Refresh operational
    # event coverage without replacing that curator's source, URL, hash,
    # timestamp, confidence, series label, or scrape batch provenance.
    manual_safe = {
        "events_scraped", "events_count", "event_count", "last_scraped",
        "scrape_status", "start_date", "end_date", "buy_in_min", "buy_in_max",
    }
    return {key: parent[key] for key in manual_safe if key in parent}


def sb_ensure_series_parent(series_result: dict, batch_id: str) -> bool:
    """Verify or create a provenance-complete poker_series parent row."""
    parent = build_series_parent_record(series_result, batch_id)
    if not parent:
        log(f"  [PARENT ERR] incomplete provenance for {series_result.get('series_uid', '?')}")
        RUN_ERRORS["upsert_failed"] += 1
        return False
    encoded_uid = urllib.parse.quote(parent["series_uid"], safe="")
    try:
        check_req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_series?series_uid=eq.{encoded_uid}"
            "&select=series_uid,is_suppressed,data_quality&limit=2",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        )
        with urllib.request.urlopen(check_req, timeout=20) as response:
            existing = json.loads(response.read() or b"[]")
        if not isinstance(existing, list) or len(existing) > 1:
            raise RuntimeError(f"unexpected parent lookup result: {existing!r}")
        if len(existing) == 1:
            if existing[0].get("is_suppressed") is True:
                log(
                    f"  [PARENT ERR] {parent['series_uid']} is explicitly "
                    "suppressed; refusing child writes"
                )
                return False
            series_result["_preserve_manual_parent"] = (
                existing[0].get("data_quality") == "manual_research"
            )
            return existing[0].get("series_uid") == parent["series_uid"]

        create_req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_series?on_conflict=series_uid",
            data=json.dumps(parent).encode(),
            method="POST",
            headers=SB_UPSERT_HDRS,
        )
        with urllib.request.urlopen(create_req, timeout=30) as response:
            created = json.loads(response.read() or b"[]")
        verified = (
            isinstance(created, list)
            and len(created) == 1
            and created[0].get("series_uid") == parent["series_uid"]
        )
        if not verified:
            raise RuntimeError(f"parent write not confirmed: {created!r}")
        log(f"  [PARENT] Created {parent['series_uid']}")
        return True
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "ignore")[:400]
        log(f"  [PARENT ERR] HTTP {exc.code} for {parent['series_uid']}: {body}")
    except Exception as exc:
        log(f"  [PARENT ERR] {parent['series_uid']}: {exc}")
    RUN_ERRORS["upsert_failed"] += 1
    return False

def sb_patch_series(series_uid: str, patch: dict) -> bool:
    """Update poker_series metadata after scraping events. Returns True on success.

    A rejected patch used to be completely invisible; it now logs the response
    body and increments the run-level failure counter that drives the exit code.
    """
    try:
        encoded_uid = urllib.parse.quote(series_uid, safe='')
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_series?series_uid=eq.{encoded_uid}",
            data=json.dumps(patch).encode(), method="PATCH",
            headers={**SB_HDRS, "Prefer": "return=representation"},
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            if r.status not in (200, 201, 204):
                log(f"  [PATCH ERR] poker_series {series_uid[:40]}: HTTP {r.status}")
                RUN_ERRORS["patch_failed"] += 1
                return False
            returned = json.loads(r.read() or b"[]")
            if not (
                isinstance(returned, list)
                and len(returned) == 1
                and returned[0].get("series_uid") == series_uid
            ):
                log(f"  [PATCH ERR] poker_series {series_uid[:40]} matched no exact row")
                RUN_ERRORS["patch_failed"] += 1
                return False
        return True
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:300]
        log(f"  [PATCH ERR] poker_series {series_uid[:40]}: HTTP {e.code}: {body}")
        RUN_ERRORS["patch_failed"] += 1
        return False
    except Exception as e:
        log(f"  [PATCH ERR] poker_series {series_uid[:40]}: {e}")
        RUN_ERRORS["patch_failed"] += 1
        return False


# Only scraper-owned rows carrying the exact authoritative PokerAtlas page in
# their provenance may be reconciled.  Curated/manual rows and aggregator rows
# have independent evidence and must never be invalidated by this source.
RECONCILABLE_SERIES_EVENT_SOURCES = {
    "pokeratlas", "pokeratlas_html", "html_fallback",
}
RECONCILABLE_SERIES_EVENT_QUALITIES = {
    "scraped_verified", "scraped_inferred",
}


def _event_provenance_source_url(notes: object) -> str:
    """Read the machine-labelled event URL without guessing from free text."""
    for part in str(notes or "").split("|"):
        part = part.strip()
        if part.startswith(PROV_SOURCE_LABEL):
            return part[len(PROV_SOURCE_LABEL):].strip().rstrip("/")
    return ""


def retirable_series_event_ids(existing_rows: list[dict],
                               current_event_uids: set[str],
                               series_uid: str, source_url: str,
                               today: date_cls | None = None) -> list[str]:
    """Return exact auto-scraped row IDs disproved by a complete source page.

    Keep historical rows (older than a 14-day grace window), curated rows,
    other sources, and rows without machine-readable provenance.  An empty
    current set is never authoritative enough to retire anything: it may mean a
    parser regression rather than a truly empty schedule.
    """
    current = {str(uid) for uid in current_event_uids if uid}
    expected_series = str(series_uid or "")
    expected_source = str(source_url or "").strip().rstrip("/")
    if not current or not expected_series or not expected_source:
        return []

    cutoff = (today or datetime.now(timezone.utc).date()) - timedelta(days=14)
    retirable: list[str] = []
    for row in existing_rows or []:
        if str(row.get("series_uid") or "") != expected_series:
            continue
        if row.get("event_uid") in current:
            continue
        if row.get("data_quality") not in RECONCILABLE_SERIES_EVENT_QUALITIES:
            continue
        if row.get("source") not in RECONCILABLE_SERIES_EVENT_SOURCES:
            continue
        if _event_provenance_source_url(row.get("notes")) != expected_source:
            continue

        # Source pages often remove completed events as the series advances.
        # Preserve those as valid history rather than treating absence as a
        # cancellation.  Missing current/future rows are the actionable set.
        raw_last_date = str(row.get("end_date") or row.get("start_date") or "")[:10]
        try:
            last_date = datetime.strptime(raw_last_date, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        if last_date < cutoff:
            continue
        if row.get("id"):
            retirable.append(str(row["id"]))
    return retirable


def sb_get_series_events_for_reconciliation(series_uid: str) -> Optional[list[dict]]:
    """Read a complete series event set, distinguishing empty from failed."""
    encoded_uid = urllib.parse.quote(str(series_uid or ""), safe="")
    if not encoded_uid:
        return None
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        params = (
            f"?series_uid=eq.{encoded_uid}"
            "&select=id,event_uid,series_uid,source,notes,data_quality,start_date,end_date"
            "&order=id.asc"
            f"&limit={page_size}&offset={offset}"
        )
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_events{params}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                page = json.loads(response.read() or b"[]")
        except Exception as exc:
            log(f"  [RECONCILE READ ERR] {series_uid}: {str(exc)[:160]}")
            return None
        if not isinstance(page, list):
            log(f"  [RECONCILE READ ERR] {series_uid}: expected a row array")
            return None
        rows.extend(page)
        if len(page) < page_size:
            return rows
        offset += page_size


def sb_mark_series_events_stale(event_ids: list[str]) -> bool:
    """Patch only pre-read exact event IDs and verify every returned identity."""
    ids = list(dict.fromkeys(str(row_id) for row_id in event_ids if row_id))
    for index in range(0, len(ids), 50):
        chunk = ids[index:index + 50]
        encoded_ids = ",".join(urllib.parse.quote(row_id, safe="-") for row_id in chunk)
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_events?id=in.({encoded_ids})",
            data=json.dumps({"data_quality": "stale"}).encode(),
            method="PATCH",
            headers={**SB_HDRS, "Prefer": "return=representation"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                returned = json.loads(response.read() or b"[]")
            confirmed = {
                str(row.get("id")) for row in returned
                if isinstance(row, dict) and row.get("id")
            } if isinstance(returned, list) else set()
            if confirmed != set(chunk):
                raise RuntimeError(
                    f"expected {len(chunk)} exact IDs, confirmed {len(confirmed)}"
                )
        except Exception as exc:
            RUN_ERRORS["patch_failed"] += 1
            log(f"  [RECONCILE PATCH ERR] poker_events: {str(exc)[:180]}")
            return False
    return True


def reconcile_authoritative_series_events(series_result: dict) -> bool:
    """Retire missing events only inside a proven-complete source snapshot."""
    if not series_result.get("reconcile_complete"):
        return True
    series_uid = str(series_result.get("series_uid") or "")
    source_url = str(series_result.get("reconcile_source_url") or "")
    current_uids = {
        str(uid) for uid in series_result.get("reconcile_event_uids") or [] if uid
    }
    evidence = str(series_result.get("reconcile_evidence") or "")
    expected_count = series_result.get("reconcile_expected_event_count")
    valid_evidence = (
        evidence.startswith("complete_next_data_collection:")
        or evidence == "complete_pokeratlas_html_contract"
    )
    if (
        not series_uid or not source_url or not current_uids
        or not valid_evidence or expected_count != len(current_uids)
    ):
        # A caller claiming completeness without its evidence boundary is a code
        # defect, not permission to perform a broad destructive update.
        RUN_ERRORS["patch_failed"] += 1
        log(f"  [RECONCILE ERR] {series_uid or '?'} has an incomplete evidence scope")
        return False
    existing = sb_get_series_events_for_reconciliation(series_uid)
    if existing is None:
        RUN_ERRORS["patch_failed"] += 1
        return False
    retire_ids = retirable_series_event_ids(
        existing, current_uids, series_uid, source_url,
    )
    if not retire_ids:
        return True
    if not sb_mark_series_events_stale(retire_ids):
        return False
    log(f"  [RECONCILE] {series_uid}: retired {len(retire_ids)} missing event row(s)")
    return True


def sb_audit(batch_id: str, series_count: int, records: int, notes: str = ""):
    """Layer 6: write the immutable audit row and report whether it landed."""
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=json.dumps({
                "table_name":"poker_events",
                "action":"poker_series_scraper_scrape","batch_id":batch_id,
                "agent_id":"poker_series_scraper.py",
                "record_id":f"batch:{batch_id}",
                # `notes` and `records_affected` are NOT columns of this table.
                # Everything that is not a real column goes in new_data (jsonb).
                "new_data":{"records_affected":records,
                            "series_count":series_count,
                            "notes":notes},
                "created_at":datetime.now(timezone.utc).isoformat()
            }).encode(),
            method="POST", headers={**SB_HDRS,"Prefer":"return=minimal"}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            response.read()
        return True
    except Exception as exc:
        log(f"  [AUDIT ERR] data_audit_log write failed: {str(exc)[:160]}")
        return False

# ── Evidence file (Layer 3: full provenance) ──────────────────────────────────
def save_evidence(series_uid: str, data: dict):
    """Save evidence JSON with full provenance before any DB write."""
    safe = re.sub(r"[^a-zA-Z0-9]","_", str(series_uid))[:60]
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = EVIDENCE_DIR / f"{safe}_{ts}_{data.get('scrape_batch_id','')[:8]}.json"
    with open(path,"w") as f: json.dump(data,f,indent=2)
    return str(path)

# ── Scrapling CF-solve with 3x retry (per Scrapling skill Pattern 2) ──────────
# Latest live session. fetch_with_retry publishes here when it has to replace
# a dead session mid-retry, so callers can resynchronise instead of holding a
# closed handle.
CURRENT_SESSION = None
STOP_REQUESTED = False

def create_session():
    """Create a new StealthySession with network pre-check."""
    if not network_ok():
        raise ConnectionError("Network unavailable — cannot start StealthySession")
    # Self-heal a missing Playwright browser before launching a session.
    if _browser_heal is not None:
        _browser_heal.ensure_browser()

    # CRITICAL: clear any dangling asyncio event loop before starting Playwright.
    # Scrapling's StealthySession.start() calls sync_playwright().start(), which
    # raises "Playwright Sync API inside the asyncio loop" if a loop is set on
    # this thread. Session recycling (and threading.Timer callbacks) leave such a
    # loop behind, which is why every cycle died at the first recycle:
    #   [26/55] ... Recycle at #25 -> Daemon cycle crashed: Playwright Sync API
    #   inside the asyncio loop -> sleeping 6 hours
    # This is the same guard pokeratlas-live-daemon.connect() already uses.
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
    return session

def fetch_with_retry(session, url: str, retries: int = 3, **kwargs) -> tuple:
    """
    Fetch URL with Scrapling StealthySession, 3x retry on CF-solve failure.
    Returns (html_str, http_status, raw_bytes, html_hash).
    NEVER uses urllib/requests for data fetching.
    """
    resp = None
    global CURRENT_SESSION
    # A failed fetch can replace the browser session. Callers intentionally pass
    # the session they started the series with, so all later source fallbacks in
    # that same series must follow the replacement published here. Previously,
    # CardPlayer could replace a dead context and HendonMob would immediately
    # reuse the closed object. Its next recovery then attempted to start a second
    # sync Playwright driver while the replacement was alive, poisoning every
    # remaining source in the cycle.
    if CURRENT_SESSION is not None and CURRENT_SESSION is not session:
        session = CURRENT_SESSION
    for attempt in range(retries):
        try:
            # google_search=True routes via Google referrer — matches daily_venue_scraper approach
            resp = session.fetch(url, google_search=True, timeout=45000, wait_until="networkidle", **kwargs)
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8", "ignore")
                h = sha256h(body)
                return html, 200, body, h
            elif resp:
                log(f"        [FETCH] Attempt {attempt+1}: HTTP {resp.status}")
        except Exception as e:
            log(f"        [FETCH] Attempt {attempt+1}: {str(e)[:80]}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
                # Restart session on failure (per skill). The recreated session
                # MUST be published to CURRENT_SESSION: it used to be rebound only
                # to this function's local, so the caller kept fetching on the
                # closed session ("Context manager has been closed") and the next
                # scheduled recycle crashed the whole cycle.
                try: session.close()
                except: pass
                session = create_session()
                CURRENT_SESSION = session
    status = getattr(resp, 'status', 0) if resp else 0
    return "", status, b"", ""

# ── PDF helpers ────────────────────────────────────────────────────────────────
def find_pdfs(html: str, base_url: str) -> list:
    KW = re.compile(r"tournament|schedule|poker|event|calendar|buy.?in|structure",re.I)
    found, seen = [], set()
    for m in re.finditer(r'href=["\']([^"\']+\.pdf)["\']', html, re.I):
        href = m.group(1).strip()
        if href.startswith("//"): href = "https:" + href
        elif href.startswith("/"): href = "/".join(base_url.split("/")[:3]) + href
        elif not href.startswith("http"): href = base_url.rstrip("/") + "/" + href
        if href in seen: continue
        seen.add(href)
        ctx = html[max(0,m.start()-150):m.end()+150]
        if KW.search(ctx) or KW.search(href): found.append(href)
    return found[:5]

PDF_MAX_BYTES = 10 * 1024 * 1024   # 10MB — a structure book bigger than this is not a schedule
PDF_MAX_PAGES = 15                  # matches enrich_series_events.py's page cap philosophy

def extract_pdf(pdf_url: str) -> str:
    """Download + parse a PDF with hard size and page caps.

    Previously read the whole response and parsed EVERY page, so one large casino
    structure book could exhaust runner memory or burn the job's time budget.
    """
    if not PDF_OK: return ""
    try:
        req = urllib.request.Request(pdf_url, headers={"User-Agent":"Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=25) as r:
            try:
                declared = int(r.headers.get("Content-Length") or 0)
            except (TypeError, ValueError):
                declared = 0
            if declared and declared > PDF_MAX_BYTES:
                log(f"      [PDF SKIP] {declared} bytes > {PDF_MAX_BYTES} cap: {pdf_url[:60]}")
                return ""
            # Read one byte past the cap so an oversized body with no/lying
            # Content-Length is detected rather than buffered in full.
            raw = r.read(PDF_MAX_BYTES + 1)
        if len(raw) > PDF_MAX_BYTES:
            log(f"      [PDF SKIP] body exceeds {PDF_MAX_BYTES} byte cap: {pdf_url[:60]}")
            return ""
        if raw[:4] != b"%PDF": return ""
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages = pdf.pages[:PDF_MAX_PAGES]
            if len(pdf.pages) > PDF_MAX_PAGES:
                log(f"      [PDF] {len(pdf.pages)} pages — parsing first {PDF_MAX_PAGES}")
            return "\n".join(p.extract_text() or "" for p in pages)
    except Exception as e:
        log(f"      [PDF ERR] {str(e)[:120]}"); return ""

# ── Provenance stamping ───────────────────────────────────────────────────────
# poker_events has NO source_url column and NO timezone column: the writable
# column set for this table is exactly what make_event_rec() emits below (plus
# scrape_completeness_score, promoted at the end of scrape_series). PostgREST
# answers an unknown column with PGRST204 and rejects the ENTIRE 100-row chunk —
# see the removed "multi-source enrichment" block in scrape_series() for the
# incident that cost whole batches. So until these columns exist:
#
#   NEEDED: poker_events.source_url TEXT  — the URL a row was scraped from
#           (poker_series.source_url already exists and is written by
#           sb_patch_series; the per-event equivalent does not).
#   NEEDED: poker_events.timezone  TEXT   — IANA zone for start_time, mirroring
#           venue_daily_tournaments.timezone (20260408_tournament_rich_fields.sql)
#           and poker_venues.timezone (20260801000000_add_poker_venues_timezone.sql).
#
# ...both facts are stamped into `notes`, which IS written here and IS read back
# by the enrichment pass, so every stored event stays traceable to its source and
# its start_time stays interpretable.
PROV_SOURCE_LABEL = "Source: "
PROV_TZ_LABEL     = "Timezone: "

def add_provenance_notes(notes, source_url=None, tz_name=None) -> Optional[str]:
    """Append machine-readable provenance to an event's pipe-delimited `notes`.

    Idempotent: a label that is already present is never appended twice, so a
    re-scrape (or a caller that pre-stamped its own notes) cannot grow the field.
    """
    parts = [p.strip() for p in str(notes).split("|")] if notes else []
    parts = [p for p in parts if p]

    def _present(label: str) -> bool:
        return any(p.startswith(label) for p in parts)

    url = str(source_url or "").strip()
    if url and not _present(PROV_SOURCE_LABEL):
        parts.append(f"{PROV_SOURCE_LABEL}{url[:300]}")
    if tz_name and not _present(PROV_TZ_LABEL):
        parts.append(f"{PROV_TZ_LABEL}{tz_name}")
    return " | ".join(parts) if parts else None


def source_url_from_records(records: list[dict]) -> str:
    """Recover the exact successful source URL from provenance-stamped rows."""

    for record in records:
        for part in str(record.get("notes") or "").split("|"):
            part = part.strip()
            if part.startswith(PROV_SOURCE_LABEL):
                value = part[len(PROV_SOURCE_LABEL):].strip()
                if value.startswith(("https://", "http://")):
                    return value[:300]
    return ""

def tz_for_state(*states) -> Optional[str]:
    """First IANA zone resolvable from the given state codes (STATE_TZ)."""
    for s in states:
        tz = STATE_TZ.get(str(s or "").strip().upper())
        if tz: return tz
    return None

# ── Record factory — maps to poker_events DB columns ──────────────────────────
def make_event_rec(series_uid, series_name, batch_id, event_uid,
                   event_name, event_number, buy_in, game_type, fmt,
                   guarantee, start_date, start_time, end_date,
                   starting_stack, blind_levels, fee, entries,
                   prize_pool, day_number, flight, late_reg_levels,
                   re_entry, re_entry_limit, unlimited_re_entry,
                   venue_name, city, state, source, source_url,
                   html_hash, notes=None, event_type=None,
                   tz_state=None) -> Optional[dict]:
    """Build a record matching the poker_events DB schema exactly.

    data_quality / scrape_confidence are DERIVED from `source` (the extraction
    path) — they used to be hardcoded 'scraped_verified'/'high' on every record
    regardless of whether it came from structured JSON or a regex guess.

    source_url used to be accepted and then silently dropped, so no stored event
    could be traced back to the page it came from. It is now carried into the
    record via add_provenance_notes() (see the column note above), together with
    the STATE_TZ zone for `state` — tz_state is the series-level fallback for the
    extractors that have no per-event state, and is used ONLY for the timezone
    lookup so the `state` column keeps its existing value.
    """
    clean_event_name = sanitize_series_event_name(event_name)
    if not clean_event_name:
        return None
    ts = datetime.now(timezone.utc).isoformat()
    dq, conf = quality_for(source)
    notes = add_provenance_notes(notes, source_url=source_url,
                                 tz_name=tz_for_state(state, tz_state))
    return {
        "event_uid":          event_uid,
        "series_uid":         series_uid,
        "event_name":         clean_event_name,
        "event_number":       event_number,
        "event_type":         event_type or fmt,
        "buy_in":             buy_in,
        "fee":                fee,
        "starting_stack":     starting_stack,
        "blind_levels":       blind_levels,
        "guarantee":          guarantee,
        "prize_pool":         prize_pool,
        "entries":            entries,
        "start_date":         start_date,
        "start_time":         start_time,
        "end_date":           end_date,
        "day_number":         day_number,
        "flight":             flight,
        "late_reg_levels":    late_reg_levels,
        "re_entry":           re_entry or False,
        "re_entry_limit":     re_entry_limit,
        "unlimited_re_entry": unlimited_re_entry or False,
        "game_type":          game_type,
        "format":             fmt,
        "venue_name":         venue_name or "",
        "city":               city or "",
        "state":              state or "",
        "source":             source,
        "notes":              notes,
        "data_quality":       dq,
        "scrape_html_hash":   html_hash,
        "scrape_timestamp":   ts,
        "scrape_confidence":  conf,
        "scrape_batch_id":    batch_id,
    }


def series_events_fit_parent_window(series: dict, events: list[dict]) -> tuple[bool, str]:
    """Require every dated event to fit the catalog parent's inclusive dates."""
    raw_start = str(series.get("start_date") or "")[:10]
    raw_end = str(series.get("end_date") or "")[:10]
    try:
        parent_start = date_cls.fromisoformat(raw_start)
        parent_end = date_cls.fromisoformat(raw_end)
    except ValueError:
        return True, "parent_window_unavailable"
    if parent_end < parent_start:
        return False, "parent_window_invalid"

    for event in events:
        for field in ("start_date", "end_date"):
            raw_value = str(event.get(field) or "")[:10]
            if not raw_value:
                continue
            try:
                value = date_cls.fromisoformat(raw_value)
            except ValueError:
                return False, f"event_{field}_invalid"
            if value < parent_start or value > parent_end:
                return False, f"event_{field}_outside_parent_window"
    return True, "matched"

# ── PokerAtlas __NEXT_DATA__ extractor for Series pages ────────────────────────
NEXT_DATA_RECONCILE_MIN_EVENTS = 2
NEXT_DATA_EVENT_COLLECTION_KEYS = {
    "events", "tournaments", "tournamentevents", "seriesevents",
    "eventschedule", "scheduleevents", "upcomingevents",
}


def _load_pa_next_data(html: str) -> Optional[dict]:
    match = re.search(
        r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL,
    )
    if not match:
        match = re.search(
            r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL,
        )
    if not match:
        return None
    try:
        payload = json.loads(match.group(1))
    except (TypeError, ValueError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _is_pa_next_event_node(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    has_buyin = any(value.get(key) not in (None, "", 0) for key in (
        "buyIn", "buyin", "buy_in",
    ))
    has_identity = any(value.get(key) for key in (
        "startTime", "time", "start_time", "startDate", "date",
        "eventDate", "start_date", "name", "title", "eventName",
    ))
    return has_buyin and has_identity


def pa_next_data_reconciliation_evidence(html: str, events: list[dict]) -> dict:
    """Prove a complete explicit schedule collection before any retirement."""

    payload = _load_pa_next_data(html)
    extracted_count = len({
        str(event.get("event_uid")) for event in events or []
        if event.get("event_uid")
    })
    candidates: list[tuple[int, Optional[int], Optional[bool], str]] = []

    def declared_event_count(value: dict) -> Optional[int]:
        containers = [value]
        page_info = value.get("pageInfo")
        if isinstance(page_info, dict):
            containers.append(page_info)
        for container in containers:
            for count_key in ("eventCount", "totalEvents", "totalCount"):
                raw_count = container.get(count_key)
                if type(raw_count) is int and raw_count >= 0:
                    return raw_count
        return None

    def terminal_pagination_state(value: dict) -> Optional[bool]:
        containers = [value]
        for context_key in ("pageInfo", "pagination"):
            context = value.get(context_key)
            if isinstance(context, dict):
                containers.append(context)

        states: list[bool] = []
        for container in containers:
            has_next = container.get("hasNextPage")
            if isinstance(has_next, bool):
                states.append(not has_next)

            current_page = container.get("currentPage")
            total_pages = container.get("totalPages")
            if (
                type(current_page) is int
                and type(total_pages) is int
                and current_page >= 0
                and total_pages >= 0
            ):
                states.append(current_page >= total_pages)

        if False in states:
            return False
        if True in states:
            return True
        return None

    def walk(
        value: object,
        inherited_count: Optional[int] = None,
        inherited_terminal: Optional[bool] = None,
    ):
        if isinstance(value, dict):
            local_count = declared_event_count(value)
            declared = local_count if local_count is not None else inherited_count
            local_terminal = terminal_pagination_state(value)
            terminal = (
                local_terminal
                if local_terminal is not None
                else inherited_terminal
            )
            for key, child in value.items():
                normalized_key = re.sub(r"[^a-z]", "", str(key).lower())
                if normalized_key in NEXT_DATA_EVENT_COLLECTION_KEYS and isinstance(child, list):
                    event_nodes = [item for item in child if _is_pa_next_event_node(item)]
                    if event_nodes and len(event_nodes) == len(child):
                        candidates.append(
                            (len(event_nodes), declared, terminal, str(key))
                        )
                walk(child, declared, terminal)
        elif isinstance(value, list):
            for child in value:
                walk(child, inherited_count, inherited_terminal)

    if payload:
        walk(payload)
    if not candidates:
        return {
            "complete": False,
            "expected_event_count": 0,
            "reason": "no_explicit_event_collection",
        }

    count_matched = [row for row in candidates if row[0] == extracted_count]
    source_count, declared_count, pagination_terminal, collection_key = max(
        count_matched or candidates,
        key=lambda row: row[0],
    )
    if source_count < NEXT_DATA_RECONCILE_MIN_EVENTS:
        reason = "event_collection_below_reconcile_threshold"
    elif declared_count is None:
        reason = "declared_event_count_missing"
    elif declared_count != source_count:
        reason = "declared_event_count_mismatch"
    elif pagination_terminal is False:
        reason = "pagination_not_terminal"
    elif pagination_terminal is None:
        reason = "pagination_terminal_state_missing"
    elif extracted_count != source_count:
        reason = "parsed_event_count_mismatch"
    else:
        return {
            "complete": True,
            "expected_event_count": source_count,
            "reason": f"complete_next_data_collection:{collection_key}",
        }
    return {
        "complete": False,
        "expected_event_count": source_count,
        "reason": reason,
    }


def extract_pa_next_data(html: str, series_uid: str, series_name: str,
                         batch_id: str, url: str, html_hash: str,
                         series_state: str = "") -> list:
    """
    Extract tournament events from a PokerAtlas series page __NEXT_DATA__.
    Walks the full JSON tree with parent-context propagation for rich fields.
    Returns list of records ready for poker_events table.
    """
    nd = _load_pa_next_data(html)
    if not nd:
        return []

    results, seen = [], set()

    def _parse_rebuy(obj: dict) -> Optional[str]:
        has_r = obj.get("hasRebuy") or obj.get("rebuy") or obj.get("reentry") or obj.get("hasReentry")
        if not has_r: return None
        rf = safe_int(obj, ["rebuyFee","rebuyAmount","reentryFee","rebuyPrice"], 0)
        af = safe_int(obj, ["addonFee","addonAmount","addOnFee","addOnPrice"], 0)
        parts = []
        if rf: parts.append(f"Rebuy: ${rf}")
        if af: parts.append(f"Addon: ${af}")
        return ", ".join(parts) if parts else "Rebuy available"

    def _parse_late_reg(obj: dict) -> Optional[str]:
        lr = obj.get("lateRegistration") or obj.get("lateReg") or obj.get("lateRegistrationLevel")
        if lr is None: return None
        return str(lr)[:80].strip()

    def _parse_series(obj: dict):
        sn = obj.get("seriesName") or obj.get("series") or obj.get("circuitName") or ""
        se = obj.get("eventNumber") or obj.get("seriesEventNumber") or ""
        return (str(sn)[:100] if sn else None, str(se)[:20] if se else None)

    def walk(obj, ctx: dict):
        """Walk JSON tree, propagating parent context downward."""
        if isinstance(obj, list):
            for item in obj: walk(item, ctx)
        elif isinstance(obj, dict):
            cur = dict(ctx)
            # Build context from this level
            if obj.get("name") or obj.get("title"):
                cur["name"] = (obj.get("name") or obj.get("title") or "")[:150]
            if obj.get("startingStack") or obj.get("startingChips"):
                cur["stack"] = safe_int(obj, ["startingStack","startingChips","chipCount","chips"])
            if obj.get("levelDuration") or obj.get("minutesPerLevel"):
                cur["level_mins"] = safe_int(obj, ["levelDuration","minutesPerLevel","blindDuration"])
            rebuy = _parse_rebuy(obj)
            if rebuy: cur["rebuy"] = rebuy
            late = _parse_late_reg(obj)
            if late is not None: cur["late_reg"] = late
            sn, se = _parse_series(obj)
            if sn: cur["series_name"] = sn
            if se: cur["series_event"] = se
            payout = obj.get("payoutLevels") or obj.get("payoutStructure")
            if payout: cur["payout_levels"] = str(payout)[:80]
            if obj.get("venueName") or obj.get("venue"):
                cur["venue_name"] = str(obj.get("venueName") or obj.get("venue") or "")[:100]
            if obj.get("city"):
                cur["city"] = str(obj["city"])[:80]
            if obj.get("state") or obj.get("stateCode"):
                cur["state"] = str(obj.get("state") or obj.get("stateCode") or "")[:2]

            # ── Is this a tournament event node? ─────────────────────────
            has_buyin = obj.get("buyIn") or obj.get("buyin") or obj.get("buy_in")
            has_time  = obj.get("startTime") or obj.get("time") or obj.get("start_time")
            has_date  = obj.get("startDate") or obj.get("date") or obj.get("eventDate") or obj.get("start_date")
            has_name  = obj.get("name") or obj.get("title") or obj.get("eventName")

            if has_buyin and (has_time or has_date or has_name):
                try:
                    buyin_raw = has_buyin
                    if isinstance(buyin_raw, str):
                        buyin_raw = re.sub(r"[^0-9]","",buyin_raw)
                    buyin = int(float(buyin_raw))
                    if not 10 <= buyin <= 250000:
                        for v in obj.values(): walk(v, cur)
                        return

                    event_name = sanitize_series_event_name(
                        str(cur.get("name") or has_name or "")[:150]
                    )
                    if not event_name:
                        for v in obj.values(): walk(v, cur)
                        return
                    st_raw     = str(has_time or "")
                    start_time = normalize_time_to_24h(st_raw) or normalize_time_to_24h(normalize_time(st_raw))

                    # Start date
                    start_date = None
                    for dk in ("startDate","date","eventDate","start_date"):
                        dv = obj.get(dk)
                        if isinstance(dv, str) and len(dv) >= 8:
                            start_date = dv[:10]; break

                    # End date
                    end_date = None
                    for dk in ("endDate","end_date"):
                        dv = obj.get(dk)
                        if isinstance(dv, str) and len(dv) >= 8:
                            end_date = dv[:10]; break

                    # Event number
                    event_number = safe_int(obj, ["eventNumber","event_number","number","eventNo"])

                    # Game type
                    game_type_raw = str(obj.get("gameType") or obj.get("game_type") or obj.get("type") or "")
                    game_type = game_from_pa(game_type_raw) if game_type_raw else game_from(event_name)
                    fmt = fmt_from(event_name)

                    # Rich fields
                    guarantee    = safe_int(obj, ["guarantee","guaranteed","gtd"])
                    stack        = cur.get("stack") or safe_int(obj, ["startingStack","startingChips","chipCount","chips","starting_stack"])
                    blind_levels = cur.get("level_mins") or safe_int(obj, ["blindLevels","levelDuration","minutesPerLevel","blind_levels","levels","numberOfLevels"])
                    fee          = safe_int(obj, ["fee","rake","entryFee"])
                    entries      = safe_int(obj, ["entries","totalEntries","maxEntries","maxPlayers","fieldSize"])
                    prize_pool   = safe_int(obj, ["prizePool","prize_pool"])
                    day_number   = safe_int(obj, ["dayNumber","day","day_number"])
                    flight_val   = obj.get("flight") or obj.get("flightName")
                    flight       = str(flight_val)[:20] if flight_val else None
                    late_reg     = cur.get("late_reg") if cur.get("late_reg") is not None else _parse_late_reg(obj)
                    bounty       = safe_int(obj, ["bountyAmount","bounty","headBounty"])
                    sat_to       = (obj.get("satelliteTo") or obj.get("feedsEvent") or "")[:100] or None
                    structure_url = (obj.get("structureUrl") or obj.get("structureSheetUrl") or "")[:300] or None

                    # Re-entry
                    re_entry = bool(obj.get("reEntry") or obj.get("re_entry") or obj.get("reentry")
                                    or obj.get("hasReentry") or obj.get("hasReEntry"))
                    re_entry_limit = safe_int(obj, ["reEntryLimit","re_entry_limit"])
                    unlimited_re = bool(obj.get("unlimitedReEntry") or obj.get("unlimited_re_entry")
                                        or obj.get("unlimitedReentry"))

                    # Venue from context
                    venue_name = cur.get("venue_name", "")
                    city       = cur.get("city", "")
                    state      = cur.get("state", "")

                    # Notes — concatenate extra info
                    notes_parts = []
                    if bounty: notes_parts.append(f"Bounty: ${bounty}")
                    if sat_to: notes_parts.append(f"Satellite to: {sat_to}")
                    if cur.get("rebuy"): notes_parts.append(cur["rebuy"])
                    if cur.get("payout_levels"): notes_parts.append(f"Payout: {cur['payout_levels']}")
                    if structure_url: notes_parts.append(f"Structure: {structure_url}")
                    notes = " | ".join(notes_parts) if notes_parts else None

                    # Build unique event_uid
                    event_num_str = str(event_number) if event_number else "0"
                    uid_seed = f"{series_uid}_{event_name}_{start_date}_{buyin}_{event_num_str}"
                    uid_hash = hashlib.md5(uid_seed.encode()).hexdigest()[:8]
                    event_uid = f"{series_uid}_e{event_num_str}_{uid_hash}"

                    # Dedup
                    dk = f"{start_date}-{start_time}-{buyin}-{event_name[:30]}"
                    if dk in seen:
                        for v in obj.values(): walk(v, cur)
                        return
                    seen.add(dk)

                    rec = make_event_rec(
                        series_uid=series_uid, series_name=series_name,
                        batch_id=batch_id, event_uid=event_uid,
                        event_name=event_name or f"{series_name} - ${buyin} Event",
                        event_number=event_number,
                        buy_in=buyin, game_type=game_type, fmt=fmt,
                        guarantee=guarantee,
                        start_date=start_date, start_time=start_time,
                        end_date=end_date, starting_stack=stack,
                        blind_levels=blind_levels, fee=fee, entries=entries,
                        prize_pool=prize_pool, day_number=day_number,
                        flight=flight, late_reg_levels=late_reg,
                        re_entry=re_entry, re_entry_limit=re_entry_limit,
                        unlimited_re_entry=unlimited_re,
                        venue_name=venue_name, city=city, state=state,
                        source="pokeratlas", source_url=url,
                        html_hash=html_hash, notes=notes,
                        tz_state=series_state,
                    )
                    if rec:
                        results.append(rec)

                except Exception:
                    pass
            # Continue walking
            for v in obj.values(): walk(v, cur)

    walk(nd, {"series_name": series_name})
    return results

# ── HTML fallback extractor ────────────────────────────────────────────────────
TIME_RE = re.compile(r"((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))\b")
BUY_RE  = re.compile(r"\$(\d{1,3}(?:,\d{3})*)")


def extract_pokeratlas_html_events(html: str, series_uid: str, series_name: str,
                                   batch_id: str, source_url: str,
                                   html_hash: str, series_state: str = "") -> Optional[list]:
    """Parse PokerAtlas' canonical series-event containers.

    ``None`` means the page did not expose this contract and the generic HTML
    fallback may run.  A list (including an empty one) means the contract was
    present and is authoritative; generic dollar-amount scanning must not run.
    """
    blocks = re.split(
        r'<li\b(?=[^>]*\btournament-item\b)[^>]*>',
        html or "",
        flags=re.I,
    )
    if len(blocks) <= 1:
        return None

    results: list[dict] = []
    seen: set[str] = set()
    series_year = extract_series_year(series_uid) or datetime.now(timezone.utc).year

    def class_text(block: str, class_name: str) -> str:
        match = re.search(
            rf'class=["\'][^"\']*(?<![-\w]){re.escape(class_name)}(?![-\w])'
            r'[^"\']*["\'][^>]*>'
            r'(.*?)</(?:span|div)>',
            block,
            re.I | re.S,
        )
        return _visible_text(match.group(1)) if match else ""

    for block in blocks[1:501]:
        buyin_match = re.search(
            r'class=["\'][^"\']*\bbuy-in\b[^"\']*["\'][^>]*>\s*\$([\d,]+)',
            block,
            re.I,
        )
        month = class_text(block, "month")
        day = class_text(block, "day")
        hour = class_text(block, "hour")
        if not buyin_match or not month or not day:
            continue
        buyin = int(buyin_match.group(1).replace(",", ""))
        if not 10 <= buyin <= 250000:
            continue
        start_date = parse_date_series(f"{month} {day} {series_year}", series_year)
        if not start_date:
            continue
        start_time = normalize_time_to_24h(normalize_time(hour)) if hour else None

        flight_name = class_text(block, "starting-time-name").strip(" -:|")
        event_name = class_text(block, "name")
        event_name = " ".join(part for part in (flight_name, event_name) if part).strip(" -:|")
        if not event_name:
            continue
        source_text = _visible_text(block)
        if not is_poker_tournament_event_text(f"{event_name} ${buyin} {source_text}"):
            continue

        event_number_text = class_text(block, "event-number")
        number_match = re.search(r"#?\s*(\d+)", event_number_text)
        event_number = int(number_match.group(1)) if number_match else None
        game_type_text = class_text(block, "type")
        game_type = game_from_pa(game_type_text) if game_type_text else game_from(event_name)

        # Some legacy PokerAtlas cards render an empty value as `, chips`.
        # Requiring the capture to begin with a digit keeps that placeholder
        # from reaching int(), while the defensive parser preserves the event
        # with an unknown stack instead of aborting the whole source page.
        stack = safe_int_text(source_text, r"(\d[\d,]*)\s*chips\b")
        level_match = re.search(r"(\d+)\s*min(?:ute)?s?\s*(?:levels?|blinds?)", source_text, re.I)
        blind_levels = int(level_match.group(1)) if level_match else None
        guarantee_match = re.search(
            r'title=["\']\$([\d,]+)\s+Guaranteed["\']', block, re.I
        )
        guarantee = int(guarantee_match.group(1).replace(",", "")) if guarantee_match else None
        re_entry = bool(re.search(r"re-?entry", source_text, re.I))
        unlimited_re_entry = bool(re.search(r"unlimited\s+re-?entry", source_text, re.I))
        day_match = re.search(r"\bDay\s+(\d+)\b", flight_name, re.I)
        day_number = int(day_match.group(1)) if day_match else None

        identity = f"{start_date}|{start_time}|{buyin}|{event_name.lower()}"
        if identity in seen:
            continue
        seen.add(identity)
        event_uid = stable_event_uid(
            series_uid,
            event_name,
            start_date,
            buyin,
            prefix="pahtml",
            start_time=start_time,
        )
        rec = make_event_rec(
            series_uid=series_uid,
            series_name=series_name,
            batch_id=batch_id,
            event_uid=event_uid,
            event_name=event_name,
            event_number=event_number,
            buy_in=buyin,
            game_type=game_type,
            fmt=fmt_from(source_text),
            guarantee=guarantee,
            start_date=start_date,
            start_time=start_time,
            end_date=None,
            starting_stack=stack,
            blind_levels=blind_levels,
            fee=None,
            entries=None,
            prize_pool=None,
            day_number=day_number,
            flight=flight_name or None,
            late_reg_levels=None,
            re_entry=re_entry,
            re_entry_limit=None,
            unlimited_re_entry=unlimited_re_entry,
            venue_name="",
            city="",
            state="",
            source="pokeratlas_html",
            source_url=source_url,
            html_hash=html_hash,
            tz_state=series_state,
        )
        if rec:
            results.append(rec)
    return results

def extract_html_events(html: str, series_uid: str, series_name: str,
                        batch_id: str, source_url: str, html_hash: str,
                        series_state: str = "") -> list:
    """Fallback: Extract events from raw HTML when __NEXT_DATA__ is missing."""
    pokeratlas_events = extract_pokeratlas_html_events(
        html, series_uid, series_name, batch_id, source_url, html_hash, series_state
    )
    if pokeratlas_events is not None:
        return pokeratlas_events

    text = re.sub(r"\s+"," ", re.sub(r"<[^>]+>"," ",html))
    seen, results = set(), []
    event_counter = 0
    series_year = extract_series_year(series_uid)  # e.g. 2026 from 'pa_2026-spring-..'

    def try_block(txt: str):
        nonlocal event_counter
        bi = BUY_RE.search(txt); tm = TIME_RE.search(txt)
        if not bi: return
        if not is_poker_tournament_event_text(txt): return
        buyin = int(bi.group(1).replace(",",""))
        if not 10<=buyin<=250000: return
        st = normalize_time_to_24h(normalize_time(tm.group(1))) if tm else None
        # Use series-aware date parser — NO forward-rolling
        ed = parse_date_series(txt, series_year)
        if not ed: return  # series events MUST have specific dated events
        # Event name — prefer quoted short strings, avoid grabbing paragraphs
        tname = None
        nm = re.search(r'"([^"]{5,70})"', txt)
        if nm: tname = nm.group(1)[:150]
        else:
            # Grab the dollar-amount description up to 60 chars if clean
            desc = re.match(r'(\$[\d,K]+[^\n|$]{3,60})', txt)
            if desc: tname = desc.group(1).strip()[:150]
        # GTD: match "$50K Gtd" / "$100K GTD" / "Guaranteed: $10,000" patterns
        # A guarantee MUST carry an explicit currency symbol or K/M suffix.
        # A bare number after "Guaranteed" matched things like "Guaranteed 5000
        # chips" / "guaranteed seating 2026" and invented prize pools.
        gtd = None
        gtd_m = re.search(r"\$\s*(\d+(?:\.\d+)?)\s*([KkMm])\s*(?:GTD|Gtd|Guaranteed)", txt)
        if gtd_m:
            gtd = int(float(gtd_m.group(1)) * (1000 if gtd_m.group(2).lower() == "k" else 1000000))
        else:
            gtd_m2 = re.search(r"(?:GTD|Gtd|Guaranteed)[:\s]*\$\s*([\d,]+)", txt, re.I)
            if not gtd_m2:
                gtd_m2 = re.search(r"\$\s*([\d,]+)\s*(?:GTD|Gtd|Guaranteed)", txt, re.I)
            if gtd_m2:
                try: gtd = int(gtd_m2.group(1).replace(",", ""))
                except ValueError: gtd = None
        # Plausibility: a guarantee below the buy-in (or below $1,000) is noise.
        if gtd is not None and (gtd < 1000 or gtd < buyin):
            gtd = None
        # Stack: require "X,XXX chips" pattern (not "15 min levels")
        stack = None
        stk_m = re.search(r"([\d,]+)\s*chips\b", txt, re.I)
        if stk_m:
            sv = int(stk_m.group(1).replace(",",""))
            if sv >= 1000: stack = sv  # stacks are always 1000+
        blvl = None
        lm = re.search(r"(\d+)\s*min(?:ute)?s?\s*(?:level|blind)", txt, re.I)
        if lm: blvl = int(lm.group(1))
        bounty = safe_int_text(txt, r"(?:bounty|knockout)[:\s]*\$?([\d,]+)")

        dk = f"{ed}-{st}-{buyin}-{(tname or '')[:30]}"
        if dk in seen: return
        seen.add(dk)

        event_counter += 1
        # event_uid MUST be derived from stable content only. It previously folded
        # in event_counter (a running count of matched blocks), so any page change
        # or ad rotation shifted the id and the upsert INSERTed a duplicate row
        # instead of updating the existing one.
        event_uid = stable_event_uid(series_uid, tname, ed, buyin, prefix="html",
                                     start_time=st)

        notes_parts = []
        if bounty: notes_parts.append(f"Bounty: ${bounty}")

        rec = make_event_rec(
            series_uid=series_uid, series_name=series_name,
            batch_id=batch_id, event_uid=event_uid,
            event_name=tname or f"{series_name} - ${buyin} Event", event_number=event_counter if event_counter > 0 else None,
            buy_in=buyin, game_type=game_from(txt), fmt=fmt_from(txt),
            guarantee=gtd, start_date=ed, start_time=st,
            end_date=None, starting_stack=stack,
            blind_levels=blvl, fee=None, entries=None,
            prize_pool=None, day_number=None, flight=None,
            late_reg_levels=None, re_entry=False,
            re_entry_limit=None, unlimited_re_entry=False,
            venue_name="", city="", state="",
            source="html_fallback", source_url=source_url,
            html_hash=html_hash,
            notes=" | ".join(notes_parts) if notes_parts else None,
            tz_state=series_state,
        )
        if rec:
            results.append(rec)

    for block in re.split(r"(?=\$\d)", text):
        if 8 < len(block) < 900: try_block(block)
    for row in (re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL|re.I) +
                re.findall(r"<li[^>]*class=\"[^\"]*(?:item|event|tourn)[^\"]*\"[^>]*>(.*?)</li>", html, re.DOTALL|re.I)):
        if "<th" in row.lower(): continue
        rt = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", row)).strip()
        if "$" in rt: try_block(rt)
    # REMOVED: the raw line-by-line "any line containing $" scan.
    # It had no length cap, so on minified single-line HTML the whole document
    # became one "event" (buy-in from a banner ad, date from an unrelated block),
    # and on pretty-printed HTML promo copy / hotel rates / gift-card blurbs
    # became tournaments. The block splitter and table/list-row passes above
    # already cover every real schedule layout.
    return results

# ── SOURCE 4 HELPER: Bravo Poker venue tournament schedule ─────────────────────
def _try_bravo_venue(series_uid, series_name, batch_id, session, series_state=""):
    """Try scraping tournament schedule from Bravo Poker venue page."""
    # Load venue mapping to find Bravo slug
    venues_file = PROJECT_ROOT / 'data' / 'all-venues.json'
    if not venues_file.exists():
        return []

    try:
        with open(venues_file) as f:
            v_data = json.load(f)
        venues = v_data if isinstance(v_data, list) else v_data.get('venues', [])
    except Exception:
        return []

    # Try to match series name to a venue
    # Series names often contain venue names like "Graton Poker Series" -> "Graton"
    best_venue = select_physical_series_venue(series_name, series_state, venues)

    if not best_venue:
        log(f"      [Src 4: Bravo] No unambiguous physical venue match for '{series_name[:30]}'")
        return []

    venue_name = str(best_venue.get("name") or "")
    if not (_series_identity_tokens(series_name) - _series_identity_tokens(venue_name)):
        log("      [Src 4: Bravo] Venue identity alone cannot prove this series; skipping")
        return []

    log(f"      [Src 4: Bravo] Matched physical venue: {venue_name[:40]}")

    bravo_slug = best_venue.get('bravo_slug') or ''
    venue_slug = best_venue.get('slug') or ''
    website = best_venue.get('website') or best_venue.get('url') or ''

    # Auto-generate Bravo slug from venue name if not stored
    if not bravo_slug:
        vname = best_venue.get('name', '')
        bravo_slug = slugify(vname)

    # Try Bravo tournament schedule page
    events = []
    if bravo_slug:
        bravo_url = f"https://bravo.poker/poker-rooms/{bravo_slug}/tournaments"
        log(f"      [Src 4a: Bravo] Trying {bravo_url[:70]}")
        try:
            b_html, b_status, b_raw, b_hash = scrapling_fetch(bravo_url)
            if (b_status == 200 and b_html and has_tourn(b_html)
                    and venue_page_confirms_series(series_name, venue_name, b_html)):
                events = extract_html_events(b_html, series_uid, series_name, batch_id, bravo_url, b_hash, series_state)
                if events:
                    stamp_source(events, 'bravo_venue')
                    log(f"        [Bravo] {len(events)} events extracted")
        except Exception as ex:
            log(f"        [Bravo] Error: {str(ex)[:60]}")

    # If no Bravo results, try venue website directly (using Scrapling Fetcher)
    if not events and website:
        log(f"      [Src 4b: Venue Web] Trying {website[:70]}")
        try:
            v_html, v_status, v_raw, v_hash = scrapling_fetch(website)
            if v_status == 200 and v_html:
                if has_tourn(v_html) and venue_page_confirms_series(
                    series_name, venue_name, v_html
                ):
                    events = extract_html_events(v_html, series_uid, series_name, batch_id, website, v_hash, series_state)
                    if events:
                        stamp_source(events, 'venue_website')
                        log(f"        [Venue Web] {len(events)} events extracted")

                # Try linked tournament/poker subpages
                if not events:
                    for href_m in re.finditer(r'href="([^"]*(?:tournament|poker|schedule)[^"]*)"', v_html, re.I):
                        sub_url = href_m.group(1)
                        if sub_url.startswith('/'):
                            sub_url = urllib.parse.urljoin(website, sub_url)
                        if not sub_url.startswith('http'):
                            continue
                        try:
                            s_html, s_status, s_raw, s_hash = scrapling_fetch(sub_url, timeout=10)
                            if (s_status == 200 and s_html and has_tourn(s_html)
                                    and venue_page_confirms_series(
                                        series_name, venue_name, s_html
                                    )):
                                events = extract_html_events(s_html, series_uid, series_name, batch_id, sub_url, s_hash, series_state)
                                if events:
                                    stamp_source(events, 'venue_subpage')
                                    log(f"        [Venue Subpage] {len(events)} events from {sub_url[:50]}")
                                    break
                        except Exception:
                            pass
        except Exception as ex:
            log(f"        [Venue Web] Error: {str(ex)[:60]}")

    return events


# ── SOURCE 3 HELPER: CardPlayer event search ─────────────────────────────────
def _try_cardplayer(series_uid, series_name, batch_id, session, series_state=""):
    import urllib.parse, re
    # We will assume fetch_with_retry and extract_html_events exist globally
    events = []
    try:
        cp_search = urllib.parse.quote(series_name.replace("'", "")[:40])
        cp_url = f"https://www.cardplayer.com/poker-tournaments?search={cp_search}"
        log(f"      [Src 3: CardPlayer] Searching: {series_name[:35]}")
        cp_html, cp_status, _, _ = fetch_with_retry(session, cp_url)
        
        target_path = None
        if cp_status == 200 and cp_html:
            best_score = (-1, -1)
            for match in re.finditer(r'href="(https://www.cardplayer.com/poker-tournaments/\d+-?([^"]*))"', cp_html, re.I):
                path = match.group(1)
                slug_part = match.group(2).lower()
                if 'monthly' in path or 'daily' in path or slug_part == '': continue
                if not source_series_identity_matches(series_name, slug_part.replace("-", " ")):
                    continue
                expected = _series_identity_tokens(series_name)
                overlap = len(expected & _series_identity_tokens(slug_part))
                score = (overlap, -len(_series_identity_tokens(slug_part) - expected))
                if score > best_score:
                    best_score = score
                    target_path = path

            if target_path is None:
                log(f"      [Src 3: CardPlayer] No relevant matching link found")
                    
        if target_path:
            series_url = target_path
            log(f"      [Src 3: CardPlayer] Found series page: {series_url}")
            s_html, s_status, _, s_hash = fetch_with_retry(session, series_url)
            if s_status == 200 and s_html and has_tourn(s_html):
                identity_markup = " ".join(re.findall(
                    r'<(?:title|h1)\b[^>]*>(.*?)</(?:title|h1)>',
                    s_html,
                    re.I | re.S,
                ))
                if not source_series_identity_matches(
                    series_name, f"{identity_markup} {series_url.rsplit('/', 1)[-1]}"
                ):
                    log("        [CardPlayer] Source identity mismatch; rejecting page")
                    return []
                events = extract_html_events(s_html, series_uid, series_name, batch_id, series_url, s_hash, series_state)
                stamp_source(events, 'cardplayer')
                log(f"        [CardPlayer] {len(events)} events extracted")
    except CODE_DEFECTS:
        raise
    except Exception as ex:
        log(f"        [CardPlayer] Fetch/parse error: {type(ex).__name__}: {str(ex)[:200]}")
    return events

# ── SOURCE 4 HELPER: HendonMob event-level search ─────────────────────────────
def _try_hendonmob(series_uid, series_name, batch_id, session, series_state=""):
    """Search HendonMob for tournament events matching this series."""
    # Clean series name for search
    clean_name = re.sub(r"[''`]", "", series_name)
    clean_name = re.sub(r"\s*(Series|Poker|Casino|Resort|Hotel)\s*", " ", clean_name, flags=re.I).strip()
    search_q = urllib.parse.quote(clean_name[:50])
    hm_url = f"https://pokerdb.thehendonmob.com/event.php?a=l&search={search_q}&buyin_cur=USD"

    log(f"      [Src 4: HendonMob] Searching: {clean_name[:40]}")
    events = []

    try:
        # Primary: HendonMob event search (via Scrapling Fetcher)
        hm_html, hm_status, hm_raw, hm_hash = fetch_with_retry(session, hm_url)

        # Fallback: try summerinvegas.com (HendonMob sister site)
        if not hm_html or hm_status != 200:
            siv_url = f"https://www.summerinvegas.com/?s={search_q}"
            log(f"      [Src 5b: SummerInVegas] Trying fallback")
            hm_html, hm_status, hm_raw, hm_hash = fetch_with_retry(session, siv_url)
            if hm_status == 200:
                hm_url = siv_url

        if hm_status == 200 and hm_html:
            rows = re.findall(r'<tr[^>]*>(.*?)</tr>', hm_html, re.DOTALL | re.I)
            event_counter = 0

            for row in rows:
                if '<th' in row.lower():
                    continue
                cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.I)
                if len(cells) < 3:
                    continue

                # Strip HTML tags from cells
                clean_cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
                if not source_series_identity_matches(series_name, " ".join(clean_cells)):
                    continue

                # Try to extract: date, event name, buy-in
                date_str = ''
                event_name = ''
                buyin = 0
                # Parsed from the row below — NEVER defaulted to NLH. PLO/HORSE/
                # Stud/mixed events were all being stored as No-Limit Hold'em.
                game_type = None
                event_url = None
                
                # Check for event detail link inside the row
                href_m = re.search(r'href="(festival\.php\?a=e.*|event\.php\?a=e.*|.*?/event/.*?)"', row, re.I)
                if href_m:
                    e_part = href_m.group(1).replace('&amp;', '&')
                    if e_part.startswith('http'):
                        event_url = e_part
                    elif hm_url.startswith('https://pokerdb'):
                        event_url = 'https://pokerdb.thehendonmob.com/' + e_part
                    else:
                        event_url = 'https://www.summerinvegas.com/' + e_part.lstrip('/')

                for cell in clean_cells:
                    # Date detection
                    dm = re.search(r'(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})', cell, re.I)
                    if dm and not date_str:
                        months = {'jan':'01','feb':'02','mar':'03','apr':'04','may':'05','jun':'06',
                                  'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12'}
                        month = months.get(dm.group(2).lower()[:3], '01')
                        date_str = f"{dm.group(3)}-{month}-{int(dm.group(1)):02d}"
                        continue
                        
                    # Buy-in detection (we no longer use this exclusively to prevent overwrite, but keeping it for completeness)
                    bi_m = re.search(r'(?:^|\s)(?:[$€£]|USD|EUR|GBP|A\$)\s*([\d,]+)(?:\s*\+\s*[$€£]?\s*([\d,]+))?', cell)
                    if bi_m and not buyin:
                        buyin = int(bi_m.group(1).replace(',', ''))
                        continue
                        
                    # Game type detection — read it off the row instead of
                    # assuming NLH. Left as None when the row says nothing.
                    if game_type is None and re.search(
                            r'\b(NLH|NL\s*Hold|No.?Limit|PLO|Omaha|HORSE|Stud|Razz|Mixed|Limit\s*Hold|2-7|Badugi)\b',
                            cell, re.I):
                        # game_from_pa() echoes its input when it recognises
                        # nothing (e.g. a "2-7 Triple Draw" cell), which would
                        # dump a whole table cell into game_type. Only accept a
                        # normalized value; otherwise leave it NULL.
                        _gt = game_from_pa(cell)
                        game_type = _gt if _gt in KNOWN_GAME_TYPES else None

                    # Event Name detection. The old guard dropped any cell
                    # containing 'NLH'/'HOLD' — i.e. exactly the cells holding the
                    # real event names ("Event #4 NLH Deepstack").
                    if len(cell) > 10 and not re.match(r'^\d', cell):
                        if not event_name:
                            event_name = cell.strip()

                if date_str and event_name:
                    event_name = sanitize_series_event_name(event_name)
                    if not event_name:
                        continue
                    event_counter += 1
                    # Deterministic, content-derived uid (the old
                    # generate_consistent_id() was never defined anywhere, so this
                    # whole source raised NameError and silently returned []).
                    event_uid = stable_event_uid(series_uid, event_name, date_str,
                                                 buyin, prefix="hm")
                    hm_dq, hm_conf = quality_for('hendonmob')
                    e_dict = {
                        "event_uid": event_uid,
                        "series_uid": series_uid,
                        "event_name": event_name[:150],
                        "event_number": str(event_counter),
                        "buy_in": buyin if buyin else None,
                        "start_date": date_str,
                        "game_type": game_type,
                        "source": 'hendonmob',
                        "data_quality": hm_dq,
                        "scrape_confidence": hm_conf,
                        "scrape_batch_id": batch_id,
                        "scrape_html_hash": hm_hash,
                        "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                        # This source builds its row by hand instead of going
                        # through make_event_rec, so it had no link back to the
                        # page it was read off at all. Prefer the event's own
                        # detail URL; fall back to the search listing.
                        "notes": add_provenance_notes(
                            None, source_url=event_url or hm_url,
                            tz_name=tz_for_state(series_state)),
                    }

                    # --- NEW DEEP SCRAPE LOGIC ---
                    if event_url and event_counter <= 10:  # Cap deep limit
                        e_html, e_stat, _, _ = fetch_with_retry(session, event_url)
                        if e_stat == 200 and e_html:
                            # Search for fee in HendonMob format Buy-in: $ 400 + 40
                            fee_m = re.search(r"Buy-in[^$€£]*[$€£A-Z]*\s*[\d,]+\s*\+\s*[$€£A-Z]*\s*([\d,]+)", e_html, re.I | re.DOTALL)
                            if fee_m:
                                e_dict['fee'] = int(re.sub(r'[^\d]', '', fee_m.group(1)))
                                
                            # Search for Starting Stack
                            stk_m = re.search(r"Starting Stack.*?([\d,]+)", e_html, re.I | re.DOTALL)
                            if stk_m:
                                v = int(re.sub(r'[^\d]', '', stk_m.group(1)))
                                if v >= 1000: e_dict['starting_stack'] = v
                                
                            # Search for Blind Levels
                            lvl_m = re.search(r"Blind Levels.*?(\d+)\s*min", e_html, re.I | re.DOTALL)
                            if lvl_m:
                                e_dict['blind_levels'] = int(lvl_m.group(1))
                                
                            # Search for Guarantee
                            gtd_m = re.search(r"Guarantee.*?\$([\d,]+)", e_html, re.I | re.DOTALL)
                            if gtd_m:
                                e_dict['guarantee'] = int(re.sub(r'[^\d]', '', gtd_m.group(1)))
                    
                    events.append(e_dict)

            log(f"        [HendonMob] {len(events)} events extracted")

    except CODE_DEFECTS:
        # Re-raise: a bug in this parser must surface, not masquerade as
        # "HendonMob had nothing".
        raise
    except Exception as ex:
        log(f"        [HendonMob] Fetch/parse error: {type(ex).__name__}: {str(ex)[:200]}")
    return events

# ── Core per-series scraper ────────────────────────────────────────────────────
def scrape_series(series: dict, session, batch_id: str,
                  enrich_mode: bool = False) -> dict:
    """Scrape all tournament events for a single poker series."""
    series_uid  = str(series.get("id", ""))
    series_name = series.get("name", "Unknown")
    missing_fields = series.get("_missing_fields", [])
    # Series-level state, used ONLY as the STATE_TZ fallback when an extracted
    # event carries no state of its own (the HTML/PDF/aggregator paths never do).
    series_state = str(series.get("_db_state") or series.get("state") or "")

    db_source_url = str(series.get("source_url") or series.get("scrape_url") or "")

    # Build PA slug and URL — SOURCE OF TRUTH for re-scraping
    # Handle numeric IDs (some series don't have PA slugs)
    if series_uid.startswith("pa_"):
        slug = series_uid.replace("pa_", "")
        pa_url = f"https://www.pokeratlas.com/poker-tournament-series/{slug}"
    elif series_uid.isdigit():
        # A numeric legacy ID may point to an official casino/tour page.  It is
        # not a PokerAtlas source merely because the old code stored it in the
        # ``pa_url`` variable; doing so let an identity-rejected page be fetched
        # a second time by Source 2 and accepted on generic poker words alone.
        pa_url = (
            db_source_url
            if re.search(r"(?:^|\.)pokeratlas\.com/poker-tournament-series/", db_source_url, re.I)
            else ""
        )
        if not pa_url and not db_source_url:
            log(f"      [NOTE] No PA URL — will try Bravo + HendonMob fallback sources")
        elif pa_url:
            log(f"      [NOTE] Numeric ID {series_uid} — using URL: {pa_url[:80]}")
        else:
            log(
                f"      [NOTE] Numeric ID {series_uid}: official/source URL "
                "will be identity-checked by Source 2"
            )
    else:
        slug = series_uid
        pa_url = f"https://www.pokeratlas.com/poker-tournament-series/{slug}"

    result = dict(
        series_uid=series_uid, series_name=series_name,
        found=False, events=[], primary_url=pa_url, source="",
        # resolved_url = the URL of the source that ACTUALLY produced the events.
        # primary_url is only the PokerAtlas guess and is "" for numeric-ID series,
        # so writing it to poker_series.source_url wiped working URLs.
        resolved_url="", skipped=False,
        canonical_series_name=series_name,
        scrape_fail_count=0, flags=[],
        # Populated only by a complete, identity-checked PokerAtlas contract.
        # Flush/reconciliation additionally requires exact persistence proof.
        reconcile_complete=False, reconcile_source_url="",
        reconcile_event_uids=[], reconcile_expected_event_count=0,
        reconcile_evidence="",
    )

    # ── SOURCE 1: PokerAtlas series page (Scrapling StealthySession) ────────
    if pa_url:
        log(f"      [Src 1: PokerAtlas] {pa_url}")
        html, status, raw_body, html_hash = fetch_with_retry(session, pa_url)
    else:
        html, status, raw_body, html_hash = "", 0, b"", ""
        log(f"      [Src 1: PokerAtlas] SKIPPED (no URL)")

    if status == 200 and html and not pa_series_page_matches(series, html, pa_url):
        log(
            "        IDENTITY MISMATCH - fetched page does not match requested "
            f"series {series_uid}; quarantining {pa_url}"
        )
        result["scrape_fail_count"] += 1
        result["flags"].append("source_identity_mismatch")
        html = ""

    if status == 200 and html:
        result["canonical_series_name"] = extract_pa_series_page_name(html, series_name)

    if status == 200 and html:
        byte_count = len(raw_body)
        log(f"        HTTP 200 — {byte_count} bytes — hash: {html_hash[:16]}...")

        # Try __NEXT_DATA__ first (rich, structured data)
        events = extract_pa_next_data(html, series_uid, series_name, batch_id, pa_url, html_hash,
                                      series_state)
        if events:
            log(f"        [PA:NEXT_DATA] {len(events)} events extracted")
            result["events"] = events
            result["found"] = True
            result["source"] = "pokeratlas"
            result["resolved_url"] = pa_url
            reconciliation = pa_next_data_reconciliation_evidence(html, events)
            if reconciliation["complete"]:
                result["reconcile_complete"] = True
                result["reconcile_source_url"] = pa_url
                result["reconcile_event_uids"] = [e["event_uid"] for e in events]
                result["reconcile_expected_event_count"] = reconciliation["expected_event_count"]
                result["reconcile_evidence"] = reconciliation["reason"]
            else:
                log(
                    "        [PA:NEXT_DATA] additive-only snapshot; refusing "
                    f"retirement ({reconciliation['reason']})"
                )

        # Fallback: HTML parsing
        if not events:
            # The PokerAtlas tournament-item container is a bounded schedule
            # contract; generic regex output is not. Keep that distinction so a
            # partial fallback can add facts but can never retire prior rows.
            contract_events = extract_pokeratlas_html_events(
                html, series_uid, series_name, batch_id, pa_url, html_hash,
                series_state,
            )
            if contract_events is None:
                events = extract_html_events(
                    html, series_uid, series_name, batch_id, pa_url, html_hash,
                    series_state,
                )
            else:
                events = contract_events
            if events:
                log(f"        [PA:HTML] {len(events)} events (fallback)")
                result["events"] = events
                result["found"] = True
                result["source"] = "pokeratlas_html"
                result["resolved_url"] = pa_url
                if contract_events is not None:
                    result["reconcile_complete"] = True
                    result["reconcile_source_url"] = pa_url
                    result["reconcile_event_uids"] = [e["event_uid"] for e in events]
                    result["reconcile_expected_event_count"] = len(events)
                    result["reconcile_evidence"] = "complete_pokeratlas_html_contract"

        # PDF discovery on the page
        for pdf_url in find_pdfs(html, pa_url):
            pdf_text = extract_pdf(pdf_url)
            if pdf_text and has_tourn(pdf_text):
                pdf_hash = sha256h(pdf_text.encode("utf-8"))
                pdf_events = extract_html_events(
                    pdf_text, series_uid, series_name, batch_id, pdf_url, pdf_hash,
                    series_state
                )
                if pdf_events:
                    existing_uids = {e["event_uid"] for e in result["events"]}
                    new_pdf = [e for e in pdf_events if e["event_uid"] not in existing_uids]
                    if new_pdf:
                        result["events"].extend(new_pdf)
                        log(f"        [PDF] +{len(new_pdf)} events from {pdf_url[:60]}")
    else:
        log(f"        HTTP {status} — SKIPPED (no fabrication)")
        result["scrape_fail_count"] += 1
        if status == 403: result["flags"].append("cf_blocked")

    # ── SOURCE 2: Series source_url from DB (if different from PA) ──────────
    if db_source_url and "pokeratlas.com" not in db_source_url and not result["found"]:
        log(f"      [Src 2: Source URL] {db_source_url[:80]}")
        html2, status2, raw2, hash2 = fetch_with_retry(session, db_source_url)
        source_venue_name = str(
            series.get("venue_name") or series.get("venue") or ""
        )
        if status2 == 200 and html2 and not venue_page_confirms_series(
            series_name, source_venue_name, html2,
        ):
            log(
                "        IDENTITY MISMATCH - official/source page does not "
                f"name series-specific identity for {series_uid}; refusing fallback"
            )
            result["scrape_fail_count"] += 1
            result["flags"].append("source_identity_mismatch")
        elif status2 == 200 and html2 and has_tourn(html2):
            events2 = extract_html_events(html2, series_uid, series_name, batch_id, db_source_url,
                                          hash2, series_state)
            if events2:
                result["events"] = events2
                result["found"] = True
                result["source"] = "source_url"
                result["resolved_url"] = db_source_url
                log(f"        [Source URL] {len(events2)} events")
        elif status2 != 200:
            log(f"        HTTP {status2} — skipped")

    # ── SOURCE 3: CardPlayer ────────────────────────────────────────────────
    if not result["found"]:
        cp_events = _try_cardplayer(series_uid, series_name, batch_id, session, series_state)
        if cp_events:
            result["events"] = cp_events
            result["found"] = True
            result["source"] = "cardplayer"
            result["resolved_url"] = source_url_from_records(cp_events) or db_source_url or pa_url
            
    # ── SOURCE 4: HendonMob / SummerInVegas ─────────────────────────────────
    if not result["found"]:
        hm_events = _try_hendonmob(series_uid, series_name, batch_id, session, series_state)
        if hm_events:
            result["events"] = hm_events
            result["found"] = True
            result["source"] = "hendonmob"
            result["resolved_url"] = source_url_from_records(hm_events) or db_source_url or pa_url

    # ── SOURCE 5: Venue Web / Bravo ─────────────────────────────────────────
    if not result["found"]:
        v_events = _try_bravo_venue(series_uid, series_name, batch_id, session, series_state)
        if v_events:
            result["events"] = v_events
            result["found"] = True
            result["source"] = v_events[0].get("source", "venue")
            result["resolved_url"] = source_url_from_records(v_events) or db_source_url or pa_url

    # ── Series-level completeness log ───────────────────────────────────────
    # REMOVED: the "multi-source enrichment" block that used to live here.
    # It regex-scraped ONE payout_levels / late_reg_levels / rebuy_addon /
    # bounty_amount / structure_sheet_url value off a CardPlayer search page and
    # the venue homepage, then fanned that single value out onto EVERY event in
    # the series — so a $200 turbo, a $600 deep stack and a $10,000 main event
    # all ended up with the main event's bounty and late-reg, stamped as scraped
    # fact. It also used plain urllib (violating this file's Scrapling mandate)
    # and wrote columns make_event_rec never produces, risking a PGRST204 that
    # rejects the whole 100-record batch.
    # Per-event structure data is the job of the PokerAtlas __NEXT_DATA__ walk
    # above and of enrich_series_events.py, both of which match values to the
    # specific event they belong to.
    if result["found"] and result["events"]:
        cmp = compute_completeness(result["events"][0])
        log(f"      → Final events: {len(result['events'])}, Completeness score: {cmp}")

    # NOTE: the duplicated Bravo + HendonMob block that used to live here was
    # removed. Sources 3-5 already ran above; the duplicate HendonMob call was
    # missing the `session` argument (TypeError -> whole series reported as
    # "no events"), and the duplicate Bravo call doubled network cost per series.

    # No fetchable primary URL and nothing found via search sources — this is a
    # SKIP, not a failure, and must not trip the circuit breaker.
    if not result["found"] and not pa_url and not db_source_url:
        result["skipped"] = True
        result["flags"].append("no_source_url")

    # Parent dates are part of source identity. A response whose events fall
    # outside that window is commonly a different series page or an unrelated
    # fallback schedule, so reject the entire response instead of publishing a
    # plausible-looking partial subset.
    window_ok, window_reason = series_events_fit_parent_window(
        series, result["events"],
    )
    if result["events"] and not window_ok:
        log(
            f"      IDENTITY MISMATCH - {window_reason}; dropping "
            f"{len(result['events'])} event(s) for {series_name}"
        )
        result["events"] = []
        result["found"] = False
        result["scrape_fail_count"] += 1
        result["flags"].append("event_date_outside_parent_window")

    # ── Anti-hallucination guard ────────────────────────────────────────────
    if result["events"] and not anti_hallucination_ok(result["events"]):
        log(f"      ⛔ Anti-hallucination FAIL — dropping {series_name}")
        result["events"] = []
        result["found"] = False
        result["flags"].append("hallucination_detected")
        return result

    # ── Compute completeness scores ─────────────────────────────────────────
    for rec in result["events"]:
        rec["_completeness"] = compute_completeness(rec)
    avg_score = 0
    if result["events"]:
        avg_score = int(sum(r["_completeness"] for r in result["events"]) / len(result["events"]))

    # ── Layer 3: Save evidence file (BEFORE any DB write) ───────────────────
    evidence = {
        "scrape_url":         pa_url,
        "scrape_http_status": status,
        "scrape_html_hash":   html_hash,
        "scrape_byte_count":  len(raw_body),
        "scrape_timestamp":   datetime.now(timezone.utc).isoformat(),
        "scrape_script":      "scripts/poker_series_scraper.py",
        "scrape_batch_id":    batch_id,
        "body_preview":       html[:200] if html else "",
        "series_uid":         series_uid,
        "series_name":        series_name,
        "canonical_series_name": result["canonical_series_name"],
        "found":              result["found"],
        "records_extracted":  len(result["events"]),
        "source":             result["source"],
        "primary_url":        result["primary_url"],
        "resolved_url":       result["resolved_url"],
        "avg_completeness":   avg_score,
        "enrich_mode":        enrich_mode,
        "missing_fields":     missing_fields,
        "flags":              result["flags"],
    }
    if result["events"]:
        buyins = [e["buy_in"] for e in result["events"] if e.get("buy_in")]
        dates  = [e["start_date"] for e in result["events"] if e.get("start_date")]
        if buyins:
            evidence["buy_in_min"] = min(buyins)
            evidence["buy_in_max"] = max(buyins)
        if dates:
            evidence["start_date"] = min(dates)
            evidence["end_date"]   = max(dates)
        # Store events in evidence for audit trail
        evidence["events"] = result["events"]

    epath = save_evidence(series_uid, evidence)
    log(f"      Evidence: {Path(epath).name}")

    # Promote the internal score to the real DB column instead of discarding it.
    # scrape_completeness_score was never written by the scraper, so the
    # --min-score enrichment filters were reading a column that only existed if
    # a different script happened to run first.
    for rec in result["events"]:
        rec["scrape_completeness_score"] = rec.pop("_completeness", None)

    return result

# ── Flush chunk (upsert events + patch series metadata) ───────────────────────
def flush_chunk(chunk_results: list, batch_id: str, dry_run: bool) -> int:
    """Upsert all events from a chunk of series, patch series metadata."""
    all_events = []
    for sr in chunk_results:
        all_events.extend(sr.get("events", []))

    if not all_events:
        log("  [FLUSH] 0 events — nothing to upsert"); return 0

    # Collapse duplicate event_uids BEFORE the upsert. Two rows with the same
    # conflict target in one PostgREST request make Postgres raise 21000 and the
    # ENTIRE 100-row chunk is rejected, so one bad pair would silently lose 99
    # good events. Last occurrence wins (later sources are the enriched ones).
    deduped = {}
    for rec in all_events:
        deduped[rec.get("event_uid")] = rec
    if len(deduped) != len(all_events):
        log(f"  [FLUSH] collapsed {len(all_events) - len(deduped)} duplicate "
            f"event_uid(s) before upsert")
        all_events = list(deduped.values())

    if dry_run:
        log(f"  [DRY RUN] Would upsert {len(all_events)} events from {len(chunk_results)} series")
        return len(all_events)

    # Events carry a foreign key to poker_series.  Newly discovered live
    # listing entries are not in the checked-in master or DB yet, so the parent
    # must be verified/created before any child upsert is attempted.
    eligible_results = []
    eligible_uids = set()
    for sr in chunk_results:
        if not sr.get("found") or not sr.get("events"):
            continue
        if sb_ensure_series_parent(sr, batch_id):
            eligible_results.append(sr)
            eligible_uids.add(sr["series_uid"])
        else:
            lost = len(sr.get("events") or [])
            RUN_ERRORS["rows_lost"] += lost
            log(f"  [FLUSH] blocked {lost} event row(s): parent not verified")
    all_events = [event for event in all_events if event.get("series_uid") in eligible_uids]
    if not all_events:
        log("  [FLUSH] 0 events have a verified parent; refusing child upsert")
        return 0

    # Upsert events in batches of 100 via PostgREST (triggers fire), retaining
    # exact returned identities. A series is metadata-fresh/reconcilable only if
    # every one of its current event_uids is present in this confirmed set.
    confirmed_event_uids: set[str] = set()
    for i in range(0, len(all_events), 100):
        confirmed_event_uids.update(sb_upsert_events_confirmed(all_events[i:i+100]))
    total = len(confirmed_event_uids)

    # Patch series metadata
    for sr in eligible_results:
        if not sr.get("found") or not sr.get("events"): continue
        events = sr["events"]
        expected_event_uids = {
            str(event.get("event_uid") or "") for event in events
            if event.get("event_uid")
        }
        if (not expected_event_uids
                or not expected_event_uids.issubset(confirmed_event_uids)):
            missing = expected_event_uids - confirmed_event_uids
            log(
                f"  [FLUSH] {sr['series_uid'][:50]} remains freshness-unverified; "
                f"{len(missing) or len(events)} current event row(s) were not confirmed"
            )
            continue
        patch = build_series_parent_refresh_patch(
            sr, batch_id,
            preserve_manual=bool(sr.get("_preserve_manual_parent")),
        )
        if not patch:
            RUN_ERRORS["patch_failed"] += 1
            log(f"  [FLUSH] parent refresh provenance missing for {sr['series_uid'][:50]}")
            continue

        if not sb_patch_series(sr["series_uid"], patch):
            log(f"  [FLUSH] series patch FAILED for {sr['series_uid'][:50]}")
            continue

        # This is deliberately last. Current events, the parent metadata, and
        # the authoritative source boundary must all be confirmed before an
        # older row is made unservable.
        if sr.get("reconcile_complete"):
            reconcile_authoritative_series_events(sr)

    found_count = len(eligible_results)
    avg_score = 0
    if all_events:
        avg_score = int(sum(compute_completeness(r) for r in all_events) / len(all_events))
    if total < len(all_events):
        log(f"  [FLUSH] ⛔ {len(all_events) - total} event row(s) were NOT written by the DB")
    log(f"  [FLUSH] {len(chunk_results)} series → {found_count} with events → "
        f"{total}/{len(all_events)} events confirmed written, avg_completeness={avg_score}")
    return total

# ── Load series list (missing mode vs enrich mode) ─────────────────────────────
def load_missing_series(filter_state: str = "", filter_slug: str = "",
                        force: bool = False, limit: int = 0,
                        discovered_series: Optional[list[dict]] = None) -> Optional[list]:
    """Load series that have NOT been scraped yet (or all if --force)."""
    if not MASTER_LIST.exists():
        log(f"❌ Master list not found: {MASTER_LIST}"); sys.exit(1)

    with open(MASTER_LIST) as f:
        data = json.load(f)
    master_series = data.get("master_list", [])
    all_series = merge_series_catalog(master_series, discovered_series or [])
    log(
        f"  Series catalog: {len(discovered_series or [])} live discoveries + "
        f"{len(master_series)} master entries -> {len(all_series)} unique"
    )

    # ── Exclude poker TOURS (these are NOT series) ──────────────────────
    TOUR_KEYWORDS = [
        "wsop", "world series of poker",
        "mspt", "mid-states poker tour",
        "wpt", "world poker tour",
        "hpt", "heartland poker tour",
        "rgps", "run good poker",
        "bestbet poker tour", "lodge poker tour",
        "ante up poker tour", "poker night in america",
        "ggpoker", "partypoker", "pokerstars",
    ]
    def _is_tour(s):
        name = str(s.get("name","")).lower()
        sid  = str(s.get("id","")).lower()
        return any(kw in name or kw in sid for kw in TOUR_KEYWORDS)

    before = len(all_series)
    all_series = [s for s in all_series if not _is_tour(s)]
    excluded = before - len(all_series)
    if excluded:
        log(f"  Excluded {excluded} poker TOURS → {len(all_series)} series remaining")

    # Get DB state for filtering
    db_series = sb_get_paged("poker_series",
        "?select=series_uid,state,events_scraped,events_count,scrape_url,source_url,"
        "last_scraped,start_date,end_date,is_suppressed")
    if db_series is None:
        log("  [SERIES LOAD ERR] poker_series cohort could not be verified")
        return None
    db_map = {r["series_uid"]: r for r in db_series}

    before_suppressed = len(all_series)
    all_series = [
        series for series in all_series
        if not db_map.get(str(series.get("id", "")), {}).get("is_suppressed")
    ]
    if before_suppressed != len(all_series):
        log(
            f"  Skipping {before_suppressed - len(all_series)} explicitly "
            "suppressed series pending manual source repair"
        )

    # Enrich master list with DB data (state, source_url, scrape_url)
    for s in all_series:
        sid = str(s.get("id", ""))
        db_row = db_map.get(sid, {})
        s["_db_state"] = db_row.get("state", "")
        # Prefer master list source_url, fallback to DB
        if not s.get("source_url"):
            s["source_url"] = db_row.get("source_url") or db_row.get("scrape_url") or ""

    # Filter explicit targets only after applying the authoritative suppression
    # map.  The former early return let ``--series`` bypass quarantine rows.
    if filter_slug:
        slug_lower = filter_slug.lower()
        matched = [s for s in all_series
                   if slug_lower in str(s.get("id", "")).lower()
                   or slug_lower in str(s.get("name", "")).lower()]
        if not matched:
            log(f"  ⚠️  No unsuppressed series matching '{filter_slug}' in ID or name")
        else:
            log(f"  Matched {len(matched)} unsuppressed series for '{filter_slug}'")
        return matched[:1]

    # Filter by state
    if filter_state:
        all_series = [s for s in all_series
                      if s.get("_db_state", "").upper() == filter_state.upper()]
        log(f"  After state filter ({filter_state}): {len(all_series)} series")

    # Skip already-scraped (unless --force).
    # A series is only skipped when it was scraped RECENTLY *and* has already
    # ended. Previously any series scraped once was skipped forever, so added
    # events, moved dates, changed guarantees and cancellations were never
    # picked up and daemon mode immediately reported "all done" every cycle.
    if not force:
        now = datetime.now(timezone.utc)
        today = now.date().isoformat()
        cutoff = now - timedelta(hours=REFRESH_AFTER_HOURS)

        def _is_fresh(r: dict) -> bool:
            if not (r.get("events_scraped") and (r.get("events_count") or 0) > 0):
                return False                      # never successfully scraped
            end_date = str(r.get("end_date") or "")[:10]
            if end_date and end_date < today:
                return True                       # series already ended — done forever
            last = r.get("last_scraped") or ""
            if not last:
                return False                      # no timestamp — refresh once
            try:
                last_dt = datetime.fromisoformat(str(last).replace("Z", "+00:00"))
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
            except ValueError:
                return False
            # Ongoing / future series: refresh once the staleness window expires.
            return last_dt >= cutoff

        scraped_uids = {r["series_uid"] for r in db_series if _is_fresh(r)}
        before = len(all_series)
        all_series = [s for s in all_series if str(s.get("id","")) not in scraped_uids]
        log(f"  Skipping {before - len(all_series)} fresh (<{REFRESH_AFTER_HOURS}h) "
            f"→ {len(all_series)} to scrape/refresh")

    if limit > 0:
        all_series = all_series[:limit]
        log(f"  Limited to first {limit} series")

    return all_series

def load_enrich_series(filter_state: str = "", min_score: int = 60,
                       limit: int = 0) -> Optional[list]:
    """
    Load series that already have events but with low completeness scores.
    Re-scrape to fill missing fields every 72h cycle.
    Series that fail 5+ times get flagged permanently_ungettable.
    """
    log(f"  [ENRICH] Loading series with avg completeness < {min_score}...")

    # Get all events, compute per-series avg completeness
    events = sb_get_paged("poker_events",
        "?select=series_uid,event_name,starting_stack,blind_levels,"
        "guarantee,format,late_reg_levels,re_entry,fee,prize_pool,entries,"
        "buy_in,start_time,start_date,game_type,source,notes")
    if events is None:
        log("  [ENRICH READ ERR] poker_events cohort could not be verified")
        return None
    if not events:
        log("  [ENRICH] No events in DB!"); return []

    from collections import defaultdict
    by_uid = defaultdict(list)
    for e in events: by_uid[e.get("series_uid","")].append(e)

    # Compute avg completeness per series
    low_score_uids = []
    for uid, evts in by_uid.items():
        if not uid: continue
        scores = [compute_completeness(e) for e in evts]
        avg = sum(scores) / len(scores) if scores else 0
        if avg < min_score:
            # Determine which fields are most NULL
            rich_fields_db = ["event_name","starting_stack","blind_levels",
                              "guarantee","format","late_reg_levels","fee",
                              "prize_pool","entries","notes"]
            missing = [f for f in rich_fields_db
                       if all(not e.get(f) for e in evts)]
            low_score_uids.append((uid, avg, missing))

    log(f"  [ENRICH] {len(low_score_uids)} series below score {min_score}")

    # Build series list from master + DB
    if not MASTER_LIST.exists():
        log(f"❌ Master list not found: {MASTER_LIST}"); sys.exit(1)

    with open(MASTER_LIST) as f:
        master = json.load(f).get("master_list", [])

    # Get DB metadata
    db_series = sb_get_paged("poker_series",
        "?select=series_uid,state,scrape_url,source_url,is_suppressed")
    if db_series is None:
        log("  [ENRICH READ ERR] poker_series metadata cohort could not be verified")
        return None
    db_map = {r["series_uid"]: r for r in db_series}
    master_map = {str(s.get("id","")): s for s in master}

    result = []
    for uid, avg_score, missing in low_score_uids:
        db_row = db_map.get(uid, {})
        if db_row.get("is_suppressed") is True:
            continue
        fail_count = 0  # scrape_fail_count column not in poker_series schema

        # Skip permanently ungettable
        if fail_count >= ENRICH_FAIL_MAX:
            log(f"  [ENRICH] Skipping {uid[:40]} — {fail_count} fails (permanently_ungettable)")
            continue

        entry = master_map.get(uid, {"id": uid, "name": uid})
        entry["_db_state"] = db_row.get("state", "")
        entry["source_url"] = db_row.get("source_url") or db_row.get("scrape_url") or ""
        entry["_missing_fields"] = missing
        entry["_avg_score"] = avg_score
        result.append(entry)

    if filter_state:
        result = [s for s in result if s.get("_db_state","").upper() == filter_state.upper()]

    if limit > 0:
        result = result[:limit]

    log(f"  [ENRICH] {len(result)} series qualify for enrichment pass")
    return result


def record_unresolved_series_attempt(series_result: dict) -> bool:
    """Record a fetched-but-unresolved series as a run-level error."""
    if series_result.get("found") or series_result.get("skipped"):
        return False
    RUN_ERRORS["series_errors"] += 1
    return True

# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    global CURRENT_SESSION, STOP_REQUESTED
    for counter in RUN_ERRORS:
        RUN_ERRORS[counter] = 0
    p = argparse.ArgumentParser(description="Poker Series Event Scraper (Scrapling + Camoufox)")
    p.add_argument("--state",      default="",  help="Filter to single state (e.g. NV)")
    p.add_argument("--series",     default="",  help="Scrape a single series by slug")
    p.add_argument("--limit",      type=int, default=0, help="Process first N series only")
    p.add_argument("--force",      action="store_true", help="Re-scrape even if events exist")
    p.add_argument("--dry-run",    action="store_true", help="No DB writes")
    p.add_argument("--enrich",     action="store_true",
                   help="Re-scrape series with low completeness to fill missing fields")
    p.add_argument("--min-score",  type=int, default=60,
                   help="Enrich series with avg completeness below this (default 60)")
    p.add_argument("--pass-limit", type=int, default=3, help="Max enrichment passes")
    p.add_argument("--daemon",     action="store_true", help="Run continuously as a 6-hour daemon")
    p.add_argument("--max-minutes", type=int, default=0,
                   help="Wall-clock budget. Flush and exit cleanly before this many "
                        "minutes elapse so a CI runner never kills the job mid-chunk "
                        "and loses the unflushed buffer. 0 = unlimited.")
    p.add_argument("--series-timeout", type=int, default=600,
                   help="Soft per-series time cap in seconds (default 600)")
    args = p.parse_args()

    deadline = (time.time() + args.max_minutes * 60) if args.max_minutes > 0 else None

    from scrapling.fetchers import StealthySession

    mode = "ENRICH" if args.enrich else "MISSING"
    log("="*70)
    log(f"POKER SERIES SCRAPER — Mode: {mode}")
    log("  Source: live PokerAtlas listing + checked-in catalog fallback")
    log(f"  Fetcher: Scrapling StealthySession + camoufox")
    log(f"  Primary: PokerAtlas __NEXT_DATA__ extraction")
    log(f"  Target DB: poker_events (upsert on event_uid)")
    log(f"  DB Writes: {'DRY RUN' if args.dry_run else 'LIVE (via PostgREST — triggers fire)'}")
    log(f"  Force: {args.force}")
    log(f"  PDF: {'✅ pdfplumber' if PDF_OK else '⚠️  missing'}")
    log(f"  Anti-hallucination: ✅ enabled")
    log(f"  Data integrity: 6-layer enforcement")
    log("="*70)

    if not network_ok():
        log("❌ Network unavailable — aborting (pre-check failed)"); sys.exit(1)

    pass_num = 0
    total_found = 0
    total_events = 0

    while pass_num < args.pass_limit:
        if STOP_REQUESTED:
            log("Shutdown requested before the next pass")
            break
        pass_num += 1
        batch_id = str(uuid.uuid4())
        session = None
        discovered_series: list[dict] = []

        if args.enrich:
            series_list = load_enrich_series(args.state, args.min_score, args.limit)
            if series_list is None:
                log("Enrichment cohort read failed; aborting this run")
                break
            if not series_list:
                log("✅ All series at full completeness!"); break
        else:
            # Refresh the current PokerAtlas listing every run.  The checked-in
            # master file is a fallback/catalog history, not a current schedule.
            session = create_session()
            CURRENT_SESSION = session
            listing_html, listing_status, _, listing_hash = fetch_with_retry(
                session, PA_SERIES_LISTING_URL
            )
            if CURRENT_SESSION is not None and CURRENT_SESSION is not session:
                session = CURRENT_SESSION
            if listing_status == 200 and listing_html:
                discovered_series = extract_pa_series_listing(listing_html)
                if discovered_series:
                    log(
                        f"  Live PokerAtlas listing: {len(discovered_series)} series "
                        f"(hash {listing_hash[:16]}...)"
                    )
                else:
                    log("  Live PokerAtlas listing returned no canonical series links")
                    RUN_ERRORS["series_errors"] += 1
            else:
                log(
                    f"  Live PokerAtlas listing unavailable (HTTP {listing_status}); "
                    "using master fallback and marking the run degraded"
                )
                RUN_ERRORS["series_errors"] += 1
            series_list = load_missing_series(
                filter_state=args.state,
                filter_slug=args.series,
                force=args.force,
                limit=args.limit,
                discovered_series=discovered_series,
            )
            if series_list is None:
                try:
                    if session is not None:
                        session.close()
                except Exception:
                    pass
                CURRENT_SESSION = None
                log("Series cohort read failed; aborting this run")
                break
            if not series_list:
                try:
                    if session is not None:
                        session.close()
                except Exception:
                    pass
                CURRENT_SESSION = None
                log("🎉 No series to scrape — all done!"); break

        log(f"\n{'='*70}")
        log(f"PASS {pass_num}/{args.pass_limit} — {len(series_list)} series — Batch {batch_id[:8]}")
        log(f"{'='*70}\n")

        if session is None:
            session = create_session()
            CURRENT_SESSION = session
        session_start = time.time()
        consecutive_fails = 0
        chunk_buf: list = []
        pass_found = 0
        wall_start = time.time()

        budget_exhausted = False
        for i, series in enumerate(series_list):
            if STOP_REQUESTED:
                log(
                    f"  Shutdown requested at series {i + 1}/{len(series_list)}; "
                    "flushing confirmed work before exit"
                )
                budget_exhausted = True
                break
            # Wall-clock budget — flush what we have and stop cleanly rather than
            # letting the CI runner kill the job mid-chunk and lose chunk_buf.
            if deadline and time.time() >= deadline:
                log(f"  ⏱  Wall-clock budget ({args.max_minutes}m) reached at series "
                    f"{i+1}/{len(series_list)} — flushing and stopping cleanly. "
                    f"Unscraped series resume on the next run.")
                budget_exhausted = True
                break

            series_name = series.get("name", "Unknown")
            series_uid  = str(series.get("id", "?"))
            score_info = ""
            mf = series.get("_missing_fields", [])
            if mf: score_info = f" [needs: {', '.join(mf[:3])}]"
            log(f"\n  [{i+1}/{len(series_list)}] {series_name}{score_info}")
            log(f"      UID: {series_uid[:60]}")

            # ── Session management ──────────────────────────────────────
            # Resync with any replacement fetch_with_retry had to make - the
            # local variable would otherwise still reference a closed session.
            if CURRENT_SESSION is not None and CURRENT_SESSION is not session:
                session = CURRENT_SESSION
            # Recycle every PAGE_RECYCLE series
            if i > 0 and i % PAGE_RECYCLE == 0:
                log(f"  ♻️  Recycle at #{i}")
                try: session.close()
                except: pass
                session = create_session()
                CURRENT_SESSION = session
                session_start = time.time()
                consecutive_fails = 0

            # 6h session timeout
            if time.time() - session_start > SESSION_MAX:
                log("  🔄 6h session refresh")
                try: session.close()
                except: pass
                session = create_session()
                session_start = time.time()

            # Sleep/wake drift detection
            expected = i * (SERIES_RATE_S + 5)
            actual   = time.time() - wall_start
            if actual > expected * 2 + 120:
                log("  ⚡ Drift detected — restarting session")
                try: session.close()
                except: pass
                session = create_session()
                session_start = time.time()
                wall_start = time.time()
                consecutive_fails = 0

            series_started = time.time()
            try:
                sr = scrape_series(series, session, batch_id, args.enrich)
                chunk_buf.append(sr)
                if sr["found"]:
                    pass_found += 1
                    consecutive_fails = 0
                    log(f"      ✅ {len(sr['events'])} events — score={compute_completeness(sr['events'][0]) if sr['events'] else 0}")
                elif sr.get("skipped"):
                    # Explicitly skipped series (no fetchable URL) shouldn't trip breaker
                    consecutive_fails = 0
                    log(f"      ⏭  Skipped — no source URL")
                else:
                    # A fetched/attempted series that produced no identity-bound
                    # events is unresolved, not a successful no-op.
                    record_unresolved_series_attempt(sr)
                    consecutive_fails += 1
                    log(f"      ❌ No events found")
                    # Update status in DB
                    if not args.dry_run:
                        if not sb_patch_series(series_uid, {
                            "scrape_status": "failed",
                            "scrape_timestamp": datetime.now(timezone.utc).isoformat(),
                        }):
                            log(f"      failed to persist unresolved status for {series_uid}")
            except CODE_DEFECTS as e:
                # A bug in the scraper is NOT "this series had no events".
                # Log loudly with a traceback, count it, and keep the run's exit
                # code non-zero so CI/launchd actually notice.
                import traceback
                log(f"    ⛔ CODE DEFECT scraping {series_uid[:50]}: "
                    f"{type(e).__name__}: {e}")
                log(traceback.format_exc())
                RUN_ERRORS["series_errors"] += 1
                chunk_buf.append({"series_uid":series_uid,"series_name":series_name,
                                  "found":False,"events":[]})
                consecutive_fails += 1
            except Exception as e:
                log(f"    ❌ {type(e).__name__}: {str(e)[:200]}")
                RUN_ERRORS["series_errors"] += 1
                chunk_buf.append({"series_uid":series_uid,"series_name":series_name,
                                  "found":False,"events":[]})
                consecutive_fails += 1

            # fetch_with_retry can replace a dead browser mid-series. Adopt that
            # session immediately so the final item in a pass is also closed and
            # so timeout/circuit-breaker handling never operates on the old one.
            if CURRENT_SESSION is not None and CURRENT_SESSION is not session:
                session = CURRENT_SESSION

            elapsed = time.time() - series_started
            if args.series_timeout and elapsed > args.series_timeout:
                log(f"      ⏱  Series took {elapsed:.0f}s (> {args.series_timeout}s cap) "
                    f"— recycling session to keep the pass on schedule")
                try: session.close()
                except Exception: pass
                session = create_session()
                CURRENT_SESSION = session
                session_start = time.time()
                consecutive_fails = 0

            # Flush chunk when full
            if len(chunk_buf) >= CHUNK_SIZE:
                n = flush_chunk(chunk_buf, batch_id, args.dry_run)
                total_events += n
                chunk_buf = []

            # Circuit breaker — 5 consecutive fails → restart
            if consecutive_fails >= CIRCUIT_MAX:
                log(f"  ⚡ Circuit breaker — {consecutive_fails} fails — restarting")
                try: session.close()
                except: pass
                time.sleep(4)
                session = create_session()
                CURRENT_SESSION = session
                session_start = time.time()
                consecutive_fails = 0

            time.sleep(SERIES_RATE_S)

        # Final flush
        if chunk_buf:
            n = flush_chunk(chunk_buf, batch_id, args.dry_run)
            total_events += n

        try: session.close()
        except: pass
        CURRENT_SESSION = None

        total_found += pass_found

        # Layer 6: Audit trail
        if not args.dry_run:
            if not sb_audit(
                batch_id,
                len(series_list),
                total_events,
                f"Pass={pass_num},Mode={mode},Found={pass_found}/{len(series_list)}",
            ):
                RUN_ERRORS["patch_failed"] += 1

        log(f"\n{'='*70}")
        log(f"PASS {pass_num} DONE — {pass_found}/{len(series_list)} resolved, {total_events} events total")

        if budget_exhausted:
            log("⏱  Stopping after this pass — wall-clock budget reached.")
            break

        # For missing mode: check if there are still unscraped series
        if not args.enrich:
            if args.series: break  # single series mode, one pass
            remaining = load_missing_series(
                args.state,
                force=False,
                discovered_series=discovered_series,
            )
            if remaining is None:
                log("Remaining-series cohort read failed; aborting this run")
                break
            log(f"Remaining: {len(remaining)}")
            if not remaining: log("🎉 100% COMPLETE!"); break
            if len(remaining) == len(series_list):
                log("⚠️  No progress — consider manual review"); break

        log("Sleeping 10s...\n"); time.sleep(10)

    # The exit gate judges PRODUCTIVITY, so it needs the denominator as well as
    # the error count: "7 source errors" means nothing without "out of how
    # many". Recorded here, where both numbers are already in hand.
    RUN_STATS["series_resolved"] = total_found

    log(f"\n{'='*70}")
    log(f"DONE — {pass_num} passes, {total_found} series resolved, {total_events} events")
    log(f"  Errors: upsert_failed={RUN_ERRORS['upsert_failed']} "
        f"rows_lost={RUN_ERRORS['rows_lost']} "
        f"patch_failed={RUN_ERRORS['patch_failed']} "
        f"series_errors={RUN_ERRORS['series_errors']}")
    log(f"Log: {log_path}")
    # Return the number of rows the DB CONFIRMED writing so callers (daemon
    # watchdog, CI) can tell a productive run from a clean-looking no-op.
    return total_events

if __name__ == "__main__":
    if "--daemon" in sys.argv:
        log("\n🚀 Starting continuous daemon mode (6 hour cycles)...")
        import signal
        import os
        
        running = True
        def signal_handler(sig, frame):
            global running, STOP_REQUESTED
            log("⛔ Shutdown signal received, stopping...")
            running = False
            STOP_REQUESTED = True
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        last_successful_save = time.time()
        WATCHDOG_MAX_STALE_MINUTES = 8 * 60 # 8 hours
        consecutive_error_cycles = 0
        
        while running:
            stale_minutes = (time.time() - last_successful_save) / 60
            if stale_minutes > WATCHDOG_MAX_STALE_MINUTES:
                log(f"🚨 WATCHDOG: No successful data save in {stale_minutes:.0f} minutes. Exiting so launchd can cleanly restart process.")
                os._exit(1)
            try:
                rows_written = main()
                cycle_control = daemon_cycle_control(
                    rows_written,
                    RUN_ERRORS,
                    consecutive_error_cycles,
                )
                consecutive_error_cycles = cycle_control["error_streak"]
                sleep_seconds = cycle_control["sleep_seconds"]
                if cycle_control["refresh_liveness"]:
                    last_successful_save = time.time()
                if cycle_control["degraded"]:
                    log(
                        f"Run completed with integrity errors {RUN_ERRORS}; "
                        f"keeping daemon alive for bounded producer retry in "
                        f"{sleep_seconds}s (degraded streak "
                        f"#{consecutive_error_cycles})"
                    )
                # Only reset the staleness clock when the cycle ACTUALLY wrote
                # rows. Resetting on every return meant a daemon producing zero
                # rows for weeks still looked healthy and the watchdog never
                # tripped.
                elif not cycle_control["refresh_liveness"]:
                    stale = (time.time() - last_successful_save) / 60
                    log(f"⚠️  Cycle wrote 0 rows — staleness clock NOT reset "
                        f"({stale:.0f} min since last successful save)")
            except Exception as e:
                log(f"\n❌ Daemon cycle crashed: {e}")
                import traceback
                traceback.print_exc()
                # An unhandled cycle defect is not a valid idle state. Exit so
                # launchd records the failure and starts a clean process rather
                # than leaving the daemon asleep and stale for six hours.
                sys.exit(1)

            if not running or STOP_REQUESTED:
                break
            
            if cycle_control["degraded"]:
                log(f"\n💤 Daemon degraded backoff for {sleep_seconds}s...")
            else:
                log(f"\n💤 Daemon sleeping for {sleep_seconds // 3600} hours...")
            for _tick in range(sleep_seconds):
                if not running:
                    break
                time.sleep(1)
                # Evaluate staleness DURING the sleep, not only at loop top —
                # otherwise the watchdog can't fire inside a 6-hour window.
                if _tick % 300 == 0:
                    stale_minutes = (time.time() - last_successful_save) / 60
                    if stale_minutes > WATCHDOG_MAX_STALE_MINUTES:
                        log(f"🚨 WATCHDOG: No successful data save in "
                            f"{stale_minutes:.0f} minutes. Exiting so launchd can "
                            f"cleanly restart process.")
                        os._exit(1)
                
        log("🛑 Daemon strictly stopped.")
    else:
        main()
        # ── FAIL ON OUR FAULTS, REPORT THE WORLD'S (2026-09-07) ──────────────
        #
        # This used to exit 1 if ANY of the four counters was non-zero, and
        # `series_errors` counts third-party fetch failures — a certificate,
        # a connection reset, an empty result from someone else's website.
        # Poker sites are never all reachable at once, so the condition was
        # unsatisfiable and this workflow has NEVER succeeded on main: zero
        # green runs in its entire recorded history, roughly five months of
        # daily red and a daily SMS to a human. An alarm that is always on is
        # an alarm that gets muted (CLAUDE.md 10.83/10.84), and it took the
        # `42P10` below with it — a real defect nobody could see behind the
        # noise.
        #
        # OUR faults still fail immediately and unconditionally: a lost row, a
        # failed upsert or a failed patch is a defect in this repo.
        #
        # Source errors are judged the way the venue-scraper gate judges its
        # dispatches: on PRODUCTIVITY, not on the absence of any error. A run
        # that resolved series did its job even if three sources were down; a
        # run that resolved nothing, or lost more than half of what it tried,
        # has not and pages.
        ours = (RUN_ERRORS["upsert_failed"] or RUN_ERRORS["rows_lost"]
                or RUN_ERRORS["patch_failed"])
        resolved = RUN_STATS.get("series_resolved") or 0
        src_errors = RUN_ERRORS["series_errors"]

        # NO FABRICATED DENOMINATOR. A first draft computed
        # `attempted = max(resolved + src_errors, resolved)` and printed
        # "N of M attempted" to a human as fact. M is not real: series_errors
        # is incremented at nine sites, most of them listing fetches, Scrapling
        # failures and Supabase paging rather than series attempts, so it both
        # double-counts and counts things that were never a series. And
        # `max(a+b, a)` with b >= 0 never picks its second argument, so
        # `barren` implied `mostly_failed` for every input and the whole gate
        # collapsed to `src_errors > resolved`.
        #
        # `resolved` IS known. So the productivity test is the one that needs
        # nothing else: we went to the sources, they failed us, and we came
        # back with nothing.
        barren = resolved == 0 and src_errors > 0

        if src_errors:
            log(f"⚠️  {src_errors} source error(s); {resolved} series resolved. "
                f"Third-party sites are not this repo's to fix — reported, not failed.")
        summary = os.environ.get("GITHUB_STEP_SUMMARY")
        if summary:
            try:
                with open(summary, "a", encoding="utf-8") as fh:
                    fh.write(
                        f"\n### Poker series scrape\n\n"
                        f"- series resolved: **{resolved}**\n"
                        f"- source errors (third party; not all of them series): {src_errors}\n"
                        f"- our faults: upsert_failed={RUN_ERRORS['upsert_failed']}, "
                        f"rows_lost={RUN_ERRORS['rows_lost']}, "
                        f"patch_failed={RUN_ERRORS['patch_failed']}\n"
                    )
            except OSError:
                pass  # a summary we cannot write must never fail the run

        if ours:
            log(f"❌ Run completed WITH ERRORS OF OURS: {RUN_ERRORS} — exiting 1")
            sys.exit(1)
        if barren:
            log(f"❌ Run resolved no series at all against {src_errors} source "
                f"error(s) — exiting 1")
            sys.exit(1)
