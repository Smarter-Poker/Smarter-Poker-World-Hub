import sys, importlib.util
spec = importlib.util.spec_from_file_location('daemon', 'scripts/tournament-schedule-daemon.py')
daemon = importlib.util.module_from_spec(spec)
sys.modules['daemon'] = daemon
spec.loader.exec_module(daemon)

sm = daemon.DaemonSessionManager()
sm.connect()
url = "https://www.pokeratlas.com/poker-room/the-lodge-poker-club-round-rock/tournaments"

kwargs = {'timeout': 25000, 'wait_until': 'networkidle'}
resp = sm.session.fetch(url, google_search=False, **kwargs)
print("status:", resp.status)
h_c = getattr(resp, 'html_content', None)
b = getattr(resp, 'body', None)

print("html_content is None?", h_c is None, "type:", type(h_c))
print("body is None?", b is None, "type:", type(b))

if h_c is not None:
    print("len html_content:", len(h_c))
if b is not None:
    print("len body:", len(b))

html = sm.fetch_page(url, **kwargs)
print("sm.fetch_page len:", len(html))
