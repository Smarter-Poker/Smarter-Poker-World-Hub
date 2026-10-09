/**
 * CreateHomeGame — PNM-lobby CTA card that launches the Club Commander
 * home-game registration wizard.
 *
 * ARCHITECTURE NOTE: Creating a home game requires going through the
 * Club Commander activation flow (at /commander/register). The wizard
 * creates the venue_owner role, the commander_subscription, and the
 * poker_venues row; after completing it, the user lands on
 * /hub/commander/home-games/create to enter home-game-specific details
 * (stakes, schedule, visibility, etc.). That final form then POSTs to
 * /api/commander/home-games/groups which auto-creates the linked
 * social_pages row via trg_autocreate_home_group_social_page.
 *
 * IMPORTANT: This component must NEVER insert into poker_venues with
 * venue_type='home_game', and must NEVER call /api/commander/home-games/groups
 * directly. The DB-level `ck_poker_venues_not_home_game` check constraint
 * will reject the former; the latter bypasses Club Commander activation
 * and is inconsistent with the rest of the system. Route users through
 * the wizard — that is the canonical path.
 */
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';
import { PokerNearMeConsoleIcon } from './PokerNearMeConsole';
import styles from './PokerNearMeHomeGameConsole.module.css';

const WIZARD_PATH = '/commander/register?tier=home_game&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate';

// WIRING FIX: this component used to GET '/api/commander/check-access' while its
// sibling HostHomeGameButton.jsx GET '/api/check-access' — the same Commander access
// gate, two different routes. Whichever one is not canonical 404s, and the
// `res.ok` guard swallows that, silently pushing an entitled user out to the
// external register wizard. Both components now share this resolver: it prefers the
// Commander-namespaced route (CLAUDE.md places the Commander API under
// pages/api/commander/) and falls back to the legacy top-level route on 404/405,
// so it behaves correctly whichever one the deployment actually serves.
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

const HOME_GAME_BENEFITS = [
  { icon: 'calendar', text: 'Set Your Schedule, One-Off Or Recurring' },
  { icon: 'community', text: 'Manage RSVPs, Waitlists, And Attendance' },
  { icon: 'saved', text: 'Private Or Public, You Control Who Can Join' },
  { icon: 'search', text: 'Free Public Listing On Poker Near Me' },
];

export default function CreateHomeGame({ onCancel }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);

  const handleStart = async () => {
    setChecking(true);
    try {
      // REGRESSION FIX: this used to hand-roll the localStorage 'smarter-poker-auth'
      // parse — the exact pattern HostHomeGameButton's comment documents as a fixed
      // bug, because it misses users whose session lives only under the legacy sb-*
      // keys and silently sent them down the unauthenticated branch. Use the canonical
      // helpers, which check AUTH_STORAGE_KEY first and then fall back to legacy keys.
      const user = getAuthUser();
      const accessToken = getAccessToken();

      if (!user || !accessToken) {
        window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
        return;
      }

      if (await checkCommanderAccess(accessToken)) {
        router.push('/hub/commander/home-games/create');
        return;
      }

      // If we get here, they need to register.
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    } catch (e) {
      console.warn('Commander access check failed:', e);
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    } finally {
      setChecking(false);
    }
  };

  return (
    <section
      className={`pnm-create-home-game-cta ${styles.createHomeGame}`}
      aria-labelledby="pnm-create-home-game-title"
    >
      <div className={`hg-cta-inner ${styles.createHomeGameInner}`}>
        <PokerNearMeConsoleIcon name="home" className={`hg-cta-icon ${styles.heroIcon}`} />

        <h3 id="pnm-create-home-game-title" className={`hg-cta-title ${styles.createTitle}`}>
          List Your Home Game On Poker Near Me
        </h3>
        <p className={`hg-cta-subtitle ${styles.copy}`}>
          100% Free To Start. No Credit Card Required. Host Your Own Poker Game, List It Publicly,
          And Let Players In Your Area Find You.
        </p>

        <ul className={`hg-cta-bullets ${styles.benefitList}`}>
          {HOME_GAME_BENEFITS.map(({ icon, text }) => (
            <li key={text} className={styles.benefitRow}>
              <PokerNearMeConsoleIcon name={icon} className={`hg-cta-bullet-icon ${styles.benefitIcon}`} />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className={`hg-cta-actions ${styles.actionGroup}`} aria-busy={checking}>
          <button
            type="button"
            onClick={handleStart}
            disabled={checking}
            className={`hg-cta-primary ${styles.paintedAction} ${styles.paintedActionPrimary}`}
          >
            <span aria-live="polite">{checking ? 'Checking Status' : "Get Started, It's Free"}</span>
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={checking}
              className={`hg-cta-secondary ${styles.paintedAction}`}
            >
              Maybe Later
            </button>
          )}
        </div>

        <p className={`hg-cta-fineprint ${styles.finePrint}`}>
          Takes About 60 Seconds. You'll Be Able To Add Stakes, Schedule, And Photos In The Next Step.
        </p>
      </div>
    </section>
  );
}
