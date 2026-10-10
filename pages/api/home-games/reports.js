import { bridgeRequest, LIMITS } from '../../../src/lib/home-games/rpcBridge';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASONS = ['other', 'illegal', 'self_harm', 'doxxing'];

// Native Commander post IDs only. Social page posts are a different resource
// and must never be written into this table's native target namespace.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  const bridge = await bridgeRequest(req, res, { method: 'POST', limit: LIMITS.write });
  if (!bridge.ok) {
    if (bridge._alreadyResponded) return;
    return res.status(bridge.status).json(bridge.body);
  }
  const { supabase, user } = bridge;
  const { group_id, post_id, report_id, reason_category = 'other', reason_text } = req.body || {};
  if (![group_id, post_id, report_id].every(value => typeof value === 'string' && UUID.test(value))
      || !REASONS.includes(reason_category) || typeof reason_text !== 'string'
      || reason_text.trim().length < 5 || reason_text.trim().length > 2000) {
    return res.status(400).json({ success: false, error: 'Choose a valid post and describe the concern in 5 to 2000 characters' });
  }
  try {
    const { data: post, error: postError } = await supabase.from('commander_home_posts')
      .select('id, group_id, author_id').eq('id', post_id).eq('group_id', group_id).maybeSingle();
    if (postError) throw postError;
    if (!post) return res.status(404).json({ success: false, error: 'Post not available' });
    if (post.author_id === user.id) return res.status(400).json({ success: false, error: 'You cannot report your own post' });
    const { data: group, error: groupError } = await supabase.from('commander_home_groups')
      .select('id, owner_id, is_active').eq('id', group_id).maybeSingle();
    if (groupError) throw groupError;
    if (!group || group.is_active !== true) return res.status(404).json({ success: false, error: 'Home Game not available' });
    if (group.owner_id !== user.id) {
      const { data: member, error: memberError } = await supabase.from('commander_home_members')
        .select('status').eq('group_id', group_id).eq('user_id', user.id).maybeSingle();
      if (memberError) throw memberError;
      if (member?.status !== 'approved') return res.status(403).json({ success: false, error: 'Approved group access required' });
    }
    // No return representation: ordinary reporters cannot read the host-only
    // moderation queue. The caller-owned ID retains identity across lost acks.
    const { error } = await supabase.from('commander_home_content_reports').insert({
      id: report_id, reporter_id: user.id, reported_type: 'post', reported_id: post.id,
      content_author_id: post.author_id, reason_category, reason_text: reason_text.trim(), status: 'pending',
    });
    if (error?.code === '23505') return res.status(409).json({ success: false, error: 'A report is already recorded. Do not send a duplicate.' });
    if (error) throw error;
    return res.status(201).json({ success: true, report_id, status: 'pending' });
  } catch (error) {
    console.warn('[home-games report] unavailable:', error?.code || error?.name || 'Error');
    return res.status(503).json({ success: false, error: 'Report submission could not be confirmed. Keep this request and review before retrying.' });
  }
}
