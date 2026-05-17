import urllib.request

def test():
    print("Testing urllib.request on cardplayer feed...")
    url = "https://www.cardplayer.com/poker-news/feed"
    req = urllib.request.Request(
        url, 
        headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            body = response.read().decode('utf-8', errors='ignore')
            print(f"Status: {status}")
            print(f"Body length: {len(body)}")
            print("First 500 chars:")
            print(body[:500])
            if "<item>" in body:
                print("✅ Found items!")
    except Exception as e:
        print(f"❌ Failed: {e}")

if __name__ == "__main__":
    test()
