from scrapling.fetchers import StealthySession

def test():
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        context = session.context
        pages = context.pages
        print("All pages URLs:")
        for idx, p in enumerate(pages):
            print(f" Page {idx}: {p.url}")
            
        if pages:
            # Let's use the exact page that is on cardplayer.com!
            target_page = None
            for p in pages:
                if "cardplayer.com" in p.url:
                    target_page = p
                    break
            
            if not target_page:
                target_page = pages[0]
                
            print(f"Targeting page: {target_page.url}")
            
            # Since targeting page URL is absolute (e.g. https://www.cardplayer.com/poker-news),
            # we should pass the absolute URL to fetch!
            js_code = """
            async () => {
                try {
                    const response = await fetch('https://www.cardplayer.com/poker-news.rss');
                    const text = await response.text();
                    return { success: true, status: response.status, length: text.length, content: text };
                } catch (e) {
                    return { success: false, error: e.toString() };
                }
            }
            """
            result = target_page.evaluate(js_code)
            print("JS Fetch Result:")
            print({k: v if k != 'content' else v[:200] for k, v in result.items()})
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
