#!/usr/bin/env python3
"""
send_sms_alert.py
━━━━━━━━━━━━━━━━━━━━━━━━━━
Secure, dependency-free wrapper for the Twilio SMS API.
Fires automated text messages to a human when the 3-day proxy fails.

Required Environment Variables:
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_FROM_NUMBER
  MY_PHONE_NUMBER
"""

import os
import sys
import json
import urllib.request
import urllib.parse
import base64

def send_alert():
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_num = os.environ.get("TWILIO_FROM_NUMBER")
    to_num = os.environ.get("MY_PHONE_NUMBER")

    # If any of the env vars are missing, we gracefully exit instead of crashing the pipeline
    if not all([sid, token, from_num, to_num]):
        print("⚠️  SMS ALERTS INACTIVE: Missing Twilio Environment Secrets. (Add them to GitHub Repository Secrets)")
        sys.exit(0)

    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    
    # Accept failure message parameter from CLI
    msg_detail = sys.argv[1] if len(sys.argv) > 1 else "Unknown Error"
    
    body = (
        f"🚨 POKER HUB ALERT 🚨\n\n"
        f"The 3-Day Autonomous Scraping Pipeline experienced a failure.\n\n"
        f"Step Failed: {msg_detail}\n"
        f"Please check the GitHub Actions panel!"
    )

    data = urllib.parse.urlencode({
        "To": to_num,
        "From": from_num,
        "Body": body
    }).encode("utf-8")

    auth_str = f"{sid}:{token}"
    b64_auth = base64.b64encode(auth_str.encode("utf-8")).decode("utf-8")

    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", f"Basic {b64_auth}")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        urllib.request.urlopen(req, timeout=10)
        print("✅ SMS Alert Triggered Successfully!")
    except Exception as e:
        print(f"❌ Failed to send SMS via Twilio: {e}")
        # We don't exit 1 here to avoid throwing an error within the error trap block
        sys.exit(0)

if __name__ == "__main__":
    send_alert()
