import sys
import os
import json
import logging

sys.path.append(os.path.join(os.path.dirname(__file__), '../scripts'))

try:
    from scrapling.fetchers import StealthySession
    import pokeratlas_live_daemon as daemon
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

def test_illinois():
    mgr = daemon.PokerAtlasSessionManager()
    if mgr.connect():
        print("Connected to StealthySession")
        url = "https://www.pokeratlas.com/poker-cash-games/illinois"
        html = mgr.fetch_with_fallback(url, expected_slug='illinois')
        if html and html != 'REDIRECT':
            print("Fetched HTML, parsing...")
            venues, rhash, now = daemon.extract_games_from_region(html, 'illinois')
            print(json.dumps(venues, indent=2))
        else:
            print("Failed to fetch or redirected:", html)
        mgr.disconnect()
    else:
        print("Failed to connect")

if __name__ == "__main__":
    test_illinois()
