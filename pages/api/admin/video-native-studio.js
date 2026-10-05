import crypto from 'node:crypto';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
const { isVideoAdminProfile } = require('../../../lib/videoAdminAuthorization');

const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i,
  SHA = /^[0-9a-f]{64}$/;
const MIMES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
const MAX_BROWSER_UPLOAD_BYTES = 500_000_000;
function clients() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim(),
    service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return url && anon && service
    ? {
        anon: createClient(url, anon, { auth: { persistSession: false } }),
        admin: createClient(url, service, { auth: { persistSession: false } }),
      }
    : null;
}
async function authorize(req, res, c) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Admin session required' });
    return null;
  }
  const { data, error } = await c.anon.auth.getUser(header.slice(7));
  if (error || !data?.user) {
    res.status(401).json({ error: 'Invalid or expired admin session' });
    return null;
  }
  const profile = await c.admin
    .from('profiles')
    .select('is_admin, role')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profile.error || !isVideoAdminProfile(profile.data)) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return data.user;
}

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  res.setHeader('Cache-Control', 'no-store');
  const c = clients();
  if (!c) return res.status(500).json({ error: 'Native studio is not configured' });
  const user = await authorize(req, res, c);
  if (!user) return;
  try {
    if (req.method === 'GET') {
      const [masters, renditions, limits, candidates] = await Promise.all([
        c.admin
          .from('video_source_masters')
          .select('*,video_rights_evidence(*),video_library_videos(id,title,thumbnail_url)')
          .order('updated_at', { ascending: false })
          .limit(50),
        c.admin
          .from('video_native_renditions')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(100),
        c.admin.from('video_native_studio_limits').select('*').eq('singleton', true).maybeSingle(),
        c.admin
          .from('video_reel_candidates')
          .select(
            'id,video_id,status,clip_start_seconds,clip_end_seconds,rights_status,native_clip_eligible,video_library_videos(id,title,thumbnail_url)'
          )
          .eq('status', 'approved')
          .eq('native_clip_eligible', true)
          .order('approved_at', { ascending: false })
          .limit(100),
      ]);
      const error = masters.error || renditions.error || limits.error || candidates.error;
      if (error) return res.status(500).json({ error: error.message });
      return res
        .status(200)
        .json({
          masters: masters.data || [],
          renditions: renditions.data || [],
          candidates: candidates.data || [],
          limits: limits.data,
        });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const action = String(req.body?.action || ''),
      videoId = String(req.body?.video_id || '');
    if (!UUID.test(videoId)) return res.status(400).json({ error: 'Valid video id required' });
    if (action === 'create_upload') {
      const mime = String(req.body?.mime_type || ''),
        bytes = Number(req.body?.byte_size);
      if (
        !MIMES.has(mime) ||
        !Number.isInteger(bytes) ||
        bytes < 1024 ||
        bytes > MAX_BROWSER_UPLOAD_BYTES
      )
        return res
          .status(400)
          .json({ error: 'Supported video type required; browser uploads are limited to 500 MB' });
      const path = `${videoId}/${crypto.randomUUID()}.source`;
      const signed = await c.admin.storage.from('video-source-masters').createSignedUploadUrl(path);
      if (signed.error) return res.status(400).json({ error: signed.error.message });
      const reservation = await c.admin.from('video_source_upload_tickets').insert({
        video_id: videoId,
        storage_path: path,
        actor_id: user.id,
        byte_size: bytes,
        mime_type: mime,
      });
      if (reservation.error)
        return res.status(409).json({ error: 'Source upload reservation could not be created' });
      return res
        .status(200)
        .json({
          bucket: 'video-source-masters',
          path,
          token: signed.data.token,
          signedUrl: signed.data.signedUrl,
        });
    }
    if (action === 'register_master') {
      const path = String(req.body?.storage_path || ''),
        folder = path.split('/').slice(0, -1).join('/'),
        name = path.split('/').at(-1);
      if (!path.startsWith(`${videoId}/`) || !SHA.test(String(req.body?.sha256 || '')))
        return res.status(400).json({ error: 'Invalid master identity' });
      const listing = await c.admin.storage
        .from('video-source-masters')
        .list(folder, { search: name, limit: 2 });
      const object = (listing.data || []).find((item) => item.name === name),
        storedBytes = Number(object?.metadata?.size),
        storedMime = String(object?.metadata?.mimetype || object?.metadata?.contentType || '');
      if (
        listing.error ||
        !object ||
        !Number.isInteger(storedBytes) ||
        storedBytes !== Number(req.body?.byte_size) ||
        (storedMime && storedMime !== String(req.body?.mime_type || ''))
      )
        return res
          .status(409)
          .json({ error: 'Uploaded master identity, type, or size does not match' });
      const result = await c.admin.rpc('fn_register_video_source_master', {
        p_video_id: videoId,
        p_actor_id: user.id,
        p_rights_status: req.body?.rights_status,
        p_evidence_kind: req.body?.evidence_kind,
        p_evidence_reference: req.body?.evidence_reference,
        p_permitted_uses: ['native_clip'],
        p_territories: Array.isArray(req.body?.territories) ? req.body.territories : ['worldwide'],
        p_valid_from: req.body?.valid_from || new Date().toISOString(),
        p_valid_until: req.body?.valid_until || null,
        p_storage_path: path,
        p_sha256: req.body.sha256,
        p_mime_type: req.body?.mime_type,
        p_byte_size: storedBytes,
        p_duration: Number(req.body?.duration_seconds),
        p_width: Number(req.body?.width),
        p_height: Number(req.body?.height),
      });
      if (result.error) {
        await c.admin.storage.from('video-source-masters').remove([path]);
        await c.admin
          .from('video_source_upload_tickets')
          .update({ status: 'cleaned', cleaned_at: new Date().toISOString() })
          .eq('storage_path', path)
          .eq('status', 'reserved');
        return res.status(400).json({ error: result.error.message });
      }
      return res.status(201).json({ master: result.data });
    }
    if (action === 'queue_rendition') {
      const candidate = String(req.body?.candidate_id || '');
      if (!UUID.test(candidate))
        return res.status(400).json({ error: 'Valid candidate id required' });
      const settings = req.body?.settings;
      if (!settings || typeof settings !== 'object' || Array.isArray(settings))
        return res.status(400).json({ error: 'Studio settings required' });
      const result = await c.admin.rpc('fn_queue_video_native_rendition', {
        p_candidate_id: candidate,
        p_actor_id: user.id,
        p_settings: settings,
      });
      if (result.error) return res.status(400).json({ error: result.error.message });
      return res.status(202).json({ rendition: result.data });
    }
    if (action === 'revoke_master') {
      const reason = String(req.body?.reason || 'replaced_by_admin').trim();
      const result = await c.admin.rpc('fn_revoke_video_source_master', {
        p_video_id: videoId,
        p_actor_id: user.id,
        p_reason: reason,
      });
      if (result.error) return res.status(400).json({ error: result.error.message });
      const paths = result.data || {};
      const source = paths.source_path ? [paths.source_path] : [],
        outputs = Array.isArray(paths.output_paths) ? paths.output_paths : [];
      const [sourceDelete, outputDelete] = await Promise.all([
        source.length
          ? c.admin.storage.from('video-source-masters').remove(source)
          : Promise.resolve({ error: null }),
        outputs.length
          ? c.admin.storage.from('video-reels-native').remove(outputs)
          : Promise.resolve({ error: null }),
      ]);
      if (sourceDelete.error || outputDelete.error)
        return res
          .status(502)
          .json({
            error: 'Master was revoked, but storage cleanup requires retry',
            cleanup_pending: true,
          });
      const confirmed = await c.admin.rpc('fn_confirm_video_source_master_deleted', {
        p_video_id: videoId,
      });
      if (confirmed.error)
        return res.status(502).json({
          error: 'Storage was purged, but deletion confirmation requires retry',
          cleanup_pending: true,
        });
      return res.status(200).json({ revoked: true, deleted: true });
    }
    return res.status(400).json({ error: 'Unsupported studio action' });
  } catch (error) {
    return res.status(500).json({ error: error?.message || 'Native studio request failed' });
  }
}
