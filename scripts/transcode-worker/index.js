/** Existing sp-transcode consumer: authorized native post queue, bounded work. */
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, open, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const POLL_MS = 60_000;
export const MAX_FILE_SIZE = 500_000_000; // Retain the existing business limit.
const FFMPEG_TIMEOUT = 600_000;
const NATIVE_COLUMNS = 'id,author_id,media_urls,original_media_url,transcode_status,playback_type,rights_status,is_deleted,metadata,thumbnail_url,moderation_state,taken_down_at';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const log = (...args) => console.log('[native-transcode]', ...args);
const warn = (...args) => console.warn('[native-transcode]', ...args);

export function nativeSourceForPost(post, origin, expectedSource = null) {
  if (!post || !UUID.test(String(post.id || '')) || !UUID.test(String(post.author_id || ''))
    || post.moderation_state === 'taken_down' || post.taken_down_at || post.metadata?.native_reels_worker !== 'sp-transcode' || post.is_deleted !== false || post.playback_type !== 'native' || post.rights_status !== 'user_authorized') return null;
  const value = post.original_media_url || post.media_urls?.[0];
  if (!value || post.media_urls?.[0] !== value || expectedSource && value !== expectedSource) return null;
  try {
    const url = new URL(value); const configured = new URL(origin);
    if (configured.protocol !== 'https:' || configured.pathname !== '/' || configured.search || configured.hash
      || configured.username || configured.password || configured.port || url.protocol !== 'https:'
      || url.origin !== configured.origin || url.username || url.password || url.port || url.search || url.hash
      || /[%\\]/.test(url.pathname)) return null;
    if (!new RegExp(`^/storage/v1/object/public/social-media/(?:videos|reels)/${post.author_id}/[^/]+$`, 'i').test(url.pathname)) return null;
    return url.href;
  } catch { return null; }
}

export async function downloadNativeSource(source, output, { fetchImpl = fetch, timeoutMs = FFMPEG_TIMEOUT } = {}) {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeoutMs);
  let file; let reader;
  try {
    const response = await fetchImpl(source, { signal: controller.signal, redirect: 'error', credentials: 'omit' });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_FILE_SIZE) throw new Error('native_download_rejected');
    reader = response.body?.getReader(); if (!reader) throw new Error('native_download_body_missing');
    file = await open(output, 'w'); let bytes = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (controller.signal.aborted || bytes > MAX_FILE_SIZE) throw new Error('native_download_limit');
      await file.write(chunk.value);
    }
    if (!bytes) throw new Error('native_download_empty');
    return bytes;
  } finally {
    clearTimeout(deadline);controller.abort();
    await reader?.cancel().catch(() => {});await file?.close();
  }
}

/** Actual queued operation owner; explicit stages recheck authority, no retries. */
export async function processNativePost(post, { origin, claim, read, download, render, upload, publish, discard } = {}) {
  const source = nativeSourceForPost(post, origin);
  if (!source || post.transcode_status !== 'queued') return { state: 'denied' };
  const claimed = await claim(post, source);
  if (!claimed || !nativeSourceForPost(claimed, origin, source) || claimed.transcode_status !== 'running') return { state: 'not-claimed' };
  const beforeDownload = await read(post.id);
  if (!nativeSourceForPost(beforeDownload, origin, source) || beforeDownload.transcode_status !== 'running') return { state: 'revoked' };
  await download(source); await render();
  const beforeUpload = await read(post.id);
  if (!nativeSourceForPost(beforeUpload, origin, source) || beforeUpload.transcode_status !== 'running') return { state: 'revoked' };
  const artifact = await upload(post);
  try {
    const result = await publish(post, source, artifact.url, artifact.thumbnailUrl || null);
    if (!result?.completed || result.postId !== post.id) throw new Error('native_publish_not_committed');
    return { state: 'done', postId: post.id, outputUrl: artifact.url };
  } catch (error) {
    // A timeout is not proof that the publication failed. Read durable outcome
    // before deleting a potentially committed object. Unknown bytes are retained.
    let observed;try { observed=await read(post.id); } catch { observed=null; }
    if(observed?.transcode_status==='done' && observed?.media_urls?.[0]===artifact.url
      && observed?.original_media_url===source && observed?.author_id===post.author_id) {
      return {state:'done',postId:post.id,outputUrl:artifact.url,recoveredAcknowledgment:true};
    }
    if(error.definitiveRejection===true) { await discard(artifact).catch(()=>warn('Native artifact cleanup unavailable'));throw error; }
    const unknown=new Error('native_publish_outcome_unknown');unknown.code='NATIVE_PUBLISH_UNKNOWN';throw unknown;
  }
}

