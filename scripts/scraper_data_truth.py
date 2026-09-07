"""Shared, side-effect-free scraper provenance and persistence contracts.

The daemon entrypoints intentionally load credentials and browser runtimes at
import time, which makes them poor unit-test targets.  This module contains the
small decisions that must stay identical across those entrypoints and is safe
to import from both production processes and executable tests.
"""

from __future__ import annotations

import hashlib
import html
import re
from typing import Dict, Iterable, Mapping, Optional, Set, Tuple


OBSERVATION_OBSERVED = "observed"
OBSERVATION_CATALOG = "catalog"
OBSERVATION_MODELED = "modeled"

QUALITY_OBSERVED = "scraped_verified"
QUALITY_CATALOG = "catalog_verified"
QUALITY_MODELED = "simulated"
QUALITY_INFERRED = "scraped_inferred"

RUN_SUCCESS = "success"
RUN_VALID_EMPTY = "valid_empty"
RUN_PROGRESS = "progress"
RUN_MAINTENANCE = "maintenance"
RUN_PARTIAL = "partial"
RUN_FAILED = "failed"


_NOISE_VENUE_PATTERNS = (
    "view live info",
    "wait list registration",
    "waitlist registration",
    "register for wait list",
    "log in",
    "favorited",
    "minutes ago",
    "minute ago",
    "hours ago",
    "hour ago",
)

US_STATE_CODES = frozenset({
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
})
US_STATE_NAME_TO_CODE = {
    "ALABAMA": "AL", "ALASKA": "AK", "ARIZONA": "AZ", "ARKANSAS": "AR",
    "CALIFORNIA": "CA", "COLORADO": "CO", "CONNECTICUT": "CT",
    "DELAWARE": "DE", "FLORIDA": "FL", "GEORGIA": "GA", "HAWAII": "HI",
    "IDAHO": "ID", "ILLINOIS": "IL", "INDIANA": "IN", "IOWA": "IA",
    "KANSAS": "KS", "KENTUCKY": "KY", "LOUISIANA": "LA", "MAINE": "ME",
    "MARYLAND": "MD", "MASSACHUSETTS": "MA", "MICHIGAN": "MI",
    "MINNESOTA": "MN", "MISSISSIPPI": "MS", "MISSOURI": "MO",
    "MONTANA": "MT", "NEBRASKA": "NE", "NEVADA": "NV",
    "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM",
    "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND",
    "OHIO": "OH", "OKLAHOMA": "OK", "OREGON": "OR", "PENNSYLVANIA": "PA",
    "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
    "TENNESSEE": "TN", "TEXAS": "TX", "UTAH": "UT", "VERMONT": "VT",
    "VIRGINIA": "VA", "WASHINGTON": "WA", "WEST VIRGINIA": "WV",
    "WISCONSIN": "WI", "WYOMING": "WY", "DISTRICT OF COLUMBIA": "DC",
}
US_STATE_NAMES = frozenset(US_STATE_NAME_TO_CODE)

NON_US_POKERATLAS_REGION_SLUGS = frozenset({
    "bc-interior",
    "calgary-s-alberta",
    "caribbean",
    "montreal-area",
    "saskatchewan",
    "toronto-ontario",
    "vancouver",
})

# Cross-border directory pages can list nearby Canadian rooms inside an
# otherwise US region. These two legacy rows have been individually verified
# non-US and must stay quarantined until the map persists detail-page country.
NON_US_POKERATLAS_VENUE_SLUGS = frozenset({
    "caesars-windsor",
    "casino-niagara-niagara-falls",
    "club-montmartre-paris",
})

# PokerAtlas publishes this room-shaped page to demonstrate its TableCaptain
# management product. The page identifies itself as a "DEMO VENUE" and does
# not represent a destination where a player can play. Keep the exact identity
# out of discovery, ingestion, and current-feed sweeps without weakening the
# fail-closed parser contract for genuine rooms.
NON_PRODUCTION_POKERATLAS_VENUE_SLUGS = frozenset({
    "patc-las-vegas",
})


