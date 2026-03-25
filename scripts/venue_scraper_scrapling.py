#!/usr/bin/env python3
"""
Venue Intelligence Scraper — Scrapling + camoufox
=================================================
Scrapes venue websites (Tier 1) for daily tournament schedules and news.
Falls back to PokerAtlas URLs (Tier 2) for venues without direct websites.

REAL DATA ONLY — Never guess, assume, or simulate values.
Only extract explicitly labeled data from the source page.

Usage:
    # Scrape all venues with websites
    SUPABASE_SERVICE_ROLE_KEY="..." .venv/bin/python3 scripts/venue_scraper_scrapling.py --all

    # Scrape a single venue by ID
    .venv/bin/python3 scripts/venue_scraper_scrapling.py --venue-id 42

    # Scrape a single URL (testing)
    .venv/bin/python3 scripts/venue_scraper_scrapling.py --url "https://commercecasino.com"

    # Dry run (list venues, don't scrape)
    .venv/bin/python3 scripts/venue_scraper_scrapling.py --all --dry-run
"""

import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Constants ──
SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
RECEIVE_URL = os.environ.get('VENUE_RECEIVE_URL', 'https://smarter.poker/api/venue-scraper/receive')
VENUE_SCRAPER_SECRET = os.environ.get('VENUE_SCRAPER_SECRET', '')

# Rate limiting
DELAY_BETWEEN_VENUES = 5  # seconds between venues
MAX_CONCURRENT = 3  # max concurrent browser sessions

# Days
DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

# ── Load credentials from .agent/skills/credentials/.env if available ──
def load_credentials():
    global SERVICE_KEY, VENUE_SCRAPER_SECRET
    cred_path = Path(__file__).parent.parent / '.agent' / 'skills' / 'credentials' / '.env'
    if cred_path.exists():
        for line in cred_path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, _, val = line.partition('=')
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key == 'SUPABASE_SERVICE_ROLE_KEY' and not SERVICE_KEY:
                    SERVICE_KEY = val
                if key == 'VENUE_SCRAPER_SECRET' and not VENUE_SCRAPER_SECRET:
                    VENUE_SCRAPER_SECRET = val
                os.environ.setdefault(key, val)

load_credentials()


# ── Tournament extraction patterns ──
TOURNAMENT_PATTERNS = {
    'buy_in': [
        r'\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:buy[- ]?in|entry|bi)',
        r'(?:buy[- ]?in|entry|bi)\s*[:=]?\s*\$?(\d{1,3}(?:,\d{3})*)',
        r'\$(\d+)\s*(?:NLH|PLO|Omaha|Hold)',
    ],
    'guaranteed': [
        r'\$(\d{1,3}(?:,\d{3})*(?:K)?)\s*(?:GTD|guaranteed|guarantee)',
        r'(?:GTD|guaranteed|guarantee)\s*[:=]?\s*\$?(\d{1,3}(?:,\d{3})*(?:K)?)',
    ],
    'game_type': [
        r'\b(NLH|NLHE|No[- ]?Limit\s*Hold\s*[\'"]?em)\b',
        r'\b(PLO|Pot[- ]?Limit\s*Omaha)\b',
        r'\b(Mixed|HORSE|8-Game)\b',
        r'\b(Omaha\s*Hi[- ]?Lo)\b',
    ],
    'format': [
        r'\b(Freezeout|Freeze[- ]?out)\b',
        r'\b(Re[- ]?entry|Reentry)\b',
        r'\b(Rebuy|Re[- ]?buy)\b',
        r'\b(Turbo)\b',
        r'\b(Deep\s*Stack|Deepstack)\b',
        r'\b(Bounty|Knockout|KO)\b',
        r'\b(Satellite|Qualifier)\b',
        r'\b(Freeroll)\b',
    ],
    'time': [
        r'(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|a\.m\.|p\.m\.))',
        r'(\d{1,2}\s*(?:AM|PM|am|pm))',
    ],
}

