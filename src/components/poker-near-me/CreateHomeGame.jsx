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
import { Home, Sparkles, Calendar, Users, Shield, ArrowRight } from 'lucide-react';
import { getAuthUser, getAccessToken } from '../../lib/authUtils';

const WIZARD_PATH = '/commander/register?tier=home_game&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate';

// WIRING FIX: this component used to GET '/api/commander/check-access' while its
// sibling HostHomeGameButton.jsx GET '/api/check-access' — the same Commander
// access gate, two different routes. Whichever one is not canonical 404s, and the
// `res.ok` guard swallows that, silently pushing an entitled user out to the
// external register wizard. Both components now share this resolver: it prefers the
// Commander-namespaced route (CLAUDE.md places the Commander API under
// pages/api/commander/) and falls back to the legacy top-level route on 404/405,
// so it behaves correctly whichever one the deployment actually serves.
const ACCESS_ENDPOINTS = ['/api/commander/check-access', '/api/check-access'];

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

      // If we get here, they need to register
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    } catch (e) {
      console.warn('Commander access check failed:', e);
      window.location.href = `https://commander.smarter.poker${WIZARD_PATH}`;
    } finally {
      setChecking(false);
    }
  };

  const bullets = [
    { Icon: Calendar, text: 'Set your schedule — one-off or recurring' },
    { Icon: Users,    text: 'Manage RSVPs, waitlists, and attendance' },
    { Icon: Shield,   text: 'Private or public — you control who can join' },
    { Icon: Sparkles, text: 'Free public listing on Poker Near Me' },
  ];

  return (
    <div className="pnm-create-home-game-cta">
      <div className="hg-cta-inner">
        <div className="hg-cta-icon" aria-hidden="true">
          <Home size={28} strokeWidth={1.8} />
        </div>

        <h3 className="hg-cta-title">List Your Home Game On Poker Near Me</h3>
        <p className="hg-cta-subtitle">
          100% free to start. No credit card required. Host your own poker game, list it publicly,
          and let players in your area find you.
        </p>

        <ul className="hg-cta-bullets">
          {bullets.map(({ Icon, text }, i) => (
            <li key={i}>
              <Icon size={16} strokeWidth={2} className="hg-cta-bullet-icon" aria-hidden="true" />
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className="hg-cta-actions relative">
          {checking ? (
            <div className="absolute inset-0 bg-[#242526]/90 flex items-center justify-center rounded-xl backdrop-blur-sm z-10 border border-[#1877F2]/30">
              <div className="flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-[#1877F2]/30 border-t-[#1877F2] rounded-full animate-spin" />
                <span className="text-sm font-semibold text-[#E4E6EB]">Checking Status...</span>
              </div>
            </div>
          ) : null}
          <button type="button" onClick={handleStart} disabled={checking} className="hg-cta-primary">
            Get Started - It's Free
            <ArrowRight size={16} strokeWidth={2.4} />
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={checking} className="hg-cta-secondary">
              Maybe Later
            </button>
          )}
        </div>

        <p className="hg-cta-fineprint">
          Takes about 60 seconds. You'll be able to add stakes, schedule, and photos in the next step.
        </p>
      </div>

      <style>{`
        .pnm-create-home-game-cta {
          display: flex;
          align-items: stretch;
          justify-content: center;
          padding: 16px 8px 24px;
        }
        .hg-cta-inner {
          width: 100%;
          max-width: 560px;
          padding: 28px 24px 24px;
          background: linear-gradient(180deg, rgba(24, 119, 242, 0.08) 0%, rgba(36, 37, 38, 0.95) 70%);
          border: 1px solid rgba(24, 119, 242, 0.35);
          border-radius: 16px;
          text-align: center;
        }
        .hg-cta-icon {
          width: 56px;
          height: 56px;
          border-radius: 14px;
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(24, 119, 242, 0.14);
          color: #4a9fff;
          border: 1px solid rgba(24, 119, 242, 0.35);
        }
        .hg-cta-title {
          font-size: 20px;
          font-weight: 700;
          color: #E4E6EB;
          margin: 0 0 10px;
          line-height: 1.25;
        }
        .hg-cta-subtitle {
          font-size: 14px;
          color: #B0B3B8;
          line-height: 1.5;
          margin: 0 auto 20px;
          max-width: 460px;
        }
        .hg-cta-bullets {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 0;
          margin: 0 auto 24px;
          list-style: none;
          max-width: 420px;
          text-align: left;
        }
        .hg-cta-bullets li {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 13px;
          color: #DADDE1;
          line-height: 1.5;
        }
        .hg-cta-bullet-icon {
          color: #31A24C;
          flex-shrink: 0;
          margin-top: 2px;
        }
        .hg-cta-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 14px;
        }
        .hg-cta-primary,
        .hg-cta-secondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.2px;
          cursor: pointer;
          transition: transform 0.08s ease, background 0.15s ease, border-color 0.15s ease;
          border: 1px solid transparent;
        }
        .hg-cta-primary {
          background: linear-gradient(180deg, #1877F2 0%, #1664d9 100%);
          color: white;
          box-shadow: 0 2px 10px rgba(24, 119, 242, 0.35);
        }
        .hg-cta-primary:hover { transform: translateY(-1px); }
        .hg-cta-primary:active { transform: translateY(0); }
        .hg-cta-secondary {
          background: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.12);
          color: #B0B3B8;
        }
        .hg-cta-secondary:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #E4E6EB;
        }
        .hg-cta-fineprint {
          font-size: 12px;
          color: #8A8D91;
          margin: 0;
          line-height: 1.5;
        }

        @media (min-width: 640px) {
          .hg-cta-actions {
            flex-direction: row;
            justify-content: center;
          }
          .hg-cta-primary,
          .hg-cta-secondary {
            flex: 0 1 auto;
            min-width: 160px;
          }
        }
      `}</style>
    </div>
  );
}