_POKER_EVENT_PROMOTION_NOISE_RE = re.compile(
    r"\b(?:giveaways?|drawings?|sweepstakes?|slot\s+promotion|casino\s+promotion|"
    r"promotional\s+drawing|earn\s+(?:bonus\s+)?entries|winner(?:s)?\s+selected)\b",
    re.I,
)
_POKER_EVENT_LOCAL_EVIDENCE_RE = re.compile(
    r"\b(?:poker\s+tournaments?|tournaments?|tourneys?|nlh|no[\s-]*limit\s+"
    r"(?:texas\s+)?hold[ '\u2019-]*em|hold[ '\u2019-]*em|plo|pot[\s-]*limit\s+omaha|"
    r"omaha(?:\s+hi(?:/lo)?)?|freeze[\s-]*out|deep[\s-]*stack|satellites?|"
    r"re[\s-]*entr(?:y|ies)|rebuys?|big\s+blind\s+ante|starting\s+stack|"
    r"blind\s+levels?|buy[\s-]*in|entry\s+fee)\b",
    re.I,
)

# Explicit PokerAtlas directory regions whose geography is within the United
# States. This is independent evidence for legacy map rows that predate stored
# JSON-LD address metadata. Newly discovered rooms should still persist country
# and state evidence so this compatibility bridge can eventually be retired.
US_POKERATLAS_REGION_SLUGS = frozenset({
    "alabama", "alaska", "appalachia", "arizona", "arkansas",
    "boston-new-england", "california", "central-coast-ca",
    "central-valley-ca", "central-wa", "cincinnati", "colorado",
    "connecticut", "delaware", "detroit-toledo", "florida", "georgia",
    "hawaii", "idaho", "illinois", "indiana", "iowa",
    "jacksonville-tallahassee-pensacola-fl", "kansas", "kc-kansas",
    "kentucky", "las-vegas-nevada", "little-rock", "los-angeles",
    "louisiana", "louisville-s-ind", "maine", "maryland",
    "miami-ft-lauderdale-hollywood-fl", "michigan", "minneapolis-area",
    "minnesota", "mississippi", "missouri", "montana", "nebraska",
    "nevada", "new-hampshire", "new-jersey", "new-mexico", "new-york",
    "north-carolina", "north-dakota", "ohio", "oklahoma",
    "oklahoma-city", "olympia-sw-wash", "oregon", "orlando-central-fl",
    "pennsylvania", "philadelphia-delaware-eastern-pa", "pittsburgh-area",
    "rhode-island", "sacramento", "san-diego", "seattle-tacoma",
    "sf-bay-area", "south-carolina", "south-dakota", "tampa-w-florida",
    "tennessee", "texas", "the-dakotas", "tulsa-ne-oklahoma",
    "upstate-ny", "virginia", "washington", "west-virginia", "wisconsin",
    "wyoming",
})


def normalize_venue_label(value: object) -> str:
    """Return a human label safe for venue identity comparisons."""

    return re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()


def is_noise_venue_label(value: object) -> bool:
    """Reject navigation/CTA copy that scrapers can mistake for a room name."""

    label = normalize_venue_label(value).lower()
    return not label or any(pattern in label for pattern in _NOISE_VENUE_PATTERNS)


def is_verified_us_location(location: Mapping) -> bool:
    """Require a US state and reject explicit non-US country metadata."""

    state = normalize_venue_label(
        location.get("state") or location.get("addressRegion")
    ).upper()
    country = location.get("country") or location.get("country_code")
    if isinstance(country, Mapping):
        country = country.get("addressCountry") or country.get("name")
    country = normalize_venue_label(country).upper().replace(".", "")
    country_is_us = not country or country in {
        "US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA",
    }
    return state in (US_STATE_CODES | US_STATE_NAMES) and country_is_us


def canonical_us_state_code(value: object) -> str:
    """Normalize a verified US state name/code to its two-letter directory key."""

    state = normalize_venue_label(value).upper()
    if state in US_STATE_CODES:
        return state
    return US_STATE_NAME_TO_CODE.get(state, "")


def pokeratlas_slug_from_url(value: object) -> str:
    """Extract only the canonical room slug from a PokerAtlas room URL."""

    match = re.search(r"/poker-room/([^/?#]+)", str(value or ""), re.I)
    return match.group(1).strip().lower() if match else ""


