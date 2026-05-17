from scrapling.fetchers import StealthySession
import re

def test():
    print("Fetching cardplayer news html...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        text = resp.body.decode('utf-8', errors='ignore') if resp.body else ""
        print(f"Body length: {len(text)}")
        
        # Let's use regex to find news links: /poker-news/XXXX-title
        # Let's search for href="/poker-news/..." or href="https://www.cardplayer.com/poker-news/..."
        pattern = r'href=["\'](https://www\.cardplayer\.com/poker-news/[^"\']+|/poker-news/[^"\']+)["\']'
        links = re.findall(pattern, text)
        print(f"Found {len(links)} raw news links:")
        
        unique_links = list(set(links))
        print(f"Unique news links ({len(unique_links)}):")
        for idx, l in enumerate(sorted(unique_links)[:20]):
            print(f" {idx+1}. {l}")
            
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
