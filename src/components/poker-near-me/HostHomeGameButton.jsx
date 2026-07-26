import React, { useState } from 'react';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';

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
      className={className || "hg-host-btn relative overflow-hidden"}
      onClick={handleStart}
      disabled={checking}
    >
      {checking ? (
        <div className="absolute inset-0 bg-[#242526]/95 flex items-center justify-center z-10">
          <div className="w-4 h-4 border-2 border-[#1877F2]/30 border-t-[#1877F2] rounded-full animate-spin mr-2" />
          <span className="text-xs font-semibold text-[#E4E6EB]">Checking...</span>
        </div>
      ) : null}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Host A Home Game
    </button>
  );
}
