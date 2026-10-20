/** Agent rank never confers whole-club staff authority. */
const STAFF_ROLES = new Set(['owner', 'co_owner', 'admin']);
export function isActiveClubMembership(member) {
  return Boolean(member && ['active', 'approved'].includes(member.status) && member.is_active !== false);
}
export function isClubStaffMembership(member) {
  return isActiveClubMembership(member) && STAFF_ROLES.has(member.role);
}
export async function loadAgentDataScope(db, clubId, userId) {
  const { data, error } = await db.rpc('fn_ca_club_data_downline', { p_club_id: clubId, p_user: userId });
  if (error) throw error;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!Array.isArray(data) || !data.includes(userId) || data.some((id) => typeof id !== 'string' || !uuid.test(id))) {
    throw new Error('Agent data scope could not be verified');
  }
  return [...new Set(data)];
}
