from scrapling.fetchers import StealthySession

def test():
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        news_items = resp.css('.newsitem')
        if news_items:
            item = news_items[0]
            print("Selector properties and methods:")
            print(dir(item))
            
            # Let's try item.text, item.string, item.get(), item.value, item.raw_html
            # Let's print out some commonly used properties in selectolax/scrapling:
            # - text() method or property
            # - html() method or property
            # - raw_value or similar
            try:
                print("text() result:", item.text())
            except Exception as e:
                print("text() failed:", e)
                
            try:
                print("text result:", item.text)
            except Exception as e:
                print("text failed:", e)
                
            try:
                print("get() result:", item.get())
            except Exception as e:
                print("get() failed:", e)
                
            try:
                print("raw_value:", item.raw_value)
            except Exception as e:
                print("raw_value failed:", e)
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
