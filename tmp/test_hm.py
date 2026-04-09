import sys, importlib.util

spec = importlib.util.spec_from_file_location('daemon', 'scripts/tournament-schedule-daemon.py')
daemon = importlib.util.module_from_spec(spec)
sys.modules['daemon'] = daemon
spec.loader.exec_module(daemon)

sm = daemon.DaemonSessionManager()
res = sm.connect()

url = "https://pokerdb.thehendonmob.com/event.php?a=l&d=09&m=04&y=2026&weeks=10&l=&t=&buyin_cur=USD&buyin_crit=l&buyin_l=&location=country&c=USA&city_distance=0&city="
html = sm.fetch_page(url, timeout=25000, google_search=True)
print("HTML len:", len(html))
print("Has tr:", 'tr' in html)