def is_poker_tournament_event_text(value: object) -> bool:
    """Require candidate-local poker evidence and reject casino promotions.

    HTML fallback blocks begin at the candidate dollar amount. Looking only at
    a compact leading window prevents a page-level navigation label such as
    ``Poker Tournament Schedule`` from legitimizing an unrelated hotel, slots,
    drawing, or giveaway amount elsewhere on the page.
    """

    candidate = re.sub(r"\s+", " ", html.unescape(str(value or ""))).strip()
    if not candidate:
        return False
    local_window = candidate[:360]
    promotion_window = candidate[:180]
    if _POKER_EVENT_PROMOTION_NOISE_RE.search(promotion_window):
        return False
    return bool(_POKER_EVENT_LOCAL_EVIDENCE_RE.search(local_window))


def is_explicit_pokeratlas_cash_catalog_empty(value: object) -> bool:
    """Recognize PokerAtlas's explicit "no cash-game information" state.

    This means the source has no catalog rows for the room. It does not mean
    the room is closed or that zero live tables are running. Callers may advance
    a catalog sweep, but must never turn this state into an observed live zero.
    """

    visible_markup = re.sub(
        r"<(?:script|style|noscript)\b[^>]*>.*?</(?:script|style|noscript)>",
        " ",
        html.unescape(str(value or "")),
        flags=re.IGNORECASE | re.DOTALL,
    )
    page_text = re.sub(
        r"\s+",
        " ",
        re.sub(r"<[^>]+>", " ", visible_markup),
    ).strip().lower().replace("’", "'")
    catalog_headings = (
        "cash games offered",
        "juegos en efectivo ofrecidos",
    )
    heading_positions = [
        page_text.find(marker)
        for marker in catalog_headings
        if marker in page_text
    ]
    if not heading_positions:
        return False

    # Limit the negative-state match to the cash-catalog section. Poker room
    # announcements elsewhere on the page can contain phrases such as "no cash
    # games tonight"; those are not evidence that PokerAtlas has no catalog.
    section = page_text[min(heading_positions):min(heading_positions) + 1_600]
    explicit_empty_patterns = (
        r"(?:currently\s+)?we\s+(?:currently\s+)?(?:do\s+not|don't)\s+"
        r"(?:currently\s+)?have\s+"
        r"(?:any\s+)?cash\s+games?\s+information(?:\s+for)?",
        r"(?:currently\s+)?we\s+(?:currently\s+)?(?:do\s+not|don't)\s+"
        r"(?:currently\s+)?have\s+"
        r"(?:any\s+)?information\s+(?:about|on|for)\s+cash\s+games?",
        r"(?:there\s+is\s+)?no\s+cash\s+games?\s+information\s+(?:available\s+)?for",
        r"we\s+(?:currently\s+)?(?:do\s+not|don't)\s+know\s+(?:about\s+)?"
        r"any\s+cash\s+games?\s+(?:at|for)",
        r"actualmente\s+no\s+tenemos\s+información\s+sobre\s+juegos\s+en\s+efectivo\s+en",
    )
    return any(re.search(pattern, section) for pattern in explicit_empty_patterns)


def stable_live_row_id(source: object, batch_id: object, venue_slug: object, game_name: object) -> int:
    """Return a deterministic negative bigint for one current-feed row.

    ``venue_live_tables.id`` is a positive sequence-backed bigint and the table
    has no natural-key constraint.  Negative deterministic IDs therefore make
    retrying a partially persisted scraper batch idempotent without colliding
    with sequence-generated legacy rows.
    """

    parts = [source, batch_id, venue_slug, game_name]
    canonical = "\x1f".join(" ".join(str(part or "").lower().split()) for part in parts)
    if any(not " ".join(str(part or "").split()) for part in parts):
        raise ValueError("stable live-row identity requires source, batch, venue, and game")
    value = int.from_bytes(hashlib.sha256(canonical.encode("utf-8")).digest()[:8], "big")
    return -max(1, value & ((1 << 63) - 1))


def is_modeled_live_row(row: Mapping) -> bool:
    """Return whether a live-table row is modeled, including legacy rows.

    ``observation_kind`` is authoritative after the data-truth migration.  The
    batch/source fallbacks keep cleanup and readers safe while old rows age out.
    """

    kind = str(row.get("observation_kind") or "").strip().lower()
    if kind:
        return kind == OBSERVATION_MODELED
    batch = str(row.get("scrape_batch_id") or row.get("batch_id") or "")
    source = str(row.get("source") or "").strip().lower()
    return batch.startswith("sim-") or source in {
        "bravo-simulator",
        "bravo_simulator",
        "modeled_cash_game",
    }


