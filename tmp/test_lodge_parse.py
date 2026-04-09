import sys, importlib.util

spec = importlib.util.spec_from_file_location('daemon', 'scripts/tournament-schedule-daemon.py')
daemon = importlib.util.module_from_spec(spec)
sys.modules['daemon'] = daemon
spec.loader.exec_module(daemon)

sm = daemon.DaemonSessionManager()
res = sm.connect()
url = "https://www.pokeratlas.com/poker-room/lodge-card-club-austin-round-rock/tournaments"
html = sm.fetch_page(url, timeout=25000, wait_until="networkidle")

with open("tmp/lodge.html", "w") as f: f.write(html)
