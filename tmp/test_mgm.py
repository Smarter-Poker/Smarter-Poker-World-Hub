import sys, importlib.util

spec = importlib.util.spec_from_file_location('daemon', 'scripts/tournament-schedule-daemon.py')
daemon = importlib.util.module_from_spec(spec)
sys.modules['daemon'] = daemon
spec.loader.exec_module(daemon)

sm = daemon.DaemonSessionManager()
res = sm.connect()

url = "https://www.pokeratlas.com/poker-room/mgm-national-harbor-oxon-hill/tournaments"
html_idle = sm.fetch_page(url, timeout=25000, wait_until="networkidle")
html_raw = sm.fetch_page(url, timeout=12000)

print("IDLE next:", '__NEXT_DATA__' in html_idle)
print("RAW next:", '__NEXT_DATA__' in html_raw)
