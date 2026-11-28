/**
 * Open Club Commander (commander.smarter.poker) already signed in.
 *
 * Commander lives on its own origin, so its localStorage cannot see the hub
 * session. The hub mints a one-time SSO token (/api/auth/commander-sso) and
 * Commander redeems it at /auth/sso, which lands on the dashboard with no
 * password.
 *
 * 2026-11-27 root cause: the Commander card read
 * localStorage['smarter-poker-auth'].session.access_token. supabase-js v2
 * stores the session flat ({ access_token, refresh_token, user, ... }), so that
 * path was always undefined and every click fell through to the Commander
 * password form. The token must come from supabase.auth.getSession(), which
 * also refreshes an expired access token before it is handed over (a raw
 * localStorage copy can be an hour stale and the SSO endpoint rejects it).
 *
 * If there is no hub session, or the SSO hop fails, Commander's own login page
 * is still the right place to go: it bridges back through this origin
 * automatically before it ever shows the password form.
 */
import { supabase } from '../supabase';

const COMMANDER_ORIGIN = process.env.NEXT_PUBLIC_COMMANDER_URL || 'https://commander.smarter.poker';
export const COMMANDER_LOGIN_URL = `${COMMANDER_ORIGIN}/commander/login`;

export async function getCommanderSsoUrl() {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) return null;
  const res = await fetch('/api/auth/commander-sso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    credentials: 'include',
  });
  const body = await res.json().catch(() => ({}));
  return res.ok && body?.url ? body.url : null;
}

export async function openClubCommander() {
  let target = COMMANDER_LOGIN_URL;
  try {
    const url = await getCommanderSsoUrl();
    if (url) target = url;
  } catch (e) {
    console.warn('[commander-sso] falling back to Commander login:', e?.message || e);
  }
  window.location.href = target;
}
