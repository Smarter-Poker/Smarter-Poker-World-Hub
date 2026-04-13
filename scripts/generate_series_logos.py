#!/usr/bin/env python3
"""
Poker Series Logo Generator — Batch v2.0
Generates venue-inspired logos for all poker series using Google Gemini
image generation (Nano Banana), uploads to Supabase Storage, and writes
logo_url back to DB.

Usage:
    export GOOGLE_AI_API_KEY=<your-gemini-key>
    export SUPABASE_URL=<url>
    export SUPABASE_SERVICE_ROLE_KEY=<key>
    python3 generate_series_logos.py
"""

import os, re, json, time, requests
from supabase import create_client
from io import BytesIO

# ─── Credentials — always from environment, never hardcoded ───
SUPABASE_URL     = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SERVICE_KEY      = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
GOOGLE_AI_KEY    = os.environ.get('GOOGLE_AI_API_KEY', '')  # Nano Banana (Gemini)
BUCKET           = 'series-logos'

if not SERVICE_KEY:
    raise RuntimeError('Missing SUPABASE_SERVICE_ROLE_KEY env var')
if not GOOGLE_AI_KEY:
    raise RuntimeError('Missing GOOGLE_AI_API_KEY env var (needed for Nano Banana image generation)')

sb = create_client(SUPABASE_URL, SERVICE_KEY)

# ─── Nano Banana image generation endpoint ───
# Uses Gemini 3.1 Flash Image Preview (Nano Banana 2)
GEMINI_IMAGE_URL = (
    'https://generativelanguage.googleapis.com/v1beta/models/'
    'gemini-3.1-flash-image-preview:generateContent'
)

# ─────────────────────────────────────────────────────────────────────────────
# TOUR BLOCKLIST — never generate logos for these
# ─────────────────────────────────────────────────────────────────────────────
TOUR_BLOCKLIST = ['mspt','wsop','wsopc','rgps','gcpt','lips','rough rider',
                  'wpt',' pat ','pgt','fpn','napt','cppt']

# ─────────────────────────────────────────────────────────────────────────────
# VENUE / LOCATION THEME ENGINE
# Maps keywords → visual identity for prompt generation
# ─────────────────────────────────────────────────────────────────────────────

VENUE_THEMES = {
    'hard rock':    {'palette': 'electric guitar red and black, rock music energy', 'frame': 'electric guitar fretboard border with chrome corner accents', 'bg': 'dark charcoal with red neon electric glow'},
    'horseshoe':    {'palette': 'lucky green and classic gold', 'frame': 'horseshoe arch ornate border with clover corner accents', 'bg': 'deep forest green with golden glow'},
    'mgm':          {'palette': 'Hollywood gold and legendary scarlet', 'frame': 'Art Deco gold border with lion silhouette watermark', 'bg': 'deep black with Hollywood gold spotlight'},
    'foxwoods':     {'palette': 'Mashantucket forest green and copper', 'frame': 'New England timber lodge border with geometric copper corner accents', 'bg': 'deep Connecticut forest green gradient'},
    'mohegan':      {'palette': 'Mohegan tribal burgundy and copper gold', 'frame': 'tribal geometric border with wolf totem corner medallions', 'bg': 'deep burgundy with copper tribal glow'},
    'bellagio':     {'palette': 'Italian luxury gold and marble black', 'frame': 'ornate gold filigree Italian architectural border with lion head corner medallions', 'bg': 'deep black marble with warm gold vignette'},
    'borgata':      {'palette': 'Atlantic City blue-green and steel chrome', 'frame': 'sleek modern steel border with ocean blue accent strips', 'bg': 'dark navy with Atlantic blue neon glow'},
    'rivers casino':{'palette': 'riverfront deep blue and silver chrome', 'frame': 'industrial steel border with river wave corner accents', 'bg': 'dark navy with river blue glow from below'},
    'winstar':      {'palette': 'Chickasaw Nation royal blue and gold', 'frame': 'grand architectural border with Oklahoma prairie corner accents', 'bg': 'deep royal blue with warm gold glow'},
    'seminole':     {'palette': 'Seminole Tribe vibrant patchwork colors, orange and green', 'frame': 'Seminole patchwork quilt inspired colorful geometric border', 'bg': 'deep Florida green with orange tribal accent glow'},
    'caesars':      {'palette': 'Roman Empire imperial gold and marble white', 'frame': 'Roman column and laurel wreath ornate border with Caesar coin corner medallions', 'bg': 'deep Roman marble white and imperial gold'},
    'wynn':         {'palette': 'ultra-luxury champagne gold and ivory white', 'frame': 'ultra-premium curved border with floral corner medallions', 'bg': 'deep satin black with champagne gold ultra-luxury atmosphere'},
    'venetian':     {'palette': 'Venetian canal blue and Italian gold', 'frame': 'Italian Renaissance gondola border with Venetian masks corner accents', 'bg': 'deep canal night blue with Italian Renaissance gold atmosphere'},
    'aria':         {'palette': 'modern ultra-luxury steel blue and champagne', 'frame': 'sleek modern luxury architectural border with crystalline corner accents', 'bg': 'deep modern luxury charcoal with blue-silver atmosphere'},
    'golden nugget':{'palette': 'classic casino gold and vintage Vegas neon', 'frame': 'vintage Vegas signage inspired border with golden nugget corner accents', 'bg': 'deep midnight black with vintage gold neon glow'},
    'commerce':     {'palette': 'Card room emerald green and classic ivory', 'frame': 'classic Los Angeles card room border with California sun corner accents', 'bg': 'deep felt green with warm California golden glow'},
    'bicycle':      {'palette': 'Bicycle playing card red white and blue classic', 'frame': 'vintage bicycle playing card themed border with ace of spades corner accents', 'bg': 'deep classic card room green'},
    'potawatomi':   {'palette': 'Potawatomi fire keeper orange and night black', 'frame': 'Potawatomi keeper of the fire ceremonial border with tribal fire corner accents', 'bg': 'deep ceremonial black with Potawatomi sacred orange fire glow'},
    'ameristar':    {'palette': 'Missouri riverboat deep blue and gold', 'frame': 'Missouri River steamboat riverboat border with paddle wheel corner accents', 'bg': 'deep Missouri river night blue with warm steamboat gold atmosphere'},
    'harrahs':      {'palette': 'classic casino red and casino gold', 'frame': 'classic American casino border with star-and-banner corner accents', 'bg': 'deep classic casino red with warm gold glamour'},
}

