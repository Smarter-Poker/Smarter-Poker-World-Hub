import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

function clients() {
  const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').trim(), anon=(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'').trim(), service=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if (!url || !anon || !service) return null;
  return { anon:createClient(url,anon,{auth:{persistSession:false}}), admin:createClient(url,service,{auth:{persistSession:false}}) };
}
async function authorize(req,res,c) {
  const configured=(process.env.ADMIN_ROUTE_SECRET||'').trim();
  if (configured && req.headers['x-admin-secret']===configured) return {id:null};
  const header=req.headers.authorization||'';
  if (!header.startsWith('Bearer ')) { res.status(401).json({error:'Admin session required'}); return null; }
  const {data,error}=await c.anon.auth.getUser(header.slice(7));
  if (error || !data?.user) { res.status(401).json({error:'Invalid or expired admin session'}); return null; }
  const profile=await c.admin.from('profiles').select('is_admin').eq('id',data.user.id).maybeSingle();
  if (profile.error || profile.data?.is_admin!==true) { res.status(403).json({error:'Admin access required'}); return null; }
  return data.user;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

export default async function handler(req,res) {
  if (!applyRateLimit(req,res,LIMITS.read)) return;
  res.setHeader('Cache-Control','no-store'); const c=clients();
  if (!c) return res.status(500).json({error:'Editorial workflow is not configured'});
  const user=await authorize(req,res,c); if (!user) return;
  try {
    if (req.method==='GET') {
      const state=typeof req.query.state==='string' ? req.query.state : null;
      let query=c.admin.from('video_enrichment_records').select('*,video_library_videos!inner(id,title,thumbnail_url,source_name,type,duration,views_count,video_url)').order('updated_at',{ascending:false}).limit(100);
      if (state) query=query.eq('workflow_state',state);
      const [records,jobs]=await Promise.all([query,c.admin.from('video_enrichment_jobs').select('id,video_id,job_type,status,attempt_count,max_attempts,failure_code,available_at,updated_at').in('status',['retry','dead_letter']).order('updated_at',{ascending:false}).limit(100)]);
      if (records.error || jobs.error) return res.status(500).json({error:(records.error||jobs.error).message});
      return res.status(200).json({records:records.data||[],exceptions:jobs.data||[]});
    }
    if (req.method==='POST') {
      const id=String(req.body?.video_id||''); if (!UUID.test(id)) return res.status(400).json({error:'Valid video id required'});
      const result=await c.admin.rpc('fn_enqueue_video_enrichment',{p_video_id:id,p_generation:Number(req.body?.generation)||1});
      if (result.error) return res.status(400).json({error:result.error.message});
      return res.status(202).json({video_id:id,enqueued:result.data});
    }
    if (req.method==='PATCH') {
      const id=String(req.body?.video_id||''), action=String(req.body?.action||''), version=Number(req.body?.version);
      if (!UUID.test(id) || !Number.isInteger(version)) return res.status(400).json({error:'Valid video id and version required'});
      const allowed=new Set(['edit','approve','reject','schedule','quarantine','restore','replay']); if (!allowed.has(action)) return res.status(400).json({error:'Unsupported action'});
      const result=await c.admin.rpc('fn_apply_video_editorial_action',{p_video_id:id,p_actor_id:user.id,p_action:action,p_expected_version:version,p_changes:req.body?.changes||{},p_reason:req.body?.reason||null});
      if (result.error) return res.status(result.error.message?.includes('version conflict')?409:400).json({error:result.error.message});
      if (action==='replay') await c.admin.rpc('fn_enqueue_video_enrichment',{p_video_id:id,p_generation:version+1});
      return res.status(200).json({record:result.data});
    }
    res.setHeader('Allow','GET, POST, PATCH'); return res.status(405).json({error:'Method not allowed'});
  } catch (error) { return res.status(500).json({error:error?.message||'Editorial request failed'}); }
}
