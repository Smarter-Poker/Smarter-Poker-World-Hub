#!/usr/bin/env python3
"""
Poker Series Logo Generator — Batch v3.0
Uses Grok Aurora (xAI), uploads to Supabase Storage, writes logo_url to DB.
Resumes from /tmp/series_logo_progress.json if interrupted.
"""

import os, re, json, time, requests, base64
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local')

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', 'https://kuklfnapbkmacvwxktbh.supabase.co')
SERVICE_KEY  = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
XAI_KEY      = os.environ.get('XAI_API_KEY', '') or os.environ.get('GROK_API_KEY', '')
BUCKET       = 'series-logos'

if not SERVICE_KEY: raise RuntimeError('Missing SUPABASE_SERVICE_ROLE_KEY')
if not XAI_KEY:  raise RuntimeError('Missing XAI_API_KEY')

sb = create_client(SUPABASE_URL, SERVICE_KEY)

TOUR_BLOCKLIST = ['mspt','wsop','wsopc','rgps','gcpt','lips','rough rider',
                  'wpt',' pat ','pgt','fpn','napt','cppt']

# ── VENUE THEMES ─────────────────────────────────────────────────────────────
# Each entry: palette, frame style, background description
VENUE_THEMES = {
    'hard rock':     ('bold red and black with chrome electric accents',
                      'guitar fretboard-inspired border with chrome corner pieces',
                      'dark charcoal with vivid red neon underglow'),
    'horseshoe':     ('lucky green and antique gold',
                      'ornate border with horseshoe arch corner accents',
                      'deep forest green with warm golden halo'),
    'mgm':           ('Hollywood gold and deep scarlet',
                      'Art Deco gold border with starburst corner medallions',
                      'deep black with warm Hollywood gold spotlight from above'),
    'foxwoods':      ('deep Connecticut forest green and copper',
                      'timber lodge border with angular copper geometric corner accents',
                      'dark New England forest green gradient'),
    'mohegan':       ('burgundy and aged copper gold',
                      'tribal geometric border with wolf corner medallions in copper',
                      'deep burgundy with copper accent glow'),
    'bellagio':      ('Italian luxury gold and black marble',
                      'ornate gold filigree border with decorative corner medallions',
                      'deep black marble with warm gold vignette from edges'),
    'borgata':       ('steel blue and chrome silver',
                      'sleek modern steel border with blue accent corner strips',
                      'dark navy with Atlantic blue neon glow from below'),
    'rivers casino': ('deep blue and silver chrome',
                      'industrial steel border with flowing wave corner accents',
                      'dark navy with river blue glow'),
    'jack casino':   ('playing card red and black with gold',
                      'card suit themed border with spade corner accents',
                      'deep black with red and gold accent glow'),
    'wind creek':    ('terracotta and warm earth tones',
                      'geometric tribal border with diamond pattern corner accents',
                      'warm earth brown gradient'),
    'cherokee':      ('mountain blue and pine green',
                      'rustic mountain border with geometric star quilt corner patterns',
                      'deep Appalachian mountain blue-green gradient'),
    'winstar':       ('royal blue and gold',
                      'grand architectural border with ornate column corner accents',
                      'deep royal blue with warm gold glow from center'),
    'seminole':      ('vibrant orange and tropical green',
                      'colorful geometric patchwork-inspired border',
                      'deep tropical green with orange accent glow'),
    'caesars':       ('imperial gold and ivory marble',
                      'Roman column and laurel wreath border with coin corner medallions',
                      'deep marble with warm imperial gold center glow'),
    'wynn':          ('champagne gold and ivory white',
                      'elegant curved border with floral corner medallions',
                      'deep satin black with champagne gold atmospheric glow'),
    'venetian':      ('Venetian canal blue and gold',
                      'Renaissance-inspired border with decorative masquerade corner accents',
                      'deep canal blue with Italian gold atmospheric lighting'),
    'aria':          ('steel blue and champagne silver',
                      'sleek architectural border with crystalline corner accents',
                      'deep charcoal with blue-silver modern city glow'),
    'golden nugget': ('classic gold and dark amber',
                      'vintage signage-inspired border with nugget corner accents',
                      'deep midnight black with warm vintage gold neon glow'),
    'commerce':      ('emerald green and classic ivory',
                      'classic card room border with sun corner accents',
                      'deep felt green with warm golden California glow'),
    'bicycle':       ('classic red, white and blue',
                      'vintage playing card border with ace corner accents',
                      'deep card room green with classic red and blue glow'),
    'potawatomi':    ('deep orange and ceremonial black',
                      'ceremonial fire-inspired border with tribal corner accents',
                      'deep ceremonial black with warm orange fire glow from center'),
    'ameristar':     ('deep blue and steamboat gold',
                      'paddle-wheel riverboat border with river corner accents',
                      'deep river blue with warm steamboat gold'),
    'harrahs':       ('classic red and gold',
                      'banner-inspired border with star corner accents',
                      'deep red with warm gold glamour glow'),
    'chinook winds': ('ocean teal and aged copper',
                      'steel border with angular geometric copper corner accents',
                      'stormy navy to deep teal gradient with ocean wave texture'),
    'emerald queen': ('riverboat green and brass gold',
                      'steamboat paddle-wheeler border with brass corner fittings',
                      'deep riverboat green with vintage brass atmosphere'),
    'peppermill':    ('deep purple and fuchsia neon',
                      'vintage neon sign border with desert corner accents',
                      'deep charcoal with vintage fuchsia and purple neon glow'),
    'gold strike':   ('gold rush amber and river blue',
                      'prospector mining border with gold nugget corner accents',
                      'deep river blue with gold rush warm amber glow'),
    'lucky club':    ('shamrock green and gold',
                      'Irish luck themed border with shamrock corner accents',
                      'deep Irish green with warm gold lucky charm glow'),
    'island view':   ('Gulf Coast turquoise and sandy gold',
                      'coastal island border with wave corner accents',
                      'deep Gulf Coast blue with sandy warm gold'),
    'palace station':('art deco gold and deep purple',
                      'station-themed Art Deco border with geometric corner accents',
                      'deep purple with warm Art Deco gold glow'),
    'live casino':   ('electric blue and white chrome',
                      'angular LED-lit steel border with electric blue corner strips',
                      'deep charcoal with electric blue neon underbelly glow'),
    'parx':          ('Pennsylvania green and gold',
                      'Keystone State racing border with Pennsylvania corner accents',
                      'deep Philly charcoal with Keystone green and gold glow'),
    'ocean casino':  ('Atlantic seafoam blue and silver',
                      'coastal border with wave and seashell corner accents',
                      'deep Atlantic blue with seafoam mist atmospheric glow'),
    'meadows':       ('Pittsburgh gold and forest green',
                      'Pennsylvania border with geometric corner accents',
                      'deep Pennsylvania charcoal with warm Pittsburgh golden glow'),
    'four winds':    ('lake blue and forest green',
                      'lakeside shoreline border with wind compass corner accents',
                      'deep Great Lakes navy with forest green glow'),
    'firekeepers':   ('ceremonial orange and deep black',
                      'fire-inspired border with ceremonial corner accents',
                      'deep night black with warm ceremonial orange fire glow'),
    'isle casino':   ('steamboat blue and gold',
                      'Iowa riverboat border with paddle wheel corner accents',
                      'deep river night blue with warm steamboat gold'),
    'downstream':    ('river blue and earth brown',
                      'riverside border with tribal geometric corner accents',
                      'deep Oklahoma river blue with warm earth glow'),
    'talking stick': ('turquoise and desert earth',
                      'geometric tribal border with southwestern corner patterns',
                      'warm Sonoran desert terracotta with turquoise tribal accent'),
    'casino del sol':('desert pink and turquoise',
                      'desert southwest border with sun symbol corner accents',
                      'warm Arizona desert sunset with turquoise glow'),
}

