#!/usr/bin/env python3
"""
scrape_weekly_schedules.py — Comprehensive Weekly Tournament Schedule Scraper
=============================================================================
Scrapes ALL published tournament schedules for every venue with has_tournaments=true.
No date ceiling — takes everything available (30 days, 60 days, 90+ days).
Checks multiple sources to maximize coverage.

Source Priority per venue:
  1. poker_venues.scrape_url  (saved source of truth from previous scrape)
  2. poker_venues.website     (direct venue website, multiple paths)
  3. PokerAtlas               (structured data, most reliable fallback)
  4. Bravo Poker Live         (public venue pages)
  5. CardPlayer.com           (major venues only)

Batch: 25 venues per run → push immediately → no data loss on crash
Cron:  Every 3 days via GitHub Actions (4 parallel jobs of 7 batches each)

Usage:
  .venv/bin/python3 scripts/scrape_weekly_schedules.py --batch 1
  .venv/bin/python3 scripts/scrape_weekly_schedules.py --batch 1 --dry-run
  .venv/bin/python3 scripts/scrape_weekly_schedules.py --state TX
  .venv/bin/python3 scripts/scrape_weekly_schedules.py --venue "Lodge Poker"
  .venv/bin/python3 scripts/scrape_weekly_schedules.py --limit 5 --dry-run

15-Layer Integrity: SHA-256 hash, batch UUID, evidence JSON, HTTP 200 check,
                    anti-hallucination filters, data_quality=scraped_verified
"""

import hashlib, json, os, re, sys, time, urllib.request, urllib.parse, uuid, argparse, io
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

# ── Config ────────────────────────────────────────────────────────────────────
PROJECT_ROOT  = Path(__file__).resolve().parent.parent
EVIDENCE_DIR  = PROJECT_ROOT / "data" / "scrape-evidence" / "weekly-schedules"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL  = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY  = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)
SB_HDRS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
}

BATCH_SIZE   = 25
RATE_S       = 3     # seconds between venues
CIRCUIT_MAX  = 5     # abort session after N consecutive failures
BATCH_ID     = str(uuid.uuid4())
SCRAPER_NAME = "scrape_weekly_schedules.py"

# Known slow/broken domains — skip for 'website' source
# (PokerAtlas is handled separately as 'pokeratlas' source)
SKIP_DOMAINS = {
    'themresort.com', 'aliantegaming.com', 'pokeratlas.com',
}

# Venue types to SKIP — these are handled by other scrapers
SKIP_VENUE_TYPES = {
    'charity', 'charity_event', 'charity_game',
    'series', 'poker_series', 'tour', 'poker_tour',
    'traveling_tour', 'regional_tour', 'tournament_series',
}

# Name-pattern keywords that indicate a series/tour (not a card room)
SKIP_NAME_PATTERNS = re.compile(
    r'\b(?:series|poker series|tour(?:nament series)?|grand prix|'
    r'circuit|wpt|wsop|mspt|heartland|mid-states|triton|'
    r'partypoker|GGpoker)\b',
    re.IGNORECASE
)

# ── Day & time helpers ────────────────────────────────────────────────────────
DAYS_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Daily"]
DAY_MAP = {
    "mon":"Monday","tue":"Tuesday","wed":"Wednesday","thu":"Thursday",
    "fri":"Friday","sat":"Saturday","sun":"Sunday",
    "daily":"Daily","everyday":"Daily","every day":"Daily",
    "nightly":"Daily","each night":"Daily",
}


def normalize_day(text: str) -> str:
    """Best-effort day extraction from a text block."""
    tl = text.lower()
    for d in DAYS_FULL:
        if d.lower() in tl:
            return d
    for abbr, full in DAY_MAP.items():
        if re.search(rf'\b{re.escape(abbr)}\b', tl):
            return full
    return "Daily"


def parse_date_from_text(text: str) -> str | None:
    """
    Try to extract a specific calendar date (YYYY-MM-DD) from text.
    Handles: 'April 15', 'Apr 15', '4/15', '4/15/2026', '2026-04-15'
    Returns None if no specific date found.
    """
    now = datetime.now(timezone.utc)
    year = now.year

    # ISO format
    m = re.search(r'\b(20\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b', text)
    if m:
        return m.group(0)

    # Month name
    months = {
        'january':1,'february':2,'march':3,'april':4,'may':5,'june':6,
        'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,
        'jan':1,'feb':2,'mar':3,'apr':4,'jun':6,'jul':7,'aug':8,
        'sep':9,'oct':10,'nov':11,'dec':12,
    }
    m2 = re.search(
        r'\b(' + '|'.join(months.keys()) + r')\b\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d\d))?',
        text, re.IGNORECASE
    )
    if m2:
        mo = months[m2.group(1).lower()]
        day = int(m2.group(2))
        yr  = int(m2.group(3)) if m2.group(3) else year
        try:
            dt = datetime(yr, mo, day, tzinfo=timezone.utc)
            if dt < now - timedelta(days=1):
                dt = dt.replace(year=yr+1)
            return dt.strftime('%Y-%m-%d')
        except ValueError:
            pass

    # Numeric MM/DD or MM/DD/YYYY
    m3 = re.search(r'\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b', text)
    if m3:
        mo, day = int(m3.group(1)), int(m3.group(2))
        yr_raw = m3.group(3)
        yr = int(yr_raw) if yr_raw else year
        if yr < 100:
            yr += 2000
        if 1 <= mo <= 12 and 1 <= day <= 31:
            try:
                dt = datetime(yr, mo, day, tzinfo=timezone.utc)
                if dt < now - timedelta(days=1):
                    dt = dt.replace(year=yr+1)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                pass
    return None


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


# ── Tournament extraction ─────────────────────────────────────────────────────
TOURN_KEYWORDS = re.compile(
    r'tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|freeroll|'
    r'freezeout|rebuy|deep.?stack|nightly poker|daily poker|poker schedule|'
    r'holdem tournament|nlh|no.limit|weekly poker|event schedule',
    re.IGNORECASE
)


def has_tournament_content(html: str) -> bool:
    return bool(TOURN_KEYWORDS.search(html))


# ── GTD-vs-BuyIn Discrimination ──────────────────────────────────────────────
# Patterns that indicate a dollar amount is a GUARANTEED amount, not a buy-in
DOLLAR_K_RE = re.compile(r'\$(\d{1,3})\s*K\b', re.IGNORECASE)
BUYIN_LABEL_RE = re.compile(
    r'(?:buy[- ]?in|entry(?:\s*fee)?|registration)[:\s]*\$([\d,]+)',
    re.IGNORECASE
)

def extract_buyin_from_block(block: str) -> tuple:
    """Extract (buy_in, guaranteed) from a text block, correctly distinguishing the two.
    Returns (buy_in_int_or_None, guaranteed_int_or_None)."""
    gtd = None
    buyin = None

    # Step 1: Handle $XK shorthand → multiply by 1000
    km = DOLLAR_K_RE.search(block)
    if km:
        gtd = int(km.group(1)) * 1000

    # Handle "$X GTD" or "Guaranteed $X"
    gm = re.search(r'(?:GTD|Guaranteed|guarantee)[:\s]*\$?([\d,]+)', block, re.I)
    if gm:
        try:
            g_val = int(gm.group(1).replace(',', ''))
            if g_val > 0: gtd = g_val
        except ValueError: pass
    gm2 = re.search(r'\$([\d,]+)\s*(?:GTD|Guaranteed)', block, re.I)
    if gm2:
        try:
            g_val = int(gm2.group(1).replace(',', ''))
            if g_val >= 1000: gtd = g_val
        except ValueError: pass

    # Step 2: Look for EXPLICIT buy-in label
    bm = BUYIN_LABEL_RE.search(block)
    if bm:
        try: buyin = int(bm.group(1).replace(',', ''))
        except ValueError: pass

    # Step 3: If no explicit label, find dollar amounts that are NOT GTD
    if buyin is None:
        for m in re.finditer(r'\$(\d{1,3}(?:,\d{3})*)', block):
            amt = int(m.group(1).replace(',', ''))
            if amt < 10 or amt > 50000: continue
            end_pos = m.end()
            after = block[end_pos:end_pos+5].strip()
            if after and after[0].upper() == 'K':
                if gtd is None: gtd = amt * 1000
                continue
            context_start = max(0, m.start() - 5)
            context_end = min(len(block), m.end() + 40)
            context = block[context_start:context_end]
            if re.search(r'(?:GTD|Guaranteed|guarantee|prize|pool|1st|first)', context, re.I):
                if gtd is None: gtd = amt
                continue
            buyin = amt
            break

    if buyin is not None and (buyin < 20 or buyin > 25000):
        buyin = None
    return (buyin, gtd)

