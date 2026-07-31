#!/usr/bin/env python3
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from scrapling.fetchers import StealthySession
from supabase import create_client

def categorize_article(title):
    lower = title.lower()
    if any(k in lower for k in ['wsop', 'wpt', 'tournament', 'event', 'triton', 'championship']):
        return 'tournament'
    if any(k in lower for k in ['strategy', 'how to', 'tips', 'guide', 'theory', 'hand review']):
        return 'strategy'
    if any(k in lower for k in ['poker room', 'casino', 'online', 'legislation', 'industry', 'revenue', 'legal']):
        return 'industry'
    return 'news'

def parse_date(date_text):
    """Return the article's published date, or None when it cannot be parsed.

    NEVER fall back to 'now'. Doing so stamped archived articles with the
    scrape time, so old stories surfaced as breaking news ahead of genuinely
    new ones whenever CardPlayer changed its date markup.
    """
    if not date_text:
        return None

    # Strip "Published:" prefix
    clean = re.sub(r'(?i)Published:\s*', '', date_text).strip()

    # Try parsing different date formats
    formats = [
        "%B %d, %Y",  # May 16, 2026
        "%b %d, %Y",  # May 16, 2026 (abbreviated)
        "%Y-%m-%d",   # 2026-05-16
    ]
    for fmt in formats:
        try:
            dt = datetime.strptime(clean, fmt)
            return dt.isoformat() + "Z"
        except ValueError:
            continue

    print(f"⚠️ Could not parse date text: '{date_text}' — leaving published_at NULL.")
    return None