# ── STATE THEMES ──────────────────────────────────────────────────────────────
STATE_THEMES = {
    'NV': ('casino neon multi-color on deep desert black',
           'neon sign border with playing card suit corner accents',
           'deep Nevada desert night with vibrant casino neon atmosphere'),
    'FL': ('Florida sunshine orange and ocean blue',
           'tropical border with palm tree corner accents',
           'warm Florida sunset orange-crimson with palm silhouettes at base'),
    'CA': ('California sun gold and Pacific blue',
           'golden coast border with sunshine corner accents',
           'deep Pacific blue with warm California golden sunset glow'),
    'TX': ('Lone Star deep navy and burnt orange',
           'border with longhorn silhouette and star corner accents',
           'deep Texas sky blue with warm burnt orange lone star horizon'),
    'LA': ('jazz purple, gold and Mardi Gras green',
           'wrought-iron French Quarter border with fleur-de-lis corner accents',
           'deep Louisiana bayou with Mardi Gras purple-gold glow'),
    'MS': ('Mississippi river blue and Spanish moss green',
           'steamboat river border with antebellum corner accents',
           'deep Southern river night with Spanish moss atmospheric green'),
    'PA': ('colonial blue and Liberty gold',
           'industrial steel border with bell silhouette corner accents',
           'deep urban charcoal with electric colonial blue glow'),
    'NJ': ('Atlantic boardwalk blue and gold',
           'boardwalk steel border with ocean wave corner accents',
           'deep Atlantic blue with vintage boardwalk neon gold atmosphere'),
    'CO': ('Rocky Mountain blue and alpine gold',
           'mountain ridge border with aspen leaf corner accents',
           'deep mountain blue-purple with alpine gold sunrise glow'),
    'MN': ('North Star midnight blue and gold',
           'Great Lakes border with birch tree corner accents',
           'deep Minnesota lake midnight blue with North Star glow'),
    'WI': ('forest green and gold',
           'Great Lakes border with maple corner accents',
           'deep Wisconsin forest green with warm golden glow'),
    'MI': ('Great Lakes blue and steel grey',
           'maritime border with lighthouse corner accents',
           'deep Great Lakes steely blue with industrial glow'),
    'IN': ('checkered racing blue and gold',
           'racing-inspired border with checkered flag corner accents',
           'deep Indiana blue with racing gold energy'),
    'OH': ('scarlet and steel grey',
           'industrial border with buckeye corner accents',
           'deep Ohio scarlet with industrial steel-grey glow'),
    'IA': ('prairie golden wheat and river blue',
           'river border with golden cornfield corner accents',
           'deep Iowa prairie with golden wheat horizon and river blue'),
    'MO': ('Gateway silver and river blue',
           'arch-inspired border with river corner accents',
           'deep Missouri river blue with silver Gateway arch glow'),
    'IL': ('Chicago urban steel blue and gold',
           'architectural border with lakefront corner accents',
           'deep Chicago midnight blue with urban gold glow'),
    'OR': ('Pacific coast teal and forest green',
           'Pacific Northwest border with coastal wave corner accents',
           'deep Oregon coastline navy-teal with Pacific Northwest forest green'),
    'WA': ('Cascade evergreen and Olympic blue',
           'Pacific Northwest border with mountain corner accents',
           'deep Washington State evergreen with blue-green mountain glow'),
    'AZ': ('desert rust and Southwest turquoise',
           'desert border with cactus and turquoise corner accents',
           'warm Arizona desert sunset rust-orange with turquoise accent'),
    'NM': ('adobe rust and turquoise sky',
           'pueblo border with sun symbol corner accents',
           'warm adobe earth with traditional turquoise sun glow'),
    'OK': ('earth brown and prairie sky blue',
           'native nations border with prairie wind corner accents',
           'deep Oklahoma prairie sky with warm earth glow'),
    'KY': ('emerald green and gold',
           'turf racing border with thoroughbred corner accents',
           'deep Kentucky Bluegrass emerald with golden race day glow'),
    'TN': ('mountain blue and music city gold',
           'border with guitar silhouette and mountain corner accents',
           'deep Great Smoky Mountain blue-green with Nashville music gold'),
    'GA': ('warm peach gold and Southern green',
           'peach blossom border with rose corner accents',
           'warm Georgia peach golden sunset with deep Southern green'),
    'VA': ('colonial blue and Governor gold',
           'historical border with cardinal corner accents',
           'deep colonial Virginia blue with warm historic gold'),
    'MD': ('heraldic red and gold',
           'heraldic cross-pattern border with Chesapeake corner accents',
           'deep Maryland red with Chesapeake Bay blue and golden heraldic glow'),
    'NY': ('NYC midnight blue and Empire gold',
           'Art Deco architectural border with skyline corner accents',
           'deep NYC midnight with Art Deco gold skyline glow'),
    'CT': ('colonial blue and forest green',
           'New England border with harbor corner accents',
           'deep New England forest green with colonial blue glow'),
    'SD': ('Badlands rust and Big Sky blue',
           'geological border with native nation corner accents',
           'deep Dakota sky blue with Badlands rust-ochre glow'),
    'MT': ('Big Sky deep blue and gold',
           'frontier mountain border with wilderness corner accents',
           'deep Montana sky blue with golden frontier mountain glow'),
    'AB': ('Canadian Rockies steel blue and gold',
           'Rocky Mountain border with Chinook arch corner accents',
           'deep Canadian Rocky Mountain blue with warm golden Chinook glow'),
    'BC': ('Pacific Northwest green and blue',
           'coastal border with orca silhouette corner accents',
           'deep BC coastal forest green with Pacific ocean blue glow'),
}

