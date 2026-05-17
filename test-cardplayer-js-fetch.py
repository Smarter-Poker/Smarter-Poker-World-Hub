from scrapling.fetchers import StealthySession

def test():
    print("Fetching cardplayer homepage to solve cloudflare...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Homepage status: {resp.status}")
        
        # Now let's execute JS fetch for the RSS feed!
        print("Executing browser JS fetch for poker-news.rss...")
        js_code = """
        async () => {
            try {
                const response = await fetch('/poker-news.rss');
                const text = await response.text();
                return { success: true, status: response.status, length: text.length, content: text };
            } catch (e) {
                return { success: false, error: e.message };
            }
        }
        """
        # In scrapling, we can evaluate JS on the page using session.page.evaluate() or session.evaluate()
        # Let's check which one exists. Usually StealthySession has a .page property which is the Playwright page!
        page = session.page
        result = page.evaluate(js_code)
        
        print("JS Fetch Result:")
        print(f"Success: {result.get('success')}")
        print(f"Status: {result.get('status')}")
        print(f"Length: {result.get('length')}")
        if result.get('success'):
            content = result.get('content', '')
            print("First 500 chars of RSS content:")
            print(content[:500])
            if "<item>" in content:
                print(f"✅ SUCCESS! Found {content.count('<item>')} items!")
        else:
            print(f"❌ Error: {result.get('error')}")
            
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
