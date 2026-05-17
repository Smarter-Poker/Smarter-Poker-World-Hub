from scrapling.fetchers import StealthySession

def test():
    print("Testing scrapling StealthySession on CardPlayer HTML...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        print(f"Final URL: {resp.url}")
        print(f"Headers: {resp.headers}")
        text = resp.body.decode() if resp.body else ""
        print(f"Content Length: {len(text)}")
        if text:
            print("First 1000 chars of body:")
            print(text[:1000])
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