def sanitize_tournament_name(name):
    """Remove HTML fragments, CSS selectors, and junk from scraped tournament names."""
    if not name: return None
    if '<' in name or '>' in name: return None
    JUNK = ['class=','elementor-','wix-','application/','row-unique',
            '</script>','</div>','<script','type=','src=','data-','style=','id="','href=']
    nl = name.lower()
    for p in JUNK:
        if p in nl: return None
    if name.strip().lower() in ('image','none','null','undefined',''): return None
    return name.strip()[:200]

def game_full_name(gt):
    NAMES = {"NLH":"No Limit Hold'em","PLO":"Pot Limit Omaha","Mixed":"Mixed Game",
             "Stud":"Seven Card Stud","Razz":"Razz","Big-O":"Big-O","Omaha":"Pot Limit Omaha"}
    return NAMES.get(gt, gt)

def make_default_tournament_name(game_type, start_time, buy_in, fmt=None):
    full_game = game_full_name(game_type or 'NLH')
    prefix = f"{fmt} " if fmt else ""
    time_str = start_time or ''
    if buy_in:
        return f"{prefix}{full_game} {time_str} ${buy_in} Buy In".strip()
    return f"{prefix}{full_game} {time_str}".strip()


def extract_tournaments(html: str, venue_name: str, source_url: str, html_hash: str) -> list:
    """
    Extract ALL tournament entries: both recurring (day_of_week) and dated (event_date).
    No date ceiling — takes everything the page publishes.
    Returns list of tournament dicts ready for upsert.
    """
    text = re.sub(r'<[^>]+>', ' ', html)
    text = re.sub(r'\s+', ' ', text)
    ts_now = datetime.now(timezone.utc).isoformat()
    seen, results = set(), []

    # ── Strategy 1: $ + time blocks ──────────────────────────────────────────
    blocks = re.split(r'(?=\$\d)', text)
    for block in blocks:
        if not 8 < len(block) < 900:
            continue

        # Use smart GTD-vs-BuyIn extraction
        buyin, gtd_extracted = extract_buyin_from_block(block)
        if buyin is None:
            continue

        # Time — required (handle 1:00 PM, 1:00p, 13:00, 11a)
        tm = re.search(r'((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a|p)\b)', block)
        if not tm:
            continue
        start_time = tm.group(1).upper().strip()
        if start_time.endswith('A'): start_time += 'M'
        elif start_time.endswith('P'): start_time += 'M'

        # Specific date?
        event_date = parse_date_from_text(block)
        day_of_week = normalize_day(block) if not event_date else None

        # Game type
        game = "NLH"
        if re.search(r'\bPLO\b', block, re.I):     game = "PLO"
        elif re.search(r'\bOmaha\b', block, re.I):  game = "Omaha"
        elif re.search(r'\bMixed\b', block, re.I):  game = "Mixed"
        elif re.search(r'\bBig.?O\b', block, re.I): game = "Big-O"
        elif re.search(r'\bStud\b', block, re.I):   game = "Stud"

        # Format
        fmt = None
        for f, pat in [
            ("Turbo",         r'turbo'),
            ("Deep Stack",    r'deep.?stack'),
            ("Bounty",        r'bounty'),
            ("Mystery Bounty",r'mystery.?bounty'),
            ("Rebuy",         r'rebuy'),
            ("Freezeout",     r'freezeout'),
            ("Satellite",     r'satellite'),
            ("Progressive KO",r'progressive|P\.?K\.?O'),
        ]:
            if re.search(pat, block, re.I):
                fmt = f
                break

        # Use GTD from extraction
        gtd = gtd_extracted

        # Starting stack
        stack = None
        sm = re.search(r'(?:starting stack|start(?:ing)? chips?|chips)[:\s]*([0-9,]+)\s*(?:chips?)?', block, re.I)
        if sm:
            try:
                stack = int(sm.group(1).replace(',', ''))
            except ValueError:
                pass

        # Blind levels
        blind_lvl = None
        blm = re.search(r'(?:blind levels?|levels?|blinds)[:\s]*(\d+)\s*(?:min(?:utes?)?)', block, re.I)
        if blm:
            blind_lvl = f"{blm.group(1)} minutes"

        # Rebuy info
        rebuy_info = None
        rm = re.search(r'(?:re.?buys?|add.?on)[:\s$]*([^\n,]{3,40})', block, re.I)
        if rm:
            rebuy_info = rm.group(1).strip()[:80]

        # Late registration
        late_reg = None
        lrm = re.search(r'late\s*reg(?:istration)?[:\s]*([^\n,]{3,30})', block, re.I)
        if lrm:
            late_reg = lrm.group(1).strip()[:50]

        # Tournament name (sanitized)
        tourn_name = None
        nm = re.search(r'(?:"([^"]{4,60})"|\'([^\']{4,60})\')', block)
        if nm:
            tourn_name = sanitize_tournament_name((nm.group(1) or nm.group(2))[:100])

        dedup_key = f"{event_date or day_of_week}-{start_time}-{buyin}-{game}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        results.append({
            "venue_name":     venue_name,
            "day_of_week":    day_of_week or "Daily",
            "event_date":     event_date,
            "start_time":     start_time,
            "buy_in":         buyin,
            "game_type":      game,
            "format":         fmt,
            "guaranteed":     gtd,
            "starting_stack": stack,
            "blind_levels":   blind_lvl,
            "rebuy_addon":    rebuy_info,
            "late_registration": late_reg,
            "tournament_name": tourn_name or make_default_tournament_name(game, start_time, buyin, fmt),
            "source_url":     source_url,
            "data_quality":   "scraped_verified",
            "scrape_html_hash":  html_hash,
            "scrape_timestamp":  ts_now,
            "scrape_batch_id":   BATCH_ID,
            "scrape_confidence": "high",
            "is_active":      True,
            "last_scraped":   ts_now,
        })

    # ── Strategy 2: HTML logical rows (tr, li, structured divs) ───────────────
    # We find blocks of HTML that likely represent a single tournament entry
    row_blocks = []
    row_blocks.extend(re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE))
    row_blocks.extend(re.findall(r'<li[^>]*class="[^"]*(?:item|event|tourn)[^"]*"[^>]*>(.*?)</li>', html, re.DOTALL | re.IGNORECASE))
    row_blocks.extend(re.findall(r'<div[^>]*class="[^"]*(?:row|item|event|tourn)[^"]*"[^>]*>(.*?)</div>', html, re.DOTALL | re.IGNORECASE))

    for row in row_blocks:
        if '<th' in row.lower():
            continue
        cells = re.findall(r'<(?:td|div|span|p|li)[^>]*>(.*?)</(?:td|div|span|p|li)>', row, re.DOTALL | re.IGNORECASE)
        if len(cells) < 2:
            row_text = re.sub(r'<[^>]+>', ' ', row).strip()
        else:
            row_text = ' '.join(re.sub(r'<[^>]+>', ' ', c).strip() for c in cells)
            
        row_text = re.sub(r'\s+', ' ', row_text)
        if '$' not in row_text:
            continue

        # Use smart GTD-vs-BuyIn extraction
        buyin, gtd = extract_buyin_from_block(row_text)
        tm = re.search(r'((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a|p)\b)', row_text)
        if buyin is None or not tm:
            continue
            
        start_time = tm.group(1).upper().strip()
        if start_time.endswith('A'): start_time += 'M'
        elif start_time.endswith('P'): start_time += 'M'

        event_date = parse_date_from_text(row_text)
        day_of_week = normalize_day(row_text) if not event_date else None

        game = "NLH"
        if re.search(r'\bPLO\b', row_text, re.I):    game = "PLO"
        elif re.search(r'\bOmaha\b', row_text, re.I): game = "Omaha"

        fmt = None
        for f, pat in [("Turbo","turbo"),("Deep Stack","deep.?stack"),("Bounty","bounty"),("Satellite","satellite")]:
            if re.search(pat, row_text, re.I):
                fmt = f; break

        # Stack from table
        stack = None
        sm = re.search(r'(?:stack|chips)[:\s]*([0-9,]+)', row_text, re.I)
        if sm:
            try: stack = int(sm.group(1).replace(',',''))
            except: pass

        dedup_key = f"{event_date or day_of_week}-{start_time}-{buyin}-{game}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        ts_now = datetime.now(timezone.utc).isoformat()

        results.append({
            "venue_name":     venue_name,
            "day_of_week":    day_of_week or "Daily",
            "event_date":     event_date,
            "start_time":     start_time,
            "buy_in":         buyin,
            "game_type":      game,
            "format":         fmt,
            "guaranteed":     gtd,
            "starting_stack": stack,
            "blind_levels":   None,
            "rebuy_addon":    None,
            "late_registration": None,
            "tournament_name": make_default_tournament_name(game, start_time, buyin, fmt),
            "source_url":     source_url,
            "data_quality":   "scraped_verified",
            "scrape_html_hash":  html_hash,
            "scrape_timestamp":  ts_now,
            "scrape_batch_id":   BATCH_ID,
            "scrape_confidence": "high",
            "is_active":      True,
            "last_scraped":   ts_now,
        })

    # ── Strategy 3: Plain-text line-by-line (PDF schedules, text-only pages) ──
    # Catches "Monday 7:00 PM $125 NLH" style lines common in PDF calendars
    DAY_PAT = re.compile(
        r'\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|'
        r'Mon|Tue|Wed|Thu|Fri|Sat|Sun|Daily|Nightly|Weekday|Weekend)\b',
        re.IGNORECASE
    )
    DAY_MAP = {'Mon':'Monday','Tue':'Tuesday','Wed':'Wednesday','Thu':'Thursday',
               'Fri':'Friday','Sat':'Saturday','Sun':'Sunday'}
    for line in html.split('\n'):
        line = line.strip()
        if len(line) < 12 or len(line) > 300 or '$' not in line:
            continue
        tm = re.search(r'((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)?|\b[1-9]\d?\s*(?:AM|PM|am|pm)\b)', line)
        if not tm:
            continue
        # Use smart GTD-vs-BuyIn extraction
        buyin, gtd = extract_buyin_from_block(line)
        if buyin is None:
            continue
        start_time = tm.group(1).upper().strip().replace('A.M.','AM').replace('P.M.','PM')
        if start_time.endswith('A'): start_time += 'M'
        elif start_time.endswith('P'): start_time += 'M'
        event_date = parse_date_from_text(line)
        day_m = DAY_PAT.search(line) if not event_date else None
        day_of_week = None
        if day_m:
            d = day_m.group(1).capitalize()
            day_of_week = DAY_MAP.get(d, d)
        game = "NLH"
        if re.search(r'\bPLO\b', line, re.I): game = "PLO"
        elif re.search(r'\bOmaha\b', line, re.I): game = "Omaha"
        elif re.search(r'\bMixed\b', line, re.I): game = "Mixed"
        fmt = None
        for f, pat in [("Deep Stack","deep.?stack"),("Bounty","bounty"),
                       ("Mystery Bounty","mystery.?bounty"),("Rebuy","rebuy"),
                       ("Turbo","turbo"),("Satellite","satellite")]:
            if re.search(pat, line, re.I): fmt = f; break
        dedup_key = f"{event_date or day_of_week}-{start_time}-{buyin}-{game}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        results.append({
            "venue_name": venue_name, "day_of_week": day_of_week or "Daily",
            "event_date": event_date, "start_time": start_time, "buy_in": buyin,
            "game_type": game, "format": fmt, "guaranteed": gtd,
            "starting_stack": None, "blind_levels": None, "rebuy_addon": None,
            "late_registration": None,
            "tournament_name": make_default_tournament_name(game, start_time, buyin, fmt),
            "source_url": source_url, "data_quality": "scraped_verified",
            "scrape_html_hash": html_hash, "scrape_timestamp": ts_now,
            "scrape_batch_id": BATCH_ID, "scrape_confidence": "medium",
            "is_active": True, "last_scraped": ts_now,
        })

    return results