def normalize_game_type(raw):
    """Normalize game type abbreviations."""
    raw_upper = raw.upper().replace('-', '').replace(' ', '')
    if 'NLHE' in raw_upper or 'NOLIMIT' in raw_upper or 'NLH' in raw_upper:
        return 'NLH'
    if 'PLO' in raw_upper or 'POTLIMIT' in raw_upper:
        return 'PLO'
    if 'MIXED' in raw_upper or 'HORSE' in raw_upper or '8GAME' in raw_upper:
        return 'Mixed'
    if 'OMAHA' in raw_upper and 'HI' in raw_upper:
        return 'OmahaHiLo'
    return raw.strip()

def normalize_format(raw):
    """Normalize tournament format."""
    raw_lower = raw.lower().replace('-', '').replace(' ', '')
    if 'freezeout' in raw_lower:
        return 'Freezeout'
    if 'reentry' in raw_lower or 'rebuy' in raw_lower:
        return 'Re-entry'
    if 'turbo' in raw_lower:
        return 'Turbo'
    if 'deep' in raw_lower:
        return 'Deep Stack'
    if 'bounty' in raw_lower or 'knockout' in raw_lower:
        return 'Bounty'
    if 'satellite' in raw_lower or 'qualifier' in raw_lower:
        return 'Satellite'
    if 'freeroll' in raw_lower:
        return 'Freeroll'
    return raw.strip()

def parse_money(val_str):
    """Parse dollar amount string to float."""
    if not val_str:
        return None
    cleaned = val_str.replace(',', '').replace('$', '').strip()
    if cleaned.upper().endswith('K'):
        return float(cleaned[:-1]) * 1000
    try:
        return float(cleaned)
    except ValueError:
        return None


def extract_tournaments_from_html(html, source_url=''):
    """
    Extract daily tournament schedules from HTML.
    REAL DATA ONLY — only extract explicitly labeled data.
    """
    tournaments = []
    
    # Look for tournament tables (most common format on venue websites)
    # Strategy: find day-of-week sections and extract associated tournament details
    
    for day in DAYS_OF_WEEK:
        # Find sections mentioning this day
        day_pattern = re.compile(
            rf'(?:^|\n|<[^>]*>)\s*{day}\s*(?:</[^>]*>|\s*[-–—:,])(.*?)(?=(?:^|\n|<[^>]*>)\s*(?:{"|".join(d for d in DAYS_OF_WEEK if d != day)})\s*(?:</[^>]*>|\s*[-–—:,])|$)',
            re.IGNORECASE | re.DOTALL
        )
        
        for match in day_pattern.finditer(html):
            section = match.group(1)
            if not section or len(section.strip()) < 5:
                continue
            
            # Extract tournament details from this day's section
            tournament = {'day_of_week': day}
            
            # Extract time
            for tp in TOURNAMENT_PATTERNS['time']:
                time_match = re.search(tp, section, re.IGNORECASE)
                if time_match:
                    tournament['start_time'] = time_match.group(1).strip()
                    break
            
            # Extract buy-in
            for bp in TOURNAMENT_PATTERNS['buy_in']:
                bi_match = re.search(bp, section, re.IGNORECASE)
                if bi_match:
                    tournament['buy_in'] = parse_money(bi_match.group(1))
                    break
            
            # Extract guaranteed
            for gp in TOURNAMENT_PATTERNS['guaranteed']:
                gtd_match = re.search(gp, section, re.IGNORECASE)
                if gtd_match:
                    tournament['guaranteed'] = parse_money(gtd_match.group(1))
                    break
            
            # Extract game type
            for gtp in TOURNAMENT_PATTERNS['game_type']:
                gt_match = re.search(gtp, section, re.IGNORECASE)
                if gt_match:
                    tournament['game_type'] = normalize_game_type(gt_match.group(1))
                    break
            
            # Extract format
            for fp in TOURNAMENT_PATTERNS['format']:
                fmt_match = re.search(fp, section, re.IGNORECASE)
                if fmt_match:
                    tournament['format'] = normalize_format(fmt_match.group(1))
                    break
            
            # Only include if we found at least a time or buy-in
            if tournament.get('start_time') or tournament.get('buy_in') is not None:
                tournament['source_url'] = source_url
                tournaments.append(tournament)
    
    # Also try table-based extraction (common in PokerAtlas)
    # Look for <tr> rows with day/time/buy-in patterns
    table_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
    for row in table_rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL | re.IGNORECASE)
        if len(cells) < 2:
            continue
        
        # Clean cell contents
        cleaned = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        
        # Check if any cell contains a day of week
        day_found = None
        for cell in cleaned:
            for day in DAYS_OF_WEEK:
                if day.lower() in cell.lower():
                    day_found = day
                    break
            if day_found:
                break
        
        if not day_found:
            continue
        
        tournament = {'day_of_week': day_found, 'source_url': source_url}
        row_text = ' '.join(cleaned)
        
        # Extract from combined row text
        for tp in TOURNAMENT_PATTERNS['time']:
            m = re.search(tp, row_text, re.IGNORECASE)
            if m:
                tournament['start_time'] = m.group(1).strip()
                break
        
        for bp in TOURNAMENT_PATTERNS['buy_in']:
            m = re.search(bp, row_text, re.IGNORECASE)
            if m:
                tournament['buy_in'] = parse_money(m.group(1))
                break
        
        for gp in TOURNAMENT_PATTERNS['guaranteed']:
            m = re.search(gp, row_text, re.IGNORECASE)
            if m:
                tournament['guaranteed'] = parse_money(m.group(1))
                break
        
        for gtp in TOURNAMENT_PATTERNS['game_type']:
            m = re.search(gtp, row_text, re.IGNORECASE)
            if m:
                tournament['game_type'] = normalize_game_type(m.group(1))
                break
        
        for fp in TOURNAMENT_PATTERNS['format']:
            m = re.search(fp, row_text, re.IGNORECASE)
            if m:
                tournament['format'] = normalize_format(m.group(1))
                break
        
        if tournament.get('start_time') or tournament.get('buy_in') is not None:
            # Avoid duplicates
            is_dup = any(
                t['day_of_week'] == tournament['day_of_week'] and
                t.get('start_time') == tournament.get('start_time') and
                t.get('buy_in') == tournament.get('buy_in')
                for t in tournaments
            )
            if not is_dup:
                tournaments.append(tournament)
    
    return tournaments


