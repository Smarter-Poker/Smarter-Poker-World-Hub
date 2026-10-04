import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

function clients() {
  const url=(process.env.NEXT_PUBLIC_SUPABASE_URL||'').trim(), anon=(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'').trim(), service=(process.env.SUPABASE_SERVICE_ROLE_KEY||'').trim();
  if (!url || !anon || !service) return null;
  return { anon:createClient(url,anon,{auth:{persistSession:false}}), admin:createClient(url,service,{auth:{persistSession:false}}) };
}
async function authorize(req,res,c) {
  const configured=(process.env.ADMIN_ROUTE_SECRET||'').trim();
  if (configured && req.headers['x-admin-secret']===configured && req.method==='GET') return {id:null};
  const header=req.headers.authorization||'';
  if (!header.startsWith('Bearer ')) { res.status(401).json({error:'Admin session required'}); return null; }
  const {data,error}=await c.anon.auth.getUser(header.slice(7));
  if (error || !data?.user) { res.status(401).json({error:'Invalid or expired admin session'}); return null; }
  const profile=await c.admin.from('profiles').select('is_admin').eq('id',data.user.id).maybeSingle();
  if (profile.error || profile.data?.is_admin!==true) { res.status(403).json({error:'Admin access required'}); return null; }
  return data.user;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const STATES=new Set(['discovered','validated','enriched','candidate','approved','rejected','published']);
function decodeCursor(raw) {
  if (!raw) return null;
  try { const value=JSON.parse(Buffer.from(String(raw),'base64url').toString('utf8')), date=new Date(value?.updated_at); return Number.isFinite(date.getTime())&&date.toISOString()===value.updated_at&&UUID.test(value?.video_id)?value:null; }
  catch { return null; }
}
function encodeCursor(record) { return Buffer.from(JSON.stringify({updated_at:record.updated_at,video_id:record.video_id})).toString('base64url'); }

export default async function handler(req,res) {
  if (!applyRateLimit(req,res,req.method==='GET'?LIMITS.read:LIMITS.write)) return;
  res.setHeader('Cache-Control','no-store'); const c=clients();
  if (!c) return res.status(500).json({error:'Editorial workflow is not configured'});
  const user=await authorize(req,res,c); if (!user) return;
  try {
    if (req.method==='GET') {
      const state=typeof req.query.state==='string' ? req.query.state : null;
      if (state && !STATES.has(state)) return res.status(400).json({error:'Unsupported editorial state'});
      const pageSize=Math.min(50,Math.max(10,Number.parseInt(req.query.pageSize,10)||25));
      const cursor=decodeCursor(req.query.cursor);
      if (req.query.cursor && !cursor) return res.status(400).json({error:'Invalid editorial cursor'});
      let query=c.admin.from('video_enrichment_records').select('*,video_library_videos!inner(id,title,thumbnail_url,source_name,type,duration,views_count,video_url)').order('updated_at',{ascending:false}).order('video_id',{ascending:false}).limit(pageSize+1);
      if (state) query=query.eq('workflow_state',state);
      if (cursor) query=query.or(`updated_at.lt.${cursor.updated_at},and(updated_at.eq.${cursor.updated_at},video_id.lt.${cursor.video_id})`);
      const [records,jobs,totalRecords,totalCandidates,totalApproved]=await Promise.all([
        query,
        c.admin.from('video_enrichment_jobs').select('id,video_id,job_type,status,attempt_count,max_attempts,failure_code,available_at,updated_at').in('status',['retry','dead_letter']).order('updated_at',{ascending:false}).limit(100),
        c.admin.from('video_enrichment_records').select('*',{count:'exact',head:true}),
        c.admin.from('video_reel_candidates').select('*',{count:'exact',head:true}),
        c.admin.from('video_reel_candidates').select('*',{count:'exact',head:true}).eq('status','approved'),
      ]);
      if (records.error || jobs.error || totalRecords.error || totalCandidates.error || totalApproved.error) return res.status(500).json({error:(records.error||jobs.error||totalRecords.error||totalCandidates.error||totalApproved.error).message});
      const page=(records.data||[]).slice(0,pageSize), hasMore=(records.data||[]).length>pageSize;
      const ids=page.map(record=>record.video_id);
      const candidates=ids.length
        ? await c.admin.from('video_reel_candidates').select('*').in('video_id',ids).order('updated_at',{ascending:false})
        : {data:[],error:null};
      if (candidates.error) return res.status(500).json({error:candidates.error.message});
      return res.status(200).json({records:page,exceptions:jobs.data||[],candidates:candidates.data||[],nextCursor:hasMore?encodeCursor(page.at(-1)):null,
        totals:{queue:totalRecords.count||0,candidates:totalCandidates.count||0,exceptions:(jobs.data||[]).length,ready:totalApproved.count||0}});
    }
    if (req.method==='POST') {
      const id=String(req.body?.video_id||''); if (!UUID.test(id)) return res.status(400).json({error:'Valid video id required'});
      const result=await c.admin.rpc('fn_enqueue_video_enrichment',{p_video_id:id,p_generation:Number(req.body?.generation)||1});
      if (result.error) return res.status(400).json({error:result.error.message});
      return res.status(202).json({video_id:id,enqueued:result.data});
    }
    if (req.method==='PATCH') {
      if (req.body?.candidate_id) {
        const candidateId=String(req.body.candidate_id), action=String(req.body.action||''), version=Number(req.body.version);
        if (!UUID.test(candidateId) || !Number.isInteger(version) || !['approve','reject'].includes(action)) return res.status(400).json({error:'Valid candidate, version, and review action required'});
        const result=await c.admin.rpc('fn_review_video_reel_candidate',{p_candidate_id:candidateId,p_actor_id:user.id,p_action:action,p_expected_version:version,p_reason:req.body?.reason||null});
        if (result.error) return res.status(result.error.message?.includes('version conflict')?409:400).json({error:result.error.message});
        return res.status(200).json({candidate:result.data});
      }
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
