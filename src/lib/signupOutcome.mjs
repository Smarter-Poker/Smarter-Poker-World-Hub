/** Interpret the duplicate result returned by Auth without a public email lookup. */
export function isExistingSignup(data, error) {
  if (['user_already_exists', 'email_exists', 'identity_already_exists'].includes(error?.code)) return true;
  if (/^(user already registered|user already exists|email already registered|email already exists|identity already exists)[.!]?$/i.test(String(error?.message || '').trim())) return true;
  // With confirmations enabled, Auth may return an obfuscated user instead of an error.
  return !error && !data?.session && Array.isArray(data?.user?.identities) && data.user.identities.length === 0;
}
