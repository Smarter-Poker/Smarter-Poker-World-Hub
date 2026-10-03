#!/usr/bin/env python3
"""Phase 3 YouTube ingestion from the operator-owned content_sources registry.

Uses only supported YouTube Data API reads. Creator ingestion follows each
channel's uploads playlist incrementally; sports discovery uses the official
mostPopular chart contract. Third-party audiovisual bytes are never fetched.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
YOUTUBE_API = 'https://www.googleapis.com/youtube/v3'
SOURCE_COLUMNS = (
    'id,name,handle,provider_source_id,uploads_playlist_id,ingest_topic,'
    'ingestion_mode,lifecycle_status,is_active,cadence_minutes,'
    'max_candidates_per_run,expected_daily_candidates,provider_cursor,'
    'region_code,provider_category_id,last_checked_at,rights_status,playback_mode'
)


class QuotaStopped(RuntimeError):
    pass


def load_env() -> None:
    env_file = Path(os.environ.get('SP_ENV_FILE') or REPO_ROOT / '.env.local')
    if not env_file.exists():
        return
    for raw in env_file.read_text().splitlines():
        line = raw.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def iso_now() -> str:
    return utcnow().isoformat()


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None


def duration_text(value: str | None) -> str | None:
    match = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', value or '')
    if not match:
        return None
    hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return f'{hours}:{minutes:02d}:{seconds:02d}' if hours else f'{minutes}:{seconds:02d}'


def views_text(value: int) -> str:
    if value >= 1_000_000:
        return f'{value / 1_000_000:.1f}M'
    if value >= 1_000:
        return f'{value / 1_000:.0f}K'
    return str(value)


class RegistryIngestor:
    def __init__(self, supabase, api_key: str, dry_run: bool = False):
        self.supabase = supabase
        self.api_key = api_key
        self.dry_run = dry_run
        self.quota_units = 0

    def reserve_quota(self, units: int = 1) -> None:
        if self.dry_run:
            self.quota_units += units
            return
        result = self.supabase.rpc('fn_reserve_video_source_quota', {'p_units': units}).execute()
        if not result.data:
            raise QuotaStopped('daily YouTube quota budget exhausted')
        self.quota_units += units

    def youtube(self, resource: str, params: dict) -> dict:
        self.reserve_quota(1)
        query = urllib.parse.urlencode({**params, 'key': self.api_key})
        request = urllib.request.Request(
            f'{YOUTUBE_API}/{resource}?{query}',
            headers={'Accept': 'application/json', 'User-Agent': 'SmarterPoker-VideoRegistry/1.0'},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode('utf-8'))
        except urllib.error.HTTPError as error:
            detail = error.read(1024).decode('utf-8', errors='replace')
            raise RuntimeError(f'youtube_http_{error.code}: {detail[:240]}') from error
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            raise RuntimeError(f'youtube_transport: {type(error).__name__}') from error
        if not isinstance(payload, dict):
            raise RuntimeError('youtube_malformed_payload')
        return payload

    def sources(self, only_source: str | None = None) -> list[dict]:
        query = (self.supabase.table('content_sources').select(SOURCE_COLUMNS)
                 .eq('kind', 'youtube_channel').eq('provider', 'youtube')
                 .eq('is_active', True).eq('lifecycle_status', 'active')
                 .in_('ingestion_mode', ['creator_uploads', 'sports_chart']))
        if only_source:
            query = query.eq('id', only_source)
        rows = query.order('last_checked_at', desc=False, nullsfirst=True).limit(500).execute().data or []
        now = utcnow()
        return [row for row in rows if only_source or not parse_time(row.get('last_checked_at'))
                or parse_time(row.get('last_checked_at')) + timedelta(minutes=row['cadence_minutes']) <= now]

    def resolve_channel(self, source: dict) -> dict:
        channel_id = source.get('provider_source_id')
        params = {'part': 'id,contentDetails,snippet', 'maxResults': 1}
        if channel_id and channel_id.startswith('UC'):
            params['id'] = channel_id
        else:
            handle = (source.get('handle') or '').lstrip('@')
            if not handle:
                raise RuntimeError('source_missing_channel_identity')
            params['forHandle'] = handle
        payload = self.youtube('channels', params)
        items = payload.get('items') or []
        if len(items) != 1:
            raise RuntimeError('youtube_channel_not_found')
        channel = items[0]
        playlist = (((channel.get('contentDetails') or {}).get('relatedPlaylists') or {}).get('uploads'))
        if not channel.get('id') or not playlist:
            raise RuntimeError('youtube_uploads_playlist_missing')
        resolved = {'provider_source_id': channel['id'], 'uploads_playlist_id': playlist}
        if not self.dry_run and (channel['id'] != channel_id or playlist != source.get('uploads_playlist_id')):
            self.supabase.table('content_sources').update({**resolved, 'updated_at': iso_now()}).eq('id', source['id']).execute()
        return {**source, **resolved}

    def creator_candidates(self, source: dict) -> tuple[list[str], dict]:
        source = self.resolve_channel(source)
        cursor = source.get('provider_cursor') or {}
        high_video = cursor.get('video_id')
        high_published = cursor.get('published_at')
        ids: list[str] = []
        newest = None
        page_token = None
        cap = min(int(source.get('max_candidates_per_run') or 50), 500)
        while len(ids) < cap:
            params = {
                'part': 'snippet,contentDetails', 'playlistId': source['uploads_playlist_id'],
                'maxResults': min(50, cap - len(ids)),
            }
            if page_token:
                params['pageToken'] = page_token
            payload = self.youtube('playlistItems', params)
            items = payload.get('items') or []
            stop = False
            for item in items:
                snippet = item.get('snippet') or {}
                video_id = ((item.get('contentDetails') or {}).get('videoId')
                            or (snippet.get('resourceId') or {}).get('videoId'))
                published = snippet.get('publishedAt') or (item.get('contentDetails') or {}).get('videoPublishedAt')
                if video_id == high_video or (high_published and published and published <= high_published):
                    stop = True
                    break
                if video_id:
                    ids.append(video_id)
                    if newest is None:
                        newest = {'video_id': video_id, 'published_at': published}
            page_token = payload.get('nextPageToken')
            if stop or not page_token or not items:
                break
        return ids, newest or cursor

    def sports_candidates(self, source: dict) -> tuple[list[str], dict]:
        retrieved = iso_now()
        payload = self.youtube('videos', {
            'part': 'id', 'chart': 'mostPopular',
            'videoCategoryId': source.get('provider_category_id') or '17',
            'regionCode': source.get('region_code') or 'US',
            'maxResults': min(int(source.get('max_candidates_per_run') or 50), 50),
        })
        ids = [item.get('id') for item in payload.get('items') or [] if item.get('id')]
        return ids, {
            'retrieved_at': retrieved,
            'region_code': source.get('region_code') or 'US',
            'category_id': source.get('provider_category_id') or '17',
            'video_ids': ids,
        }

    def metadata(self, ids: list[str]) -> list[dict]:
        rows = []
        for start in range(0, len(ids), 50):
            payload = self.youtube('videos', {
                'part': 'snippet,contentDetails,status,statistics',
                'id': ','.join(ids[start:start + 50]), 'maxResults': 50,
            })
            rows.extend(payload.get('items') or [])
        return rows

    @staticmethod
    def qualify(source: dict, item: dict) -> tuple[dict | None, str | None]:
        video_id = item.get('id')
        snippet = item.get('snippet') or {}
        status = item.get('status') or {}
        details = item.get('contentDetails') or {}
        if not video_id or not snippet.get('title') or not snippet.get('channelId'):
            return None, 'metadata_incomplete'
        if status.get('privacyStatus') != 'public':
            return None, 'not_public'
        if status.get('embeddable') is not True:
            return None, 'not_embeddable'
        thumbnails = snippet.get('thumbnails') or {}
        thumbnail = next((thumbnails[key].get('url') for key in ('maxres', 'standard', 'high', 'medium', 'default')
                          if thumbnails.get(key, {}).get('url')), None)
        if not thumbnail or not snippet.get('publishedAt'):
            return None, 'metadata_incomplete'
        topic = source.get('ingest_topic')
        video_type = 'slots' if topic == 'casino_slots' else ('sports' if topic == 'sports' else 'cash')
        view_count = int((item.get('statistics') or {}).get('viewCount') or 0)
        now = iso_now()
        return {
            'youtube_video_id': video_id,
            'source_id': source.get('id'),
            'source_name': snippet.get('channelTitle') or source['name'],
            'type': video_type,
            'title': snippet['title'][:500],
            'views_count': view_count,
            'views_text': views_text(view_count),
            'duration': duration_text(details.get('duration')),
            'thumbnail_url': thumbnail,
            'video_url': f'https://www.youtube.com/watch?v={video_id}',
            'published_at': snippet['publishedAt'],
            'scraped_at': now,
            'updated_at': now,
            'availability_status': 'verified',
            'embeddable': True,
            'availability_checked_at': now,
            'availability_failure_reason': None,
            'availability_source': 'youtube_data_api_v3',
            'made_for_kids': status.get('madeForKids'),
            'provider_channel_id': snippet['channelId'],
            'provider_retrieved_at': now,
        }, None

    def existing_ids(self, ids: list[str]) -> set[str]:
        existing = set()
        for start in range(0, len(ids), 100):
            result = (self.supabase.table('video_library_videos').select('youtube_video_id')
                      .in_('youtube_video_id', ids[start:start + 100]).execute())
            existing.update(row['youtube_video_id'] for row in result.data or [])
        return existing

    def record(self, source: dict, operation_id: str, status: str, counts: dict,
               cursor_before: dict, cursor_after: dict, failure_code: str | None) -> None:
        if self.dry_run:
            return
        self.supabase.rpc('fn_record_video_source_observation', {
            'p_operation_id': operation_id, 'p_source_id': source['id'], 'p_status': status,
            'p_candidates': counts['candidates'], 'p_qualified': counts['qualified'],
            'p_inserted': counts['inserted'], 'p_duplicates': counts['duplicates'],
            'p_rejected': counts['rejected'], 'p_quota_units': counts['quota_units'],
            'p_cursor_before': cursor_before, 'p_cursor_after': cursor_after,
            'p_failure_code': failure_code,
        }).execute()

    def process(self, source: dict) -> dict:
        operation_id = str(uuid.uuid4())
        cursor_before = source.get('provider_cursor') or {}
        quota_before = self.quota_units
        counts = {'candidates': 0, 'qualified': 0, 'inserted': 0, 'duplicates': 0,
                  'rejected': 0, 'quota_units': 0}
        cursor_after = cursor_before
        status, failure = 'failed', None
        try:
            if source['ingestion_mode'] == 'sports_chart':
                ids, cursor_after = self.sports_candidates(source)
            else:
                ids, cursor_after = self.creator_candidates(source)
            counts['candidates'] = len(ids)
            metadata = self.metadata(ids) if ids else []
            qualified = []
            for item in metadata:
                row, reason = self.qualify(source, item)
                if row:
                    qualified.append(row)
                else:
                    counts['rejected'] += 1
                    failure = failure or reason
            counts['qualified'] = len(qualified)
            existing = self.existing_ids([row['youtube_video_id'] for row in qualified]) if qualified else set()
            counts['duplicates'] = len(existing)
            new_rows = [row for row in qualified if row['youtube_video_id'] not in existing]
            inserted_count = len(new_rows)
            if new_rows and not self.dry_run:
                result = self.supabase.table('video_library_videos').upsert(
                    new_rows, on_conflict='youtube_video_id', ignore_duplicates=True
                ).execute()
                inserted_count = len(result.data or [])
                counts['duplicates'] += len(new_rows) - inserted_count
            counts['inserted'] = inserted_count
            status = 'succeeded' if counts['inserted'] else 'empty'
        except QuotaStopped as error:
            status, failure = 'quota_stopped', str(error)
            cursor_after = cursor_before
        except Exception as error:
            status, failure = 'failed', str(error)[:240]
            cursor_after = cursor_before
        counts['quota_units'] = self.quota_units - quota_before
        self.record(source, operation_id, status, counts, cursor_before, cursor_after, failure)
        return {'operation_id': operation_id, 'source_id': source['id'], 'source_name': source['name'],
                'topic': source['ingest_topic'], 'status': status, **counts,
                'failure_code': failure}

    def run(self, source_id: str | None = None, max_sources: int = 500) -> dict:
        rows = self.sources(source_id)[:max_sources]
        results = []
        for source in rows:
            result = self.process(source)
            results.append(result)
            print(json.dumps(result, sort_keys=True), flush=True)
            if result['status'] == 'quota_stopped':
                break
        totals = {key: sum(row[key] for row in results) for key in
                  ('candidates', 'qualified', 'inserted', 'duplicates', 'rejected', 'quota_units')}
        return {'ran_at': iso_now(), 'dry_run': self.dry_run, 'sources_due': len(rows),
                'sources_processed': len(results), 'totals': totals, 'results': results}


def main() -> int:
    parser = argparse.ArgumentParser(description='Registry-driven YouTube Video Library ingestion')
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--source-id')
    parser.add_argument('--max-sources', type=int, default=500)
    parser.add_argument('--preflight-only', action='store_true')
    args = parser.parse_args()
    load_env()
    url = (os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').strip()
    service_key = (os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or '').strip()
    youtube_key = (os.environ.get('YOUTUBE_DATA_API_KEY') or os.environ.get('YOUTUBE_API_KEY') or '').strip()
    if not url or not service_key or not youtube_key:
        print('Missing required Supabase or YouTube Data API configuration', file=sys.stderr)
        return 2
    from supabase import create_client
    db = create_client(url, service_key)
    required = db.table('content_sources').select(SOURCE_COLUMNS).limit(1).execute()
    if required.data is None:
        print('Source registry preflight failed', file=sys.stderr)
        return 2
    if args.preflight_only:
        print(json.dumps({'ok': True, 'mode': 'registry-youtube-data-api-v3'}))
        return 0
    ingestor = RegistryIngestor(db, youtube_key, dry_run=args.dry_run)
    summary = ingestor.run(args.source_id, max(1, min(args.max_sources, 500)))
    print(json.dumps(summary, sort_keys=True))
    return 1 if any(row['status'] == 'failed' for row in summary['results']) else 0


if __name__ == '__main__':
    raise SystemExit(main())
