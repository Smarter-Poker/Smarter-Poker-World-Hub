const VIDEO_ADMIN_ROLES = new Set(['admin', 'superadmin', 'god']);

function isVideoAdminProfile(profile) {
  const role = typeof profile?.role === 'string' ? profile.role.trim().toLowerCase() : '';
  return profile?.is_admin === true || VIDEO_ADMIN_ROLES.has(role);
}

module.exports = { isVideoAdminProfile };
