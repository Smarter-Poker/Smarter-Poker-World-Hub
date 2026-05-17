from scrapling.fetchers import StealthySession

def test():
    print("Fetching cardplayer news html...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        
        # Let's inspect unique class names on all divs
        divs = resp.css('div')
        print(f"Found {len(divs)} divs")
        classes = set()
        for div in divs:
            cls = div.attrib.get('class', '')
            if cls:
                for c in cls.split():
                    classes.add(c)
        
        print("Sample classes found:")
        print(sorted(list(classes))[:100])
        
        # CardPlayer news items are often inside list items 'li' or inside specific divs.
        # Let's inspect 'li' or other tags.
        lis = resp.css('li')
        print(f"Found {len(lis)} lis")
        
        # Let's check articles
        articles = resp.css('article')
        print(f"Found {len(articles)} articles")
        
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