# ── Anti-hallucination guard ──────────────────────────────────────────────────
def anti_hallucination_check(records: list) -> bool:
    """Returns True if records pass all integrity checks.

    Catches AI-generated data patterns while never false-positiving on
    real scraped records. NOTE: scrape_timestamp IS legitimately identical
    per batch — never flag that field.
    """
    if not records or len(records) < 3:
        return True

    buyins = [r['buy_in'] for r in records if r.get('buy_in')]
    if buyins and len(buyins) >= 5:
        round_pct = sum(1 for b in buyins if b % 100 == 0) / len(buyins)
        if round_pct > 0.95:
            print(f"    ⚠️  ANTI-HALLUCINATION: {round_pct:.0%} buy-ins are round $100 multiples")
            return False

    # All identical event slot = fabricated schedule
    slots = [
        f"{r.get('day_of_week','')}-{r.get('event_date','')}-{r.get('start_time','')}"
        for r in records
    ]
    if len(slots) > 5 and len(set(slots)) == 1:
        print(f"    ⚠️  ANTI-HALLUCINATION: All {len(records)} records have identical event slots")
        return False

    # Single buy-in for 10+ records is suspicious ONLY if there's also
    # diversity in time slots (which would indicate generated data rather than
    # a real venue that just runs one daily event at the same price)
    if len(buyins) >= 10 and len(set(buyins)) == 1:
        times = [r.get('start_time', '') for r in records]
        unique_times = len(set(times))
        if unique_times >= 3:
            # Many different time slots at one buy-in AND more than 10 records = suspicious
            print(f"    ⚠️  ANTI-HALLUCINATION: {len(records)} records, 1 buy-in (${buyins[0]}), {unique_times} times — suspicious")
            return False
        # Few distinct times = real daily/weekly grind (legitimate)

    return True




# ── Network helpers ───────────────────────────────────────────────────────────
def network_ok() -> bool:
    try:
        urllib.request.urlopen('https://google.com', timeout=6)
        return True
    except Exception:
        return False


def domain_of(url: str) -> str:
    try:
        return url.split('//')[1].split('/')[0].lstrip('www.')
    except Exception:
        return ''


def skip_domain(url: str) -> bool:
    return any(domain_of(url).endswith(d) for d in SKIP_DOMAINS)


# ── Supabase helpers ──────────────────────────────────────────────────────────
def sb_get(path: str, params: str = '') -> list:
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{path}{params}",
            headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read()) or []
    except Exception as e:
        print(f"    [SB_GET ERR] {e}")
        return []


def sb_upsert(table: str, records: list) -> int:
    if not records:
        return 0
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/{table}",
            data=json.dumps(records).encode(),
            method='POST',
            headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=40) as r:
            return len(records) if r.status in (200, 201) else 0
    except Exception as e:
        print(f"    [UPSERT ERR] {e}")
        return 0


def sb_patch_venue(venue_id: int, patch: dict) -> bool:
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{venue_id}",
            data=json.dumps(patch).encode(),
            method='PATCH',
            headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status in (200, 204)
    except Exception as e:
        print(f"    [PATCH ERR] {e}")
        return False


def sb_audit_log(batch_id: str, venue_count: int, record_count: int, notes: str = ''):
    try:
        entry = {
            "table_name":        "venue_daily_tournaments",
            "action":            "weekly_schedule_scrape",
            "batch_id":          batch_id,
            "records_affected":  record_count,
            "agent_id":          SCRAPER_NAME,
            "notes":             f"Venues: {venue_count}. {notes}",
            "created_at":        datetime.now(timezone.utc).isoformat(),
        }
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=json.dumps(entry).encode(),
            method='POST',
            headers={**SB_HDRS, "Prefer": "return=minimal"},
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            pass
    except Exception:
        pass  # Audit log failure is non-fatal


