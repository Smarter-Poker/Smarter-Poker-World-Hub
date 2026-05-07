#!/usr/bin/env python3
"""
storage-gc-orphans.py
=====================

One-shot Supabase storage GC for the social-media bucket: finds reel MP4s
and thumbnails in storage that are no longer referenced by any
social_reels.video_url, social_reels.thumbnail_url, social_posts.media_urls,
social_posts.original_media_url, or social_posts.thumbnail_url, and deletes
them via the Supabase Storage REST API.

Why this script exists:
    Today's session re-queued 2,833+ low-quality MP4s for re-conversion at
    HQ. The OLD MP4 files were never referenced by social_reels after the
    revert, but the storage objects remained — accumulating cost.
    Estimated reclaim: ~6.6 GB across ~786 MP4s + ~577 thumbs.

Safety:
    - Only deletes files older than 30 minutes (avoids racing with the
      currently-draining HQ re-conversion queue).
    - Uses NOT EXISTS checks against ALL known reference columns.
    - Runs in batches of 250 (under Supabase's batch-delete request size).
    - Idempotent: re-running after a complete pass is a no-op.

Run on Dan's mac (or anywhere with .env.local + network access to Supabase):
    cd ~/Documents/Smarter-Poker-World-Hub
    python3 scripts/yt-transcode-worker/storage-gc-orphans.py

Optional flags:
    --dry-run        Print the orphan count + total size, but don't delete.
    --max-age=30m    Only delete files older than this (default 30min).
                     Format: 30m, 2h, 1d.
"""
import json
import urllib.request
import urllib.error
import sys
import os
import re
import time

# ── Resolve credentials from .env.local ─────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
ENV_FILE = os.path.join(REPO_ROOT, '.env.local')

def env(key):
    if not os.path.isfile(ENV_FILE):
        sys.exit(f"ERROR: {ENV_FILE} not found")
    with open(ENV_FILE) as f:
        for line in f:
            if line.startswith(f'{key}='):
                return line.split('=', 1)[1].strip().strip('"').strip("'")
    sys.exit(f"ERROR: {key} not in {ENV_FILE}")

SUPA_URL = env('NEXT_PUBLIC_SUPABASE_URL') if 'NEXT_PUBLIC_SUPABASE_URL' in open(ENV_FILE).read() \
           else 'https://kuklfnapbkmacvwxktbh.supabase.co'
SERVICE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')
DB_PASS = env('SUPABASE_DB_PASSWORD')

# ── psycopg2 (must be installed; if missing, prompt) ────────────────────
try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    sys.exit("ERROR: psycopg2 not installed. Run: pip3 install psycopg2-binary")

# ── Parse flags ────────────────────────────────────────────────────────
DRY_RUN = '--dry-run' in sys.argv
MAX_AGE = '30m'
for arg in sys.argv[1:]:
    if arg.startswith('--max-age='):
        MAX_AGE = arg.split('=', 1)[1]

# Convert MAX_AGE to a Postgres interval
def to_interval(s):
    m = re.match(r'^(\d+)([smhd])$', s)
    if not m:
        sys.exit(f"ERROR: --max-age must look like 30m, 2h, 1d. Got: {s}")
    n, unit = m.groups()
    return f"{n} {dict(s='seconds', m='minutes', h='hours', d='days')[unit]}"

PG_INTERVAL = to_interval(MAX_AGE)
print(f"storage-gc-orphans: bucket=social-media, max-age={MAX_AGE}, dry-run={DRY_RUN}")

# ── Connect to Postgres ─────────────────────────────────────────────────
SUPA_HOST = SUPA_URL.replace('https://', '').replace('http://', '').replace('/', '')
PROJECT_REF = SUPA_HOST.split('.')[0]
DB_DSN = f"postgresql://postgres@db.{PROJECT_REF}.supabase.co:5432/postgres"
print(f"Connecting to {DB_DSN} ...")

conn = psycopg2.connect(DB_DSN, password=DB_PASS, sslmode='require', connect_timeout=10)
conn.autocommit = True

