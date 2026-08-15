#!/usr/bin/env python3
"""
CREATE BRAVO POKER LIVE ACCOUNT — via Geonode residential proxy + camoufox
===========================================================================
Uses Scrapling StealthySession to bypass Cloudflare and register an account
on Bravo Poker Live from a clean residential IP.

Usage:
  /opt/homebrew/bin/python3 scripts/create-bravo-account.py
"""

import os
import sys
import time
import uuid
from pathlib import Path
from dotenv import load_dotenv

# Load env
project_root = Path(__file__).resolve().parent.parent
for env_file in ['.env.local', '.env.production.local', '.env']:
    env_path = project_root / env_file
    if env_path.exists():
        load_dotenv(dotenv_path=env_path)
        print(f"✅ Loaded env from {env_file}")
        break

# ── CONFIG ──
NEW_EMAIL = 'clubarena45@gmail.com'
NEW_PASS  = os.environ['SMARTER_POKER_SHARED_PASSWORD']
FIRST_NAME = 'Club'
LAST_NAME = 'Arena'
SCREENSHOT_DIR = project_root / 'data' / 'bravo-logs'
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

# ── PROXY ──
session_id = uuid.uuid4().hex[:8]
proxy_dict = {
    'server': 'http://us.proxy.geonode.io:10000',
    'username': f'geonode_H9vRsHHED8-type-residential-country-us-lifetime-10-session-{session_id}',
    'password': 'ac5d0ee2-8e04-4d56-8445-8a7ea8f31801',
}

print(f"📍 Proxy: us.proxy.geonode.io:10000 (sticky session: {session_id})")
print(f"📧 Registration: {NEW_EMAIL}")
print()

# ── MAIN ──
from scrapling.fetchers import StealthySession

print("🔌 Starting StealthySession (visible browser)...")
session = StealthySession(headless=False, solve_cloudflare=True, proxy=proxy_dict)
session.start()

print("☁️  Solving Cloudflare Turnstile...")
try:
    resp = session.fetch('https://www.bravopokerlive.com/login/', google_search=True)
    print(f"  → Status: {resp.status}")
except Exception as e:
    print(f"❌ CF solve failed: {e}")
    try: session.close()
    except: pass
    sys.exit(1)

print("✅ Cloudflare solved!")

# Get browser page
ctx = session.context
page = ctx.new_page()

# Navigate directly to the register page
print("\n📝 Navigating to registration page...")
page.goto('https://www.bravopokerlive.com/register/', timeout=20000, wait_until='domcontentloaded')
time.sleep(5)
page.screenshot(path=str(SCREENSHOT_DIR / 'register_01_page.png'))
print(f"  📸 register_01_page.png")

# The Bravo register page has duplicate forms — target by FirstName which is ONLY in the register form
print("\n📝 Filling registration form (targeting register-only fields)...")
try:
    # Fill FirstName (unique to register form)
    page.fill('input#FirstName', FIRST_NAME)
    print(f"  ✅ First Name: {FIRST_NAME}")
    
    # Fill LastName
    page.fill('input#LastName', LAST_NAME)
    print(f"  ✅ Last Name: {LAST_NAME}")
    
    # For Email and Password, target the ones NEAR FirstName (3rd set on page)
    # Use the form that contains FirstName
    form = page.query_selector('form:has(input#FirstName)')
    if form:
        email_field = form.query_selector('input[name="Email"]')
        pass_field = form.query_selector('input[name="Password"]')
        eula_check = form.query_selector('input#AcceptEula[type="checkbox"]')
        submit_btn = form.query_selector('button[type="submit"], input[type="submit"]')
        
        if email_field:
            email_field.fill(NEW_EMAIL)
            print(f"  ✅ Email: {NEW_EMAIL}")
        else:
            print("  ❌ Could not find email field in registration form")
        
        if pass_field:
            pass_field.fill(NEW_PASS)
            print("  ✅ Password: filled")
        else:
            print("  ❌ Could not find password field")
        
        if eula_check:
            eula_check.check()
            print("  ✅ Accept EULA: checked")
        else:
            print("  ⚠️  No EULA checkbox found")
        
        page.screenshot(path=str(SCREENSHOT_DIR / 'register_02_filled.png'))
        print(f"  📸 register_02_filled.png")
        
        # Check for reCAPTCHA
        recaptcha = page.query_selector('iframe[src*="recaptcha"], .g-recaptcha, #RecaptchaResponse')
        if recaptcha:
            print("\n  ⚠️  reCAPTCHA DETECTED — you may need to solve it manually in the browser window!")
            print("  ⏳ Waiting 30 seconds for you to solve the CAPTCHA...")
            time.sleep(30)
        
        # Submit
        print("\n🚀 Submitting registration...")
        if submit_btn:
            submit_btn.click()
        else:
            # Try pressing Enter on the password field
            pass_field.press('Enter')
        
        time.sleep(8)
        page.screenshot(path=str(SCREENSHOT_DIR / 'register_03_result.png'))
        print(f"  📸 register_03_result.png")
        
        result_url = page.url
        result_html = page.content()
        print(f"\n  Final URL: {result_url}")
        
        # Save HTML for debugging
        with open(SCREENSHOT_DIR / 'register_result.html', 'w') as f:
            f.write(result_html)
        
        if 'error' in result_html.lower() and 'already' in result_html.lower():
            print("  ⚠️  Account may already exist")
        elif 'verify' in result_html.lower() or 'confirmation' in result_html.lower():
            print("  📧 Email verification required — check clubarena45@gmail.com")
        elif 'welcome' in result_html.lower():
            print("  ✅ REGISTRATION SUCCESSFUL!")
        elif 'recaptcha' in result_html.lower() or 'captcha' in result_html.lower():
            print("  ❌ reCAPTCHA blocked submission — needs manual solve")
        else:
            print("  ℹ️  Check screenshots for result")
    else:
        print("  ❌ Could not find registration form (form:has(input#FirstName))")
        # Fallback: list all forms
        forms = page.query_selector_all('form')
        print(f"  Found {len(forms)} forms on page")

except Exception as e:
    print(f"\n  ❌ Error: {e}")
    import traceback
    traceback.print_exc()
    page.screenshot(path=str(SCREENSHOT_DIR / 'register_error.png'))

# Keep browser open for manual interaction
print("\n⏳ Browser staying open for 60 seconds — you can interact manually if needed.")
print("   Press Ctrl+C to exit early.")
try:
    time.sleep(60)
except KeyboardInterrupt:
    pass

try:
    page.close()
    session.close()
except:
    pass

print("\n✅ Done. Screenshots in data/bravo-logs/register_*.png")
