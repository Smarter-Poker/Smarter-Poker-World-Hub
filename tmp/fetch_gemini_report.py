import os
from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        # We can try headful if headless fails, but let's try headless first
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        print("Navigating to Gemini share link...")
        page.goto("https://gemini.google.com/share/af81a6c10d9c")
        
        time.sleep(2)
        # Check if we need to sign in
        if "ServiceLogin" in page.url or "signin" in page.url:
            print("Need to sign in...")
            page.fill("input[type='email']", "SMARTERPOKER45@GMAIL.COM")
            page.click("#identifierNext")
            page.wait_for_selector("input[type='password']", state="visible")
            time.sleep(1)
            page.fill("input[type='password']", os.environ["SMARTER_POKER_SHARED_PASSWORD"])
            page.click("#passwordNext")
            
            # Wait for login to complete or 2FA
            time.sleep(8)
            print("Current URL after login:", page.url)

            # Might need to navigate again to the share link if it didn't redirect
            if "share/af81a6c10d9c" not in page.url:
                print("Redirecting back to share link...")
                page.goto("https://gemini.google.com/share/af81a6c10d9c")
                time.sleep(5)
        
        page.wait_for_load_state("networkidle")
        time.sleep(3) # Extra wait for rendering
        
        print("Extracting content...")
        # Try to find the specific chat element to avoid unnecessary UI text
        # usually gemini responses are in specific tags, but body innerText works too
        content = page.locator("body").inner_text()
        with open("/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/tmp/gemini_report.txt", "w", encoding="utf-8") as f:
            f.write(content)
        
        print("Report extracted successfully.")
        browser.close()

if __name__ == "__main__":
    run()