STATE_THEMES = {
    'NV': {'palette': 'Las Vegas neon multi-color on deep desert black', 'frame': 'classic casino neon sign border with playing card suit corner accents', 'bg': 'deep Nevada desert night with vibrant casino neon atmosphere'},
    'FL': {'palette': 'Florida sunshine orange and oceanic blue', 'frame': 'tropical border with palm tree and flamingo corner accents', 'bg': 'warm Florida sunset orange with palm tree silhouettes'},
    'CA': {'palette': 'California sun gold and Pacific blue', 'frame': 'California golden coast border with surf and sunshine corner accents', 'bg': 'deep Pacific blue with warm California golden sunset glow'},
    'TX': {'palette': 'Texas Lone Star deep blue and burnt orange', 'frame': 'Texas longhorn cattle drive border with lone star corner accents', 'bg': 'deep Texas sky blue with warm burnt orange lone star horizon'},
    'LA': {'palette': 'New Orleans jazz purple and gold with Mardi Gras green', 'frame': 'New Orleans wrought-iron French Quarter border with fleur-de-lis corner accents', 'bg': 'deep Louisiana bayou with jazz-age Mardi Gras purple-gold glow'},
    'MS': {'palette': 'Mississippi Deep South river blue and Spanish moss green', 'frame': 'Mississippi River steamboat border', 'bg': 'deep Southern Mississippi night with river glow'},
    'PA': {'palette': 'Philadelphia colonial blue and Liberty gold', 'frame': 'Pennsylvania steel industrial border with Liberty Bell silhouette corner accents', 'bg': 'deep urban Pennsylvania charcoal with electric Liberty blue glow'},
    'NJ': {'palette': 'Atlantic City oceanfront blue and boardwalk gold', 'frame': 'Atlantic City boardwalk steel border with ocean wave corner accents', 'bg': 'deep Atlantic blue with boardwalk vintage neon gold atmosphere'},
    'CO': {'palette': 'Colorado Rocky Mountain blue and gold', 'frame': 'Rocky Mountain ridge border with aspen leaf corner accents', 'bg': 'deep mountain Colorado blue-purple with alpine gold sunrise'},
    'MN': {'palette': 'Minnesota North Star midnight blue and gold', 'frame': 'Great Lakes border with loon and birch tree corner accents', 'bg': 'deep Minnesota lake midnight blue'},
    'WI': {'palette': 'Wisconsin dairy state forest green and gold', 'frame': 'Great Lakes border with Badger and maple corner accents', 'bg': 'deep Wisconsin lake and forest green with warm golden glow'},
    'IL': {'palette': 'Chicago urban steel blue and gold', 'frame': 'Chicago architectural border with lakefront and El train corner accents', 'bg': 'deep Chicago midnight blue with urban gold architectural glow'},
    'OK': {'palette': 'Oklahoma Cherokee nation earth and prairie sky', 'frame': 'Oklahoma native nations border with prairie wind corner accents', 'bg': 'deep Oklahoma grand prairie sky with warm earth and tribal glow'},
    'AZ': {'palette': 'Arizona desert rust and turquoise', 'frame': 'Sonoran Desert border with saguaro cactus and turquoise corner accents', 'bg': 'warm Arizona desert sunset rust-orange with southwest turquoise glow'},
}