# ── Evidence capture ──────────────────────────────────────────────────────────
def save_evidence(name: str, state: str, data: dict) -> Path:
    safe = re.sub(r'[^a-zA-Z0-9]', '_', name)[:40]
    path = EVIDENCE_DIR / f"ws_{state}_{safe}_{int(time.time())}.json"
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)
    return path


# ── PokerAtlas JSON API parser ───────────────────────────────────────────────
def parse_pokeratlas_json(data: dict, venue_name: str, api_url: str, html_hash: str) -> list:
    """
    Parse the PokerAtlas tournaments JSON API response.
    Endpoint: https://www.pokeratlas.com/api/venues/{venue_id}/tournaments
    Returns list of tournament dicts.
    """
    ts_now = datetime.now(timezone.utc).isoformat()
    results = []
    seen = set()

    tournaments = data.get('tournaments') or data.get('data') or []
    if isinstance(data, list):
        tournaments = data

    for t in tournaments:
        if not isinstance(t, dict):
            continue

        # Buy-in — PA stores in cents or dollars depending on endpoint version
        buyin_raw = t.get('buy_in') or t.get('buyin') or t.get('buyIn') or 0
        try:
            buyin = int(float(buyin_raw))
            # If stored in cents (>500 for a $5 tournament is suspicious)
            if buyin > 0 and buyin % 100 == 0 and buyin > 10000:
                buyin = buyin // 100
        except (ValueError, TypeError):
            continue
        if not 10 <= buyin <= 50000:
            continue

        # Time
        start_time = t.get('start_time') or t.get('startTime') or t.get('time') or ''
        if not start_time:
            continue
        # Normalize to HH:MM AM/PM
        tm_match = re.search(r'(\d{1,2}:\d{2}\s*(?:AM|PM)?)', str(start_time), re.IGNORECASE)
        start_time = tm_match.group(1).upper().strip() if tm_match else str(start_time)[:10]

        # Day/date
        event_date = None
        day_of_week = None
        raw_date = t.get('event_date') or t.get('date') or t.get('eventDate') or ''
        raw_day  = t.get('day_of_week') or t.get('day') or t.get('recurring_day') or ''
        if raw_date:
            event_date = parse_date_from_text(str(raw_date))
        if not event_date and raw_day:
            day_of_week = normalize_day(str(raw_day))
        if not event_date and not day_of_week:
            # Try to extract from name or description
            desc = str(t.get('name','') or t.get('description',''))
            day_of_week = normalize_day(desc)

        # Game
        game = 'NLH'
        game_raw = str(t.get('game_type') or t.get('game') or t.get('gameType') or '').lower()
        if 'plo' in game_raw or 'omaha' in game_raw: game = 'PLO'
        elif 'mixed' in game_raw: game = 'Mixed'
        elif 'stud' in game_raw: game = 'Stud'
        elif 'big-o' in game_raw or 'big o' in game_raw: game = 'Big-O'

        # Format
        fmt = None
        name_raw = str(t.get('name') or t.get('title') or '')
        for f, pat in [
            ('Mystery Bounty', r'mystery.?bounty'),
            ('Progressive KO',  r'progressive|P\.?K\.?O'),
            ('Bounty',          r'bounty'),
            ('Deep Stack',      r'deep.?stack'),
            ('Turbo',           r'turbo'),
            ('Rebuy',           r'rebuy'),
            ('Satellite',       r'satellite'),
        ]:
            if re.search(pat, name_raw, re.I):
                fmt = f; break

        gtd = None
        gtd_raw = t.get('guarantee') or t.get('guaranteed') or t.get('prize_pool') or 0
        try: gtd = int(float(gtd_raw)) or None
        except: pass

        stack = None
        try: stack = int(t.get('starting_chips') or t.get('startingChips') or t.get('chips') or 0) or None
        except: pass

        dedup_key = f"{event_date or day_of_week}-{start_time}-{buyin}-{game}"
        if dedup_key in seen:
            continue
        seen.add(dedup_key)

        results.append({
            'venue_name':      venue_name,
            'day_of_week':     day_of_week or 'Daily',
            'event_date':      event_date,
            'start_time':      start_time,
            'buy_in':          buyin,
            'game_type':       game,
            'format':          fmt,
            'guaranteed':      gtd,
            'starting_stack':  stack,
            'tournament_name': name_raw[:100] or None,
            'source_url':      api_url,
            'data_quality':    'scraped_verified',
            'scrape_html_hash':   html_hash,
            'scrape_timestamp':   ts_now,
            'scrape_batch_id':    BATCH_ID,
            'scrape_confidence':  'high',
            'is_active':       True,
            'last_scraped':    ts_now,
        })

    return results


# ── PokerAtlas HTML Schedule Parser (section.tournament-schedule) ────────────
_PA_DAY_NAMES = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

def parse_pa_html_schedule(html: str, venue_name: str, venue_state: str) -> list:
    """
    Parse PokerAtlas /tournaments HTML page using the known CSS structure:
      <section class="tournament-schedule"><ol><li><div class="tournament">...
    Falls back to React/hydration JSON data embedded in the page.
    Returns list of tournament dicts ready to insert.
    """
    if 'tournament-schedule' not in html and 'no-tournaments' not in html:
        return []
    if 'no-tournaments' in html or 'no tournaments listed' in html.lower():
        return []
    # State check via JSON-LD
    jld_m = re.search(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.DOTALL | re.I)
    if jld_m:
        try:
            obj = json.loads(jld_m.group(1))
            page_state = (obj.get('address') or {}).get('addressRegion', '')
            if page_state and page_state.upper() != venue_state.upper():
                return []
        except Exception:
            pass
    ts_now = datetime.now(timezone.utc).isoformat()
    results, seen = [], set()
    # Section-based parse
    sched = re.search(r'<section[^>]*class="tournament-schedule"[^>]*>(.*?)</section>', html, re.DOTALL)
    if sched:
        for entry in re.finditer(
            r'<div[^>]*class="tournament"[^>]*>(.*?)</div>\s*(?:</div>)*\s*(?:</a>)?',
            sched.group(1), re.DOTALL
        ):
            parsed = _pa_entry_to_records(entry.group(1), venue_name, ts_now)
            for t in parsed:
                dk = f"{t['day_of_week']}-{t['start_time']}-{t.get('buy_in','')}-{t['game_type']}"
                if dk not in seen:
                    seen.add(dk)
                    results.append(t)
    # React/hydration JSON fallback
    if not results:
        jm = re.search(r'"tournaments"\s*:\s*(\[.*?\])', html, re.DOTALL)
        if jm:
            try:
                for item in json.loads(jm.group(1))[:100]:
                    if not isinstance(item, dict): continue
                    raw_days = item.get('days') or _PA_DAY_NAMES[:]
                    active = raw_days if isinstance(raw_days, list) else _PA_DAY_NAMES[:]
                    buyin_raw = item.get('buyIn') or item.get('buy_in') or 0
                    try: buyin = int(float(buyin_raw))
                    except Exception: continue
                    if not (10 <= buyin <= 50000): continue
                    st = str(item.get('startTime') or item.get('time') or '').upper().strip()
                    gm = str(item.get('gameType') or item.get('game') or 'NLH')
                    t_name = str(item.get('name') or '')[:100] or None
                    for day in active:
                        dk = f"{day}-{st}-{buyin}-{gm}"
                        if dk not in seen:
                            seen.add(dk)
                            results.append({
                                'venue_name': venue_name, 'day_of_week': day,
                                'event_date': None, 'start_time': st,
                                'buy_in': buyin, 'game_type': _pa_norm_game(gm),
                                'format': None, 'guaranteed': item.get('guaranteed'),
                                'starting_stack': None, 'blind_levels': None,
                                'rebuy_addon': None, 'late_registration': None,
                                'tournament_name': t_name, 'data_quality': 'scraped_verified',
                                'is_active': True, 'scrape_batch_id': BATCH_ID,
                                'scrape_timestamp': ts_now, 'scrape_html_hash': '',
                                'scrape_confidence': 'high', 'last_scraped': ts_now,
                            })
            except Exception:
                pass
    return results


