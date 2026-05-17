import xml.etree.ElementTree as ET
from scrapling.fetchers import StealthySession

def test():
    print("Fetching PokerNews RSS...")
    url = "https://www.pokernews.com/rss.php"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        text = resp.body.decode('utf-8', errors='ignore') if resp.body else ""
        print(f"Length: {len(text)}")
        
        # Parse XML
        root = ET.fromstring(text)
        channel = root.find('channel')
        items = channel.findall('item')
        print(f"Found {len(items)} items in PokerNews RSS:")
        for idx, item in enumerate(items[:5]):
            title = item.find('title').text
            link = item.find('link').text
            pubDate = item.find('pubDate').text
            print(f" {idx+1}. {title} ({pubDate})")
            
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
