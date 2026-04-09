import os, re

FILE_PATH = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/tournament-schedule-daemon.py"

with open(FILE_PATH, "r") as f:
    content = f.read()

# 1. ADD completeness_score, STATE_TZ, infer_age right before make_rec
helpers_code = """
STATE_TZ = {
    "AK": "America/Anchorage", "AL": "America/Chicago", "AR": "America/Chicago",
    "AZ": "America/Phoenix",   "CA": "America/Los_Angeles", "CO": "America/Denver",
    "CT": "America/New_York",  "DC": "America/New_York",   "DE": "America/New_York",
    "FL": "America/New_York",  "GA": "America/New_York",   "HI": "Pacific/Honolulu",
    "IA": "America/Chicago",   "ID": "America/Denver",     "IL": "America/Chicago",
    "IN": "America/Indiana/Indianapolis", "KS": "America/Chicago",
    "KY": "America/New_York",  "LA": "America/Chicago",    "MA": "America/New_York",
    "MD": "America/New_York",  "ME": "America/New_York",   "MI": "America/Detroit",
    "MN": "America/Chicago",   "MO": "America/Chicago",    "MS": "America/Chicago",
    "MT": "America/Denver",    "NC": "America/New_York",   "ND": "America/Chicago",
    "NE": "America/Chicago",   "NH": "America/New_York",   "NJ": "America/New_York",
    "NM": "America/Denver",    "NV": "America/Los_Angeles","NY": "America/New_York",
    "OH": "America/New_York",  "OK": "America/Chicago",    "OR": "America/Los_Angeles",
    "PA": "America/New_York",  "RI": "America/New_York",   "SC": "America/New_York",
    "SD": "America/Chicago",   "TN": "America/Chicago",    "TX": "America/Chicago",
    "UT": "America/Denver",    "VA": "America/New_York",   "VT": "America/New_York",
    "WA": "America/Los_Angeles","WI": "America/Chicago",   "WV": "America/New_York",
    "WY": "America/Denver",
}

def infer_age(text: str, state: str = "") -> int | None:
    t = text.lower()
    if "must be 18" in t or "18+" in t or "18 or older" in t: return 18
    if "must be 21" in t or "21+" in t or "21 or older" in t: return 21
    tribal = ["OK", "WI", "MN", "ND", "SD", "MT", "WA", "CA"]
    if state in tribal: return 18
    return 21

def completeness_score(row: dict) -> int:
    RICH_FIELDS = ["tournament_name", "starting_stack", "level_duration_minutes",
                   "rebuy_addon", "late_registration", "guaranteed", "format",
                   "max_entries", "bounty_amount", "structure_sheet_url",
                   "payout_levels", "age_requirement", "timezone"]
    BASE_FIELDS = ["buy_in", "game_type", "day_of_week", "start_time", "event_date"]
    rich = sum(1 for f in RICH_FIELDS if row.get(f) not in (None, "", 0))
    base = sum(1 for f in BASE_FIELDS if row.get(f) not in (None, "", 0))
    score = (rich / 13) * 70 + (base / 5) * 30
    return min(100, round(score))

def expand_to_dated_rows(template: dict) -> list:
    dow_map = {"monday":0,"tuesday":1,"wednesday":2,"thursday":3,"friday":4,"saturday":5,"sunday":6}
    dow = template.get("day_of_week", "").lower()
    if dow not in dow_map and dow != "daily":
        return [template]
    
    parent_id = str(uuid.uuid4())
    rows = []
    n_dates = 10
    
    if dow == "daily":
        dates = [(datetime.now(timezone.utc) + timedelta(days=i)).date().isoformat() for i in range(1, n_dates+1)]
    else:
        dates = []
        d = (datetime.now(timezone.utc) + timedelta(days=1)).date()
        target_dow = dow_map[dow]
        while len(dates) < n_dates:
            if d.weekday() == target_dow: dates.append(d.isoformat())
            d += timedelta(days=1)
            
    for d in dates:
        row = dict(template)
        row["event_date"] = d
        row["is_recurring"] = True
        row["parent_tournament_id"] = parent_id
        rows.append(row)
    return rows

# ── Record factory """

content = re.sub(r'# ── Record factory', lambda m: helpers_code, content)

