from scripts.tournament_schedule_daemon import DaemonSessionManager

sm = DaemonSessionManager()
sm.connect()
html = sm.fetch_page("https://www.pokeratlas.com/poker-room/resorts-world-las-vegas/tournaments")
print("HTML length:", len(html))
print("Preview:", html[:100])
