from scrapling.fetchers import StealthySession

def test():
    url = "https://www.cardplayer.com/poker-news/1660093-maurice-hawkins-captures-record-25th-wsop-circuit-ring"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        
        # Let's search for date elements
        # Usually cardplayer details have author and publication date at the top of the article.
        # Let's print out all texts containing "May" or "2026" or check divs with classes like .date, .time, .author, .post-meta, .meta
        divs = resp.css('div')
        print(f"Found {len(divs)} divs")
        for div in divs:
            cls = div.attrib.get('class', '')
            if any(k in cls for k in ['meta', 'date', 'author', 'time', 'publish']):
                print(f"Class: \"{cls}\" Text: \"{div.text.strip()}\"")
                
        # Let's search inside spans
        spans = resp.css('span')
        print(f"Found {len(spans)} spans")
        for span in spans:
            cls = span.attrib.get('class', '')
            if any(k in cls for k in ['meta', 'date', 'author', 'time', 'publish']) or '2026' in span.text:
                print(f"Span Class: \"{cls}\" Text: \"{span.text.strip()}\"")
                
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
