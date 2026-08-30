import { createClient } from '../../../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../../../src/lib/apiRateLimit';

let client;
function db() {
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  const { user, error: authError } = await getServerUserWithFallback(req, db());
  if (authError || !user) return res.status(401).json({ success: false, error: 'Authentication required' });
  const groupId = String(req.query.groupId || '');
  if (!UUID_RE.test(groupId)) return res.status(400).json({ success: false, error: 'Invalid study group id' });

  const { data: membership, error: memberError } = await db()
    .from('training_study_group_members')
    .select('role')
    .eq('group_id', groupId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memberError || !membership) return res.status(403).json({ success: false, error: 'Join this study group to view its discussion' });

  if (req.method === 'GET') {
    const { data: messages, error } = await db()
      .from('training_study_group_messages')
      .select('id, user_id, body, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) return res.status(500).json({ success: false, error: 'Messages could not be loaded' });
    const ids = [...new Set((messages || []).map((message) => message.user_id))];
    const { data: profiles } = ids.length
      ? await db().from('profiles').select('id, username, display_name, avatar_url').in('id', ids).limit(100)
      : { data: [] };
    const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
    return res.status(200).json({
      success: true,
      messages: (messages || []).map((message) => ({ ...message, profile: profileMap.get(message.user_id) || null, mine: message.user_id === user.id })),
    });
  }

  if (req.method === 'POST') {
    const body = typeof req.body?.body === 'string' ? req.body.body.trim().slice(0, 2000) : '';
    if (!body) return res.status(400).json({ success: false, error: 'Message cannot be empty' });
    const { data: message, error } = await db()
      .from('training_study_group_messages')
      .insert({ group_id: groupId, user_id: user.id, body })
      .select('id, user_id, body, created_at')
      .single();
    if (error) return res.status(500).json({ success: false, error: 'Message could not be sent' });
    return res.status(201).json({ success: true, message: { ...message, mine: true } });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
