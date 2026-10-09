import React, { useState } from 'react';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';
import { PokerNearMeConsoleIcon } from './PokerNearMeConsole';
import styles from './PokerNearMeHomeGameConsole.module.css';

// WIRING FIX: this component used to GET '/api/check-access' while its sibling
// CreateHomeGame.jsx GET '/api/commander/check-access' — the same Commander access
// gate, two different routes. Whichever one is not canonical 404s, and the `res.ok`
// guard swallows that, silently pushing an entitled user out to the external
// register wizard instead of /hub/commander/home-games/create. Both components now
// share this resolver: it prefers the Commander-namespaced route (CLAUDE.md places
// the Commander API under pages/api/commander/) and falls back to the legacy
// top-level route on 404/405, so it works whichever one the deployment serves.
const ACCESS_ENDPOINTS = ['/api/check-access', '/api/commander/check-access'];

async function checkCommanderAccess(accessToken) {
  for (const endpoint of ACCESS_ENDPOINTS) {
    let res;
    try {
      res = await fetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        credentials: 'include',
      });
    } catch (e) {
      // Network error — try the next candidate rather than failing outright.
      continue;
    }
    // Route genuinely absent on this deployment — try the other one.
    if (res.status === 404 || res.status === 405) continue;
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!data?.hasAccess;
  }
  return false;
}

export default function HostHomeGameButton({ className }) {
  const [checking, setChecking] = useState(false);

  const handleStart = async () => {
    setChecking(true);
    const WIZARD_PATH = '/commander/register?tier=home_game&from=poker_near_me&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate';
    try {
      // Use the canonical auth helpers — they check the explicit
      // 'smarter-poker-auth' AUTH_STORAGE_KEY first, then fall back to legacy
      // sb-* keys. The previous hand-rolled localStorage parse missed users
      // whose session lives only under the legacy key, which silently sent
      // them through the unauthenticated branch even though they were logged
      // in everywhere else.
      const user = getAuthUser();
      const accessToken = getAccessToken();

      if (!user || !accessToken) {
        // Truly unauthenticated → register flow.
        window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
        return;
      }

      // Authenticated → query hub-vanguard's canonical access endpoint.
      // Backed by the SECURITY DEFINER RPC get_commander_access_details(uuid),
      // which checks all four access vectors:
      //   - clubs.owner_id (Club Arena owner)
      //   - commander_subscriptions.owner_id (active sub)
      //   - commander_staff.user_id|linked_user_id (owner/manager at a venue)
      //   - commander_home_groups.owner_id (home-game host)
      if (await checkCommanderAccess(accessToken)) {
        window.location.href = '/hub/commander/home-games/create';
        return;
      }

      // Authenticated but no Commander access → register.
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    } catch (e) {
      console.warn('Commander access check failed:', e);
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    } finally {
      setChecking(false);
    }
  };

  return (
    <button
      type="button"
      className={`${className || 'hg-host-btn'} ${styles.paintedAction} ${styles.paintedActionPrimary} ${styles.hostAction}`}
      onClick={handleStart}
      disabled={checking}
      aria-busy={checking}
    >
      <PokerNearMeConsoleIcon name={checking ? 'info' : 'home'} className={styles.actionIcon} />
      <span aria-live="polite">{checking ? 'Checking Status' : 'Host A Home Game'}</span>
    </button>
  );
}
