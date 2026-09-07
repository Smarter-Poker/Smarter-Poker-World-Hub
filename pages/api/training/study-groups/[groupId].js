import { createClient } from '../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

let client;
function db() {
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function auth(req) {
  const { user, error } = await getServerUserWithFallback(req, db());
  return error ? null : user;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  const user = await auth(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const groupId = String(req.query.groupId || '');
  if (!UUID_RE.test(groupId)) return res.status(400).json({ success: false, error: 'Invalid study group id' });

  const { data: group, error: groupError } = await db()
    .from('training_study_groups')
    .select('id, owner_id, name, format, stakes, timezone, focus, schedule, level, max_members, created_at')
    .eq('id', groupId)
    .maybeSingle();
  if (groupError) return res.status(500).json({ success: false, error: 'Study group could not be loaded' });
  if (!group) return res.status(404).json({ success: false, error: 'Study group not found' });

  if (req.method === 'GET') {
    const { data: members, error } = await db()
      .from('training_study_group_members')
      .select('user_id, role, joined_at')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })
      .limit(20);
    if (error) return res.status(500).json({ success: false, error: 'Members could not be loaded' });
    const ids = (members || []).map((member) => member.user_id);
    const { data: profiles } = ids.length
      ? await db().from('profiles').select('id, username, display_name, avatar_url').in('id', ids).limit(20)
      : { data: [] };
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    return res.status(200).json({
      success: true,
      group: { ...group, joined: ids.includes(user.id), owned: group.owner_id === user.id },
      members: (members || []).map((member) => ({ ...member, profile: profileMap.get(member.user_id) || null })),
    });
  }

  if (req.method === 'POST') {
    const { data: result, error } = await db().rpc('join_training_study_group', {
      p_group_id: groupId,
      p_user_id: user.id,
    });
    if (error) return res.status(500).json({ success: false, error: 'Study group could not be joined' });
    if (result === 'full') return res.status(409).json({ success: false, error: 'This study group is full' });
    if (result === 'not_found') return res.status(404).json({ success: false, error: 'Study group not found' });
    if (result !== 'joined') return res.status(500).json({ success: false, error: 'Study group could not be joined' });
    return res.status(200).json({ success: true, groupId });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
