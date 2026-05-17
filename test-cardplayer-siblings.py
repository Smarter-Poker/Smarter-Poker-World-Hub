from scrapling.fetchers import StealthySession

def test():
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        # Let's inspect the first newsitem's siblings
        news_items = resp.css('.newsitem')
        if news_items:
            # Let's print out the siblings of news_items[0]
            parent = news_items[0].parent
            print("Parent tag class:", parent.attrib.get('class', ''))
            
            # Let's print out the first 10 children of parent to see the structure of the list
            print("\nChildren of parent:")
            children = parent.children
            for idx, child in enumerate(children[:15]):
                tag = child.tag
                cls = child.attrib.get('class', '') if child.attrib else ''
                print(f" {idx+1}. Tag: <{tag}> Class: \"{cls}\"")
                # If the tag is not 'newsitem' or similar, let's print its text
                if 'newsitem' not in cls and child.text:
                    print(f"    Text: {child.text.strip()[:100]}")
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