DEFAULT_THEME = (
    'neon cyan and gunmetal silver',
    'industrial machined metal frame with corner bolt rivets and neon cyan accent strips',
    'dark navy gunmetal with brushed metal texture'
)


def get_theme(series_name, venue_name, state):
    name_l  = (series_name or '').lower()
    venue_l = (venue_name or '').lower()
    state_u = (state or '').upper()
    for kw, theme in VENUE_THEMES.items():
        if kw in venue_l or kw in name_l:
            return theme
    if state_u in STATE_THEMES:
        return STATE_THEMES[state_u]
    return DEFAULT_THEME


def format_guarantee(series):
    name  = series.get('series_name', '')
    total = series.get('total_guaranteed')
    main  = series.get('main_event_guaranteed')
    events = series.get('total_events') or series.get('event_count') or 1
    has_dollar = bool(re.search(r'\$\d+', name))

    if has_dollar and main:
        if main >= 1_000_000: return f'${main/1_000_000:.1f}M MAIN EVENT'
        return f'${int(main/1000)}K MAIN EVENT'
    if total and events > 1:
        if total >= 1_000_000:
            r = int(total/1_000_000)*1_000_000
            return f'OVER ${r/1_000_000:.0f}M IN GUARANTEES'
        if total >= 100_000:
            r = int(total/100_000)*100_000
            return f'OVER ${int(r/1000)}K IN GUARANTEES'
        if total >= 10_000:
            r = int(total/10_000)*10_000
            return f'OVER ${int(r/1000)}K IN GUARANTEES'
        return f'OVER ${total:,} IN GUARANTEES'
    if main:
        if main >= 1_000_000: return f'${main/1_000_000:.1f}M GTD'
        return f'${int(main/1000)}K GTD'
    return 'TOURNAMENT SERIES'


