import os
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://gemini.google.com/share/27921ca78fe2")
        time.sleep(8)
        
        if "signin" in page.url.lower() or "ServiceLogin" in page.url:
            print("Need to sign in...")
            try:
                page.fill("input[type='email']", "SMARTERPOKER45@GMAIL.COM")
                page.click("#identifierNext")
                time.sleep(3)
                page.fill("input[type='password']", os.environ["SMARTER_POKER_SHARED_PASSWORD"])
                page.click("#passwordNext")
                time.sleep(10)
            except Exception as e:
                print("Login error:", e)
            if "share/27921ca78fe2" not in page.url:
                page.goto("https://gemini.google.com/share/27921ca78fe2")
                time.sleep(10)

        time.sleep(5)
        
        # Scroll to the very bottom to ensure all content is loaded
        prev_height = 0
        for _ in range(30):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1)
            curr_height = page.evaluate("document.body.scrollHeight")
            if curr_height == prev_height:
                break
            prev_height = curr_height
        
        content = page.locator("body").inner_text()
        with open("/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/tmp/gemini_report2.txt", "w", encoding="utf-8") as f:
            f.write(content)
        
        print(f"Done. Saved {len(content)} bytes.")
        browser.close()

if __name__ == "__main__":
    run()
