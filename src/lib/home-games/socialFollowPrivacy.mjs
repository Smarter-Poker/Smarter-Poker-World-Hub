import { isHomeGameSocialPage } from './socialPrivacyServer.mjs';

export async function homeGameFollowContext(supabase, page, userId) {
  if (!isHomeGameSocialPage(page)) return { homeGame: false };
  const { data: group, error } = await supabase.from('commander_home_groups')
    .select('id, owner_id, is_active, is_private').eq('id', page.linked_entity_id).maybeSingle();
  if (error) throw error;
  let member = null;
  if (group && userId && userId !== group.owner_id) {
    const result = await supabase.from('commander_home_members').select('role, status')
      .eq('group_id', group.id).eq('user_id', userId).maybeSingle();
    if (result.error) throw result.error;
    member = result.data;
  }
  const active = group?.is_active === true;
  const owner = Boolean(userId && group?.owner_id === userId);
  const approved = active && (owner || member?.status === 'approved');
  return { homeGame: true, active, approved,
    staff: approved && (owner || ['owner', 'admin', 'co_host'].includes(member?.role)),
    public: active && page.is_public !== false && group?.is_private === false,
    denied: ['banned', 'declined'].includes(member?.status),
  };
}

export function publicHomeGameFollowPage(page) {
  if (!isHomeGameSocialPage(page)) return page;
  const fields = ['id', 'slug', 'name', 'page_type', 'is_public', 'avatar_url', 'cover_url', 'description', 'location_city', 'location_state'];
  return Object.fromEntries(fields.filter(field => field in page).map(field => [field, page[field]]));
}