def _pa_entry_to_records(entry_html: str, venue_name: str, ts_now: str) -> list:
    """Parse one PokerAtlas <div class=\"tournament\"> into 1+ records (one per day)."""
    nm = re.search(r'class="name"[^>]*>\s*<span>(.*?)</span>', entry_html, re.DOTALL)
    t_name = re.sub(r'<[^>]+>', '', nm.group(1)).strip()[:100] if nm else None
    hm = re.search(r'class="hour">(.*?)</span>', entry_html, re.DOTALL)
    start_time = re.sub(r'<[^>]+>', '', hm.group(1)).strip().upper() if hm else ''
    bm = re.search(r'class="buy-in">\$?([\d,]+)', entry_html)
    buyin = int(bm.group(1).replace(',','')) if bm else None
    if buyin is not None and not (10 <= buyin <= 50000):
        return []
    gm = re.search(r'class="type">(.*?)</span>', entry_html, re.DOTALL)
    game = _pa_norm_game(re.sub(r'<[^>]+>','',gm.group(1)).strip() if gm else 'NLH')
    dm = re.search(r'<div class="days">(.*?)</div>', entry_html, re.DOTALL)
    if dm:
        items = re.findall(r'<li[^>]*class="([^"]*)"[^>]*>\s*(\w+)\s*</li>', dm.group(1))
        active = [_PA_DAY_NAMES[i] for i,(cls,_) in enumerate(items)
                  if i < len(_PA_DAY_NAMES) and 'active' in cls]
        active = active or _PA_DAY_NAMES[:]
    else:
        active = _PA_DAY_NAMES[:]
    gtd = None
    gm2 = re.search(r'(?:guaranteed|gtd)[^$]*\$?([\d,]+)', entry_html, re.I)
    if gm2:
        try: gtd = int(gm2.group(1).replace(',',''))
        except Exception: pass
    if not start_time and buyin is None:
        return []
    base = {
        'venue_name': venue_name, 'event_date': None, 'start_time': start_time,
        'buy_in': buyin, 'game_type': game, 'format': None, 'guaranteed': gtd,
        'starting_stack': None, 'blind_levels': None, 'rebuy_addon': None,
        'late_registration': None, 'tournament_name': t_name,
        'data_quality': 'scraped_verified', 'is_active': True,
        'scrape_batch_id': BATCH_ID, 'scrape_timestamp': ts_now,
        'scrape_html_hash': '', 'scrape_confidence': 'high', 'last_scraped': ts_now,
    }
    return [{**base, 'day_of_week': d} for d in active]


def _pa_norm_game(raw: str) -> str:
    u = raw.upper().strip()
    if 'HOLDEM' in u or 'NLH' in u or 'HOLD' in u or 'NL ' in u: return 'NLH'
    if 'OMAHA' in u or 'PLO' in u: return 'PLO'
    if 'MIXED' in u: return 'Mixed'
    if 'STUD' in u: return 'Stud'
    if 'LIMIT' in u and 'NO' not in u: return 'Limit Holdem'
    return raw.strip() or 'NLH'


# ── Multi-slug PokerAtlas URL generator ─────────────────────────────────────
def make_pa_slug_variants(venue: dict) -> list:
    """Generate up to 8 PokerAtlas variant URLs for a venue."""
    name = venue.get('name', '')
    city = venue.get('city', '') or ''
    out, seen = [], set()

    def slugify(s):
        s = re.sub(r"[''`]", '', s)
        return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

    def add(u):
        if u and u not in seen:
            seen.add(u); out.append(('pokeratlas', u))

    ns, cs = slugify(name), slugify(city)
    # Stored slug
    stored = venue.get('pokeratlas_slug') or ''
    if stored: add(f"https://www.pokeratlas.com/poker-room/{stored}/tournaments")
    # From stored URL fields
    for fld in ('poker_atlas_url', 'pokeratlas_url', 'scrape_url', 'schedule_scrape_url'):
        pu = venue.get(fld) or ''
        if 'pokeratlas.com/poker-room/' in pu:
            slug = pu.split('/poker-room/')[-1].strip('/').split('/')[0]
            if slug: add(f"https://www.pokeratlas.com/poker-room/{slug}/tournaments")
    # Generated variants
    if ns and cs: add(f"https://www.pokeratlas.com/poker-room/{ns}-{cs}/tournaments")
    if ns:        add(f"https://www.pokeratlas.com/poker-room/{ns}/tournaments")
    # Strip generic suffixes
    stripped = re.sub(r'\b(casino|resort|hotel|club|room|poker|gaming|card|house)\b', '', name, flags=re.I)
    s2 = slugify(stripped)
    if s2 and cs: add(f"https://www.pokeratlas.com/poker-room/{s2}-{cs}/tournaments")
    if s2:        add(f"https://www.pokeratlas.com/poker-room/{s2}/tournaments")
    return out[:8]


# ── Venue scope validator ────────────────────────────────────────────────────

def venue_name_tokens(name: str) -> set:
    """Break venue name into meaningful lowercase tokens (3+ chars, skip stopwords)."""
    STOPWORDS = {'the','and','of','at','in','on','for','a','an','by',
                 'casino','poker','room','club','card','house','lounge'}
    words = re.sub(r'[^a-z0-9 ]', ' ', name.lower()).split()
    return {w for w in words if len(w) >= 3 and w not in STOPWORDS} or {name.lower()[:6]}


def venue_matches_page(page_text: str, venue_name: str, venue_state: str,
                       venue_city: str, source: str, page_url: str) -> bool:
    """
    Confirm a fetched page actually belongs to the target venue.
    Returns True if safe to extract, False if wrong venue detected.

    Rules:
    - For PokerAtlas/Bravo/website: validate at least 1 venue name token appears
      in page title/h1/JSON-LD name field (not just body text — too loose).
    - For search result pages (hendonmob/cardplayer): always allow — we extract
      only matching entries in the parser.
    - For website_canonical: validate domain is consistent with saved website
      OR venue name tokens appear in page title.
    """
    if source in ('hendonmob', 'cardplayer'):
        return True  # Search pages filtered at record level

    tokens = venue_name_tokens(venue_name)
    if not tokens:
        return True

    text_lower = page_text.lower()

    # Extract title tag
    title_m = re.search(r'<title[^>]*>(.*?)</title>', page_text, re.IGNORECASE | re.DOTALL)
    title = title_m.group(1).lower() if title_m else ''

    # Extract h1 tags
    h1s = re.findall(r'<h1[^>]*>(.*?)</h1>', page_text, re.IGNORECASE | re.DOTALL)
    h1_text = ' '.join(re.sub(r'<[^>]+>', '', h).lower() for h in h1s[:3])

    # JSON-LD venue name
    jld_names = re.findall(r'"name"\s*:\s*"([^"]{3,80})"', page_text[:8000])
    jld_name_text = ' '.join(n.lower() for n in jld_names[:3])

    # Combined searchable surface
    header_text = f"{title} {h1_text} {jld_name_text}"

    # At least 1 significant token must appear in page header region
    matched = sum(1 for t in tokens if t in header_text)
    if matched >= 1:
        return True

    # Fallback: check state abbreviation + any token in page body
    # (catches venues whose name differs slightly from URL structure)
    if venue_state and venue_state.lower() in text_lower:
        body_matched = sum(1 for t in tokens if t in text_lower[:5000])
        if body_matched >= 2:
            return True

    return False


