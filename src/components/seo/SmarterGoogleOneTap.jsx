/**
 * Google One Tap (FedCM) ready component for signed-out SEO guests.
 *
 * Lazy-loads https://accounts.google.com/gsi/client ONLY for signed-out guests,
 * ONLY after a 2500ms idle delay (never blocks LCP), and ONLY when
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID is configured (silent no-op otherwise).
 *
 * Zero static analytics.js imports (uses lightweight sendBeacon telemetry).
 * Zero em dashes.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import { getSeoOfferExperiment, getAiWelcomeContext } from '../../lib/seo/seoExperiment';
import {
  recordFirstTouch,
  recordUnlockIntent,
  firstTouchMetadata,
} from '../../lib/acquisition/firstTouch.mjs';
import {
  recordPendingSeoUnlock,
  promotePendingSeoUnlock,
} from './SmarterUnlockedWelcomeBanner';

export const GOOGLE_GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
export const GOOGLE_ONE_TAP_DELAY_MS = 2500;
export const ONE_TAP_DISMISSED_KEY = 'sp_google_one_tap_dismissed_v1';

function sanitizeReturnPath(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/auth')) {
    return '/hub';
  }
  return value;
}

export function buildGoogleOneTapNextPath(currentPath = '/hub') {
  const safePath = sanitizeReturnPath(currentPath);
  if (/(?:^|[?&])unlocked=1(?:&|$)/.test(safePath)) return safePath;
  return `${safePath}${safePath.includes('?') ? '&' : '?'}unlocked=1`;
}

export function buildGoogleOneTapRedirectUrl(currentPath = '/hub') {
  const unlockedPath = buildGoogleOneTapNextPath(currentPath);
  return `/hub/verify-phone?welcome=1&next=${encodeURIComponent(unlockedPath)}`;
}

function hasStoredGuestSession() {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;
    const explicit = storage.getItem('smarter-poker-auth');
    if (explicit) {
      try {
        const parsed = JSON.parse(explicit);
        if (parsed && (parsed.access_token || parsed.user)) return true;
      } catch (_) {
        if (explicit.length > 10) return true;
      }
    }
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        const raw = storage.getItem(key);
        if (raw && raw !== '{}' && raw !== 'null') return true;
      }
    }
  } catch (_) {
    return false;
  }
  return false;
}

function isOneTapDismissedSession() {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage?.getItem(ONE_TAP_DISMISSED_KEY) === '1';
  } catch (_) {
    return false;
  }
}

export default function SmarterGoogleOneTap({ currentPath = '/', signedIn = false } = {}) {
  const initializedRef = useRef(false);
  const pathRef = useRef(currentPath);
  pathRef.current = currentPath;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    const clientId = String(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '').trim();
    if (!clientId) return undefined;
    if (signedIn || hasStoredGuestSession() || isOneTapDismissedSession()) return undefined;

    let cancelled = false;

    const handleCredentialResponse = async (response) => {
      const credential = response?.credential;
      if (!credential || cancelled) return;

      const returnPath = sanitizeReturnPath(pathRef.current || window.location?.pathname || '/hub');
      const experimentVariant = getSeoOfferExperiment();
      const aiWelcome = getAiWelcomeContext();

      try {
        recordFirstTouch();
        recordUnlockIntent({
          unlockKey: 'google-one-tap',
          source: 'google-one-tap',
          experimentVariant,
          aiEngine: aiWelcome?.engine || '',
        });
        recordPendingSeoUnlock({
          unlockKey: 'google-one-tap',
          source: 'google-one-tap',
          redirectPath: returnPath,
        });
      } catch (_) {
        /* non-blocking */
      }

      try {
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: credential,
        });

        if (error || !data?.session) {
          trackSeoFunnelEvent('seo_google_one_tap_error', {
            pathname: returnPath,
            reason: error?.message || 'no_session',
          });
          return;
        }

        trackSeoFunnelEvent('seo_google_one_tap_success', {
          pathname: returnPath,
          experiment_variant: experimentVariant,
          ...(aiWelcome ? { ai_engine: aiWelcome.engine } : {}),
        });

        try {
          window.sessionStorage?.setItem('just_authenticated', 'true');
          promotePendingSeoUnlock('google-one-tap');
        } catch (_) {
          /* ignore storage restrictions */
        }

        const user = data.user || data.session.user;
        const accessToken = data.session.access_token;

        // Best-effort profile provisioning + attribution persistence for fresh accounts.
        let needsPhoneVerify = true;
        try {
          if (user && accessToken && typeof fetch === 'function') {
            const meta = user.user_metadata || {};
            const fullName =
              meta.full_name ||
              meta.name ||
              [meta.given_name, meta.family_name].filter(Boolean).join(' ') ||
              null;
            const resp = await fetch('/api/auth/ensure-profile', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                user_id: user.id,
                email: user.email || null,
                full_name: fullName,
                username: meta.poker_alias || meta.preferred_username || null,
                avatar_url: meta.avatar_url || meta.picture || null,
                metadata: meta,
              }),
            });
            if (resp && resp.ok) {
              const ensured = await resp.json().catch(() => null);
              if (ensured && ensured.welcomePackage?.withheldReason !== 'phone_not_verified') {
                needsPhoneVerify = false;
              }
            }
          }
        } catch (_) {
          /* non-blocking */
        }

        try {
          const ftMeta = firstTouchMetadata(window, Date.now());
          const existingMeta = user?.user_metadata || {};
          const patch = {};
          for (const [k, v] of Object.entries(ftMeta || {})) {
            if (v && !existingMeta[k]) patch[k] = v;
          }
          if (Object.keys(patch).length > 0 && typeof supabase.auth.updateUser === 'function') {
            await supabase.auth.updateUser({ data: patch });
          }
        } catch (_) {
          /* non-blocking */
        }

        const targetUrl = needsPhoneVerify
          ? buildGoogleOneTapRedirectUrl(returnPath)
          : buildGoogleOneTapNextPath(returnPath);

        if (typeof window.location?.replace === 'function') {
          window.location.replace(targetUrl);
        } else if (typeof window.location?.assign === 'function') {
          window.location.assign(targetUrl);
        }
      } catch (err) {
        trackSeoFunnelEvent('seo_google_one_tap_error', {
          pathname: returnPath,
          reason: err?.message || 'unexpected_error',
        });
      }
    };

    const initializeAndPrompt = () => {
      if (cancelled || initializedRef.current) return;
      if (hasStoredGuestSession() || isOneTapDismissedSession()) return;
      const gsi = window.google?.accounts?.id;
      if (!gsi || typeof gsi.initialize !== 'function') return;
      initializedRef.current = true;
      try {
        gsi.initialize({
          client_id: clientId,
          callback: handleCredentialResponse,
          auto_select: false,
          cancel_on_tap_outside: true,
          use_fedcm_for_prompt: true,
          context: 'signup',
        });
        if (typeof gsi.prompt === 'function') {
          gsi.prompt((notification) => {
            try {
              if (notification?.isDismissedMoment?.() || notification?.isSkippedMoment?.()) {
                window.sessionStorage?.setItem(ONE_TAP_DISMISSED_KEY, '1');
              }
            } catch (_) {
              /* ignore */
            }
          });
        }
      } catch (_) {
        /* One Tap must never throw into host SEO pages */
      }
    };

    const timer = window.setTimeout(() => {
      if (cancelled || hasStoredGuestSession() || isOneTapDismissedSession()) return;
      if (window.google?.accounts?.id) {
        initializeAndPrompt();
        return;
      }
      const existingScript = document.querySelector(`script[src="${GOOGLE_GSI_SCRIPT_SRC}"]`);
      if (existingScript) {
        existingScript.addEventListener('load', initializeAndPrompt, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = GOOGLE_GSI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.setAttribute('data-sp-google-gsi', '1');
      script.addEventListener('load', initializeAndPrompt, { once: true });
      (document.head || document.body)?.appendChild(script);
    }, GOOGLE_ONE_TAP_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      try {
        window.google?.accounts?.id?.cancel?.();
      } catch (_) {
        /* ignore */
      }
    };
  }, [signedIn]);

  return null;
}
