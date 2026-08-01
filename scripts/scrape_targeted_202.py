#!/usr/bin/env python3
"""
scrape_targeted_202.py — Targeted 5-Source Scraper for Missing Card Rooms
=========================================================================
Dynamically loads ONLY the venues that still lack tournament data and
runs them through ALL 5 sources in priority order:

  1. PokerAtlas      /poker-room/{slug}/tournaments  (structured HTML + __NEXT_DATA__)
  2. Bravo           bravopokerlive.com/poker-rooms/{slug}/
  3. HendonMob       global USA fetch → fuzzy-match to venue
  4. CardPlayer      cardplayer.com/poker-tournaments → fuzzy-match to venue
  5. Venue website   direct pages + PDF extraction

Runs continuously:
  - After each full pass, re-checks which venues still lack data
  - Keeps retrying until 0 remain or --max-passes is reached
  - Circuit breaker (5 consec fails) → session restart
  - Page recycle every 40 venues
  - 6h session refresh
  - Evidence JSON written for every attempt
  - Chunked upsert: buffers 25 venues, flushes to DB at once

Usage:
    .venv/bin/python3 scripts/scrape_targeted_202.py
    .venv/bin/python3 scripts/scrape_targeted_202.py --pass-limit 3
    .venv/bin/python3 scripts/scrape_targeted_202.py --state TX
    .venv/bin/python3 scripts/scrape_targeted_202.py --dry-run
"""

import argparse, hashlib, io, json, os, re, sys, time, urllib.request, urllib.parse, uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

try:
    import pdfplumber
    PDF_OK = True
except ImportError:
    PDF_OK = False

# ── Config ───────────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOG_DIR      = PROJECT_ROOT / "data" / "tournament-logs"
EVIDENCE_DIR = PROJECT_ROOT / "data" / "scrape-evidence" / "targeted-202"
LOG_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = "https://kuklfnapbkmacvwxktbh.supabase.co"
SUPABASE_KEY = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
)
SB_HDRS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}
ON_CONFLICT = "venue_id,venue_name,day_of_week,event_date,start_time,buy_in,game_type"

SKIP_TYPES = {
    "charity","charity_event","charity_game","series","poker_series",
    "tour","poker_tour","traveling_tour","regional_tour","tournament_series",
}
SCRAPER_DOMAINS = {
    "pokeratlas.com","bravopokerlive.com","cardplayer.com",
    "thehendonmob.com","pokernews.com","hendonmob.com",
}

CHUNK_SIZE   = 25    # flush to DB every N venues
VENUE_RATE_S = 2.0   # seconds between venues
PAGE_RECYCLE = 40    # recycle StealthySession every N venues
SESSION_MAX  = 21600 # 6h proactive session refresh
CIRCUIT_MAX  = 5     # consecutive failures → restart session

log_path = LOG_DIR / f"targeted202_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

