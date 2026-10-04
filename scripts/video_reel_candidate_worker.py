#!/usr/bin/env python3
"""Bounded Phase 5 metadata-only candidate selector."""
from __future__ import annotations
import argparse, json, os, re, socket, sys
from pathlib import Path

WORKER=f"{socket.gethostname()}:{os.getpid()}"
YOUTUBE_ID=re.compile(r'^[A-Za-z0-9_-]{11}$')

def duration_seconds(raw):
    if isinstance(raw,(int,float)): return max(0,int(raw))
    text=str(raw or '').strip()
    if text.isdigit(): return int(text)
    iso=re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?',text,re.I)
    if iso: return int(iso.group(1) or 0)*3600+int(iso.group(2) or 0)*60+int(iso.group(3) or 0)
    clock=re.fullmatch(r'(?:(\d+):)?(\d{1,2}):(\d{2})',text)
    if clock: return int(clock.group(1) or 0)*3600+int(clock.group(2))*60+int(clock.group(3))
    return 0

def chapter_candidates(chapters,duration):
    clean=[]
    for chapter in chapters or []:
        try: start=max(0,int(float(chapter.get('start_seconds',0))))
        except (TypeError,ValueError): continue
        if start>=duration: continue
        title=str(chapter.get('title') or 'Chapter').strip()[:160]
        clean.append((start,title))
    clean.sort()
    return clean

def select_segment(video,enrichment):
    duration=duration_seconds(video.get('duration'))
    if duration<=0: raise ValueError('duration_unavailable')
    quality=float(enrichment.get('quality_score') or 0)
    concepts=[str(value).lower() for value in enrichment.get('concepts') or []]
    if duration<=180 or enrichment.get('format')=='short':
        return 0,duration,'validated_short','Validated Short uses its complete bounded runtime',{'duration_seconds':duration,'signals':['validated','short_format'],'concepts':concepts}
    chapters=chapter_candidates(enrichment.get('chapters'),duration)
    meaningful=[item for item in chapters if item[0]>0 or item[1].lower() not in ('video start','start')]
    if meaningful:
        def score(item):
            title=item[1].lower()
            return sum(3 for concept in concepts if concept in title)+min(item[0]//60,5)
        start,title=max(meaningful,key=score)
        end=min(duration,start+90)
        if end-start>=15:
            return start,end,'chapter_highlight',f'Chapter signal selected: {title}',{'chapter_title':title,'quality_score':quality,'concepts':concepts,'signals':['chapter_boundary','topic_match']}
    start=min(30,max(0,int(duration*.10)))
    end=min(duration,start+60)
    if end-start<15: start=max(0,end-15)
    return start,end,'metadata_highlight','Metadata quality window selected from validated long-form content',{'duration_seconds':duration,'quality_score':quality,'concepts':concepts,'signals':['validated','quality_score','long_form_window']}

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--limit',type=int,default=25); parser.add_argument('--preflight-only',action='store_true'); args=parser.parse_args()
    if not 1<=args.limit<=50: raise SystemExit('limit must be 1..50')
    if args.preflight_only:
        print(json.dumps({'status':'ok','worker':'video_reel_candidate'})); return
    sys.path.insert(0,str(Path(__file__).resolve().parents[1])); from supabase import create_client
    url=os.environ.get('NEXT_PUBLIC_SUPABASE_URL','').strip(); key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','').strip()
    if not url or not key: raise SystemExit('Supabase service configuration required')
    db=create_client(url,key)
    claims=db.rpc('fn_claim_video_reel_candidate_sources',{'p_worker':WORKER,'p_limit':args.limit}).execute().data or []
    summary={'claimed':len(claims),'proposed':0,'failed':0,'by_kind':{},'failures':[]}
    for claim in claims:
        try:
            video=db.table('video_library_videos').select('id,youtube_video_id,video_url,source_id,source_name,type,title,duration').eq('id',claim['video_id']).maybe_single().execute().data
            enrichment=db.table('video_enrichment_records').select('format,concepts,chapters,quality_score,game_type').eq('video_id',claim['video_id']).maybe_single().execute().data
            if not video or not enrichment: raise RuntimeError('candidate_source_missing')
            source=None
            if video.get('source_id'):
                source=db.table('content_sources').select('id,provider_source_id,name,rights_status,playback_mode').eq('id',video['source_id']).maybe_single().execute().data
            source=source or {}
            start,end,kind,reason,rationale=select_segment(video,enrichment)
            youtube_id=str(video.get('youtube_video_id') or '')
            rights=str(source.get('rights_status') or 'embed_only')
            owned=rights in ('owned','licensed')
            if YOUTUBE_ID.fullmatch(youtube_id):
                mode='third_party_embed'; embed=f'https://www.youtube-nocookie.com/embed/{youtube_id}?start={start}&end={end}'; native=False
            elif owned:
                mode='native_master'; embed=None; native=True
            else: raise RuntimeError('rights_or_embed_identity_missing')
            topic='sports' if video.get('type')=='sports' else ('casino-slots' if video.get('type')=='slots' else 'poker')
            payload={'p_candidate_id':claim['id'],'p_worker':WORKER,'p_selection_kind':kind,'p_playback_mode':mode,
              'p_start':start,'p_end':end,'p_embed_url':embed,'p_reason':reason,'p_rationale':rationale,
              'p_quality':enrichment.get('quality_score'),'p_source_key':str(video.get('source_id') or video.get('source_name') or 'unknown'),
              'p_creator_key':str(source.get('provider_source_id') or video.get('source_name') or 'unknown'),'p_topic':topic,
              'p_rights_status':rights,'p_native_clip_eligible':native}
            db.rpc('fn_finish_video_reel_candidate',payload).execute()
            summary['proposed']+=1; summary['by_kind'][kind]=summary['by_kind'].get(kind,0)+1
        except Exception as exc:
            summary['failed']+=1; summary['failures'].append({'candidate_id':claim.get('id'),'code':str(exc).split(':',1)[0][:120]})
    print(json.dumps(summary,sort_keys=True))
    if summary['failed']: raise SystemExit(1)

if __name__=='__main__': main()