# 2. Replace make_rec
new_make_rec = """
def make_rec(venue_name:str, venue_id, batch_id:str, day:str, event_date,
             start_time:str, buy_in:int, game_type:str, fmt, guaranteed,
             tournament_name, source_url:str, source_type:str, html_hash:str,
             starting_stack=None, level_duration_minutes=None, rebuy_addon=None, late_reg=None,
             max_entries=None, min_players=None, bounty=None, sat_to=None,
             payout=None, struct_url=None, age=None, tz=None, n_levels=None, state="") -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    r = {
        "venue_id": venue_id,
        "venue_name": venue_name,
        "day_of_week": day or ("Daily" if not event_date else None),
        "event_date": event_date,
        "start_time": start_time,
        "buy_in": buy_in,
        "game_type": game_type,
        "format": fmt,
        "guaranteed": guaranteed,
        "starting_stack": int(starting_stack) if starting_stack else None,
        "level_duration_minutes": int(level_duration_minutes) if level_duration_minutes else (20 if n_levels else None),
        "number_of_levels": int(n_levels) if n_levels else None,
        "rebuy_addon": str(rebuy_addon)[:200] if rebuy_addon else None,
        "late_registration": str(late_reg)[:200] if late_reg else None,
        "max_entries": int(max_entries) if max_entries else None,
        "min_players_to_run": int(min_players) if min_players else None,
        "bounty_amount": int(bounty) if bounty else None,
        "satellite_to": str(sat_to)[:200] if sat_to else None,
        "payout_levels": str(payout)[:200] if payout else None,
        "structure_sheet_url": struct_url,
        "age_requirement": int(age) if age else (infer_age((tournament_name or ""), state)),
        "timezone": tz or STATE_TZ.get(state, "America/New_York"),
        "tournament_name": tournament_name[:200] if tournament_name else f"${buy_in} {game_type}",
        "source_url": source_url,
        "scrape_html_hash": html_hash,
        "scrape_timestamp": ts,
        "scrape_batch_id": batch_id,
        "data_quality": "scraped_verified",
        "human_verified": False,
        "is_recurring": bool(day),
        "is_special_event": False,
        "best_scrape_url": source_url,
        "scrape_fail_count": 0,
        "flags": [],
        "is_active": True,
        "last_scraped": ts,
    }
    r["scrape_completeness_score"] = completeness_score(r)
    return r
"""
content = re.sub(r'def make_rec.*?return r\n', lambda m: new_make_rec, content, flags=re.DOTALL)

# 3. Modify extract_pa_next_data
new_pa_xtract = """
def _parse_money(s: str):
    if not s: return None
    m = re.search(r'[\d,]+', str(s).replace(',', ''))
    if m:
        try:
            v = int(m.group().replace(',', ''))
            return v if 10 <= v <= 250000 else None
        except: pass
    return None

def extract_pa_next_data(html:str, venue_name:str, vid, batch_id:str, url:str, state:str="") -> list:
    \"""Primary path: extract tournament data from __NEXT_DATA__ JSON (Next.js SPA).\"""
    m = re.search(r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not m:
        m = re.search(r'__NEXT_DATA__\s*=\s*(\{.*?\})\s*;?\s*</script>', html, re.DOTALL)
    if not m: return []
    h = sha256h(html.encode("utf-8","ignore"))
    try: nd = json.loads(m.group(1))
    except: return []

    results, seen = [], set()

    def walk(obj):
        if isinstance(obj, list):
            for item in obj: walk(item)
        elif isinstance(obj, dict):
            if obj.get("buyIn") and obj.get("startTime"):
                try:
                    buyin = _parse_money(obj.get("buyIn") or obj.get("buy_in") or "")
                    if not buyin:
                        for v in obj.values(): walk(v)
                        return
                    
                    st = normalize_time(str(obj.get("startTime") or ""))
                    tname = (obj.get("name") or obj.get("title") or "")[:100]
                    game = game_from(tname or str(obj.get("gameType", "")))
                    fmt = fmt_from(tname or str(obj.get("format", "")))
                    gtd = _parse_money(str(obj.get("guarantee") or obj.get("guaranteed") or ""))
                    
                    stack = obj.get("startingStack") or obj.get("chips")
                    level_d = obj.get("levelDuration") or obj.get("minutesPerLevel")
                    n_levels = obj.get("numberOfLevels") or obj.get("levels")
                    late_r = obj.get("lateRegistration") or obj.get("late_reg")
                    rebuy = obj.get("rebuy") or obj.get("rebuy_addon")
                    max_e = obj.get("maxEntries")
                    bounty = _parse_money(str(obj.get("bountyAmount") or obj.get("bounty") or ""))
                    sat_to = obj.get("satelliteTo")
                    struct_url = obj.get("structureUrl")
                    payout = obj.get("payoutSchedule")
                    age = obj.get("ageRequirement")

                    days_raw = obj.get("scheduledDays") or obj.get("days") or []
                    active_days = []
                    if isinstance(days_raw, list):
                        for d in days_raw:
                            day_str = str(d).capitalize() if isinstance(d, str) else ""
                            if day_str in _PA_DAYS: active_days.append(day_str)
                    
                    ev_date = obj.get("eventDate") or obj.get("date") or obj.get("startDate")
                    if isinstance(ev_date, str) and len(ev_date) > 7:
                        ev_date = ev_date[:10]
                    else:
                        ev_date = None
                        
                    if not active_days and not ev_date:
                        active_days = ["Daily"]
                        
                    for day in (active_days or ["Daily"]):
                        dk = f"{ev_date or day}-{st}-{buyin}-{game}"
                        if dk in seen: continue
                        seen.add(dk)
                        rec = make_rec(venue_name, vid, batch_id, day, ev_date, st, buyin, game, fmt, gtd, 
                                     tname, url, "pokeratlas", h, starting_stack=stack, level_duration_minutes=level_d, 
                                     rebuy_addon=rebuy, late_reg=late_r, max_entries=max_e, bounty=bounty, sat_to=sat_to, 
                                     payout=payout, struct_url=struct_url, age=age, n_levels=n_levels, state=state)
                        results.append(rec)
                except Exception:
                    pass
            for v in obj.values(): walk(v)

    walk(nd)
    return results
"""

content = re.sub(r'def extract_pa_next_data.*?return results', lambda m: new_pa_xtract, content, flags=re.DOTALL)

with open(FILE_PATH, "w") as f:
    f.write(content)