def clean_name(name):
    name = (name or '').replace('&#39;', "'").replace('&amp;', '&')
    name = re.sub(r"[\s\-]+['']?\d{2,4}\s*$", '', name).strip()
    name = re.sub(r'\s+20\d{2}\s*$', '', name).strip()
    name = re.sub(r'\s*[-–]\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\S*\s*$', '', name, flags=re.I).strip()
    return name


def build_prompt(series):
    name   = clean_name(series.get('series_name', ''))
    venue  = (series.get('venue_name') or '').replace('&#39;', "'").replace('&amp;', '&')
    city   = series.get('city') or ''
    state  = series.get('state') or ''
    loc    = f'{city}, {state}' if city and state else (city or state or '')
    gtd    = format_guarantee(series)
    palette, frame, bg = get_theme(series.get('series_name',''), venue, state)

    lines = []
    lines.append(f'Series title text: "{name}"')
    if venue: lines.append(f'Secondary text: "{venue.upper()}"')
    if loc:   lines.append(f'Tertiary text: "{loc}"')
    lines.append(f'Bottom badge text: "{gtd}"')
    lines.append('Small watermark bottom-right corner: "SMARTER.POKER"')

    return f"""Graphic design for a professional poker tournament event card, 1024x1024 pixels.

Style: premium metallic poster design with a unique venue-inspired identity.
Background: {bg}.
Border/frame: {frame}.
Color palette: {palette}.

Text to render legibly:
{chr(10).join(lines)}

Design rules:
- The series title must be the largest, most prominent text
- All text must be clearly readable
- No dates, no years
- No people, no faces, no real-world logos
- Pure graphic design — shapes, textures, typography, decorative elements only
- High quality, premium tournament poster aesthetic"""


