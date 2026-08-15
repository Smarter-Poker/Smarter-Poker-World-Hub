import os
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        # Launch headful just in case Gemini blocks headless
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        page.goto("https://gemini.google.com/share/af81a6c10d9c")
        
        time.sleep(5)
        
        if "signin" in page.url.lower() or "ServiceLogin" in page.url:
            print("Need to sign in...")
            try:
                page.fill("input[type='email']", "SMARTERPOKER45@GMAIL.COM")
                page.click("#identifierNext")
                time.sleep(3)
                page.fill("input[type='password']", os.environ["SMARTER_POKER_SHARED_PASSWORD"])
                page.click("#passwordNext")
                time.sleep(10)
                print("Current URL after login:", page.url)
            except Exception as e:
                print("Login error:", e)
        
        # Go back to the share link if login redirected elsewhere
        if "share/af81a6c" not in page.url:
            print("Going specifically to the shared link...")
            page.goto("https://gemini.google.com/share/af81a6c10d9c")
            time.sleep(10)
        
        # Don't wait for networkidle, just wait for a known selector or sleep
        time.sleep(5)
        
        # Get content
        content = page.locator("body").inner_text()
        with open("/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/tmp/gemini_report.txt", "w", encoding="utf-8") as f:
            f.write(content)
        
        print("Done. Saved bytes:", len(content))
        browser.close()

if __name__ == "__main__":
    run()
