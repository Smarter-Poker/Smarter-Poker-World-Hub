from scrapling.fetchers import StealthySession

def test():
    print("Fetching cardplayer news html...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        
        # Select .newsitem elements
        news_items = resp.css('.newsitem')
        print(f"Found {len(news_items)} .newsitem elements:")
        
        for idx, item in enumerate(news_items[:5]):
            print(f"\n--- Article {idx+1} ---")
            
            # Print HTML structure of the item
            # Let's inspect links, images, text inside
            links = item.css('a')
            images = item.css('img')
            
            print(f"Links found: {len(links)}")
            for l in links[:2]:
                print(f"  Link: href=\"{l.attrib.get('href', '')}\" text=\"{l.text.strip()}\"")
                
            print(f"Images found: {len(images)}")
            for img in images[:2]:
                print(f"  Img: src=\"{img.attrib.get('src', '')}\" alt=\"{img.attrib.get('alt', '')}\"")
                
            # Get text description or info
            info = item.css('.newsinfo')
            if info:
                print(f"  Info text: {info[0].text.strip()[:150]}...")
            else:
                print(f"  Item text: {item.text.strip()[:150]}...")
                
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