ORPHAN_QUERY = f"""
WITH referenced_paths AS (
  SELECT DISTINCT regexp_replace(video_url, '^.*/social-media/', '') AS storage_path
    FROM social_reels WHERE video_url ILIKE '%%supabase.co/storage%%social-media/%%'
  UNION SELECT DISTINCT regexp_replace(thumbnail_url, '^.*/social-media/', '')
    FROM social_reels WHERE thumbnail_url ILIKE '%%supabase.co/storage%%social-media/%%'
  UNION SELECT DISTINCT regexp_replace(original_media_url, '^.*/social-media/', '')
    FROM social_posts WHERE original_media_url ILIKE '%%supabase.co/storage%%social-media/%%'
  UNION SELECT DISTINCT regexp_replace(thumbnail_url, '^.*/social-media/', '')
    FROM social_posts WHERE thumbnail_url ILIKE '%%supabase.co/storage%%social-media/%%'
  UNION SELECT DISTINCT regexp_replace(media_url::text, '^.*/social-media/', '')
    FROM social_posts, LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(media_urls) = 'array' THEN media_urls ELSE '[]'::jsonb END
    ) AS media_url
    WHERE media_url::text ILIKE '%%supabase.co/storage%%social-media/%%'
)
SELECT name, (metadata->>'size')::bigint AS size_bytes
FROM storage.objects o
WHERE o.bucket_id = 'social-media'
  AND o.created_at < now() - interval %s
  AND ((o.name LIKE 'reels/%%' AND o.name LIKE '%%.mp4')
    OR (o.name LIKE 'reels/thumbs/%%' AND o.name LIKE '%%.jpg'))
  AND NOT EXISTS (SELECT 1 FROM referenced_paths rp WHERE rp.storage_path = o.name)
ORDER BY name
"""

print("Querying orphans ...")
with conn.cursor() as cur:
    cur.execute(ORPHAN_QUERY, (PG_INTERVAL,))
    rows = cur.fetchall()

orphans = [(name, size or 0) for name, size in rows]
total_bytes = sum(s for _, s in orphans)

def fmt_size(b):
    for u in ('B', 'KB', 'MB', 'GB'):
        if b < 1024:
            return f"{b:.1f} {u}"
        b /= 1024
    return f"{b:.1f} TB"

print(f"Found {len(orphans)} orphan(s) totaling {fmt_size(total_bytes)}")

if DRY_RUN or not orphans:
    print("Dry run — no deletions.")
    sys.exit(0)

# ── Batch-delete via Supabase Storage REST API ──────────────────────────
DEL_URL = f"{SUPA_URL}/storage/v1/object/social-media"
HEADERS = {
    "Authorization": f"Bearer {SERVICE_KEY}",
    "apikey": SERVICE_KEY,
    "Content-Type": "application/json",
}
BATCH = 250

deleted = 0
errors = 0
for i in range(0, len(orphans), BATCH):
    chunk = [name for name, _ in orphans[i:i+BATCH]]
    payload = json.dumps({"prefixes": chunk}).encode()
    req = urllib.request.Request(DEL_URL, data=payload, method='DELETE', headers=HEADERS)
    try:
        resp = urllib.request.urlopen(req, timeout=60)
        result = json.loads(resp.read())
        deleted += len(result)
        print(f"  batch {i//BATCH + 1}: deleted {len(result)}/{len(chunk)}")
    except urllib.error.HTTPError as e:
        errors += 1
        body = e.read().decode()[:200]
        print(f"  batch {i//BATCH + 1}: HTTP {e.code} — {body}")
        time.sleep(2)
    except Exception as e:
        errors += 1
        print(f"  batch {i//BATCH + 1}: error {type(e).__name__}: {e}")

print()
print(f"Done. Deleted {deleted}/{len(orphans)} files; {errors} batch error(s).")
print(f"Storage reclaimed: {fmt_size(total_bytes * deleted / max(len(orphans), 1))}")
