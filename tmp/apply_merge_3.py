import os, re

FILE_PATH = "/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/scripts/tournament-schedule-daemon.py"

with open(FILE_PATH, "r") as f:
    content = f.read()

# 1. Expand anti-hallucination engine
new_anti = """
def anti_hallucination_ok(records: list) -> bool:
    if len(records) < 3: return True
    buyins = [r["buy_in"] for r in records if r.get("buy_in")]
    if len(buyins) >= 5 and sum(1 for b in buyins if b%100==0)/len(buyins) > 0.95:
        return False
    slots = [f"{r.get('day_of_week')}-{r.get('event_date')}-{r.get('start_time')}" for r in records]
    if len(slots) > 5 and len(set(slots)) == 1: return False
    
    # Layer 5: Detect fake casino phones leaking into names
    for r in records:
        text = str(r.get('tournament_name', '')).strip()
        if text.endswith('5555') or text.endswith('0000'): return False
    return True
"""
content = re.sub(r'def anti_hallucination_ok.*?return True\n', lambda m: new_anti, content, flags=re.DOTALL)

# 2. Inject resilient Session Manager
session_mgr_code = """
import subprocess, threading

def _network_available():
    try:
        req = urllib.request.Request('https://1.1.1.1', method='HEAD')
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception: return False

def _kill_zombie_browsers():
    my_pid = os.getpid()
    def _kill_tree(parent_pid):
        try:
            res = subprocess.run(['pgrep', '-P', str(parent_pid)], capture_output=True, text=True, timeout=5)
            if res.stdout.strip():
                for c in res.stdout.strip().split():
                    _kill_tree(c)
            subprocess.run(['kill', '-9', str(parent_pid)], capture_output=True, timeout=2)
        except: pass
    try:
        res = subprocess.run(['pgrep', '-P', str(my_pid)], capture_output=True, text=True, timeout=5)
        if res.stdout.strip():
            for child in res.stdout.strip().split():
                try:
                    ps = subprocess.run(['ps', '-o', 'command=', '-p', child], capture_output=True, text=True, timeout=3)
                    if 'chromedriver' in ps.stdout.lower() or 'chromium' in ps.stdout.lower() or 'camoufox' in ps.stdout.lower():
                        _kill_tree(child)
                except: pass
    except: pass

def _hard_kill_on_hang(msg):
    os._exit(1)

class DaemonSessionManager:
    def __init__(self):
        self.session = None
        self._session_dead = False
        self.consecutive_fetch_failures = 0
        self.last_connect_time = None
        
    def connect(self):
        from scrapling.fetchers import StealthySession
        self.disconnect()
        _kill_zombie_browsers()
        if not _network_available(): return False
        wd = threading.Timer(60, _hard_kill_on_hang, args=('connect() hung',))
        wd.daemon = True; wd.start()
        try:
            self.session = StealthySession(headless=True, solve_cloudflare=True)
            self.session.start()
            self.last_connect_time = datetime.now(timezone.utc)
            self._session_dead = False
            self.consecutive_fetch_failures = 0
            wd.cancel()
            return True
        except:
            wd.cancel()
            self.disconnect()
            return False

    def ensure_connected(self):
        if not self.session or self._session_dead or self.consecutive_fetch_failures >= 3:
            return self.connect()
        if self.last_connect_time and (datetime.now(timezone.utc) - self.last_connect_time).total_seconds() > 3600:
            return self.connect()
        return True

    def disconnect(self):
        try:
            if self.session: self.session.close()
        except: pass
        finally:
            self.session = None; self._session_dead = False

    def fetch_page(self, url, html_only=True):
        try:
            resp = self.session.fetch(url, google_search=False)
            if getattr(resp, 'status', 0) != 200:
                html = resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
                if 'Just a moment' in str(html) or 'security verification' in str(html):
                    if self.connect():
                        resp = self.session.fetch(url, google_search=True)
                        if getattr(resp, 'status', 0) != 200: return ''
                    else: return ''
                else: return ''
            self.consecutive_fetch_failures = 0
            if html_only:
                return resp.html_content or (resp.body.decode('utf-8','ignore') if getattr(resp,'body',None) else '')
            return resp
        except Exception as e:
            msg = str(e).lower()
            self.consecutive_fetch_failures += 1
            if 'has been closed' in msg or 'target page' in msg or ('timeout' in msg and self.consecutive_fetch_failures >= 3):
                self._session_dead = True
            return ''
"""

content = re.sub(r'def new_session\(\):.*?return s\n', lambda m: session_mgr_code, content, flags=re.DOTALL)

# 3. Main loop and scrape_venue adaptions
main_fix = """
    session_mgr = DaemonSessionManager()
    session_mgr.connect()
    
    if args.enrich:
        run_enrichment_pass(args.dry_run)
        sys.exit(0)
"""
content = re.sub(r'    session=new_session\(\)\s*if args\.enrich:\s*run_enrichment_pass\(args\.dry_run\)\s*sys\.exit\(0\)', lambda m: main_fix, content)

main_fix_2 = """
            try:
                session_mgr.ensure_connected()
                vr=scrape_venue(venue,session_mgr,batch_id,hm_map,cp_map)
"""
content = re.sub(r'            try:\n                vr=scrape_venue\(venue,session,batch_id,hm_map,cp_map\)', lambda m: main_fix_2, content)

# 4. In run_enrichment_pass
enrich_fix = """
    session_mgr = DaemonSessionManager()
    session_mgr.connect()
    batch_id = str(uuid.uuid4())
    ok = 0
    for i, vrow in enumerate(targets):
        try:
            session_mgr.ensure_connected()
            res = scrape_venue(v_dict, session_mgr, batch_id, hm_map={}, cp_map={})
"""
content = re.sub(r'    session = new_session\(\)\n    batch_id = str\(uuid.uuid4\(\)\)\n    ok = 0\n    for i, vrow in enumerate\(targets\):\n.*?try:\n            res = scrape_venue\(v_dict, session, batch_id, hm_map=\{\}, cp_map=\{\}\)', lambda m: enrich_fix, content, flags=re.DOTALL)

with open(FILE_PATH, "w") as f:
    f.write(content)
