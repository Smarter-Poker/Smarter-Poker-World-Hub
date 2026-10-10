const PUBLIC_PROFILE_ROUTE = '/api/profile/public';

export async function loadPublicProfile(username, fetchImpl = fetch) {
  const value = typeof username === 'string' ? username.trim() : '';
  if (!value) return { data: null, error: 'invalid_username', status: 400 };

  try {
    const response = await fetchImpl(
      `${PUBLIC_PROFILE_ROUTE}?username=${encodeURIComponent(value)}`,
      { method: 'GET', cache: 'no-store', headers: { Accept: 'application/json' } }
    );
    const body = await response.json().catch(() => null);
    if (response.ok && body?.success === true && body.profile?.id) {
      return { data: body.profile, error: null, status: response.status };
    }
    return {
      data: null,
      error: body?.error || 'Profile temporarily unavailable',
      status: response.status,
    };
  } catch (_error) {
    return { data: null, error: 'Profile temporarily unavailable', status: 0 };
  }
}
