import os
import sys
import json
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

project_root = Path(__file__).resolve().parent.parent
load_dotenv(project_root / '.agent' / 'skills' / 'credentials' / '.env')

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BUCKET = 'venue-logos'

VENUES = [
    (2633, "https://thelodgepokerclub.com"),
    (3116, "https://roughriderpokertour.com"),
]

# For Ameristar, we'll download directly from Wikipedia
AMERISTAR_IMG = "https://upload.wikimedia.org/wikipedia/en/thumb/5/5e/Ameristar_Casinos_logo.svg/512px-Ameristar_Casinos_logo.svg.png"

def upload_to_supabase(image_data, venue_id):
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{venue_id}.png"
    req = urllib.request.Request(url, data=image_data, method='POST')
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Content-Type', 'image/png')
    req.add_header('x-upsert', 'true')
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        return resp.status == 200
    except Exception as e:
        print(f"Upload error: {e}")
        return False

# Download Ameristar
try:
    print("Downloading Ameristar...")
    req = urllib.request.Request(AMERISTAR_IMG, headers={'User-Agent': 'Mozilla/5.0'})
    img_data = urllib.request.urlopen(req).read()
    if upload_to_supabase(img_data, 2660):
        print(f"  ✅ Uploaded Ameristar (2660)")
    else:
        print("  ❌ Failed Ameristar")
except Exception as e:
    print(f"Failed Ameristar: {e}")

# We will run the V2 scraper's logic for The Lodge and Roughrider by just invoking it