def get_theme(series_name, venue_name, city, state):
    """Build venue/location-specific visual theme for logo prompt."""
    name_lower = (series_name or '').lower()
    venue_lower = (venue_name or '').lower()
    state_upper = (state or '').upper()

    for keyword, theme in VENUE_THEMES.items():
        if keyword in venue_lower or keyword in name_lower:
            return theme

    if state_upper in STATE_THEMES:
        return STATE_THEMES[state_upper]

    # Default Smarter.Poker metal theme
    return {
        'palette': 'neon cyan and gunmetal silver',
        'frame': 'industrial machined metal frame with corner bolt rivets and neon cyan accent strips',
        'bg': 'dark navy gunmetal with brushed metal texture'
    }


def format_guarantee(series):
    name = series.get('series_name', '')
    total = series.get('total_guaranteed')
    main = series.get('main_event_guaranteed')
    events = series.get('total_events') or series.get('event_count') or 1

    has_dollar_in_name = bool(re.search(r'\$\d+', name))

    if has_dollar_in_name and main:
        if main >= 1_000_000:
            return f"${main/1_000_000:.1f}M MAIN EVENT"
        return f"${int(main/1000)}K MAIN EVENT"
    elif total and events > 1:
        if total >= 1_000_000:
            rounded = int(total / 1_000_000) * 1_000_000
            return f"OVER ${rounded/1_000_000:.0f}M IN GUARANTEES"
        elif total >= 100_000:
            rounded = int(total / 100_000) * 100_000
            return f"OVER ${int(rounded/1000)}K IN GUARANTEES"
        elif total >= 10_000:
            rounded = int(total / 10_000) * 10_000
            return f"OVER ${int(rounded/1000)}K IN GUARANTEES"
        return f"OVER ${total:,} IN GUARANTEES"
    elif main:
        if main >= 1_000_000:
            return f"${main/1_000_000:.1f}M GTD"
        return f"${int(main/1000)}K GTD"
    return "TOURNAMENT SERIES"


def clean_name(name):
    name = (name or '').replace('&#39;', "'").replace('&amp;', '&').replace('&amp;#39;', "'")
    name = re.sub(r"[\s\-]+['']?2[0-9]{1,3}\s*$", '', name).strip()
    name = re.sub(r"\s+20[0-9]{2}\s*$", '', name).strip()
    name = re.sub(r"\s*[-–]\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s*$", '', name, flags=re.I).strip()
    return name


def build_prompt(series):
    name = clean_name(series.get('series_name', ''))
    venue = (series.get('venue_name') or '').replace('&#39;', "'").replace('&amp;', '&')
    city = series.get('city') or ''
    state = series.get('state') or ''
    location = f"{city}, {state}" if city and state else (city or state or '')
    gtd = format_guarantee(series)
    theme = get_theme(series.get('series_name',''), venue, city, state)

    venue_line = f'"{venue.upper()}"' if venue else ''
    location_line = f'"{location}"' if location else ''
    badge_style = "glowing" if "GTD" in gtd or "GUARANTEES" in gtd else "classic"

    prompt = f"""Professional poker series logo, 640x640 square format.

SERIES: "{name}"
{f'VENUE: {venue_line}' if venue_line else ''}
{f'LOCATION: {location_line}' if location_line else ''}

UNIQUE VISUAL IDENTITY — {theme['bg']}
FRAME: {theme['frame']}
COLOR PALETTE: {theme['palette']}

TEXT LAYOUT:
- "{name}" — large bold embossed chrome/metallic text, dominant center-top
{f'- {venue_line} — glowing accent color, center middle' if venue_line else ''}
{f'- {location_line} — small white text below venue' if location_line else ''}
- Bottom badge ({badge_style}): "{gtd}"
- Bottom right corner: small "SMARTER.POKER" watermark

Premium quality. Authentic venue character. NO dates. NO year numbers."""

    return prompt.strip()