def main():
    print("🚀 Starting CardPlayer News Scraper (Scrapling)...")
    
    # Load environment variables
    env_path = Path('/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local')
    if not env_path.exists():
        print("❌ Error: .env.local not found!")
        sys.exit(1)
        
    load_dotenv(dotenv_path=env_path)
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    
    if not url or not key:
        print("❌ Error: NEXT_PUBLIC_SUPABASE_URL or key not found in .env.local!")
        sys.exit(1)
        
    supabase = create_client(url, key)
    print("✅ Supabase client initialized.")
    
    # Initialize Scrapling session
    session = StealthySession(headless=True, solve_cloudflare=True)
    session.start()
    
    inserted_count = 0
    skipped_count = 0
    error_count = 0
    date_missing_count = 0
    fatal_error = None

    try:
        # Step 1: Fetch CardPlayer News landing page
        landing_url = "https://www.cardplayer.com/poker-news"
        print(f"📰 Fetching landing page: {landing_url}")
        resp = session.fetch(landing_url, google_search=True)
        
        if resp.status != 200:
            print(f"❌ Failed to fetch landing page, status code: {resp.status}")
            sys.exit(1)
            
        news_items = resp.css('.newsitem')
        print(f"✅ Found {len(news_items)} news items on CardPlayer.")

        if not news_items:
            # 200 OK with zero matches means the '.newsitem' selector no longer
            # matches the markup (or we were served a block page).
            raise RuntimeError(
                "Landing page returned 200 but zero '.newsitem' elements — "
                "selector break or bot block"
            )

        # Step 2: Iterate over news items
        # Limit to 15 latest articles
        for idx, item in enumerate(news_items[:15]):
            try:
                # Find title link
                a_tag = item.css('.newsinfo a')
                if not a_tag:
                    continue
                
                title = a_tag[0].text.strip()
                source_url = a_tag[0].attrib.get('href', '').strip()
                
                if not title or not source_url:
                    continue
                
                # Clean source url
                if source_url.startswith('/'):
                    source_url = "https://www.cardplayer.com" + source_url
                    
                # Check if this article is already in the DB
                existing = supabase.table("poker_news").select("id").eq("source_url", source_url).execute()
                if existing.data:
                    # Skip duplicate
                    skipped_count += 1
                    continue
                
                print(f"\n🆕 New article found [{idx+1}]: '{title}'")
                
                # Fetch image
                img_tag = item.css('img')
                image_url = ""
                if img_tag:
                    image_url = img_tag[0].attrib.get('src', '').strip()
                    # Fallback to lazy src
                    if not image_url or 'lazy' in image_url or '1x1' in image_url:
                        image_url = img_tag[0].attrib.get('data-lazy-src', '').strip()
                
                # No stock-photo substitute: a generic Unsplash image presented
                # as the article's own is fabricated imagery. Leave it NULL and
                # let the frontend render its own placeholder.
                if not image_url:
                    image_url = None

                # Fetch excerpt/summary
                p_tag = item.css('.newsinfo p')
                summary = ""
                if p_tag:
                    summary = p_tag[0].text.strip()
                
                excerpt = summary[:150] if summary else title
                
                # Step 3: Fetch detail page for publication date
                print(f"🔍 Fetching article detail: {source_url}")
                detail_resp = session.fetch(source_url)
                published_at_str = None

                if detail_resp.status == 200:
                    post_date_span = detail_resp.css('span.cp-post-date')
                    if post_date_span:
                        date_text = post_date_span[0].text.strip()
                        print(f"📅 Post date text: '{date_text}'")
                        published_at_str = parse_date(date_text)

                # published_at stays NULL when the source date is missing or
                # unparseable — the UI can order by scraped_at instead. It is
                # never back-filled with the scrape time.
                if not published_at_str:
                    date_missing_count += 1
                    print("⚠️ No usable publication date — storing published_at as NULL.")

                # Step 4: Insert new article
                new_article = {
                    "title": title,
                    "summary": summary if summary else None,
                    "excerpt": excerpt,
                    "content": "",
                    "source_name": "CardPlayer",
                    "source_url": source_url,
                    "source_icon": "♠️",
                    "image_url": image_url,
                    "category": categorize_article(title),
                    "published_at": published_at_str,
                    "scraped_at": datetime.utcnow().isoformat() + "Z",
                    "updated_at": datetime.utcnow().isoformat() + "Z",
                    "is_published": True,
                    "source_box": 3,
                    "is_archived": False
                }
                
                result = supabase.table("poker_news").insert(new_article).execute()
                # Confirm the insert actually produced a row before counting it.
                rows = getattr(result, "data", None)
                if isinstance(rows, list) and len(rows) == 0:
                    error_count += 1
                    print(f"❌ Insert returned no row for: {title}")
                    continue
                inserted_count += 1
                print(f"✅ Successfully inserted article: {title}")

            except Exception as item_err:
                error_count += 1
                print(f"⚠️ Error processing news item {idx+1}: {item_err}")

    except Exception as e:
        fatal_error = e
        print(f"❌ Scraper error: {e}")
    finally:
        session.close()

    processed = inserted_count + skipped_count
    print(f"\nCARDPLAYER SCRAPER RUN SUMMARY:")
    print(f"   Inserted: {inserted_count} new articles")
    print(f"   Skipped:  {skipped_count} existing articles")
    print(f"   Errors:   {error_count} item failures")
    print(f"   No date:  {date_missing_count} articles stored without published_at")

    # ── EXIT STATUS ───────────────────────────────────────────────────────
    # A blocked fetch, a dead session or a selector change must NOT look like
    # a successful run to the scheduler.
    if fatal_error is not None:
        print(f"❌ RUN FAILED: {fatal_error}")
        sys.exit(1)

    if processed == 0:
        print("❌ RUN FAILED: no articles were inserted or matched as existing.")
        sys.exit(1)

    # Every item we attempted blew up — treat as a failure even if some
    # articles were already known.
    if error_count and inserted_count == 0 and error_count >= 3:
        print(f"❌ RUN FAILED: {error_count} item errors and 0 inserts.")
        sys.exit(1)

    print("RUN COMPLETED OK")

if __name__ == "__main__":
    main()
