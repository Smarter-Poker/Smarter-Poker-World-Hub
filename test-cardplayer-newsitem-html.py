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
        
        # Let's inspect the exact HTML of the first item
        if news_items:
            # resp.css() returns elements where we can get the underlying element or get its HTML
            # In scrapling, we can get the HTML of an adaptor element using .html or .get()
            item = news_items[0]
            print("\n--- Inner HTML ---")
            # In scrapling, the adaptor has an `html` property
            print(item.html[:2000])
            
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
