import { homeGamePagePublicFlags, homeGameSocialWriteAccess } from './socialPrivacyServer.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Global mirrors are public projections, never a substitute for an approved
// member's Commander/private-page reader. Match the feed's current-parent law.
export async function publicHomeGameMirrors(supabase, posts) {
  const ids = [...new Set((posts || []).map(post => post.metadata?.source_page_id)
    .filter(id => UUID_RE.test(String(id || ''))))];
  let flags = new Map();
  if (ids.length) {
    const { data: pages, error } = await supabase.from('social_pages')
      .select('id, page_type, is_public, linked_entity_type, linked_entity_id').in('id', ids);
    if (error) throw error;
    flags = await homeGamePagePublicFlags(pages, async groupIds => {
      const { data: groups, error: groupError } = await supabase.from('commander_home_groups')
        .select('id, is_active, is_private').in('id', groupIds);
      if (groupError) throw groupError;
      return groups;
    });
  }
  return (posts || []).filter(post => {
    const sourceId = post.metadata?.source_page_id;
    if (sourceId) return flags.get(sourceId) === true;
    return post.metadata?.page_type !== 'home_game';
  });
}

// Service-role engagement reads must inherit the current parent-page decision.
// A caller-supplied post id is not authorization to read private comments.
export async function homeGamePostAccess(supabase, postId, userId, write = false) {
  const { data: post, error } = await supabase.from('social_page_posts')
    .select('id, page_id').eq('id', postId).maybeSingle();
  if (error) throw error;
  if (!post) return { allowed: false, status: 404 };
  const { data: page, error: pageError } = await supabase.from('social_pages')
    .select('id, page_type, is_public, linked_entity_type, linked_entity_id')
    .eq('id', post.page_id).maybeSingle();
  if (pageError) throw pageError;
  if (!page) return { allowed: false, status: 404 };
  const access = await homeGameSocialWriteAccess(supabase, page, userId);
  return { ...access, allowed: write ? access.allowed : access.allowed || access.public, status: 403 };
}