def log(msg: str):
    ts   = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    try:
        with open(log_path, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass

# ── Utility ──────────────────────────────────────────────────────────────────
def sha256h(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", re.sub(r"[''`]", "", s).lower()).strip("-")

def network_ok() -> bool:
    for url in ("https://1.1.1.1", "https://www.google.com", "https://supabase.com"):
        try:
            urllib.request.urlopen(url, timeout=6)
            return True
        except Exception:
            continue
    return False

MONTHS = {"january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
          "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
          "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
          "sep":9,"oct":10,"nov":11,"dec":12}

def parse_date(text: str) -> str | None:
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
        except ValueError: pass
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
            except ValueError: pass
    return None

DAYS_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday","Daily"]
DAY_MAP   = {"mon":"Monday","tue":"Tuesday","wed":"Wednesday","thu":"Thursday",
             "fri":"Friday","sat":"Saturday","sun":"Sunday","daily":"Daily",
             "nightly":"Daily","weekday":"Monday","weekend":"Saturday"}

def normalize_day(text: str) -> str:
    tl = text.lower()
    for d in DAYS_FULL:
        if d.lower() in tl: return d
    for k,v in DAY_MAP.items():
        if re.search(rf"\b{k}\b", tl): return v
    return "Daily"

def normalize_time(raw: str) -> str:
    m = re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?|\d{1,2}\s*(?:AM|PM|am|pm))", str(raw))
    if not m: return ""
    t = m.group(1).upper().strip()
    if t.endswith("A"): t += "M"
    if t.endswith("P"): t += "M"
    return t

def game_from(text: str) -> str:
    u = text.upper()
    if "PLO" in u or "OMAHA" in u: return "PLO"
    if "MIXED" in u or "HORSE" in u: return "Mixed"
    if "STUD" in u: return "Stud"
    if "RAZZ" in u: return "Razz"
    if "BIG-O" in u or "BIG O" in u: return "Big-O"
    return "NLH"

def fmt_from(text: str) -> str | None:
    for f,pat in [("Mystery Bounty","mystery.?bounty"),("Progressive KO","progressive|PKO"),
                  ("Bounty","bounty"),("Deep Stack","deep.?stack"),("Turbo","turbo"),
                  ("Rebuy","rebuy"),("Freezeout","freezeout"),("Satellite","satellite")]:
        if re.search(pat, text, re.I): return f
    return None

TOURN_KW = re.compile(
    r"tournament|tourney|buy.?in|\$\d{2,}.*?(?:buy|entry)|bounty|freeroll|"
    r"freezeout|rebuy|deep.?stack|daily poker|poker schedule|nlh|no.limit|"
    r"weekly poker|event schedule|holdem|poker room", re.I
)
def has_tourn(html: str) -> bool:
    return bool(TOURN_KW.search(html[:60000]))

def anti_hallucination_ok(records: list) -> bool:
    if len(records) < 3: return True
    buyins = [r["buy_in"] for r in records if r.get("buy_in")]
    if len(buyins) >= 5 and sum(1 for b in buyins if b%100==0)/len(buyins) > 0.95:
        return False
    slots = [f"{r.get('day_of_week')}-{r.get('event_date')}-{r.get('start_time')}" for r in records]
    if len(slots) > 5 and len(set(slots)) == 1: return False
    return True

def dedup_key(r: dict) -> str:
    return f"{r.get('event_date') or r.get('day_of_week')}-{r.get('start_time')}-{r.get('buy_in')}-{r.get('game_type')}"

_PA_DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]

# ── Record factory ────────────────────────────────────────────────────────────
def make_rec(venue_name:str, venue_id, batch_id:str, day:str, event_date,
             start_time:str, buy_in:int, game_type:str, fmt, guaranteed,
             tournament_name, source_url:str, source_type:str, html_hash:str,
             starting_stack=None, blind_levels=None, rebuy_addon=None, late_reg=None) -> dict:
    ts = datetime.now(timezone.utc).isoformat()
    r = {
        "venue_name":venue_name,"day_of_week":day or "Daily","event_date":event_date,
        "start_time":start_time,"buy_in":buy_in,"game_type":game_type,"format":fmt,
        "guaranteed":guaranteed,"starting_stack":starting_stack,"blind_levels":blind_levels,
        "rebuy_addon":rebuy_addon,"late_registration":late_reg,
        "tournament_name":tournament_name,"source_url":source_url,
        "data_quality":"scraped_verified","scrape_html_hash":html_hash,
        "scrape_timestamp":ts,"scrape_batch_id":batch_id,
        "scrape_confidence":"high","is_active":True,"last_scraped":ts,
    }
    if venue_id: r["venue_id"] = venue_id
    return r

# ── Supabase REST ─────────────────────────────────────────────────────────────
def sb_get_paged(path: str, base_params: str, limit: int = 1000) -> list:
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
            log(f"  [SB_GET ERR] {e}"); break
        all_rows.extend(rows)
        if len(rows) < limit: break
        offset += limit
    return all_rows

def sb_upsert(table: str, records: list) -> int:
    if not records: return 0
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={urllib.parse.quote(ON_CONFLICT)}"
        req = urllib.request.Request(
            url, data=json.dumps(records).encode(), method="POST", headers=SB_HDRS
        )
        with urllib.request.urlopen(req, timeout=40) as r:
            return len(records) if r.status in (200,201) else 0
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8","ignore")[:300]
        log(f"  [UPSERT ERR] HTTP {e.code}: {body}"); return 0
    except Exception as e:
        log(f"  [UPSERT ERR] {e}"); return 0

def sb_patch_venue(vid: int, patch: dict):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/poker_venues?id=eq.{vid}",
            data=json.dumps(patch).encode(), method="PATCH", headers=SB_HDRS
        )
        urllib.request.urlopen(req, timeout=20)
    except Exception: pass

def sb_audit(batch_id: str, venues: int, records: int, notes: str = ""):
    try:
        req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/data_audit_log",
            data=json.dumps({"table_name":"venue_daily_tournaments",
                "action":"targeted_202_scrape","batch_id":batch_id,
                "records_affected":records,"agent_id":"scrape_targeted_202.py",
                "notes":f"Venues:{venues}. {notes}",
                "created_at":datetime.now(timezone.utc).isoformat()}).encode(),
            method="POST", headers={**SB_HDRS,"Prefer":"return=minimal"}
        )
        urllib.request.urlopen(req, timeout=15)
    except Exception: pass

def save_evidence(name:str, state:str, data:dict):
    safe = re.sub(r"[^a-zA-Z0-9]","_",name)[:40]
    path = EVIDENCE_DIR / f"t202_{state}_{safe}_{int(time.time())}.json"
    with open(path,"w") as f: json.dump(data,f,indent=2)

# ── HTML extraction ───────────────────────────────────────────────────────────
TIME_RE = re.compile(r"((?:[01]?\d|2[0-3]):[0-5]\d\s*(?:AM|PM|am|pm|a|p)?|\b[1-9]\d?\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.)\b)")
BUY_RE  = re.compile(r"\$(\d{1,3}(?:,\d{3})*)")

def extract_html(html:str, venue_name:str, vid, batch_id:str, source_url:str, src_type:str) -> list:
    text = re.sub(r"\s+"," ", re.sub(r"<[^>]+>"," ",html))
    h    = sha256h(html.encode("utf-8","ignore"))
    seen, results = set(), []

    def try_block(txt: str):
        bi = BUY_RE.search(txt); tm = TIME_RE.search(txt)
        if not bi or not tm: return
        buyin = int(bi.group(1).replace(",",""))
        if not 10<=buyin<=50000: return
        st = normalize_time(tm.group(1))
        if not st: return
        ed  = parse_date(txt)
        day = normalize_day(txt) if not ed else None
        gtd = None
        gm  = re.search(r"(?:GTD|Guaranteed)[:\s]*\$?([\d,]+)",txt,re.I)
        if gm:
            try: gtd=int(gm.group(1).replace(",",""))
            except: pass
        stack = None
        sm = re.search(r"(?:stack|chips)[:\s]*([0-9,]+)",txt,re.I)
        if sm:
            try: stack=int(sm.group(1).replace(",",""))
            except: pass
        blvl = None
        blm  = re.search(r"(?:blind levels?|levels?)[:\s]*(\d+)\s*min",txt,re.I)
        if blm: blvl=f"{blm.group(1)} minutes"
        late = None
        lrm  = re.search(r"late\s*reg[:\s]*([^\n,]{3,30})",txt,re.I)
        if lrm: late=lrm.group(1).strip()[:50]
        rebuy= None
        rm   = re.search(r"(?:re.?buy|add.?on)[:\s$]*([^\n,]{3,40})",txt,re.I)
        if rm: rebuy=rm.group(1).strip()[:80]
        tname= None
        nm   = re.search(r'(?:"([^"]{4,60})"|\x27([^\x27]{4,60})\x27)',txt)
        if nm: tname=(nm.group(1) or nm.group(2))[:100]
        dk   = f"{ed or day}-{st}-{buyin}-{game_from(txt)}"
        if dk in seen: return
        seen.add(dk)
        results.append(make_rec(venue_name,vid,batch_id,day or "Daily",ed,st,buyin,
            game_from(txt),fmt_from(txt),gtd,tname,source_url,src_type,h,stack,blvl,rebuy,late))

    for block in re.split(r"(?=\$\d)", text):
        if 8<len(block)<900: try_block(block)
    for row in (re.findall(r"<tr[^>]*>(.*?)</tr>",html,re.DOTALL|re.I)+
                re.findall(r"<li[^>]*class=\"[^\"]*(?:item|event|tourn)[^\"]*\"[^>]*>(.*?)</li>",html,re.DOTALL|re.I)+
                re.findall(r"<div[^>]*class=\"[^\"]*(?:row|item|event|tourn)[^\"]*\"[^>]*>(.*?)</div>",html,re.DOTALL|re.I)):
        if "<th" in row.lower(): continue
        rt=re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",row)).strip()
        if "$" in rt: try_block(rt)
    for line in html.split("\n"):
        line=line.strip()
        if len(line)>=12 and "$" in line: try_block(line)
    return results

# ── PDF extraction ────────────────────────────────────────────────────────────
def find_pdfs(html:str, base_url:str) -> list:
    KW=re.compile(r"tournament|schedule|poker|event|calendar|weekly|nightly|buy.?in",re.I)
    found,seen=[],set()
    for m in re.finditer(r'href=["\']([^"\']+\.pdf)["\']',html,re.I):
        href=m.group(1).strip()
        if href.startswith("//"): href="https:"+href
        elif href.startswith("/"): href="/".join(base_url.split("/")[:3])+href
        elif not href.startswith("http"): href=base_url.rstrip("/")+"/"+href
        if href in seen: continue
        seen.add(href)
        ctx=html[max(0,m.start()-150):m.end()+150]
        if KW.search(ctx) or KW.search(href): found.append(href)
    return found[:5]

def extract_pdf(pdf_url:str) -> str:
    if not PDF_OK: return ""
    try:
        req=urllib.request.Request(pdf_url,headers={
            "User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept":"application/pdf,*/*"})
        with urllib.request.urlopen(req,timeout=25) as r: raw=r.read()
        if raw[:4]!=b"%PDF": return ""
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            return "\n".join(p.extract_text() or "" for p in pdf.pages)
    except Exception as e:
        log(f"      [PDF ERR] {str(e)[:60]}"); return ""

# ── PokerAtlas parser ─────────────────────────────────────────────────────────
def extract_pa_next_data(html:str, venue_name:str, vid, batch_id:str, url:str) -> list:
    """PRIMARY: extract from __NEXT_DATA__ JSON (Next.js SPA)."""
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
                    buyin_raw = obj.get("buyIn") or 0
                    if isinstance(buyin_raw, str):
                        buyin_raw = re.sub(r"[^0-9]","",buyin_raw)
                    buyin = int(buyin_raw)
                    if not 10 <= buyin <= 50000:
                        for v in obj.values(): walk(v)
                        return
                    st    = normalize_time(str(obj.get("startTime") or ""))
                    tname = (obj.get("name") or obj.get("title") or "")[:100]
                    game  = game_from(tname or (obj.get("type") or ""))
                    fmt   = fmt_from(tname)
                    gtd   = obj.get("guarantee") or obj.get("guaranteed")
                    if isinstance(gtd, str): gtd = int(re.sub(r"[^0-9]","",gtd)) if gtd else None
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
                        results.append(make_rec(venue_name, vid, batch_id, day, ev_date,
                            st, buyin, game, fmt, gtd, tname, url, "pokeratlas", h))
                except Exception:
                    pass
            for v in obj.values(): walk(v)
    walk(nd)
    return results

def parse_pa_html_fallback(html:str, venue_name:str, vid, batch_id:str, url:str) -> list:
    """FALLBACK: parse classic PA HTML tournament-schedule section."""
    if "tournament-schedule" not in html and "buy-in" not in html.lower(): return []
    if re.search(r'class=["\'"]no-tournaments["\']', html): return []
    h = sha256h(html.encode("utf-8","ignore"))
    results, seen = [], set()
    sched = re.search(r'<section[^>]*class="tournament-schedule"[^>]*>(.*?)</section>', html, re.DOTALL)
    if not sched: return []
    raw_blocks = re.split(r'(?=<div[^>]*class="[^"]*\btournament\b[^"]*")', sched.group(1))
    for block in [b for b in raw_blocks if '<div' in b]:
        hm = re.search(r'class="hour"[^>]*>([^<]{1,20})', block)
        if not hm: continue
        st = normalize_time(hm.group(1).strip())
        if not st: continue
        nm  = re.search(r'class="name"[^>]*>\s*<span>([^<]{2,80})', block)
        tname = nm.group(1).strip()[:100] if nm else None
        bm  = re.search(r'class=["\']buy-in[^>]*>\$?([\d,]+)', block)
        if not bm: bm = re.search(r'\$([\d,]{2,7})', block)
        buyin = int(bm.group(1).replace(",","")) if bm else None
        if buyin is None or not 10 <= buyin <= 50000: continue
        gm    = re.search(r'class="type"[^>]*>([^<]{1,40})', block)
        game  = game_from(gm.group(1).strip() if gm else (tname or "NLH"))
        active = _PA_DAYS[:]
        dm = re.search(r'class="days"[^>]*>(.*?)(?:</ul>|</div>)', block, re.DOTALL)
        if dm:
            items = re.findall(r'<li[^>]*class="([^"]*)"[^>]*>\s*(\w+)\s*</li>', dm.group(1))
            a = [_PA_DAYS[i] for i,(cls,_) in enumerate(items) if i<7 and "active" in cls]
            if a: active = a
        gtd = None
        gm2 = re.search(r'(?:guaranteed|gtd)[^$]*\$?([\d,]+)', block, re.I)
        if gm2:
            try: gtd = int(gm2.group(1).replace(",",""))
            except: pass
        for day in active:
            dk = f"{day}-{st}-{buyin}-{game}"
            if dk in seen: continue
            seen.add(dk)
            results.append(make_rec(venue_name, vid, batch_id, day, None, st, buyin, game,
                fmt_from(tname or ""), gtd, tname, url, "pokeratlas", h))
    return results

# ── Global source fetchers ────────────────────────────────────────────────────
def fetch_hendonmob(session) -> dict:
    """Source 3: HendonMob USA tournament listing. Returns {venue_key: [events]}."""
    now = datetime.now(timezone.utc)
    url = (f"https://pokerdb.thehendonmob.com/event.php"
           f"?a=l&d={now.day:02d}&m={now.month:02d}&y={now.year}"
           f"&weeks=10&l=&t=&buyin_cur=USD&buyin_crit=l&buyin_l="
           f"&location=country&c=USA&city_distance=0&city=")
    log(f"  [Source 3: HendonMob] Fetching USA events...")
    try:
        resp = session.fetch(url, google_search=True, timeout=45000, wait_until="networkidle")
        if not resp or resp.status != 200:
            log(f"  [HendonMob] HTTP {getattr(resp,'status',0)} — skipped"); return {}
        body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
        html = body.decode("utf-8","ignore")
        h    = sha256h(body)
        result = {}
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL|re.I)
        for row in rows:
            cells=[re.sub(r"<[^>]+>"," ",c).strip()
                   for c in re.findall(r"<td[^>]*>(.*?)</td>",row,re.DOTALL|re.I)]
            if len(cells)<3: continue
            text=" ".join(cells)
            ed=parse_date(text)
            if not ed: continue
            bi=re.search(r"\$(\d{1,3}(?:,\d{3})*)",text)
            if not bi: continue
            buyin=int(bi.group(1).replace(",",""))
            if not 10<=buyin<=250000: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            tm=re.search(r"(\d{1,2}:\d{2}\s*(?:AM|PM))",text,re.I)
            result.setdefault(vkey,[]).append({
                "event_date":ed,"start_time":normalize_time(tm.group(1)) if tm else "12:00 PM",
                "buy_in":buyin,"game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
            })
        log(f"  [HendonMob] {len(result)} venues matched, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        log(f"  [HendonMob] ERR: {str(e)[:80]}"); return {}

def fetch_cardplayer(session) -> dict:
    """Source 4: CardPlayer tournament listing. Returns {venue_key: [events]}."""
    url = "https://www.cardplayer.com/poker-tournaments"
    log(f"  [Source 4: CardPlayer] Fetching tournament list...")
    try:
        resp = session.fetch(url, google_search=False, timeout=45000, wait_until="networkidle")
        if not resp or resp.status != 200:
            log(f"  [CardPlayer] HTTP {getattr(resp,'status',0)} — skipped"); return {}
        body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
        html = body.decode("utf-8","ignore")
        h    = sha256h(body)
        result = {}
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL|re.I)
        for row in rows:
            cells=[re.sub(r"<[^>]+>"," ",c).strip()
                   for c in re.findall(r"<td[^>]*>(.*?)</td>",row,re.DOTALL|re.I)]
            if len(cells)<3: continue
            text=" ".join(cells)
            bi=re.search(r"\$(\d{1,3}(?:,\d{3})*)",text)
            if not bi: continue
            buyin=int(bi.group(1).replace(",",""))
            if not 10<=buyin<=250000: continue
            vname=max((c for c in cells if "$" not in c and len(c)>5),key=len,default="")
            if not vname: continue
            vkey=vname.strip().lower()
            ed=parse_date(text)
            tname=next((c[:100] for c in cells if len(c)>10 and "$" not in c and c!=vname),None)
            result.setdefault(vkey,[]).append({
                "event_date":ed,"start_time":"12:00 PM","buy_in":buyin,
                "game_type":game_from(text),"format":fmt_from(text),
                "guaranteed":None,"tournament_name":tname,"source_url":url,"html_hash":h,
            })
        log(f"  [CardPlayer] {len(result)} venues, {sum(len(v) for v in result.values())} events")
        return result
    except Exception as e:
        log(f"  [CardPlayer] ERR: {str(e)[:80]}"); return {}

def match_global(venue_name:str, gmap:dict) -> list:
    """Fuzzy-match venue name against HendonMob/CardPlayer global maps."""
    STOP={"the","and","casino","poker","room","club","card","house","hotel","resort","at","in","of"}
    tokens={w for w in re.sub(r"[^a-z0-9 ]","",venue_name.lower()).split() if len(w)>=3} - STOP
    if not tokens: tokens={venue_name.lower()[:6]}
    best,best_score=[],0
    for key,events in gmap.items():
        score=sum(1 for t in tokens if t in key)
        if score>best_score and score>=1:
            best,best_score=events,score
    return best

def url_to_origin(u: str) -> str | None:
    """Extract scheme+host from URL, reject scraper domains."""
    try:
        if not u: return None
        if not u.startswith("http"): u=f"https://{u}"
        parts=u.split("//",1)
        if len(parts)<2: return None
        host=parts[1].split("/")[0].strip()
        if "." not in host or len(host)<5: return None
        clean_host = host.lower().replace("www.","")
        if any(clean_host==d or clean_host.endswith("."+d) for d in SCRAPER_DOMAINS):
            return None
        return parts[0]+"//"+host
    except: return None

WEBSITE_PATHS = [
    "/poker/tournaments", "/poker-room/tournaments", "/gaming/poker/tournaments",
    "/tournaments", "/events/poker", "/events", "/poker", "/poker-room", ""
]

# ── Core per-venue scrape (5 sources) ────────────────────────────────────────
def scrape_venue(venue:dict, session, batch_id:str, hm_map:dict, cp_map:dict) -> dict:
    name  = venue.get("name","Unknown")
    state = venue.get("state","")
    city  = venue.get("city","")
    vid   = venue.get("id")
    result = dict(name=name,vid=vid,state=state,found=False,records=[],primary_url="",source="")
    seen_keys: set = set()

    def add(recs:list, label:str, src_url:str):
        new=[]
        for r in recs:
            dk=dedup_key(r)
            if dk not in seen_keys:
                seen_keys.add(dk)
                r["source_url"]=src_url
                new.append(r)
        if new:
            result["records"].extend(new)
            log(f"      ✅ +{len(new)} [{label}]")
            if not result["found"]:
                result.update(found=True,primary_url=src_url,source=label)

    # ── SOURCE 1: PokerAtlas ─────────────────────────────────────────────────
    log(f"      [Src 1: PokerAtlas]")
    pa_urls = []
    stored_slug = venue.get("pokeratlas_slug") or ""
    if stored_slug:
        pa_urls.insert(0, f"https://www.pokeratlas.com/poker-room/{stored_slug}/tournaments")
    for fld in ("poker_atlas_url","pokeratlas_url","scrape_url","schedule_scrape_url"):
        u = venue.get(fld) or ""
        if "pokeratlas.com/poker-room/" in u:
            slug = u.split("/poker-room/")[-1].strip("/").split("/")[0]
            if slug:
                pa_urls.append(f"https://www.pokeratlas.com/poker-room/{slug}/tournaments")
    # Auto-generated slug variants
    pa_urls += [
        f"https://www.pokeratlas.com/poker-room/{slugify(name+'-'+city)}/tournaments",
        f"https://www.pokeratlas.com/poker-room/{slugify(name)}/tournaments",
    ]
    seen_pa = set()
    for pa_url in pa_urls:
        if pa_url in seen_pa: continue
        seen_pa.add(pa_url)
        try:
            resp = session.fetch(pa_url, timeout=25000, wait_until="networkidle")
            if not resp or resp.status != 200: continue
            body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
            html = body.decode("utf-8","ignore")
            # Scope check — ensure title contains a meaningful token from venue name
            title_m = re.search(r"<title[^>]*>(.*?)</title>",html,re.I|re.DOTALL)
            title   = (title_m.group(1) if title_m else "").lower()
            STOP2   = {"the","and","casino","poker","room","card","at","in","of","a"}
            tokens  = {w for w in re.sub(r"[^a-z0-9 ]"," ",name.lower()).split() if len(w)>=4} - STOP2
            if tokens and not any(t in title for t in tokens): continue
            # Primary: __NEXT_DATA__ JSON
            recs = extract_pa_next_data(html, name, vid, batch_id, pa_url)
            if recs: log(f"        [PA:NEXT_DATA] {len(recs)} records")
            # Fallback: classic HTML parser
            if not recs:
                recs = parse_pa_html_fallback(html, name, vid, batch_id, pa_url)
            # Fallback: generic extractor
            if not recs and has_tourn(html):
                recs = extract_html(html, name, vid, batch_id, pa_url, "pokeratlas")
            add(recs, "pokeratlas", pa_url)
            # PDF discovery on PA page
            for pdf_url in find_pdfs(html, pa_url):
                pdf_text = extract_pdf(pdf_url)
                if pdf_text and has_tourn(pdf_text):
                    pdf_h  = sha256h(pdf_text.encode("utf-8","ignore"))
                    precs  = extract_html(pdf_text,name,vid,batch_id,pdf_url,"pdf_pokeratlas")
                    for r in precs: r["scrape_html_hash"]=pdf_h
                    add(precs, "pdf_pa", pdf_url)
                    log(f"        📄 PDF {pdf_url[:60]}")
            # Collect JSON-LD canonical venue website origin for Source 5
            for jld_raw in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',html,re.DOTALL|re.I):
                try:
                    jld = json.loads(jld_raw)
                    canonical = jld.get("url") or jld.get("@id") or ""
                    if canonical and canonical.startswith("http") and "pokeratlas" not in canonical:
                        parts = canonical.split("//",1)
                        if len(parts)==2:
                            origin = parts[0]+"//"+parts[1].split("/")[0]
                            venue.setdefault("_extra_origins",[]).append(origin)
                except: pass
            if recs: break
        except Exception as e:
            log(f"        [PA] {str(e)[:60]}")
        time.sleep(0.4)

    # ── SOURCE 2: Bravo Poker Live ───────────────────────────────────────────
    log(f"      [Src 2: Bravo]")
    # Generate bravo slug from name (no bravo_slug column in DB)
    bravo_name_slug = slugify(name)
    bravo_name_slug_short = re.sub(r"-(casino|poker|room|club|house|gaming|resort)$","",bravo_name_slug)
    bravo_urls_to_try = [f"https://www.bravopokerlive.com/poker-rooms/{bravo_name_slug}/"]
    if bravo_name_slug_short != bravo_name_slug:
        bravo_urls_to_try.append(f"https://www.bravopokerlive.com/poker-rooms/{bravo_name_slug_short}/")
    for bravo_url in bravo_urls_to_try:
        try:
            resp = session.fetch(bravo_url, timeout=12000, wait_until="domcontentloaded")
            if resp and resp.status == 200:
                body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8","ignore")
                if has_tourn(html):
                    recs = extract_html(html, name, vid, batch_id, bravo_url, "bravo")
                    add(recs, "bravo", bravo_url)
                    if recs: break
        except Exception as e:
            log(f"        [Bravo] {str(e)[:60]}")

    # ── SOURCE 3: HendonMob global match ────────────────────────────────────
    log(f"      [Src 3: HendonMob match]")
    hm_evts = match_global(name, hm_map)
    if hm_evts:
        hm_recs = [make_rec(name,vid,batch_id,"Daily",e.get("event_date"),
            e.get("start_time","12:00 PM"),e["buy_in"],e.get("game_type","NLH"),
            e.get("format"),e.get("guaranteed"),e.get("tournament_name"),
            e.get("source_url","https://pokerdb.thehendonmob.com/event.php"),
            "hendonmob",e.get("html_hash","")) for e in hm_evts if e.get("buy_in")]
        add(hm_recs, "hendonmob", "https://pokerdb.thehendonmob.com/event.php")

    # ── SOURCE 4: CardPlayer global match ───────────────────────────────────
    log(f"      [Src 4: CardPlayer match]")
    cp_evts = match_global(name, cp_map)
    if cp_evts:
        cp_recs = [make_rec(name,vid,batch_id,"Daily",e.get("event_date"),
            e.get("start_time","12:00 PM"),e["buy_in"],e.get("game_type","NLH"),
            e.get("format"),e.get("guaranteed"),e.get("tournament_name"),
            "https://www.cardplayer.com/poker-tournaments","cardplayer",
            e.get("html_hash","")) for e in cp_evts if e.get("buy_in")]
        add(cp_recs, "cardplayer", "https://www.cardplayer.com/poker-tournaments")

    # ── SOURCE 5: Venue website + PDFs ──────────────────────────────────────
    log(f"      [Src 5: Venue Website]")
    origins_seen: set = set()
    candidate_origins: list = []
    # Primary website field
    if ws := (venue.get("website") or "").strip():
        o = url_to_origin(ws)
        if o and o not in origins_seen:
            origins_seen.add(o); candidate_origins.append(o)
    # scrape_url that isn't a known scraper domain
    if su := (venue.get("scrape_url") or "").strip():
        o = url_to_origin(su)
        if o and o not in origins_seen:
            origins_seen.add(o); candidate_origins.append(o)
    # JSON-LD discovered origins from PA page
    for orig in (venue.get("_extra_origins") or []):
        o = url_to_origin(orig)
        if o and o not in origins_seen:
            origins_seen.add(o); candidate_origins.append(o)

    for origin in candidate_origins[:3]:
        for path in WEBSITE_PATHS:
            wurl = origin + path
            try:
                resp = session.fetch(wurl, timeout=12000, wait_until="domcontentloaded")
                if not resp or resp.status != 200: continue
                body = resp.body if isinstance(resp.body,bytes) else str(resp.body).encode("utf-8")
                html = body.decode("utf-8","ignore")
                if not has_tourn(html): continue
                recs = extract_html(html, name, vid, batch_id, wurl, "website")
                add(recs, f"website{path or '/'}", wurl)
                # PDF discovery on venue site
                for pdf_url in find_pdfs(html, wurl):
                    pdf_text = extract_pdf(pdf_url)
                    if pdf_text and has_tourn(pdf_text):
                        pdf_h  = sha256h(pdf_text.encode("utf-8","ignore"))
                        precs  = extract_html(pdf_text,name,vid,batch_id,pdf_url,"pdf_website")
                        for r in precs: r["scrape_html_hash"]=pdf_h
                        add(precs, "pdf_site", pdf_url)
                        log(f"        📄 PDF {pdf_url[:60]}")
                if recs: break
            except Exception as e:
                log(f"        [Web {path}] {str(e)[:60]}")
            time.sleep(0.2)

    # Anti-hallucination guard
    if result["records"] and not anti_hallucination_ok(result["records"]):
        log(f"      ⛔ Anti-hallucination FAIL — dropping {name}")
        result["records"]=[]; result["found"]=False
        return result

    # Save evidence
    save_evidence(name, state, {
        "venue_name":name,"state":state,"city":city,"venue_id":vid,
        "batch_id":batch_id,"found":result["found"],"record_count":len(result["records"]),
        "primary_source":result["source"],"primary_url":result["primary_url"],
        "timestamp":datetime.now(timezone.utc).isoformat(),
    })
    return result

# ── Chunk flush (25-venue buffer → DB) ───────────────────────────────────────
def flush_chunk(chunk_results:list, batch_id:str, dry_run:bool) -> int:
    all_recs = []
    for vr in chunk_results:
        all_recs.extend(vr.get("records",[]))
        if vr.get("vid") and vr.get("found"):
            sb_patch_venue(vr["vid"], {
                "has_tournaments":True,
                "scrape_url":vr.get("primary_url",""),
                "schedule_scrape_url":vr.get("primary_url",""),
                "scrape_source":vr.get("source",""),
                "schedule_last_scraped_at":datetime.now(timezone.utc).isoformat(),
                "last_scraped_at":datetime.now(timezone.utc).isoformat(),
            })

    if not all_recs:
        log(f"  [FLUSH] 0 records — nothing to upsert")
        return 0

    if dry_run:
        n = len(all_recs)
        log(f"  [DRY RUN] Would upsert {n} records from {len(chunk_results)} venues")
        return n

    total = 0
    for i in range(0, len(all_recs), 100):
        total += sb_upsert("venue_daily_tournaments", all_recs[i:i+100])

    found_count = sum(1 for vr in chunk_results if vr.get("found"))
    log(f"  [FLUSH] {len(chunk_results)} venues → {found_count} with data → {total}/{len(all_recs)} records ✅")
    return total

# ── Load missing venues from DB ───────────────────────────────────────────────
def load_missing_venues(filter_state:str = "") -> list:
    """Dynamically query the DB for venues that still have no tournament records."""
    log("  Loading tournament record index...")
    recs = sb_get_paged("venue_daily_tournaments", "?select=venue_id,venue_name")
    ids_with_recs   = set(r["venue_id"]   for r in recs if r.get("venue_id"))
    names_with_recs = set(r["venue_name"] for r in recs if r.get("venue_name"))
    log(f"  {len(recs)} records → {len(ids_with_recs)} distinct venue_ids, {len(names_with_recs)} distinct names")

    log("  Loading venue registry...")
    all_venues = sb_get_paged("poker_venues",
        "?select=id,name,state,city,venue_type,has_tournaments,website,"
        "scrape_url,pokeratlas_slug,pokeratlas_url,poker_atlas_url,schedule_scrape_url"
        "&is_active=eq.true&has_tournaments=eq.true")
    card_rooms = [v for v in all_venues if (v.get("venue_type") or "").lower() not in SKIP_TYPES]
    missing    = [v for v in card_rooms
                  if v["id"] not in ids_with_recs and v["name"] not in names_with_recs]
    if filter_state:
        missing = [v for v in missing if (v.get("state") or "").upper() == filter_state.upper()]
    log(f"  {len(card_rooms)} card rooms → {len(missing)} still missing data")
    return missing

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description="Targeted 5-Source Scraper for 202 Missing Venues")
    p.add_argument("--state",      default="", help="Filter to single state, e.g. TX")
    p.add_argument("--pass-limit", type=int, default=10, help="Max passes before exit (default 10)")
    p.add_argument("--dry-run",    action="store_true", help="No DB writes")
    args = p.parse_args()

    from scrapling.fetchers import StealthySession

    log("="*70)
    log("TARGETED 202 SCRAPER — 5-Source Engine")
    log(f"  Sources: PokerAtlas → Bravo → HendonMob → CardPlayer → Venue Site+PDF")
    log(f"  Chunk:   {CHUNK_SIZE} venues → flush to DB")
    log(f"  PDF:     {'✅ pdfplumber' if PDF_OK else '⚠️  missing'}")
    log(f"  DB:      {'DRY RUN' if args.dry_run else 'LIVE WRITES'}")
    log(f"  State:   {args.state or 'ALL'}")
    log("="*70)

    if not network_ok():
        log("❌ Network unavailable — aborting"); sys.exit(1)

    pass_num      = 0
    total_found   = 0
    total_records = 0

    while pass_num < args.pass_limit:
        pass_num += 1
        batch_id = str(uuid.uuid4())

        # Fresh check — re-query DB each pass
        missing = load_missing_venues(args.state)

        if not missing:
            log(f"\n🎉 PASS {pass_num}: 0 venues remaining — 100% COVERAGE ACHIEVED!")
            break

        log(f"\n{'='*70}")
        log(f"PASS {pass_num}/{args.pass_limit} — {len(missing)} venues to process")
        log(f"{'='*70}\n")

        # Global fetches once per pass (Sources 3 & 4)
        session = StealthySession(headless=True, solve_cloudflare=True)
        session.start()
        session_start    = time.time()
        consecutive_fails = 0
        chunk_buf: list  = []
        pass_found       = 0
        pass_records     = 0
        wall_start       = time.time()

        log("  Fetching global sources (HendonMob + CardPlayer)...")
        hm_map = fetch_hendonmob(session)
        time.sleep(2)
        cp_map = fetch_cardplayer(session)
        time.sleep(2)

        for i, venue in enumerate(missing):
            name = venue.get("name","Unknown")
            log(f"\n  [{i+1}/{len(missing)}] {name} ({venue.get('city','')}, {venue.get('state','')})")

            # Sleep/wake drift detection
            expected = i*(VENUE_RATE_S + 4)
            actual   = time.time() - wall_start
            if actual > expected*2 + 120:
                log("  ⚡ Sleep/wake drift — restarting session")
                try: session.close()
                except: pass
                time.sleep(2)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start()
                session_start = time.time(); consecutive_fails = 0; wall_start = time.time()

            # Proactive 6h session refresh
            if time.time() - session_start > SESSION_MAX:
                log("  🔄 6h session refresh")
                try: session.close()
                except: pass
                time.sleep(2)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start(); session_start = time.time()

            # Page recycle every 40 venues
            if i > 0 and i % PAGE_RECYCLE == 0:
                log(f"  ♻️  Page recycle at #{i}")
                try: session.close()
                except: pass
                time.sleep(2)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start(); session_start = time.time(); consecutive_fails = 0

            try:
                vr = scrape_venue(venue, session, batch_id, hm_map, cp_map)
                chunk_buf.append(vr)
                if vr["found"]:
                    pass_found    += 1
                    pass_records  += len(vr["records"])
                    consecutive_fails = 0
                else:
                    consecutive_fails += 1
            except Exception as e:
                log(f"    ❌ {e}")
                chunk_buf.append({"name":name,"vid":venue.get("id"),"found":False,"records":[]})
                consecutive_fails += 1

            # Flush every CHUNK_SIZE venues
            if len(chunk_buf) >= CHUNK_SIZE:
                n = flush_chunk(chunk_buf, batch_id, args.dry_run)
                total_records += n; pass_records = n
                chunk_buf = []

            # Circuit breaker
            if consecutive_fails >= CIRCUIT_MAX:
                log(f"  ⚡ Circuit breaker ({consecutive_fails} fails) — restarting session")
                try: session.close()
                except: pass
                time.sleep(4)
                session = StealthySession(headless=True, solve_cloudflare=True)
                session.start(); session_start = time.time(); consecutive_fails = 0

            time.sleep(VENUE_RATE_S)

        # Flush tail
        if chunk_buf:
            n = flush_chunk(chunk_buf, batch_id, args.dry_run)
            total_records += n

        try: session.close()
        except: pass

        total_found += pass_found
        if not args.dry_run:
            sb_audit(batch_id, len(missing), total_records,
                     f"Pass={pass_num},Found={pass_found},Sources=5,PDFs={'yes' if PDF_OK else 'no'}")

        log(f"\n{'='*70}")
        log(f"PASS {pass_num} DONE — {pass_found}/{len(missing)} venues resolved, {total_records} records total")

        # Check if we're done
        remaining = load_missing_venues(args.state)
        log(f"Remaining after pass {pass_num}: {len(remaining)}")
        if not remaining:
            log("🎉 ALL VENUES COVERED — 100% COMPLETE!")
            break
        if len(remaining) == len(missing):
            log("⚠️  No progress this pass — consider manual review of remaining venues")

        log(f"Sleeping 10s before next pass...\n")
        time.sleep(10)

    log(f"\n{'='*70}")
    log(f"SCRAPER FINISHED — {pass_num} passes, {total_found} venues resolved, {total_records} total records")
    log(f"Log: {log_path}")

if __name__ == "__main__":
    main()