async function runMain() {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Native worker service identity unavailable');
  const client = createClient(origin, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (input,options={}) => {
    const controller=new AbortController();const abort=()=>controller.abort();
    options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)controller.abort();
    const timeout=setTimeout(abort,FFMPEG_TIMEOUT);
    try{return await fetch(input,{...options,signal:controller.signal});}
    finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);}
  } } });
  let working = false;
  const read = async id => {
    const { data, error } = await client.from('social_posts').select(NATIVE_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw new Error('native_authority_read_failed');return data;
  };
  const tick = async () => {
    if (working) return;working = true;
    let post;let dir;
    try {
      const { data, error } = await client.from('social_posts').select(NATIVE_COLUMNS)
        .eq('transcode_status', 'queued').eq('metadata->>native_reels_worker','sp-transcode').order('created_at', { ascending: true }).limit(1);
      if (error) throw new Error('native_queue_read_failed');post=data?.[0];if (!post) return;
      dir=await mkdtemp(join(tmpdir(), 'tx-'));const input=join(dir,'input');const output=join(dir,'output.mp4');const thumbnail=join(dir,'thumbnail.jpg');
      const result=await processNativePost(post, {
        origin, read,
        claim: async (candidate, source) => {
          let query = client.from('social_posts').update({transcode_status:'running',original_media_url:source})
            .eq('id',candidate.id).eq('author_id',candidate.author_id).eq('transcode_status','queued')
            .eq('rights_status','user_authorized').eq('playback_type','native').eq('is_deleted',false).eq('metadata->>native_reels_worker','sp-transcode')
            ;
          query=candidate.original_media_url ? query.eq('original_media_url',source) : query.is('original_media_url',null);
          const {data,error}=await query.select(NATIVE_COLUMNS).maybeSingle();
          if (error) throw new Error('native_claim_failed');return data;
        },
        download: source => downloadNativeSource(source,input),
        render: async () => {const codec=await probeCodec(input);if(codec==='h264')await remuxToMp4(input,output);else await transcode(input,output);await extractThumbnail(output,thumbnail);},
        upload: async candidate => {
          const size=(await stat(output)).size;if(!size || size>MAX_FILE_SIZE)throw new Error('native_output_limit');
          const artifactId=randomUUID();const path=`videos/${candidate.author_id}/native-${candidate.id}-${artifactId}.mp4`;
          const thumbnailPath=path.replace(/\.mp4$/,'.jpg');
          const thumbnailSize=(await stat(thumbnail)).size;if(!thumbnailSize || thumbnailSize>1_000_000)throw new Error('native_thumbnail_limit');
          try {
            const videoResult=await client.storage.from('social-media').upload(path,await readFile(output),{contentType:'video/mp4',upsert:false});
            if(videoResult.error)throw new Error('native_upload_failed');
            const imageResult=await client.storage.from('social-media').upload(thumbnailPath,await readFile(thumbnail),{contentType:'image/jpeg',upsert:false});
            if(imageResult.error)throw new Error('native_thumbnail_upload_failed');
            const {data}=client.storage.from('social-media').getPublicUrl(path);
            const thumbnailPublic=client.storage.from('social-media').getPublicUrl(thumbnailPath);
            return {path,url:data.publicUrl,thumbnailPath,thumbnailUrl:thumbnailPublic.data.publicUrl};
          } catch(error) {await client.storage.from('social-media').remove([path,thumbnailPath]);throw error;}
        },
        publish: async (candidate,source,url,thumbnailUrl) => {
          const {data,error}=await client.rpc('complete_owned_native_upload',{p_post_id:candidate.id,p_author_id:candidate.author_id,p_source_url:source,p_output_url:url,p_thumbnail_url:thumbnailUrl});
          if(error){const failure=new Error('native_publish_rejected');failure.definitiveRejection=/^[0-9A-Z]{5}$/.test(String(error.code||''));throw failure;}return data;
        },
        discard: async artifact => {const {error}=await client.storage.from('social-media').remove([artifact.path,artifact.thumbnailPath].filter(Boolean));if(error)throw new Error('native_artifact_cleanup_failed');},
      });
      if(result.state!=='done' && result.state!=='not-claimed') {
        await client.from('social_posts').update({transcode_status:'failed',transcode_error:'native_authority_denied'})
          .eq('id',post.id).eq('author_id',post.author_id).in('transcode_status',['queued','running']);
      }
      log('Native operation', result.state);
    } catch (error) {
      warn('Native operation failed:',error.message);
      if(post && error.code!=='NATIVE_PUBLISH_UNKNOWN')await client.from('social_posts').update({transcode_status:'failed',transcode_error:String(error.message).slice(0,120)})
        .eq('id',post.id).eq('author_id',post.author_id).eq('transcode_status','running');
    } finally {if(dir)await rm(dir,{recursive:true,force:true});working=false;}
  };
  // Retain the existing service's startup recovery and business polling schedule.
  const {error}=await client.from('social_posts').update({transcode_status:'queued',transcode_error:'worker_restarted'})
    .eq('transcode_status','running').eq('rights_status','user_authorized').eq('playback_type','native').eq('is_deleted',false).eq('metadata->>native_reels_worker','sp-transcode');
  if(error)throw new Error('native_startup_recovery_failed');
  await tick();setInterval(()=>{void tick();},POLL_MS);
  process.on('SIGTERM',()=>process.exit(0));process.on('SIGINT',()=>process.exit(0));
}

