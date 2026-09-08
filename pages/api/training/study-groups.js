import { createClient } from '../../../src/lib/supabaseServerClient';
import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

let client;
function db() {
  if (!client) client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return client;
}

async function authenticate(req) {
  const { user, error } = await getServerUserWithFallback(req, db());
  return error ? null : user;
}

const clean = (value, max, fallback = '') => {
  const text = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return text || fallback;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Authorization');

  if (!applyRateLimit(req, res, req.method === 'GET' ? LIMITS.read : LIMITS.write)) return;
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ success: false, error: 'Authentication required' });

  if (req.method === 'GET') {
    const { data: groups, error } = await db()
      .from('training_study_groups')
      .select('id, owner_id, name, format, stakes, timezone, focus, schedule, level, max_members, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return res.status(500).json({ success: false, error: 'Study groups could not be loaded' });
    const ids = (groups || []).map((group) => group.id);
    const { data: members, error: memberError } = ids.length
      ? await db().from('training_study_group_members').select('group_id, user_id').in('group_id', ids).limit(2000)
      : { data: [], error: null };
    if (memberError) return res.status(500).json({ success: false, error: 'Study group membership could not be loaded' });
    const counts = {};
    const joined = new Set();
    (members || []).forEach((member) => {
      counts[member.group_id] = (counts[member.group_id] || 0) + 1;
      if (member.user_id === user.id) joined.add(member.group_id);
    });
    return res.status(200).json({
      success: true,
      groups: (groups || []).map((group) => ({
        ...group,
        members: counts[group.id] || 0,
        max: group.max_members,
        tz: group.timezone,
        tool: 'Smarter.Poker',
        joined: joined.has(group.id),
        owned: group.owner_id === user.id,
      })),
    });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    const name = clean(body.name, 80);
    if (name.length < 3) return res.status(400).json({ success: false, error: 'Group name must be at least 3 characters' });
    const { data, error } = await db().rpc('create_training_study_group', {
      p_owner_id: user.id,
      p_name: name,
      p_format: clean(body.format, 40, 'Cash'),
      p_stakes: clean(body.stakes, 60, 'All Stakes'),
      p_timezone: clean(body.timezone, 40, 'UTC'),
      p_focus: clean(body.focus, 160, 'Hand Review'),
      p_schedule: clean(body.schedule, 80, 'Flexible'),
      p_level: clean(body.level, 40, 'Any'),
      p_max_members: Math.max(2, Math.min(20, Number(body.maxMembers) || 8)),
    });
    const group = Array.isArray(data) ? data[0] : data;
    if (error || !group) return res.status(500).json({ success: false, error: 'Study group could not be created' });
    return res.status(201).json({ success: true, group });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
