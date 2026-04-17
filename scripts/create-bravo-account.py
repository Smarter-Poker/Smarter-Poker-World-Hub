#!/usr/bin/env python3
"""
CREATE BRAVO POKER LIVE ACCOUNT — via residential proxy + camoufox
===================================================================
Uses Scrapling StealthySession (camoufox) to:
  1. Solve Cloudflare Turnstile via Geonode residential proxy
  2. Navigate to Bravo's registration page
  3. Fill in email/password
  4. Submit the form
  5. Screenshot every step

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
NEW_PASS  = '215SlalomCt!'
SCREENSHOT_DIR = project_root / 'data' / 'bravo-logs'
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

# ── PROXY (dict format for Scrapling) ──
session_id = uuid.uuid4().hex[:8]
proxy_user = f'geonode_H9vRsHHED8-type-residential-country-us-session-{session_id}'
proxy_pass = 'ac5d0ee2-8e04-4d56-8445-8a7ea8f31801'
proxy_server = 'http://us.proxy.geonode.io:9000'

proxy_dict = {
    'server': proxy_server,
    'username': proxy_user,
    'password': proxy_pass,
}

print(f"📍 Proxy: us.proxy.geonode.io:9000")
print(f"📍 Sticky session: {session_id}")
print(f"📧 Email: {NEW_EMAIL}")
print()

# ── MAIN ──
from scrapling.fetchers import StealthySession

print("🔌 Starting StealthySession (headless=False so you can see)...")
session = StealthySession(headless=False, solve_cloudflare=True, proxy=proxy_dict)
session.start()

# Step 1: Solve CF
print("☁️  Solving Cloudflare Turnstile...")
try:
    resp = session.fetch('https://www.bravopokerlive.com/login/', google_search=True)
    print(f"  → Status: {resp.status}")
except Exception as e:
    print(f"❌ CF solve failed: {e}")
    try: session.close()
    except: pass
    sys.exit(1)

if resp.status != 200:
    print(f"❌ Cloudflare block — status {resp.status}")
    try: session.close()
    except: pass
    sys.exit(1)

print("✅ Cloudflare solved!")

# Step 2: Get browser page
ctx = session.context
page = ctx.new_page()

# Step 3: Go to login page and look for Register link
print("\n🔍 Looking for registration page...")
page.goto('https://www.bravopokerlive.com/login/', timeout=20000, wait_until='domcontentloaded')
time.sleep(4)
page.screenshot(path=str(SCREENSHOT_DIR / 'register_01_login.png'))
print(f"  📸 Screenshot: register_01_login.png")

content = page.content()

# Try to find Register link on the login page
register_link = None
for selector in [
    'a[href*="register"]', 'a[href*="Register"]',
    'a[href*="signup"]', 'a[href*="SignUp"]',
    'a:has-text("Register")', 'a:has-text("Sign Up")',
    'a:has-text("Create")', 'a:has-text("register")',
]:
    try:
        el = page.query_selector(selector)
        if el:
            href = el.get_attribute('href') or ''
            print(f"  Found link: {selector} → {href}")
            register_link = el
            break
    except:
        continue

if register_link:
    print("  Clicking register link...")
    register_link.click()
    time.sleep(4)
    page.screenshot(path=str(SCREENSHOT_DIR / 'register_02_form.png'))
    print(f"  📸 Screenshot: register_02_form.png")
else:
    # Try direct URLs
    print("  No register link found — trying direct URLs...")
    for url in [
        'https://www.bravopokerlive.com/register/',
        'https://www.bravopokerlive.com/Account/Register',
        'https://www.bravopokerlive.com/Account/Register/',
        'https://www.bravopokerlive.com/signup/',
    ]:
        try:
            page.goto(url, timeout=15000, wait_until='domcontentloaded')
            time.sleep(3)
            c = page.content()
            if 'Email' in c or 'email' in c:
                print(f"  ✅ Found form at: {url}")
                page.screenshot(path=str(SCREENSHOT_DIR / 'register_02_form.png'))
                break
        except Exception as e:
            print(f"  ❌ {url}: {e}")

# Step 4: Fill the form
print(f"\n📝 Filling registration form...")
page.screenshot(path=str(SCREENSHOT_DIR / 'register_03_prefill.png'))

try:
    # Find all input fields and print them for debugging
    inputs = page.query_selector_all('input')
    print(f"  Found {len(inputs)} input fields:")
    for inp in inputs:
        name = inp.get_attribute('name') or ''
        type_ = inp.get_attribute('type') or ''
        id_ = inp.get_attribute('id') or ''
        placeholder = inp.get_attribute('placeholder') or ''
        print(f"    name={name} type={type_} id={id_} placeholder={placeholder}")

    # Fill email
    for sel in ['input[name="Email"]', 'input[type="email"]', '#Email', 'input[name="email"]']:
        el = page.query_selector(sel)
        if el:
            el.fill(NEW_EMAIL)
            print(f"  ✅ Email filled via {sel}")
            break
    
    # Fill password
    pass_fields = page.query_selector_all('input[type="password"]')
    if len(pass_fields) >= 1:
        pass_fields[0].fill(NEW_PASS)
        print("  ✅ Password filled")
    if len(pass_fields) >= 2:
        pass_fields[1].fill(NEW_PASS)
        print("  ✅ Confirm password filled")
    
    # Fill username/name if present
    for sel in ['input[name="UserName"]', 'input[name="username"]', 'input[name="Name"]', 'input[name="name"]']:
        el = page.query_selector(sel)
        if el:
            el.fill('ClubArena45')
            print(f"  ✅ Username filled via {sel}")
            break
    
    page.screenshot(path=str(SCREENSHOT_DIR / 'register_04_filled.png'))
    print(f"  📸 Screenshot: register_04_filled.png")
    
    # Step 5: Submit
    print("\n🚀 Submitting registration...")
    submit = None
    for sel in [
        'button[type="submit"]', 'input[type="submit"]',
        'button:has-text("Register")', 'button:has-text("Sign Up")',
        'button:has-text("Create")', 'button:has-text("Submit")',
    ]:
        el = page.query_selector(sel)
        if el:
            submit = el
            break
    
    if submit:
        submit.click()
        print("  ⏳ Waiting for response...")
        time.sleep(8)
        page.screenshot(path=str(SCREENSHOT_DIR / 'register_05_result.png'))
        print(f"  📸 Screenshot: register_05_result.png")
        
        result_url = page.url
        result_html = page.content()
        print(f"\n  Final URL: {result_url}")
        
        # Save full HTML for debugging
        with open(SCREENSHOT_DIR / 'register_result.html', 'w') as f:
            f.write(result_html)
        
        if 'error' in result_html.lower():
            print("  ⚠️  Possible error in response — check screenshots")
        elif 'verify' in result_html.lower() or 'confirm' in result_html.lower() or 'email' in result_html.lower():
            print("  📧 Email verification probably required — check clubarena45@gmail.com")
        elif 'welcome' in result_html.lower() or 'success' in result_html.lower():
            print("  ✅ REGISTRATION SUCCESSFUL!")
        else:
            print("  ℹ️  Unknown result — check screenshots")
    else:
        print("  ❌ No submit button found")

except Exception as e:
    print(f"  ❌ Error: {e}")
    import traceback
    traceback.print_exc()

# Final screenshot
page.screenshot(path=str(SCREENSHOT_DIR / 'register_final.png'))
print(f"\n📸 Final screenshot: register_final.png")

# Keep browser open so user can see / interact manually
print("\n⏳ Keeping browser open for 30 seconds (you can interact manually)...")
print("   Close the browser or press Ctrl+C to exit early.")
try:
    time.sleep(30)
except KeyboardInterrupt:
    pass

# Cleanup
try:
    page.close()
    session.close()
except:
    pass

print("\n✅ Done. Check screenshots: data/bravo-logs/register_*.png")
