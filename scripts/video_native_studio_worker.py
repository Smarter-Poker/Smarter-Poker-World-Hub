#!/usr/bin/env python3
"""Bounded rights-cleared native Reel renderer. Never handles embed-only media."""
import argparse, datetime, hashlib, json, os, re, socket, subprocess, tempfile, uuid
from pathlib import Path
import requests

WORKER=f'{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex}'
URL=(os.getenv('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
KEY=os.getenv('SUPABASE_SERVICE_ROLE_KEY') or ''
FFMPEG='/usr/bin/ffmpeg'; FFPROBE='/usr/bin/ffprobe'
UUID=re.compile(r'^[0-9a-f]{8}-[0-9a-f-]{27}$',re.I)

def headers(extra=None):
    value={'apikey':KEY,'Authorization':f'Bearer {KEY}'}
    if extra:value.update(extra)
    return value

def rpc(name,payload):
    response=requests.post(f'{URL}/rest/v1/rpc/{name}',headers=headers({'Content-Type':'application/json'}),json=payload,timeout=30)
    response.raise_for_status(); return response.json()

def query(table,params):
    response=requests.get(f'{URL}/rest/v1/{table}',headers=headers(),params=params,timeout=30)
    response.raise_for_status(); return response.json()

def update(table,filters,payload):
    response=requests.patch(f'{URL}/rest/v1/{table}',headers=headers({'Content-Type':'application/json','Prefer':'return=minimal'}),params=filters,json=payload,timeout=30)
    response.raise_for_status()

def safe_code(error):
    known={'master_hash_mismatch','source_probe_invalid','output_probe_invalid','output_too_large','ffmpeg_failed','rights_revoked'}
    text=str(error)
    return text if text in known else f'studio_{error.__class__.__name__.lower()}'[:80]

def sha256(path):
    digest=hashlib.sha256()
    with open(path,'rb') as stream:
        for chunk in iter(lambda:stream.read(1024*1024),b''):digest.update(chunk)
    return digest.hexdigest()

def srt_time(seconds):
    millis=max(1,int(float(seconds)*1000)); hours,millis=divmod(millis,3600000); minutes,millis=divmod(millis,60000); secs,millis=divmod(millis,1000)
    return f'{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}'

def probe(path):
    result=subprocess.run([FFPROBE,'-v','error','-show_streams','-show_format','-of','json',str(path)],capture_output=True,text=True,timeout=60,check=True)
    data=json.loads(result.stdout); streams=data.get('streams') or []
    video=next((x for x in streams if x.get('codec_type')=='video'),None)
    audio=next((x for x in streams if x.get('codec_type')=='audio'),None)
    duration=float((data.get('format') or {}).get('duration') or (video or {}).get('duration') or 0)
    if not video or duration<=0:raise ValueError('source_probe_invalid')
    return {'duration':duration,'width':int(video.get('width') or 0),'height':int(video.get('height') or 0),'video_codec':video.get('codec_name') or '', 'audio_codec':(audio or {}).get('codec_name') or 'none'}

def filter_graph(settings,subtitle_path=None):
    crop=settings.get('crop_mode','vertical_focus'); focus=max(0,min(100,float(settings.get('focus_x',50))))/100
    if crop not in {'vertical_focus','fit_blur','center_crop'}:raise ValueError('output_probe_invalid')
    if crop=='fit_blur':
        video="split=2[base][fg];[base]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24[bg];[fg]scale=1080:1920:force_original_aspect_ratio=decrease[front];[bg][front]overlay=(W-w)/2:(H-h)/2"
    else:
        position='(iw-ow)*%.6f'%focus if crop=='vertical_focus' else '(iw-ow)/2'
        video=f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:{position}:(ih-oh)/2"
    if subtitle_path:video+=f",subtitles={subtitle_path}:force_style='Alignment=2,MarginV=180,FontSize=18,Outline=2,Shadow=0'"
    if settings.get('branding',True):video+=",drawbox=x=36:y=36:w=310:h=58:color=black@0.55:t=fill,drawtext=text='SMARTER.POKER':x=58:y=52:fontsize=28:fontcolor=white"
    return video

def render(master,output,poster,settings):
    start=float(settings['clip_start_seconds']); end=float(settings['clip_end_seconds']); duration=end-start
    subtitle=None; caption=' '.join(str(settings.get('caption_text') or '').split())[:1000]
    if caption:
        subtitle=output.parent/'captions.srt'; subtitle.write_text(f'1\n00:00:00,000 --> {srt_time(duration)}\n{caption}\n',encoding='utf-8')
    args=[FFMPEG,'-nostdin','-hide_banner','-loglevel','error','-ss',str(start),'-t',str(duration),'-i',str(master),'-vf',filter_graph(settings,subtitle),'-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-movflags','+faststart','-max_muxing_queue_size','2048','-y',str(output)]
    try:subprocess.run(args,capture_output=True,text=True,timeout=900,check=True)
    except Exception as error:raise RuntimeError('ffmpeg_failed') from error
    subprocess.run([FFMPEG,'-nostdin','-hide_banner','-loglevel','error','-ss','0.5','-i',str(output),'-frames:v','1','-q:v','2','-y',str(poster)],capture_output=True,text=True,timeout=60,check=True)

def download(bucket,path,target):
    with requests.get(f'{URL}/storage/v1/object/{bucket}/{path}',headers=headers(),timeout=(30,300),stream=True) as response:
        response.raise_for_status()
        with open(target,'wb') as stream:
            for chunk in response.iter_content(1024*1024):stream.write(chunk)

def upload(bucket,path,source,content_type):
    with open(source,'rb') as stream:
        response=requests.post(f'{URL}/storage/v1/object/{bucket}/{path}',headers=headers({'Content-Type':content_type,'x-upsert':'false'}),data=stream,timeout=(30,300))
    response.raise_for_status()

def remove_outputs(paths):
    if not paths:return
    response=requests.delete(f'{URL}/storage/v1/object/video-reels-native',headers=headers({'Content-Type':'application/json'}),json={'prefixes':paths},timeout=30)
    response.raise_for_status()

def cleanup_expired_uploads():
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    tickets=query('video_source_upload_tickets',{'status':'eq.reserved','expires_at':f'lt.{now}','select':'id,storage_path','order':'expires_at.asc','limit':'20'})
    if not tickets:return 0
    response=requests.delete(f'{URL}/storage/v1/object/video-source-masters',headers=headers({'Content-Type':'application/json'}),json={'prefixes':[item['storage_path'] for item in tickets]},timeout=30)
    response.raise_for_status()
    for item in tickets:update('video_source_upload_tickets',{'id':f'eq.{item["id"]}','status':'eq.reserved'},{'status':'cleaned','cleaned_at':now,'updated_at':now})
    return len(tickets)

def load_authority(job):
    masters=query('video_source_masters',{'id':f'eq.{job["master_id"]}','status':'eq.ready','select':'id,video_id,storage_bucket,storage_path,sha256,byte_size,duration_seconds,width,height,rights_evidence_id'})
    if len(masters)!=1:return None
    evidence=query('video_rights_evidence',{'id':f'eq.{masters[0]["rights_evidence_id"]}','revoked_at':'is.null','select':'id,rights_status,permitted_uses,valid_from,valid_until'})
    candidates=query('video_reel_candidates',{'id':f'eq.{job["candidate_id"]}','status':'eq.approved','native_clip_eligible':'eq.true','playback_mode':'eq.native_master','select':'id,video_id,rights_status'})
    now=datetime.datetime.now(datetime.timezone.utc)
    valid_from=datetime.datetime.fromisoformat(evidence[0]['valid_from'].replace('Z','+00:00')) if evidence else now
    valid_until=datetime.datetime.fromisoformat(evidence[0]['valid_until'].replace('Z','+00:00')) if evidence and evidence[0].get('valid_until') else None
    if len(evidence)!=1 or len(candidates)!=1 or valid_from>now or (valid_until and valid_until<=now) or candidates[0]['video_id']!=masters[0]['video_id'] or evidence[0]['rights_status']!=candidates[0]['rights_status'] or 'native_clip' not in evidence[0]['permitted_uses']:return None
    return masters[0]

def process(job):
    authority=load_authority(job)
    if not authority:raise ValueError('rights_revoked')
    output_path=f'{job["candidate_id"]}/{job["id"]}.mp4'; poster_path=f'{job["candidate_id"]}/{job["id"]}.jpg'
    # A stale processing claim may have uploaded deterministic objects before a
    # dropped completion response. A ready row is never reclaimable, so the new
    # custody holder can safely remove only these non-authoritative leftovers.
    remove_outputs([output_path,poster_path])
    with tempfile.TemporaryDirectory(prefix='sp-native-studio-') as root:
        root=Path(root); source=root/'master.source'; output=root/'reel.mp4'; poster=root/'poster.jpg'
        download(authority['storage_bucket'],authority['storage_path'],source)
        if sha256(source)!=authority['sha256']:raise ValueError('master_hash_mismatch')
        source_probe=probe(source)
        if abs(source_probe['duration']-float(authority['duration_seconds']))>1.0 or source_probe['width']!=int(authority['width']) or source_probe['height']!=int(authority['height']):raise ValueError('source_probe_invalid')
        render(source,output,poster,job['settings'])
        result=probe(output); size=output.stat().st_size
        if result['width']!=1080 or result['height']!=1920 or result['duration']>180 or result['video_codec']!='h264':raise ValueError('output_probe_invalid')
        limits=query('video_native_studio_limits',{'singleton':'eq.true','select':'max_output_bytes'})
        if not limits or size>int(limits[0]['max_output_bytes']):raise ValueError('output_too_large')
        upload('video-reels-native',output_path,output,'video/mp4'); upload('video-reels-native',poster_path,poster,'image/jpeg')
        rpc('fn_finish_video_native_rendition',{'p_id':job['id'],'p_worker':WORKER,'p_claim_token':job['claim_token'],'p_output_path':output_path,'p_poster_path':poster_path,'p_sha256':sha256(output),'p_bytes':size,'p_duration':result['duration'],'p_width':result['width'],'p_height':result['height'],'p_video_codec':result['video_codec'],'p_audio_codec':result['audio_codec'],'p_validation':{'source_sha256_verified':True,'vertical_safe_area':True,'poster_generated':True,'branding':bool(job['settings'].get('branding',True))}})

def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--limit',type=int,default=2); parser.add_argument('--preflight-only',action='store_true'); args=parser.parse_args()
    if not URL or not KEY or not os.path.isfile(FFMPEG) or not os.path.isfile(FFPROBE):raise SystemExit('studio runtime unavailable')
    query('video_native_studio_limits',{'singleton':'eq.true','select':'enabled,max_jobs_per_run,max_output_bytes'})
    if args.preflight_only:print(json.dumps({'ok':True,'worker':'video_native_studio'}));return
    if args.limit<1 or args.limit>5:raise SystemExit('limit must be 1..5')
    cleaned=cleanup_expired_uploads()
    jobs=rpc('fn_claim_video_native_renditions',{'p_worker':WORKER,'p_limit':args.limit})
    complete=failed=0
    for job in jobs:
        try:process(job);complete+=1
        except Exception as error:
            persisted=query('video_native_renditions',{'id':f'eq.{job["id"]}','select':'status,claim_token,output_path,poster_path'})
            if len(persisted)==1 and persisted[0]['status']=='ready':complete+=1;continue
            failed+=1
            output_path=f'{job["candidate_id"]}/{job["id"]}.mp4'; poster_path=f'{job["candidate_id"]}/{job["id"]}.jpg'
            try:remove_outputs([output_path,poster_path])
            except Exception:pass
            try:rpc('fn_fail_video_native_rendition',{'p_id':job['id'],'p_worker':WORKER,'p_claim_token':job['claim_token'],'p_code':safe_code(error)})
            except Exception:pass
    print(json.dumps({'claimed':len(jobs),'completed':complete,'failed':failed,'expired_uploads_cleaned':cleaned}))
    if failed:raise SystemExit(1)

if __name__=='__main__':main()
