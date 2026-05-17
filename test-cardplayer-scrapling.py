import sys
import time
from scrapling.fetchers import StealthySession

def test():
    print("Testing scrapling StealthySession on CardPlayer RSS...")
    url = "https://www.cardplayer.com/poker-news.rss"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        text = resp.text
        print(f"Content Length: {len(text)}")
        print("First 500 chars of response:")
        print(text[:500])
        
        # Check if it has items
        if "<item>" in text:
            items = text.split("<item>")
            print(f"✅ Success! Found {len(items)-1} items!")
        else:
            print("❌ No items found in response.")
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