def is_observed_bravo_row(row: Mapping) -> bool:
    """Only genuinely observed Bravo rows may suppress PokerAtlas catalog rows."""

    if str(row.get("source") or "").strip().lower() != "bravo":
        return False
    kind = str(row.get("observation_kind") or "").strip().lower()
    if kind:
        return kind == OBSERVATION_OBSERVED
    return not is_modeled_live_row(row)


def classify_persisted_run(
    *,
    attempted: int,
    persisted: int,
    rejected: Optional[int] = None,
    errors: int = 0,
    valid_empty: bool = False,
    progress: bool = False,
    maintenance: bool = False,
    status_reason: str = "",
) -> Dict[str, object]:
    """Classify a run from confirmed database output, never parser output.

    A run with zero confirmed rows is a failure unless the caller positively
    proves an allowed empty state.  ``valid_empty`` cannot hide rejects/errors
    or a partial write.
    """

    rejected_was_supplied = rejected is not None
    attempted = int(attempted or 0)
    persisted = int(persisted or 0)
    rejected = int(rejected or 0)
    errors = int(errors or 0)

    if min(attempted, persisted, rejected, errors) < 0:
        raise ValueError("persistence counters cannot be negative")
    if persisted > attempted:
        raise ValueError("persisted rows cannot exceed attempted rows")
    expected_rejected = attempted - persisted
    if not rejected_was_supplied:
        rejected = expected_rejected
    elif rejected != expected_rejected:
        raise ValueError(
            "records_rejected must equal records_attempted minus records_saved"
        )

    zero_write_statuses = sum(bool(value) for value in (
        valid_empty, progress, maintenance
    ))
    if zero_write_statuses > 1:
        raise ValueError("zero-write run statuses are mutually exclusive")
    if zero_write_statuses and (
        attempted > 0 or persisted > 0 or rejected > 0 or errors > 0
    ):
        raise ValueError(
            "valid_empty/progress/maintenance require zero attempted, persisted, "
            "rejected, and errors"
        )

    if valid_empty:
        run_status = RUN_VALID_EMPTY
        reason = status_reason or "source_confirmed_no_write_required"
    elif progress:
        run_status = RUN_PROGRESS
        reason = status_reason or "checkpoint_advanced_without_rows"
    elif maintenance:
        run_status = RUN_MAINTENANCE
        reason = status_reason or "maintenance_confirmed"
    elif persisted <= 0:
        run_status = RUN_FAILED
        reason = status_reason or "zero_rows_persisted"
    elif rejected > 0 or (attempted > 0 and persisted < attempted):
        run_status = RUN_PARTIAL
        reason = status_reason or "not_all_attempted_rows_persisted"
    elif errors > 0:
        run_status = RUN_PARTIAL
        reason = status_reason or "cycle_completed_with_errors"
    else:
        run_status = RUN_SUCCESS
        reason = status_reason or "all_attempted_rows_persisted"

    return {
        "run_status": run_status,
        "records_attempted": attempted,
        "records_saved": persisted,
        "records_rejected": rejected,
        "errors": errors,
        "status_reason": reason,
    }


def fully_persisted_venue_ids(
    expected_keys_by_venue: Mapping[object, Iterable[Tuple]],
    persisted_keys: Iterable[Tuple],
) -> Set[object]:
    """Return venues for which every submitted row was confirmed persisted."""

    confirmed = set(persisted_keys)
    complete: Set[object] = set()
    for venue_id, keys in expected_keys_by_venue.items():
        expected = set(keys)
        if expected and expected.issubset(confirmed):
            complete.add(venue_id)
    return complete


def tour_stop_identity(row: Mapping) -> Tuple[str, str]:
    """Stable tour-stop identity: a recurring name may legitimately recur yearly."""

    name = html.unescape(str(row.get("stop_name") or "")).lower()
    # Editorially researched rows often add a calendar qualifier such as
    # ``(August 2026)`` while the source heading omits it.  On the same tour and
    # start date those are the same stop, not two events.  Remove only
    # calendar-shaped parentheticals so meaningful qualifiers remain part of
    # the identity.
    name = re.sub(
        r"\s*\([^)]*(?:20\d{2}|january|february|march|april|may|june|july|"
        r"august|september|october|november|december)[^)]*\)\s*",
        " ",
        name,
    )
    name = " ".join(re.sub(r"[^a-z0-9]+", " ", name).split())
    start = str(row.get("stop_start_date") or row.get("start_date") or "")[:10]
    return name, start
