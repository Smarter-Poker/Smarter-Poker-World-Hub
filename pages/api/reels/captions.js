import {createHash} from 'node:crypto';
import {createClient} from '../../../src/lib/supabaseServerClient';
import {getServerUserWithFallback} from '../../../src/lib/serverAuth';
import {applyRateLimit,LIMITS} from '../../../src/lib/apiRateLimit';
import {readPublicReelById} from '../../../src/lib/server/reelsFeed';
import {validateReelWebVTT,trustedReelCaptionUrl,MAX_REEL_CAPTION_BYTES} from '../../../src/lib/reelNativeCaptions.mjs';
export const config={api:{bodyParser:{sizeLimit:'120kb'}}};
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const columns='id,author_id,is_public,is_deleted,media_status,playback_type,rights_status,moderation_state,taken_down_at,caption_track_url';
function nativeReady(row){return row?.playback_type==='native'&&row.media_status==='ready'&&!row.is_deleted&&!row.taken_down_at&&row.moderation_state==='active'&&['owned','licensed','user_authorized'].includes(row.rights_status);}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('Vary','Authorization');
 if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return res.status(405).json({success:false,error:'Method not allowed'});}
 if(!applyRateLimit(req,res,req.method==='GET'?LIMITS.read:LIMITS.upload))return;
 const id=String(req.method==='POST'?req.body?.id:req.query.id||'').trim().toLowerCase();
 if(!UUID.test(id))return res.status(400).json({success:false,error:'Invalid Reel identity'});
 try{
  const storageUrl=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
  const client=createClient(storageUrl,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:row,error}=await client.from('social_reels').select(columns).eq('id',id).maybeSingle();
  if(error)throw error;
  if(!row||!nativeReady(row))return res.status(404).json({success:false,error:'Native captions are unavailable for this Reel'});
  let user=null;
  if(req.headers.authorization){const auth=await getServerUserWithFallback(req,client);if(!auth.error)user=auth.user;}
  if(req.method==='GET'){
   if(user?.id!==row.author_id){const publicReel=await readPublicReelById({id,client});if(!publicReel.data||publicReel.data.id!==id)return res.status(404).json({success:false,error:'Reel not found'});}
   const url=row.caption_track_url?trustedReelCaptionUrl(row.caption_track_url,{storageUrl,authorId:row.author_id,reelId:id}):null;
   return res.status(200).json({success:true,url});
  }
  if(!user?.id)return res.status(401).json({success:false,error:'Authentication required'});
  if(user.id!==row.author_id||row.rights_status!=='user_authorized')return res.status(403).json({success:false,error:'Only the original native Reel creator may add captions'});
  let validated;try{validated=validateReelWebVTT(req.body?.text);}catch(error){return res.status(400).json({success:false,error:error.message});}
  // Immutable content-addressed revisions avoid an upload racing an existing live track.
  const hash=createHash('sha256').update(validated.text).digest('hex');
  const path=`reels/${user.id}/caption-${id}-${hash}.vtt`;
  const bucket=client.storage.from('social-media');
  const uploaded=await bucket.upload(path,Buffer.from(validated.text,'utf8'),{contentType:'text/vtt',cacheControl:'31536000',upsert:false});
  if(uploaded.error){
   // A deterministic same-content request may already exist. Confirm actual bytes once.
   const filename=path.split('/').pop();
   const listed=await bucket.list(`reels/${user.id}`,{search:filename,limit:1});
   const object=listed.data?.find(item=>item.name===filename);
   if(listed.error||!object||!Number.isFinite(Number(object.metadata?.size))||Number(object.metadata.size)>MAX_REEL_CAPTION_BYTES)throw uploaded.error;
   const existing=await bucket.download(path);
   if(existing.error||!existing.data||existing.data.size>MAX_REEL_CAPTION_BYTES||await existing.data.text()!==validated.text)throw uploaded.error;
  }else if(uploaded.data?.path!==path)throw new Error('Caption upload identity could not be confirmed');
  const publicUrl=bucket.getPublicUrl(path)?.data?.publicUrl;
  const url=trustedReelCaptionUrl(publicUrl,{storageUrl,authorId:user.id,reelId:id});if(!url)throw new Error('Caption storage URL could not be confirmed');
  const updated=await client.from('social_reels').update({caption_track_url:url}).eq('id',id).eq('author_id',user.id).eq('playback_type','native').eq('rights_status','user_authorized').eq('media_status','ready').eq('moderation_state','active').eq('is_deleted',false).is('taken_down_at',null).select('id,caption_track_url').maybeSingle();
  if(updated.error)throw updated.error;
  if(updated.data?.id!==id||updated.data.caption_track_url!==url)return res.status(409).json({success:false,error:'This Reel changed during the caption upload'});
  return res.status(200).json({success:true,url});
 }catch(error){console.warn('[Reels captions] Request failed:',error?.message||error);return res.status(503).json({success:false,error:'Caption storage is temporarily unavailable'});}
}