def extract_news_from_html(html, source_url=''):
    """Extract news/promotions from venue website HTML."""
    news = []
    
    # Look for news/promotion sections
    news_patterns = [
        r'<(?:article|div)[^>]*class="[^"]*(?:news|promo|announce|event|update)[^"]*"[^>]*>(.*?)</(?:article|div)>',
        r'<h[2-4][^>]*>(.*?)</h[2-4]>\s*<p[^>]*>(.*?)</p>',
    ]
    
    for pattern in news_patterns:
        matches = re.findall(pattern, html, re.DOTALL | re.IGNORECASE)
        for match in matches[:5]:  # Limit to 5 news items
            if isinstance(match, tuple):
                title = re.sub(r'<[^>]+>', '', match[0]).strip()
                content = re.sub(r'<[^>]+>', '', match[1]).strip() if len(match) > 1 else ''
            else:
                title = re.sub(r'<[^>]+>', '', match).strip()[:200]
                content = ''
            
            if title and len(title) > 5 and len(title) < 300:
                news.append({
                    'title': title,
                    'content': content[:500] if content else None,
                    'source_url': source_url,
                })
    
    return news


async def scrape_venue(session, venue, semaphore):
    """Scrape a single venue using Scrapling."""
    async with semaphore:
        venue_id = venue.get('id')
        name = venue.get('name', 'Unknown')
        
        # Determine URL — venue website first, PokerAtlas fallback
        website = venue.get('website', '')
        pa_url = venue.get('poker_atlas_url', '')
        
        source_tier = 'website'
        url = ''
        
        if website and len(website.strip()) > 3:
            url = website if website.startswith('http') else f'https://{website}'
            source_tier = 'website'
        elif pa_url and len(pa_url.strip()) > 5:
            url = pa_url
            source_tier = 'pokeratlas'
        else:
            print(f'  ⚠️  [{venue_id}] {name} — No source URL, skipping')
            return None
        
        print(f'  🔍 [{venue_id}] {name} — Scraping {source_tier}: {url}')
        
        try:
            page = await session.fetch(url, google_search=False)
            
            if page.status != 200:
                print(f'  ❌ [{venue_id}] {name} — HTTP {page.status}')
                return {
                    'venue_id': venue_id,
                    'status': 'failed',
                    'source_url': url,
                    'error': f'HTTP {page.status}',
                    'tournaments': [],
                    'news': [],
                }
            
            # Get HTML content
            body = page.body.decode('utf-8', errors='ignore') if page.body else ''
            
            if len(body) < 100:
                print(f'  ⚠️  [{venue_id}] {name} — Empty response')
                return {
                    'venue_id': venue_id,
                    'status': 'failed',
                    'source_url': url,
                    'error': 'Empty response',
                    'tournaments': [],
                    'news': [],
                }
            
            # Extract tournaments
            tournaments = extract_tournaments_from_html(body, url)
            
            # Extract news (only from direct websites, not PokerAtlas)
            news = extract_news_from_html(body, url) if source_tier == 'website' else []
            
            print(f'  ✅ [{venue_id}] {name} — {len(tournaments)} tournaments, {len(news)} news items')
            
            return {
                'venue_id': venue_id,
                'status': 'success',
                'source_url': url,
                'source_tier': source_tier,
                'tournaments': tournaments,
                'news': news,
            }
        
        except Exception as e:
            print(f'  ❌ [{venue_id}] {name} — Error: {e}')
            return {
                'venue_id': venue_id,
                'status': 'failed',
                'source_url': url,
                'error': str(e),
                'tournaments': [],
                'news': [],
            }
        
        finally:
            # Rate limiting
            await asyncio.sleep(DELAY_BETWEEN_VENUES)