async function extractThumbnail(video, output) {
  await new Promise((resolve,reject)=>{
    const child=spawn('ffmpeg',['-v','error','-ss','0','-i',video,'-frames:v','1','-vf',"scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",'-q:v','3','-y',output]);
    const deadline=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('native_thumbnail_timeout'));},30000);
    child.on('error',error=>{clearTimeout(deadline);reject(error);});
    child.on('close',code=>{clearTimeout(deadline);code===0?resolve():reject(new Error('native_thumbnail_failed'));});
  });
}

// ─── ffmpeg helpers ──────────────────────────────────────────────────────────

/**
 * Probe the video codec of a file using ffprobe.
 * Returns 'h264', 'hevc', 'unknown', etc.
 */
function probeCodec(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'csv=p=0',
      filePath,
    ]);
    let out = '';
    proc.stdout.on('data', (d) => { out += d.toString(); });
    const deadline = setTimeout(() => { proc.kill('SIGKILL'); resolve('unknown'); }, 30000);
    proc.on('error', () => { clearTimeout(deadline); resolve('unknown'); });
    proc.on('close', () => { clearTimeout(deadline); resolve(out.trim().toLowerCase() || 'unknown'); });
  });
}

/**
 * Fast re-mux (no re-encoding) from .mov to .mp4 with faststart.
 * Used when the codec is already H.264 but the container is .mov.
 */
function remuxToMp4(inPath, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-i', inPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      '-y', outPath,
    ]);
    ff.stderr.on('data', (d) => process.stdout.write(d));
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`remux_exit_${code}`)));
    // Timeout
    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(new Error('remux_timeout'));
    }, FFMPEG_TIMEOUT);
    ff.on('error', error => { clearTimeout(timer); reject(error); });
    ff.on('close', () => clearTimeout(timer));
  });
}

/**
 * Full transcode: HEVC/whatever → H.264 baseline + AAC + faststart.
 * This is the most cross-compatible web container — plays on every browser
 * since Safari 5 / Chrome 4.
 */
export function nativeEncodingArguments(inPath,outPath) {
  const scale="scale=w='if(gt(iw,ih),min(1920,trunc(iw/2)*2),min(1080,trunc(iw/2)*2))':h='if(gt(iw,ih),min(1080,trunc(ih/2)*2),min(1920,trunc(ih/2)*2))':force_original_aspect_ratio=decrease:force_divisible_by=2";
  return ['-i',inPath,'-c:v','libx264','-preset','fast','-crf','23','-vf',scale,
    '-fpsmax','30','-pix_fmt','yuv420p','-profile:v','main','-level','4.0','-c:a','aac','-b:a','128k',
    '-movflags','+faststart','-y',outPath];
}

function transcode(inPath, outPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', nativeEncodingArguments(inPath,outPath));
    ff.stderr.on('data', (d) => process.stdout.write(d));
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg_exit_${code}`)));
    // Timeout
    const timer = setTimeout(() => {
      ff.kill('SIGKILL');
      reject(new Error('ffmpeg_timeout_10min'));
    }, FFMPEG_TIMEOUT);
    ff.on('error', error => { clearTimeout(timer); reject(error); });
    ff.on('close', () => clearTimeout(timer));
  });
}


if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url) await runMain();
