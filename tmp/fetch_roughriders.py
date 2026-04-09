import os
import sys
import urllib.request
from pathlib import Path
from dotenv import load_dotenv

project_root = Path(__file__).resolve().parent.parent
load_dotenv(project_root / '.agent' / 'skills' / 'credentials' / '.env')

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
BUCKET = 'venue-logos'

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

# Rough Riders Logo
RR_IMG = "https://roughriderpokertour.com/wp-content/uploads/2024/12/rpt-logo-1-1.webp"

try:
    print("Downloading Rough Riders...")
    req = urllib.request.Request(RR_IMG, headers={'User-Agent': 'Mozilla/5.0'})
    img_data = urllib.request.urlopen(req).read()
    if upload_to_supabase(img_data, 3116):
        print("  ✅ Uploaded Rough Riders (3116)")
    else:
        print("  ❌ Failed Rough Riders")
except Exception as e:
    print(f"Failed: {e}")
