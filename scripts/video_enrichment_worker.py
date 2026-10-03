#!/usr/bin/env python3
"""Bounded Phase 4 enrichment worker. It never fetches third-party media bytes."""
from __future__ import annotations
import argparse, json, os, re, socket, sys
from pathlib import Path

WORKER = f"{socket.gethostname()}:{os.getpid()}"
QUALITY_REVIEW_CODES = ('blank_frames', 'duplicate_captions', 'poor_audio', 'mid_sentence_cuts')

def classify(row):
    text = f"{row.get('title','')} {' '.join(row.get('tags') or [])}".lower()
    concepts = [name for name, pattern in {
        'preflop': r'pre.?flop|opening range', 'bluffing': r'bluff', 'tournaments': r'tournament|mtt|wsop',
        'cash games': r'cash game', 'slots': r'slot|jackpot', 'sports': r'nfl|nba|nhl|mlb|sports'
    }.items() if re.search(pattern, text)]
    game = 'slots' if row.get('type') == 'slots' else ('sports' if row.get('type') == 'sports' else 'poker')
    video_format = 'short' if int(row.get('duration') or 0) <= 180 else 'long_form'
    skill = 'advanced' if re.search(r'advanced|solver|gto|high stakes', text) else ('beginner' if re.search(r'beginner|basics|101', text) else 'all_levels')
    stakes_match = re.search(r'(?<!\w)(?:\$\d+(?:k|m)?|micro stakes|low stakes|mid stakes|high stakes)', text)
    event_patterns = ('wsop', 'wpt', 'ept', 'super bowl', 'world series')
    events = [event.upper() for event in event_patterns if event in text]
    quality = 45 + min(30, int(row.get('views_count') or 0) // 10000) + (10 if row.get('thumbnail_url') else 0)
    findings = []
    if len(row.get('title') or '') < 12: findings.append({'code':'weak_title','severity':'medium','status':'detected'})
    if quality < 55: findings.append({'code':'weak_relevance','severity':'medium','status':'detected'})
    if re.search(r'\bsponsor(?:ed)?\b|\bpaid promotion\b|\bad break\b', text):
        findings.append({'code':'ads','severity':'medium','status':'detected'})
    findings.extend({'code':code,'severity':'review_required','status':'not_assessed'} for code in QUALITY_REVIEW_CODES)
    return {'game_type':game,'format':video_format,'skill_level':skill,'concepts':concepts,
            'players':[],'events':events,'stakes':stakes_match.group(0) if stakes_match else None,
            'language_code':'en','source_quality_score':min(100,quality),
            'quality_score':min(100,quality),'quality_findings':findings}

def promote_candidate(db, video_id):
    pending=(db.table('video_enrichment_jobs').select('id',count='exact').eq('video_id',video_id).neq('status','succeeded').execute())
    if (pending.count or 0) != 0: return False
    record=(db.table('video_enrichment_records').select('workflow_state').eq('video_id',video_id).maybe_single().execute().data or {})
    if record.get('workflow_state') not in ('validated','enriched'): return False
    db.table('video_enrichment_records').update({'workflow_state':'candidate'}).eq('video_id',video_id).execute()
    return True

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--limit',type=int,default=10); parser.add_argument('--preflight-only',action='store_true'); args=parser.parse_args()
    if not 1 <= args.limit <= 50: raise SystemExit('limit must be 1..50')
    if args.preflight_only: print(json.dumps({'status':'ok','worker':'video_enrichment'})); return
    sys.path.insert(0,str(Path(__file__).resolve().parents[1]));
    from supabase import create_client
    url=os.environ.get('NEXT_PUBLIC_SUPABASE_URL','').strip(); key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY','').strip()
    if not url or not key: raise SystemExit('Supabase service configuration required')
    db=create_client(url,key); jobs=db.rpc('fn_claim_video_enrichment_jobs',{'p_worker':WORKER,'p_limit':args.limit}).execute().data or []
    result={'claimed':len(jobs),'succeeded':0,'retried':0,'dead_letter':0,'failures':[]}
    for job in jobs:
        try:
            video=(db.table('video_library_videos').select('id,title,type,tags,views_count,thumbnail_url,duration,source_name').eq('id',job['video_id']).maybe_single().execute().data)
            if not video: raise RuntimeError('video_missing')
            enrichment=classify(video); job_type=job['job_type']; output={}
            if job_type in ('classify','tag','quality','analysis'):
                output=enrichment
                patch={k:v for k,v in enrichment.items() if k in ('game_type','format','skill_level','concepts','players','events','stakes','language_code','source_quality_score','quality_score','quality_findings')}
                if job_type=='analysis': patch['classification']={'method':'deterministic_metadata_v1','source':video.get('source_name')}; patch['workflow_state']='enriched'
                db.table('video_enrichment_records').update(patch).eq('video_id',job['video_id']).execute()
            elif job_type=='transcript':
                output={'status':'unavailable','reason':'provider_caption_authority_not_configured'}
                db.table('video_enrichment_records').update({'transcript_status':'unavailable'}).eq('video_id',job['video_id']).execute()
            elif job_type=='chapters':
                output={'chapters':[{'start_seconds':0,'title':'Video Start'}]}
                db.table('video_enrichment_records').update({'chapters':output['chapters']}).eq('video_id',job['video_id']).execute()
            status=db.rpc('fn_finish_video_enrichment_job',{'p_job_id':job['id'],'p_worker':WORKER,'p_succeeded':True,'p_output':output}).execute().data
            promote_candidate(db,job['video_id'])
            result['succeeded']+=1
        except Exception as exc:
            code=str(exc).split(':',1)[0][:120]
            try: status=db.rpc('fn_finish_video_enrichment_job',{'p_job_id':job['id'],'p_worker':WORKER,'p_succeeded':False,'p_output':{},'p_failure_code':code,'p_failure_detail':type(exc).__name__}).execute().data
            except Exception: status='custody_failure'
            result['dead_letter' if status=='dead_letter' else 'retried']+=1; result['failures'].append({'job_id':job['id'],'code':code})
    print(json.dumps(result,sort_keys=True))

if __name__=='__main__': main()