def generate_image(prompt):
    headers = {'Authorization': f'Bearer {XAI_KEY}', 'Content-Type': 'application/json'}
    payload = {'model': 'aurora', 'prompt': prompt, 'n': 1,
                'size': '1024x1024', 'quality': 'standard', 'style': 'vivid'}
    resp = requests.post('https://api.x.ai/v1/images/generations',
                         headers=headers, json=payload, timeout=90)
    if resp.status_code != 200:
        raise Exception(f'xAI Image API {resp.status_code}: {resp.text[:300]}')
    url = resp.json()['data'][0]['url']
    return requests.get(url, timeout=60).content


def upload_and_save(sid, slug, img_bytes):
    path = f'{slug}.png'
    try:
        sb.storage.from_(BUCKET).upload(
            path, img_bytes,
            file_options={'content-type': 'image/png', 'upsert': 'true'})
    except Exception as e:
        if 'already exists' in str(e).lower() or 'Duplicate' in str(e):
            sb.storage.from_(BUCKET).update(
                path, img_bytes,
                file_options={'content-type': 'image/png'})
        else:
            raise
    public_url = f'{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{path}'
    sb.table('poker_series').update({'logo_url': public_url}).eq('id', sid).execute()
    return public_url


def slugify(text):
    text = (text or '').lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text.strip())
    return re.sub(r'-+', '-', text)[:80]


def is_tour(name):
    n = (name or '').lower()
    return any(k in n for k in TOUR_BLOCKLIST)


def main():
    print('='*60)
    print('🎴 Poker Series Logo Generator v3.0 — Grok Aurora')
    print('='*60)

    progress_file = '/tmp/series_logo_progress.json'
    done_ids = set()
    if os.path.exists(progress_file):
        with open(progress_file) as f:
            done_ids = set(json.load(f).get('done', []))
        print(f'📋 Resuming — {len(done_ids)} already done')

    # Fetch all series
    all_series, offset = [], 0
    while True:
        res = sb.table('poker_series').select(
            'id, series_name, venue_name, city, state, '
            'total_guaranteed, main_event_guaranteed, total_events, event_count'
        ).range(offset, offset+999).execute()
        if not res.data: break
        all_series.extend(res.data)
        if len(res.data) < 1000: break
        offset += 1000

    to_do = [s for s in all_series
              if not is_tour(s.get('series_name',''))
              and s['id'] not in done_ids]

    print(f'📊 Total series: {len(all_series)}')
    print(f'✅ Already done: {len(done_ids)}')
    print(f'🔄 To generate: {len(to_do)}')
    print()

    success, failed = 0, []

    for i, series in enumerate(to_do, 1):
        sid   = series['id']
        name  = clean_name(series.get('series_name', f'Series {sid}'))
        slug  = slugify(name) or f'series-{sid}'
        gtd   = format_guarantee(series)

        print(f'[{i}/{len(to_do)}] {name} | {gtd} (ID:{sid})')

        try:
            prompt    = build_prompt(series)
            img_bytes = generate_image(prompt)
            url       = upload_and_save(sid, slug, img_bytes)

            done_ids.add(sid)
            with open(progress_file, 'w') as f:
                json.dump({'done': list(done_ids)}, f)

            success += 1
            print(f'  ✅ {url}')
            time.sleep(7)   # ~8-9 req/min — within DALL-E tier limit

        except Exception as e:
            err = str(e)
            print(f'  ❌ {err[:120]}')
            failed.append({'id': sid, 'name': name, 'error': err[:120]})
            # Back off longer on safety rejections to avoid hammering
            if 'safety' in err.lower() or '400' in err:
                time.sleep(3)
            else:
                time.sleep(5)

    print()
    print('='*60)
    print(f'🎉 DONE: {success} generated, {len(failed)} failed')
    if failed:
        for item in failed:
            print(f'  ❌ [{item["id"]}] {item["name"]}: {item["error"]}')
    print('='*60)


if __name__ == '__main__':
    main()
