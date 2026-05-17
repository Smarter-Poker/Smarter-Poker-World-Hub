from scrapling.fetchers import StealthySession

def test():
    print("Fetching cardplayer news html...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        
        news_items = resp.css('.newsitem')
        print(f"Found {len(news_items)} .newsitem elements:")
        
        for idx, item in enumerate(news_items[:3]):
            print(f"\n--- Article {idx+1} ---")
            print("Full text:")
            print(repr(item.text.strip()))
            
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
