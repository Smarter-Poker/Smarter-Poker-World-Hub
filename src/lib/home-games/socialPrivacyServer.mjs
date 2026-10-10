export function isHomeGameSocialPage(page) {
  return page?.page_type === 'home_game' || page?.linked_entity_type === 'home_group';
}

// Recheck the authoritative group, not a cached public bit on an old post or
// mirror. A missing link/group is not proof of public Home Games visibility.
export async function homeGamePagePublicFlags(pages, readGroups) {
  const groupIds = [...new Set((pages || [])
    .filter(isHomeGameSocialPage)
    .map((page) => page.linked_entity_id).filter(Boolean))];
  const groups = groupIds.length ? await readGroups(groupIds) : [];
  const byId = new Map((groups || []).map((group) => [String(group.id), group]));
  return new Map((pages || []).map((page) => {
    if (!isHomeGameSocialPage(page)) return [page.id, true];
    const group = byId.get(String(page.linked_entity_id));
    return [page.id, page.is_public !== false && group?.is_active === true && group?.is_private === false];
  }));
}

export async function homeGameSocialWriteAccess(supabase, page, userId) {
  if (!isHomeGameSocialPage(page)) return { homeGame: false, allowed: true, staff: false, public: true };
  const { data: group, error } = await supabase.from('commander_home_groups')
    .select('id, owner_id, is_active, is_private').eq('id', page.linked_entity_id).maybeSingle();
  if (error) throw error;
  if (!group || group.is_active !== true) return { homeGame: true, allowed: false, public: false };
  const isPublic = page.is_public !== false && group.is_private === false;
  if (!userId) return { homeGame: true, allowed: false, staff: false, public: isPublic };
  if (group.owner_id === userId) return { homeGame: true, allowed: true, staff: true, public: isPublic };
  const { data: member, error: memberError } = await supabase.from('commander_home_members')
    .select('role, status').eq('group_id', group.id).eq('user_id', userId).maybeSingle();
  if (memberError) throw memberError;
  const allowed = member?.status === 'approved';
  return {
    homeGame: true, allowed, public: isPublic,
    staff: allowed && ['owner', 'admin', 'co_host'].includes(member.role),
  };
}