def generate_logo_nano_banana(prompt):
    """Generate logo via Google Gemini Nano Banana image API."""
    url = f"{GEMINI_IMAGE_URL}?key={GOOGLE_AI_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "responseMimeType": "image/png",
        }
    }
    headers = {'Content-Type': 'application/json'}

    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise Exception(f"Gemini image error {resp.status_code}: {resp.text[:300]}")

    # Extract base64 image data from response
    import base64
    candidates = resp.json().get('candidates', [])
    for candidate in candidates:
        for part in candidate.get('content', {}).get('parts', []):
            if 'inlineData' in part:
                img_b64 = part['inlineData']['data']
                return base64.b64decode(img_b64)

    raise Exception(f"No image in Gemini response: {resp.text[:200]}")


def upload_and_save(series_id, slug, img_bytes):
    """Upload logo to Supabase Storage and update DB."""
    path = f"{slug}.png"
    try:
        sb.storage.from_(BUCKET).upload(
            path, img_bytes,
            file_options={'content-type': 'image/png', 'upsert': 'true'}
        )
    except Exception as e:
        if 'already exists' in str(e).lower() or 'Duplicate' in str(e):
            sb.storage.from_(BUCKET).update(
                path, img_bytes,
                file_options={'content-type': 'image/png'}
            )
        else:
            raise

    public_url = f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}"
    sb.table('poker_series').update({'logo_url': public_url}).eq('id', series_id).execute()
    return public_url


def slugify(text):
    text = (text or '').lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text.strip())
    text = re.sub(r'-+', '-', text)
    return text[:80]


def is_tour(name):
    n = (name or '').lower()
    return any(k in n for k in TOUR_BLOCKLIST)


def main():
    print("=" * 60)
    print("🎴 Poker Series Logo Generator — v2.0 (Nano Banana / Gemini)")
    print("=" * 60)

    progress_file = '/tmp/series_logo_progress.json'
    done_ids = set()
    if os.path.exists(progress_file):
        with open(progress_file) as f:
            done_ids = set(json.load(f).get('done', []))
        print(f"📋 Resuming — {len(done_ids)} already completed")

    all_series = []
    offset = 0
    while True:
        res = sb.table('poker_series').select(
            'id, series_name, venue_name, city, state, location, '
            'total_guaranteed, main_event_guaranteed, total_events, event_count, is_suppressed'
        ).range(offset, offset + 999).execute()
        if not res.data:
            break
        all_series.extend(res.data)
        if len(res.data) < 1000:
            break
        offset += 1000

    to_process = [
        s for s in all_series
        if not is_tour(s.get('series_name', ''))
        and not s.get('is_suppressed')
        and s['id'] not in done_ids
    ]

    print(f"📊 Total series: {len(all_series)}")
    print(f"✅ Already done: {len(done_ids)}")
    print(f"🔄 To generate: {len(to_process)}")
    print()

    success = 0
    failed = []

    for i, series in enumerate(to_process, 1):
        sid = series['id']
        name = clean_name(series.get('series_name', f'Series {sid}'))
        slug = slugify(name) or f'series-{sid}'

        print(f"[{i}/{len(to_process)}] {name} (ID:{sid})")

        try:
            prompt = build_prompt(series)
            img_bytes = generate_logo_nano_banana(prompt)
            url = upload_and_save(sid, slug, img_bytes)

            done_ids.add(sid)
            with open(progress_file, 'w') as f:
                json.dump({'done': list(done_ids)}, f)

            success += 1
            print(f"  ✅ {url}")

            # Rate limit: ~1 request/4s for Gemini
            time.sleep(4)

        except Exception as e:
            print(f"  ❌ FAILED: {e}")
            failed.append({'id': sid, 'name': name, 'error': str(e)})
            time.sleep(2)

    print()
    print("=" * 60)
    print(f"🎉 COMPLETE: {success} logos generated")
    print(f"❌ Failed: {len(failed)}")
    if failed:
        print("Failed series:")
        for item in failed:
            print(f"  [{item['id']}] {item['name']}: {item['error'][:80]}")
    print("=" * 60)


if __name__ == '__main__':
    main()