async def post_results(results, batch_id, source_tier):
    """POST scraped results to the receive endpoint."""
    import urllib.request
    
    payload = json.dumps({
        'batch_id': batch_id,
        'source_tier': source_tier,
        'venues': results,
    }).encode('utf-8')
    
    headers = {
        'Content-Type': 'application/json',
        'x-venue-scraper-key': VENUE_SCRAPER_SECRET,
    }
    
    try:
        req = urllib.request.Request(RECEIVE_URL, data=payload, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode('utf-8')
            print(f'  📤 POST to {RECEIVE_URL}: {resp.status} — {body[:200]}')
            return json.loads(body)
    except Exception as e:
        print(f'  ❌ POST failed: {e}')
        return None


async def run_scraper(venues, dry_run=False):
    """Main scraper loop."""
    print(f'\n{"="*60}')
    print(f'🏪 Venue Intelligence Scraper — Scrapling + camoufox')
    print(f'{"="*60}')
    print(f'  Total venues: {len(venues)}')
    
    tier1 = [v for v in venues if v.get('website') and len(v['website'].strip()) > 3]
    tier2 = [v for v in venues if (not v.get('website') or len(v['website'].strip()) <= 3) and v.get('poker_atlas_url') and len(v['poker_atlas_url'].strip()) > 5]
    tier3 = [v for v in venues if (not v.get('website') or len(v['website'].strip()) <= 3) and (not v.get('poker_atlas_url') or len(v['poker_atlas_url'].strip()) <= 5)]
    
    print(f'  Tier 1 (direct website): {len(tier1)}')
    print(f'  Tier 2 (PokerAtlas fallback): {len(tier2)}')
    print(f'  Tier 3 (no source): {len(tier3)}')
    
    if tier3:
        print(f'\n  ⚠️  {len(tier3)} venues have no source URL:')
        for v in tier3[:10]:
            print(f'      - [{v["id"]}] {v["name"]} ({v.get("city","?")}, {v.get("state","?")})')
        if len(tier3) > 10:
            print(f'      ... and {len(tier3) - 10} more')
    
    if dry_run:
        print(f'\n  🔍 DRY RUN — No scraping performed.')
        return
    
    # Import Scrapling
    from scrapling.fetchers import AsyncStealthySession
    
    all_results = []
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    
    # Scrape all venues (Tier 1 first, then Tier 2)
    scrape_queue = tier1 + tier2
    
    print(f'\n  Starting scrape of {len(scrape_queue)} venues...\n')
    
    async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
        tasks = [scrape_venue(session, v, semaphore) for v in scrape_queue]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for r in results:
            if isinstance(r, Exception):
                print(f'  ❌ Task exception: {r}')
                continue
            if r:
                all_results.append(r)
    
    # ── Summary ──
    success = [r for r in all_results if r['status'] == 'success']
    failed = [r for r in all_results if r['status'] == 'failed']
    total_tournaments = sum(len(r.get('tournaments', [])) for r in success)
    total_news = sum(len(r.get('news', [])) for r in success)
    
    print(f'\n{"="*60}')
    print(f'  📊 SCRAPE RESULTS')
    print(f'{"="*60}')
    print(f'  Scraped:      {len(all_results)}')
    print(f'  Success:      {len(success)}')
    print(f'  Failed:       {len(failed)}')
    print(f'  Tournaments:  {total_tournaments}')
    print(f'  News items:   {total_news}')
    
    # ── POST results in batches to receive endpoint ──
    if all_results and VENUE_SCRAPER_SECRET:
        BATCH_POST_SIZE = 20
        for i in range(0, len(all_results), BATCH_POST_SIZE):
            batch = all_results[i:i + BATCH_POST_SIZE]
            batch_id = f'scrapling-{datetime.now(timezone.utc).strftime("%Y%m%d%H%M")}-{i//BATCH_POST_SIZE}'
            await post_results(batch, batch_id, 'scrapling')
            await asyncio.sleep(1)
    elif not VENUE_SCRAPER_SECRET:
        print('\n  ⚠️  No VENUE_SCRAPER_SECRET — saving results to JSON instead')
        output_path = Path(__file__).parent.parent / 'data' / 'scraped-venue-tournaments.json'
        output_path.parent.mkdir(exist_ok=True)
        output_path.write_text(json.dumps({
            'scraped_at': datetime.now(timezone.utc).isoformat(),
            'total': len(all_results),
            'success': len(success),
            'failed': len(failed),
            'results': all_results,
        }, indent=2))
        print(f'  💾 Saved to {output_path}')
    
    print(f'\n{"="*60}\n')
    return all_results


def load_venues():
    """Load venues from the master JSON file."""
    json_path = Path(__file__).parent.parent / 'public' / 'data' / 'all-venues.json'
    if not json_path.exists():
        print(f'❌ Venue file not found: {json_path}')
        sys.exit(1)
    
    data = json.loads(json_path.read_text())
    return data.get('venues', [])


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Venue Intelligence Scraper')
    parser.add_argument('--all', action='store_true', help='Scrape all venues')
    parser.add_argument('--venue-id', type=int, help='Scrape a single venue by ID')
    parser.add_argument('--url', type=str, help='Scrape a single URL (testing)')
    parser.add_argument('--dry-run', action='store_true', help='List venues without scraping')
    parser.add_argument('--limit', type=int, default=0, help='Limit number of venues to scrape')
    args = parser.parse_args()
    
    if args.url:
        # Test mode — scrape a single URL
        async def test_single():
            from scrapling.fetchers import AsyncStealthySession
            async with AsyncStealthySession(headless=True, solve_cloudflare=True) as session:
                page = await session.fetch(args.url, google_search=False)
                body = page.body.decode('utf-8', errors='ignore')
                tournaments = extract_tournaments_from_html(body, args.url)
                news = extract_news_from_html(body, args.url)
                print(json.dumps({'tournaments': tournaments, 'news': news}, indent=2))
        
        asyncio.run(test_single())
    
    elif args.all or args.venue_id:
        venues = load_venues()
        
        if args.venue_id:
            venues = [v for v in venues if v.get('id') == args.venue_id]
            if not venues:
                print(f'❌ Venue ID {args.venue_id} not found')
                sys.exit(1)
        
        if args.limit > 0:
            venues = venues[:args.limit]
        
        asyncio.run(run_scraper(venues, dry_run=args.dry_run))
    
    else:
        parser.print_help()
