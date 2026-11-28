/**
 * 60-Second Day-0 Intent-Routing Picker + Tiered 2-Sided Referral Milestones.
 *
 * Loaded dynamically inside SmarterUnlockedWelcomeBanner.jsx post-signup so
 * pages/_app.js static module count stays strictly <= 100.
 *
 * Zero supabase or analytics.js imports (uses lightweight sendBeacon telemetry).
 * House style: #SMARTERDESIGN (0px corners, zero banned gold, Title Case, zero em dashes).
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';

export const DAY0_INTENT_STORAGE_KEY = 'sp_day0_intent_v1';

export const DAY0_INTENT_TILES = Object.freeze([
  {
    id: 'crush-gto',
    label: 'Crush Cash & MTTs (GTO)',
    href: '/hub/training',
    tag: '107 GTO Games',
  },
  {
    id: 'play-live-rooms',
    label: 'Play Live Poker Rooms',
    href: '/hub/poker-near-me',
    tag: 'Live Venues',
  },
  {
    id: 'track-bankroll',
    label: 'Track My Bankroll',
    href: '/hub/bankroll-manager',
    tag: 'Profit Tracker',
  },
]);

export const REFERRAL_MILESTONES = Object.freeze([
  { id: 'tier-1', friends: 1, label: '1 Friend: 500 Diamonds' },
  { id: 'tier-3', friends: 3, label: '3 Friends: +30 Days VIP' },
  { id: 'tier-5', friends: 5, label: '5 Friends: Pro Badge' },
]);

/**
 * Pure helper: persists selected Day-0 onboarding intent to localStorage['sp_day0_intent_v1'].
 */
export function saveDay0Intent(intentId, storage) {
  const cleanId = String(intentId || '').trim().slice(0, 64);
  if (!cleanId) return '';
  const targetStorage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  try {
    if (targetStorage && typeof targetStorage.setItem === 'function') {
      targetStorage.setItem(DAY0_INTENT_STORAGE_KEY, cleanId);
    }
  } catch (_) {
    /* ignore storage restrictions */
  }
  return cleanId;
}

/**
 * Pure helper: reads previously selected Day-0 intent from localStorage['sp_day0_intent_v1'].
 */
export function readDay0Intent(storage) {
  const targetStorage = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  try {
    if (!targetStorage || typeof targetStorage.getItem !== 'function') return '';
    return String(targetStorage.getItem(DAY0_INTENT_STORAGE_KEY) || '').trim();
  } catch (_) {
    return '';
  }
}

/**
 * Honest 3-tier referral milestone progress strip placed right beside the
 * existing "Invite A Poker Friend" button inside SmarterUnlockedWelcomeBanner.
 */
export function TieredReferralMilestones() {
  return (
    <div
      data-testid="tiered-referral-milestones"
      aria-label="Tiered Referral Milestones"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px 8px',
        padding: '6px 10px',
        borderRadius: 0,
        border: '1px solid #2b4663',
        background: '#0b1120',
        color: '#bdd0e2',
        fontSize: 11.5,
        fontWeight: 700,
        lineHeight: 1.3,
        minWidth: 0,
      }}
    >
      {REFERRAL_MILESTONES.map((tier, index) => (
        <span
          key={tier.id}
          data-testid={`referral-milestone-${tier.id}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            whiteSpace: 'nowrap',
            color: index === 0 ? '#86daff' : '#f2f7ff',
          }}
        >
          {index > 0 ? (
            <span aria-hidden="true" style={{ color: '#38bdf8', fontWeight: 800 }}>
              ·
            </span>
          ) : null}
          <span>{tier.label}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * 60-Second Day-0 Intent-Routing Picker with 3 sharp-corner destination tiles.
 */
export default function Day0IntentRouter({
  unlockKey = 'free-account',
  source = 'seo-unlock',
  onSelectIntent,
  includeMilestones = false,
} = {}) {
  const [selectedIntent, setSelectedIntent] = useState('');

  useEffect(() => {
    setSelectedIntent(readDay0Intent());
  }, []);

  const handleIntentSelect = (tile) => {
    saveDay0Intent(tile.id);
    setSelectedIntent(tile.id);
    trackSeoFunnelEvent('seo_post_signup_day0_win_click', {
      intentId: tile.id,
      unlock_key: unlockKey,
      source,
    });
    if (typeof onSelectIntent === 'function') {
      onSelectIntent(tile.id, tile.href);
    }
  };

  return (
    <div
      data-testid="day0-intent-router"
      style={{
        marginTop: 12,
        paddingTop: 10,
        borderTop: '1px solid #243b54',
        display: 'grid',
        gap: 8,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        <span
          style={{
            color: '#86daff',
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
          }}
        >
          60-Second Day-0 Goal Picker
        </span>
        <span
          style={{
            color: '#bdd0e2',
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          Choose Your Starting Track
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          minWidth: 0,
        }}
      >
        {DAY0_INTENT_TILES.map((tile) => {
          const isSelected = selectedIntent === tile.id;
          return (
            <Link
              key={tile.id}
              href={tile.href}
              data-testid={`day0-intent-tile-${tile.id}`}
              data-intent-id={tile.id}
              onClick={() => handleIntentSelect(tile)}
              style={{
                boxSizing: 'border-box',
                flex: '1 1 170px',
                minWidth: 0,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '9px 12px',
                borderRadius: 0,
                border: `1px solid ${isSelected ? '#38bdf8' : '#2b4663'}`,
                background: isSelected ? '#102945' : '#0b1120',
                color: '#f2f7ff',
                fontSize: 12.5,
                fontWeight: 700,
                lineHeight: 1.25,
                textDecoration: 'none',
              }}
            >
              <span>{tile.label}</span>
              <span
                style={{
                  color: '#86daff',
                  fontSize: 11,
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  flex: '0 0 auto',
                }}
              >
                {tile.tag}
              </span>
            </Link>
          );
        })}
      </div>

      {includeMilestones ? <TieredReferralMilestones /> : null}
    </div>
  );
}
