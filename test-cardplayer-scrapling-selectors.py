from scrapling.fetchers import StealthySession

def test():
    print("Fetching cardplayer news html...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        
        # Scrapling response objects (Adaptors) support BeautifulSoup-like or CSS selectors directly!
        # Let's inspect what attributes resp has
        print("Response attributes:")
        print(dir(resp))
        
        # Let's try CSS selectors
        # Usually, news items are in containers like .news-card, .poker-news-item, or inside div structures.
        # Let's look for div structures with news articles.
        # CardPlayer news items are typically in divs with class "news-card" or "article" or "item".
        # Let's find elements matching 'div.news-card' or 'div.article' or 'div.news_card' or 'div.news-item'
        # We can also check if we can select 'a' tags directly.
        links = resp.css('a')
        print(f"Found {len(links)} links via CSS selector")
        
        # Let's print out the text and href of the first 20 links that contain '/poker-news/'
        news_count = 0
        for link in links:
            href = link.attrib.get('href', '')
            if href and '/poker-news/' in href:
                text = link.text.strip()
                if text and len(text) > 15:
                    news_count += 1
                    print(f"[{news_count}] Title: \"{text}\"")
                    print(f"      Link: {href}")
                    
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