def validate_jld_canonical(jld: dict, venue_name: str, venue_state: str) -> str | None:
    """
    Examine a JSON-LD Casino/LocalBusiness object from PokerAtlas.
    Return the canonical URL only if the venue name matches our target.
    Returns None if the page is for a different venue (bad slug in DB).
    """
    jld_venue_name = jld.get('name') or ''
    canonical = jld.get('url') or jld.get('@id') or ''
    if not canonical or not canonical.startswith('http') or 'pokeratlas' in canonical:
        return None

    if not jld_venue_name:
        return canonical  # No name to compare — allow cautiously

    our_tokens   = venue_name_tokens(venue_name)
    page_tokens  = venue_name_tokens(jld_venue_name)
    overlap      = our_tokens & page_tokens

    # Require at least 1 meaningful token overlap OR names are very similar
    if overlap:
        return canonical

    # Short-name fallback: first 4 chars of first word match
    our_first  = venue_name.lower().split()[0][:4]
    page_first = jld_venue_name.lower().split()[0][:4]
    if our_first == page_first:
        return canonical

    print(f"      [SCOPE-BLOCK] JSON-LD name '{jld_venue_name}' ≠ target '{venue_name}' — skipping canonical URL")
    return None


# ── Build URL priority list for a venue ──────────────────────────────────────
def build_url_list(venue: dict) -> list:
    """
    Returns ordered list of (source_label, url) tuples to try.
    Priority: saved_url → PokerAtlas HTML → Bravo → HendonMob → CardPlayer → Venue Website
    """
    urls = []
    name = venue.get('name', '')
    seen = set()

    def add(label, u):
        if not u or u in seen or skip_domain(u):
            return
        # Validate URL has a proper domain (must contain a dot, min 4 chars in hostname)
        try:
            hostname = u.split('//')[1].split('/')[0].lstrip('www.')
            if '.' not in hostname or len(hostname) < 4:
                return  # e.g. https://poker/tournaments — invalid, skip
        except (IndexError, Exception):
            return
        seen.add(u)
        urls.append((label, u))

    # 1. Saved source of truth (from previous successful scrape)
    saved = venue.get('scrape_url') or venue.get('schedule_scrape_url') or ''
    if saved:
        # Normalize: strip duplicate trailing path segments (e.g. /tournaments/tournaments)
        saved = re.sub(r'(/tournaments)+$', '/tournaments', saved.rstrip('/'))
        add('saved_source', saved)

    # 2. PokerAtlas HTML page — multi-slug variants + JSON-LD canonical discovery
    for pa_label, pa_u in make_pa_slug_variants(venue):
        add(pa_label, pa_u)
    # Fallback: single generated slug if make_pa_slug_variants returned nothing
    if not any(lbl == 'pokeratlas' for lbl, _ in urls):
        gen_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        add('pokeratlas', f"https://www.pokeratlas.com/poker-room/{gen_slug}/tournaments")

    # 3. Bravo Poker Live — use stored slug if available, else generate
    bravo_stored = venue.get('bravo_url') or ''
    bravo_slug_stored = venue.get('bravo_slug') or ''
    if bravo_slug_stored:
        add('bravo', f"https://www.bravopokerlive.com/poker-rooms/{bravo_slug_stored}")
    elif bravo_stored and 'bravopokerlive.com' in bravo_stored:
        add('bravo', bravo_stored)
    else:
        # Generated slug — remove venue-generic suffixes that confuse Bravo
        bravo_slug = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
        # Bravo uses shorter slugs — strip trailing city/state duplicates
        bravo_slug = re.sub(r'-(casino|poker|room|club|house)$', '', bravo_slug)
        add('bravo', f"https://www.bravopokerlive.com/poker-rooms/{bravo_slug}")

    # 4. HendonMob (search — filtered at record level)
    encoded_name = urllib.parse.quote_plus(name)
    add('hendonmob', f"https://www.thehendonmob.com/search/?q={encoded_name}")

    # 5. CardPlayer.com (search — filtered at record level)
    add('cardplayer', f"https://www.cardplayer.com/poker-tournaments/search?q={encoded_name}")

    # 6. Direct venue website — try multiple path patterns
    website = venue.get('website') or ''
    if website:
        # Reject pure relative paths (e.g. '/poker-room') stored without domain
        if website.startswith('/') or len(website) < 8:
            website = ''
    if website:
        base = website if website.startswith('http') else f"https://{website}"
        base = base.rstrip('/')
        # CRITICAL: Validate the extracted hostname is a real domain (has a dot, min 5 chars)
        # This prevents malformed entries like 'gaming/poker' → 'https://gaming/poker/tournaments'
        try:
            hostname = base.split('//')[1].split('/')[0].lstrip('www.')
            if '.' not in hostname or len(hostname) < 5:
                website = ''  # Invalid domain — skip all website paths
        except (IndexError, Exception):
            website = ''
    if website:
        base_for_paths = (website if website.startswith('http') else f"https://{website}").rstrip('/')
        # Normalize: strip trailing page filename (e.g. /poker-room.html, /index.php)
        last_seg = base_for_paths.split('/')[-1]
        if '.' in last_seg and not last_seg.startswith('www.') and len(last_seg) > 4:
            base_for_paths = base_for_paths.rsplit('/', 1)[0]
        base = base_for_paths

        for path in [
            '/poker/tournaments',
            '/poker-room/tournaments',
            '/gaming/poker/tournaments',
            '/tournaments',
            '/events',
            '/poker',
            '/poker-room',
            '',
        ]:
            add('website', f"{base}{path}")


    return urls[:18]  # 14 base paths + up to 4 JSON-LD injected URLs


# ── PDF Extraction Pipeline ───────────────────────────────────────────────────
def find_pdf_links(html: str, base_url: str) -> list:
    """
    Find all PDF links on a page that likely contain tournament schedules.
    Returns list of absolute PDF URLs.
    """
    # Keywords that suggest this PDF is a tournament/schedule document
    SCHED_WORDS = re.compile(
        r'tournament|schedule|poker|event|calendar|weekly|nightly|daily|buy.?in',
        re.IGNORECASE
    )
    found = []
    seen = set()

    # Find all <a href="...pdf"> links
    for m in re.finditer(r'href=["\']([^"\']+\.pdf)["\']', html, re.IGNORECASE):
        href = m.group(1).strip()
        # Make absolute
        if href.startswith('//'):
            href = 'https:' + href
        elif href.startswith('/'):
            # Extract origin from base_url
            parts = base_url.split('/')
            origin = '/'.join(parts[:3])
            href = origin + href
        elif not href.startswith('http'):
            href = base_url.rstrip('/') + '/' + href

        if href in seen:
            continue
        seen.add(href)

        # Check surrounding anchor text for schedule-related words
        # Grab up to 100 chars before/after the match for context
        start = max(0, m.start() - 150)
        end = min(len(html), m.end() + 150)
        context = html[start:end]

        if SCHED_WORDS.search(context) or SCHED_WORDS.search(href):
            found.append(href)

    return found[:5]  # Cap at 5 PDFs per page to avoid runaway


def extract_pdf_text(pdf_url: str, session) -> str:
    """
    Download a PDF via StealthySession and extract all text using pdfplumber.
    Returns empty string on failure.
    """
    if not PDF_OK:
        return ''
    try:
        resp = session.fetch(pdf_url, timeout=20000, wait_until='domcontentloaded')
        if not resp or resp.status != 200:
            return ''
        raw = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode('utf-8')
        # Verify it's actually a PDF
        if not raw[:4] == b'%PDF':
            return ''
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages_text = []
            for page in pdf.pages:
                txt = page.extract_text()
                if txt:
                    pages_text.append(txt)
            return '\n'.join(pages_text)
    except Exception as e:
        print(f"      [PDF ERR] {str(e)[:70]}")
        return ''


