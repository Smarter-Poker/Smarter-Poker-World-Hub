#!/usr/bin/env python3
"""
PROXY BROWSER — Open any URL through the Geonode residential proxy via camoufox.
=================================================================================
Opens a visible camoufox browser routed through the proxy. You can use it to:
  - Verify Bravo email (log into Gmail, click verify link)
  - Create accounts on any site from a residential IP
  - Browse any site through the proxy

Usage:
  /opt/homebrew/bin/python3 scripts/proxy-browser.py
  /opt/homebrew/bin/python3 scripts/proxy-browser.py "https://mail.google.com"
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
        break

# Default URL or from command line
start_url = sys.argv[1] if len(sys.argv) > 1 else 'https://mail.google.com'

# ── PROXY ──
session_id = uuid.uuid4().hex[:8]
proxy_dict = {
    'server': 'http://us.proxy.geonode.io:10000',
    'username': f'geonode_H9vRsHHED8-type-residential-country-us-lifetime-10-session-{session_id}',
    'password': 'ac5d0ee2-8e04-4d56-8445-8a7ea8f31801',
}

print(f"🌐 Proxy Browser — everything goes through residential IP")
print(f"📍 Proxy: us.proxy.geonode.io:10000 (session: {session_id})")
print(f"🔗 Opening: {start_url}")
print()

from scrapling.fetchers import StealthySession

print("🔌 Launching camoufox browser through proxy...")
session = StealthySession(headless=False, solve_cloudflare=False, proxy=proxy_dict)
session.start()

ctx = session.context
page = ctx.new_page()

# First verify our IP
page.goto('https://httpbin.org/ip', timeout=15000)
time.sleep(2)
ip_text = page.inner_text('body')
print(f"✅ Your proxy IP: {ip_text.strip()}")

# Navigate to the requested URL
print(f"\n🔗 Navigating to {start_url}...")
page.goto(start_url, timeout=30000, wait_until='domcontentloaded')

print(f"\n✅ Browser is open! Do what you need:")
print(f"   - Log into Gmail")
print(f"   - Find the Bravo verification email")
print(f"   - Click the verify link")
print(f"   - Everything goes through the residential proxy")
print(f"\n⏳ Browser will stay open for 5 minutes.")
print(f"   Press Ctrl+C when you're done.")

try:
    time.sleep(300)  # 5 minutes
except KeyboardInterrupt:
    print("\n👋 Closing browser...")

try:
    page.close()
    session.close()
except:
    pass

print("✅ Done.")
