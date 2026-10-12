export const MAX_REEL_CAPTION_BYTES = 100 * 1024;
export const MAX_REEL_CAPTION_SECONDS = 24 * 60 * 60;
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
function timestamp(value){
 const match=/^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/.exec(value);
 if(!match)return NaN;
 return Number(match[1]||0)*3600+Number(match[2])*60+Number(match[3])+Number(match[4])/1000;
}
export function validateReelWebVTT(value,{duration=MAX_REEL_CAPTION_SECONDS}={}){
 if(typeof value!=='string'||new TextEncoder().encode(value).length>MAX_REEL_CAPTION_BYTES)throw new Error('Captions must be WebVTT text under 100 KB.');
 const text=value.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 if(!/^WEBVTT(?:[ \t][^\n]*)?\n\n/.test(text)||/\u0000/.test(text))throw new Error('A valid WEBVTT header is required.');
 const blocks=text.slice(text.indexOf('\n\n')+2).trim().split(/\n{2,}/);
 if(!blocks.length||!blocks[0])throw new Error('Captions need at least one cue.');
 let cues=0;
 const bound=Number.isFinite(duration)&&duration>0?Math.min(duration,MAX_REEL_CAPTION_SECONDS):MAX_REEL_CAPTION_SECONDS;
 for(const block of blocks){
  const lines=block.split('\n');
  if(lines[0].startsWith('NOTE'))continue;
  const timing=lines[0].includes('-->')?lines.shift():(lines.shift(),lines.shift());
  const match=/^(\S+)\s+-->\s+(\S+)(?:\s+(?:align:(?:start|center|end|left|right)|position:\d{1,3}%|size:\d{1,3}%|line:(?:-?\d+|\d{1,3}%)))?$/.exec(timing||'');
  const start=match?timestamp(match[1]):NaN,end=match?timestamp(match[2]):NaN;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>bound||!lines.join('\n').trim())throw new Error('Every caption cue needs valid bounded timestamps and text.');
  // Reject styling/script payloads; captions retain only text and standard cue markup.
  if(/<(?!\/?(?:b|i|u|ruby|rt|c(?:\.[\w-]+)*|v(?: [^<>]*)?|lang(?: [\w-]+)?)>)[^>]*>|-->/i.test(lines.join('\n')))throw new Error('Unsupported caption markup.');
  cues++;
 }
 if(!cues||cues>2000)throw new Error('Captions need between 1 and 2000 cues.');
 return{text,cues};
}
export function trustedReelCaptionUrl(value,{storageUrl,authorId,reelId}={}){
 try{
  if(!UUID.test(authorId||'')||!UUID.test(reelId||''))return null;
  const base=new URL(storageUrl),url=new URL(value);
  const prefix=`/storage/v1/object/public/social-media/reels/${authorId}/caption-${reelId}`;
  if(url.protocol!=='https:'||url.origin!==base.origin||url.username||url.password||url.search||url.hash)return null;
  const suffix=url.pathname.slice(prefix.length);
  if(!url.pathname.startsWith(prefix)||!/^(-[a-f0-9]{64})?\.vtt$/.test(suffix))return null;
  return url.href;
 }catch(_){return null;}
}
export async function getReelCaptionTrack(reel,{accessToken,signal,fetcher=fetch,storageUrl}={}){
 const response=await fetcher(`/api/reels/captions?id=${encodeURIComponent(reel.id)}`,{signal,headers:accessToken?{Authorization:`Bearer ${accessToken}`}:{}});
 const payload=await response.json();if(!response.ok||!payload.success)throw new Error(payload.error||'Captions are unavailable.');
 if(!payload.url)return null;
 const url=trustedReelCaptionUrl(payload.url,{storageUrl,authorId:reel.author_id,reelId:reel.id});
 if(!url)throw new Error('The caption track could not be verified.');
 return url;
}
export async function uploadReelCaptionTrack(reel,text,{accessToken,signal,fetcher=fetch,storageUrl}={}){
 validateReelWebVTT(text);
 if(!accessToken)throw new Error('Sign in before adding captions.');
 const response=await fetcher('/api/reels/captions',{method:'POST',signal,headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({id:reel.id,text})});
 const payload=await response.json();if(!response.ok||!payload.success)throw new Error(payload.error||'Caption upload failed.');
 const url=trustedReelCaptionUrl(payload.url,{storageUrl,authorId:reel.author_id,reelId:reel.id});
 if(!url)throw new Error('The caption upload could not be verified.');return url;
}
