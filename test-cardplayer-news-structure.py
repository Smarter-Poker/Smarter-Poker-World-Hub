from scrapling.fetchers import StealthySession

def test():
    print("Fetching cardplayer news html...")
    url = "https://www.cardplayer.com/poker-news"
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    try:
        resp = session.fetch(url, google_search=True)
        print(f"Status: {resp.status}")
        
        # Let's search for elements containing news entries
        # CardPlayer typically has elements like a list of div elements
        # Let's inspect some candidate container elements
        # Usually cardplayer lists news items under a container like div.news-card, div.news_card, or within a main content column.
        # Let's look for images inside '/assets/news/' or '/poker-news/' and their parents!
        images = resp.css('img')
        print(f"Found {len(images)} images")
        
        # Let's print parent HTML of some images to see the structure of news cards
        count = 0
        for img in images:
            src = img.attrib.get('src', '')
            if src and ('news' in src or 'poker' in src or 'uploads' in src):
                count += 1
                if count <= 5:
                    print(f"\n--- Image {count} (src={src}) ---")
                    # Let's find some parent structure or check if there is an article element
                    parent = img.xpath('..')
                    if parent:
                        print("Parent tag:", parent[0].tag)
                        grandparent = parent[0].xpath('..')
                        if grandparent:
                            print("Grandparent tag:", grandparent[0].tag)
                            # Print class of grandparent
                            print("Grandparent class:", grandparent[0].attrib.get('class', ''))
                            # Print first 200 chars of HTML inside grandparent
                            # print("Grandparent HTML:", grandparent[0].html[:200])
                            
    except Exception as e:
        print(f"❌ Failed: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    test()
