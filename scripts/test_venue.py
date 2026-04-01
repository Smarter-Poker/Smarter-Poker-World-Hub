import asyncio
from scrapling import StealthyFetcher
from bs4 import BeautifulSoup

def is_venue_active(html, name):
    soup = BeautifulSoup(html, 'html.parser')
    
    # Are there any poker games listed?
    games_section = soup.find('div', id='games')
    
    print(f'=== {name} ===')
    if games_section:
        print('Games section exists')
    else:
        print('No games section.')

    # What about 'Poker Room Open' or 'Poker Room Closed' text?
    status_el = soup.find(string=lambda s: s and 'Poker' in s and 'Closed' in s)
    if status_el:
        print('Status text:', status_el.strip())
        
    for text in ['Permanently Closed', 'poker room is closed', 'no live poker']:
        if text.lower() in html.lower():
            print(f"FOUND Phrase: {text}")

async def check_venues():
    fetcher = StealthyFetcher(solve_cloudflare=True)
    try:
        harrahs = await fetcher.async_fetch('https://www.pokeratlas.com/poker-room/harrahs-joliet')
        is_venue_active(harrahs.text, 'Harrahs Joliet')
        
        bellagio = await fetcher.async_fetch('https://www.pokeratlas.com/poker-room/bellagio-las-vegas')
        is_venue_active(bellagio.text, 'Bellagio')
    finally:
        pass # not closing pool

asyncio.run(check_venues())