def scrape_venue(venue: dict, session, dry_run: bool) -> dict:
    name   = venue.get('name', 'Unknown')
    state  = venue.get('state', '')
    city   = venue.get('city', '')
    vid    = venue.get('id')
    result = dict(
        venue_name=name, state=state, city=city, db_id=vid,
        found=False, confirmed_source='', source_url='',
        total_records=0, recurring=0, dated=0,
        html_hash='', db_updated=False, error=None,
    )

    urls = build_url_list(venue)
    ts_now = datetime.now(timezone.utc).isoformat()
    all_records = []      # Accumulate across sources for max coverage
    seen_keys   = set()   # Global dedup across all sources

    already_seen_urls = {u for _, u in urls}

    i = 0
    while i < len(urls):
        src, url = urls[i]
        i += 1
        print(f"      [{src}] {url[:80]}")

        # ── PDF sources bypass StealthySession — download raw bytes directly ─
        if src == 'pdf_sched':
            if not PDF_OK:
                continue
            pdf_bytes = b''
            try:
                req = urllib.request.Request(url, headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    'Accept': 'application/pdf,*/*',
                    'Referer': url.split('/wp-content')[0] if '/wp-content' in url else url,
                })
                with urllib.request.urlopen(req, timeout=25) as r:
                    pdf_bytes = r.read()
            except Exception as e:
                print(f"      [PDF SKIP] urllib: {str(e)[:60]}")
                continue
            if not pdf_bytes or pdf_bytes[:4] != b'%PDF':
                print(f"      [PDF] Not valid PDF (magic={pdf_bytes[:8]!r})")
                continue
            try:
                with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf_obj:
                    pages_text = [p.extract_text() or '' for p in pdf_obj.pages]
                pdf_text = '\n'.join(t for t in pages_text if t)
            except Exception as e:
                print(f"      [PDF ERR] pdfplumber: {str(e)[:70]}")
                continue
            if not pdf_text or not has_tournament_content(pdf_text):
                print(f"      [PDF] No tournament content in PDF")
                time.sleep(1)
                continue
            print(f"      [PDF] {len(pdf_text)} chars → parsing tournaments")
            pdf_hash = sha256(pdf_bytes)
            candidates = extract_tournaments(pdf_text, name, url, pdf_hash)
            if not candidates:
                print(f"      [PDF] No structured records parsed from PDF")
                time.sleep(1)
                continue
            new_recs = []
            for rec in candidates:
                dk = f"{rec.get('event_date') or rec.get('day_of_week')}-{rec.get('start_time')}-{rec.get('buy_in')}-{rec.get('game_type')}"
                if dk not in seen_keys:
                    seen_keys.add(dk)
                    new_recs.append(rec)
            if new_recs:
                all_records.extend(new_recs)
                recurring_pdf = sum(1 for r in new_recs if not r.get('event_date'))
                dated_pdf = sum(1 for r in new_recs if r.get('event_date'))
                print(f"      ✅ +{len(new_recs)} PDF records ({recurring_pdf} recurring, {dated_pdf} dated)")
                if not result['found']:
                    result.update(found=True, confirmed_source='pdf_sched', source_url=url, html_hash=pdf_hash)
            time.sleep(1.5)
            continue  # Back to top of loop

        try:
            gs_flag = src in ('hendonmob', 'cardplayer')
            resp = session.fetch(url, google_search=gs_flag, timeout=12000, wait_until='domcontentloaded')
        except Exception as e:
            print(f"      [SKIP] {str(e)[:70]}")
            continue

        if not resp or resp.status != 200:
            time.sleep(1)
            continue


        # ── Standard HTML processing ─────────────────────────────────────────
        body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode('utf-8')
        html = body.decode('utf-8', errors='ignore')
        h    = sha256(body)


        # ── Venue scope check: confirm this page is for OUR venue ────────────
        if not venue_matches_page(html, name, state, city, src, url):
            print(f"      [SCOPE-BLOCK] Page does not match venue '{name}' — skipping")
            time.sleep(1)
            continue

        # ── PokerAtlas: extract canonical venue website from JSON-LD ─────────
        if src == 'pokeratlas':
            jld_blocks = re.findall(
                r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',
                html, re.DOTALL | re.IGNORECASE
            )
            for jld_raw in jld_blocks:
                try:
                    jld = json.loads(jld_raw)
                    # ── CRITICAL: Validate JSON-LD is for OUR venue before injecting URL
                    canonical = validate_jld_canonical(jld, name, state)
                    if canonical:
                        base = canonical.rstrip('/')
                        for ilabel, iurl in [
                            ('website_canonical', f"{base}/poker/tournaments"),
                            ('website_canonical', f"{base}/tournaments"),
                            ('website_canonical', base),
                        ]:
                            if iurl not in already_seen_urls:
                                already_seen_urls.add(iurl)
                                urls.append((ilabel, iurl))
                                print(f"      [JSON-LD ✓] Discovered: {iurl[:70]}")
                    break
                except (json.JSONDecodeError, Exception):
                    pass

        # ── PDF Discovery: scan HTML page for tournament PDF links ────────────
        if PDF_OK and src not in ('hendonmob', 'cardplayer'):
            pdf_links = find_pdf_links(html, url)
            for pdf_url in pdf_links:
                if pdf_url not in already_seen_urls:
                    already_seen_urls.add(pdf_url)
                    urls.append(('pdf_sched', pdf_url))
                    print(f"      [PDF FOUND] Queued: {pdf_url[:75]}")

        # ── Content extraction ────────────────────────────────────────────────
        if src == 'pokeratlas_api':
            try:
                data = json.loads(html)
                candidates = parse_pokeratlas_json(data, name, url, h)
                if candidates:
                    print(f"      ✅ PokerAtlas API: {len(candidates)} tournaments parsed")
                else:
                    print(f"      [pokeratlas_api] No tournaments in JSON response")
            except (json.JSONDecodeError, Exception) as e:
                print(f"      [pokeratlas_api] JSON parse failed: {str(e)[:60]}")
                candidates = []
        elif src == 'pokeratlas':
            # Try structured HTML parser first (most accurate for PA pages)
            candidates = parse_pa_html_schedule(html, name, state)
            if candidates:
                print(f"      ✅ PA HTML parser: {len(candidates)} tournaments (structured)")
                # Stamp html_hash on all PA-parsed records
                for rec in candidates:
                    rec['scrape_html_hash'] = h
                    rec['source_url'] = url
            else:
                # Fall back to generic regex extractor
                if not has_tournament_content(html):
                    print(f"      [NO CONTENT] No tournament keywords found")
                    time.sleep(1)
                    continue
                candidates = extract_tournaments(html, name, url, h)
        else:
            # All other sources: bravo, website, saved_source, etc.
            if not has_tournament_content(html):
                print(f"      [NO CONTENT] No tournament keywords found")
                time.sleep(1)
                continue
            candidates = extract_tournaments(html, name, url, h)


        # Deduplicate against global seen set
        new_recs = []
        for rec in candidates:
            dk = f"{rec.get('event_date') or rec.get('day_of_week')}-{rec.get('start_time')}-{rec.get('buy_in')}-{rec.get('game_type')}"
            if dk not in seen_keys:
                seen_keys.add(dk)
                new_recs.append(rec)

        if new_recs:
            all_records.extend(new_recs)
            recurring_new = sum(1 for r in new_recs if not r.get('event_date'))
            dated_new     = sum(1 for r in new_recs if r.get('event_date'))
            print(f"      ✅ +{len(new_recs)} records via {src} ({recurring_new} recurring, {dated_new} dated)")

            if not result['found']:
                result.update(found=True, confirmed_source=src, source_url=url, html_hash=h)

        # Save evidence for primary confirmed source only
        if len(all_records) > 0 and not result.get('_evidence_saved'):
            ev_path = save_evidence(name, state, {
                "venue_name":         name, "state": state, "city": city,
                "source_url":         url, "source_type": src,
                "scrape_http_status": resp.status,
                "scrape_html_hash":   h,
                "scrape_byte_count":  len(body),
                "scrape_timestamp":   ts_now,
                "scrape_batch_id":    BATCH_ID,
                "scrape_script":      SCRAPER_NAME,
                "db_id":              vid,
                "records_extracted":  len(all_records),
                "body_preview":       html[:300],
            })
            print(f"      📁 Evidence: {ev_path.name}")
            result['_evidence_saved'] = True

        time.sleep(1.5)

        # If we already have substantial coverage (>7 recurring days = full week),
        # we can stop trying more sources. But still try all sources to collect
        # dated events (no ceiling!).
        recurring_total = sum(1 for r in all_records if not r.get('event_date'))
        if recurring_total >= 7 and len(all_records) >= 10:
            # Already have a full weekly schedule, but keep trying for dated events
            # Only break if we're on a fallback source (PokerAtlas already checked)
            if 'pokeratlas' in src or 'bravo' in src:
                break

    if not all_records:
        print(f"      ⚠️  No tournament data found across {len(urls)} sources")
        return result

    # Anti-hallucination check
    if not anti_hallucination_check(all_records):
        print(f"      ⛔ Records failed anti-hallucination check — skipping DB write")
        result['error'] = 'anti_hallucination_fail'
        return result

    result['total_records'] = len(all_records)
    result['recurring']     = sum(1 for r in all_records if not r.get('event_date'))
    result['dated']         = sum(1 for r in all_records if r.get('event_date'))

    if dry_run:
        print(f"      [DRY RUN] Would upsert {len(all_records)} records")
        return result

    # ── DB writes ──────────────────────────────────────────────────────────────
    # Assign venue_id to all records
    if vid:
        for rec in all_records:
            rec['venue_id'] = vid

    # Upsert tournament records (in chunks of 100 to stay under PostgREST limits)
    total_upserted = 0
    chunk_size = 100
    for i in range(0, len(all_records), chunk_size):
        chunk = all_records[i:i+chunk_size]
        n = sb_upsert('venue_daily_tournaments', chunk)
        total_upserted += n

    print(f"      💾 {total_upserted}/{len(all_records)} records upserted")

    # Update venue record with scrape provenance
    if vid:
        ok = sb_patch_venue(vid, {
            "has_tournaments":         True,
            "scrape_url":              result['source_url'],
            "schedule_scrape_url":     result['source_url'],
            "scrape_source":           result['confirmed_source'],
            "scrape_html_hash":        result['html_hash'],
            "scrape_timestamp":        ts_now,
            "last_scraped_at":         ts_now,
            "schedule_last_scraped_at": ts_now,
        })
        result['db_updated'] = ok
        print(f"      {'✅' if ok else '⚠️'} Venue record {'updated' if ok else 'update FAILED'}")

    return result


# ── Load venues from Supabase ─────────────────────────────────────────────────
def load_venues(args) -> list:
    """Pull venues from Supabase, filtered & sorted oldest-scraped-first.
    
    EXCLUDES: charity events, poker series, and poker tours — those are
    handled by dedicated scrapers and must not be double-processed here.
    """
    params = (
        "?select=id,name,state,city,venue_type,website,poker_atlas_url,"
        "pokeratlas_url,pokeratlas_slug,"
        "scrape_url,schedule_scrape_url,"
        "schedule_last_scraped_at,last_scraped_at,has_tournaments"
        "&has_tournaments=eq.true"
        "&is_active=eq.true"
        "&order=schedule_last_scraped_at.asc.nullsfirst"
        "&limit=2000"
    )
    rows = sb_get('poker_venues', params)
    print(f"  Loaded {len(rows)} has_tournaments=true venues from Supabase")

    # ── MANDATORY: Exclude charity, series, and tour venue types ─────────────
    before = len(rows)
    rows = [
        v for v in rows
        if (v.get('venue_type') or '').lower() not in SKIP_VENUE_TYPES
        and not SKIP_NAME_PATTERNS.search(v.get('name') or '')
    ]
    skipped = before - len(rows)
    if skipped:
        print(f"  Excluded {skipped} charity/series/tour venues (handled by other scrapers)")
    print(f"  Card rooms eligible: {len(rows)}")

    if args.state:
        rows = [v for v in rows if v.get('state','').upper() == args.state.upper()]
        print(f"  State filter {args.state}: {len(rows)} venues")

    if args.venue:
        rows = [v for v in rows if args.venue.lower() in (v.get('name','') or '').lower()]
        print(f"  Name filter '{args.venue}': {len(rows)} venues")

    if args.batch > 0:
        start = (args.batch - 1) * BATCH_SIZE
        rows  = rows[start:start + BATCH_SIZE]
        print(f"  Batch {args.batch}: venues {start+1}–{start+len(rows)}")

    if args.limit > 0:
        rows = rows[:args.limit]

    return rows


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description='Comprehensive weekly tournament schedule scraper')
    p.add_argument('--batch',   type=int, default=0, help='Batch number (1-28, 25 venues each)')
    p.add_argument('--state',   default='', help='Filter by state, e.g. TX')
    p.add_argument('--venue',   default='', help='Venue name substring filter')
    p.add_argument('--limit',   type=int, default=0, help='Max venues to process')
    p.add_argument('--dry-run', action='store_true', help='No DB writes')
    args = p.parse_args()

    print("=" * 70)
    print("COMPREHENSIVE WEEKLY TOURNAMENT SCHEDULE SCRAPER v2.0")
    print(f"  Batch ID:  {BATCH_ID}")
    print(f"  Mode:      {'DRY RUN — no DB writes' if args.dry_run else 'LIVE — writing to Supabase'}")
    print(f"  Engine:    StealthySession (camoufox, solve_cloudflare=True)")
    print(f"  Sources:   saved_url → venue_website → PokerAtlas → Bravo")
    print(f"  Date cap:  NONE — scrapes all published events")
    print(f"  Evidence:  {EVIDENCE_DIR}")
    print("=" * 70)

    # Network pre-check
    if not network_ok():
        print("❌ Network check failed — aborting")
        sys.exit(1)
    print("✅ Network OK\n")

    venues = load_venues(args)
    if not venues:
        print("No venues to process.")
        sys.exit(0)
    print(f"\n  Processing {len(venues)} venues\n")

    stats = dict(
        processed=0, found=0, not_found=0, errors=0,
        total_recurring=0, total_dated=0, total_upserted=0,
    )

    from scrapling.fetchers import StealthySession
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    consecutive_fails = 0
    start_wall = time.time()

    try:
        for i, venue in enumerate(venues):
            name = venue.get('name', 'Unknown')
            print(f"\n[{i+1}/{len(venues)}] {name} ({venue.get('city','')}, {venue.get('state','')})")
            stats['processed'] += 1

            # Sleep/wake drift detection — restart session if >2x expected elapsed
            expected_elapsed = i * (RATE_S + 5)
            actual_elapsed   = time.time() - start_wall
            if actual_elapsed > expected_elapsed * 2 + 120:
                print("  ⚡ Sleep/wake drift detected — restarting session")
                try: session.close()
                except Exception: pass
                time.sleep(2)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                consecutive_fails = 0
                start_wall = time.time()

            try:
                result = scrape_venue(venue, session, args.dry_run)
                if result.get('found'):
                    stats['found']           += 1
                    stats['total_recurring'] += result.get('recurring', 0)
                    stats['total_dated']     += result.get('dated', 0)
                    stats['total_upserted']  += result.get('total_records', 0)
                    consecutive_fails = 0
                else:
                    stats['not_found'] += 1
                    consecutive_fails  += 1

            except Exception as e:
                print(f"    ❌ Exception: {e}")
                stats['errors'] += 1
                consecutive_fails += 1

            # Circuit breaker
            if consecutive_fails >= CIRCUIT_MAX:
                print(f"\n⚡ Circuit breaker: {consecutive_fails} consecutive failures — restarting session")
                try: session.close()
                except Exception: pass
                time.sleep(4)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                consecutive_fails = 0

            # Rate limit
            if i < len(venues) - 1:
                time.sleep(RATE_S)

    finally:
        try: session.close()
        except Exception: pass

    # Audit log
    if not args.dry_run:
        sb_audit_log(
            BATCH_ID,
            stats['processed'],
            stats['total_upserted'],
            f"Found={stats['found']}, NotFound={stats['not_found']}, "
            f"Recurring={stats['total_recurring']}, Dated={stats['total_dated']}"
        )

    print("\n" + "=" * 70)
    print("SCRAPE COMPLETE")
    print(f"  Venues processed:  {stats['processed']}")
    print(f"  Venues with data:  {stats['found']}")
    print(f"  Venues no data:    {stats['not_found']}")
    print(f"  Recurring records: {stats['total_recurring']}")
    print(f"  Dated events:      {stats['total_dated']}")
    print(f"  Total upserted:    {stats['total_upserted']}")
    print(f"  Errors:            {stats['errors']}")
    print(f"  Evidence dir:      {EVIDENCE_DIR}")
    print("=" * 70)


if __name__ == '__main__':
    main()
