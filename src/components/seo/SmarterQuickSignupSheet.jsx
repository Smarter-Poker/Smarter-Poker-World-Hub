import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import {
  recordFirstTouch,
  beginOAuthAttribution,
  withAttributionNonce,
} from '../../lib/acquisition/firstTouch.mjs';
import styles from './SmarterSeoKit.module.css';

export const QUICK_SIGNUP_EVENT = 'sp:open-quick-signup';

function sanitizeRedirect(raw) {
  const value = String(raw || '').trim();
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/auth')) {
    return '/hub';
  }
  return value;
}

export function openQuickSignup(detail = {}) {
  if (typeof window === 'undefined') return false;
  try {
    window.dispatchEvent(new CustomEvent(QUICK_SIGNUP_EVENT, { detail }));
    return true;
  } catch (_) {
    return false;
  }
}

export function buildSignupUrl({ redirectPath = '/hub', unlockKey = '', source = 'seo-unlock' } = {}) {
  const safeRedirect = sanitizeRedirect(redirectPath);
  const params = new URLSearchParams();
  params.set('redirect', safeRedirect);
  if (unlockKey) params.set('unlock', String(unlockKey).slice(0, 64));
  if (source) params.set('src', String(source).slice(0, 64));
  return `/auth/signup?${params.toString()}`;
}

export default function SmarterQuickSignupSheet() {
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthError, setOauthError] = useState('');

  const close = useCallback(() => {
    setPayload(null);
    setOauthBusy(false);
    setOauthError('');
  }, []);

  useEffect(() => {
    const onOpen = (event) => {
      const detail = event?.detail || {};
      setOauthError('');
      setOauthBusy(false);
      setPayload({
        unlockKey: detail.unlockKey || 'free-account',
        eyebrow: detail.eyebrow || 'Free Smarter.Poker Account',
        title: detail.title || 'Unlock Full Poker Tools & Live Room Intel Free',
        subtitle:
          detail.subtitle ||
          'Create Your Free Account In 10 Seconds To Save Progress, Unlock Multi-Position Solver Data, And Track Live Venues.',
        benefits: Array.isArray(detail.benefits) && detail.benefits.length > 0
          ? detail.benefits.slice(0, 4)
          : [
              '100% Free Forever - Zero Credit Card Required',
              '107 Interactive GTO Training Games & Saved Ranges',
              'Live Poker Room Waitlists, Peak Hours & Bankroll Tracker',
            ],
        redirectPath: sanitizeRedirect(detail.redirectPath || router?.asPath || '/hub'),
        source: detail.source || 'quick-signup-sheet',
      });
    };

    window.addEventListener(QUICK_SIGNUP_EVENT, onOpen);
    return () => window.removeEventListener(QUICK_SIGNUP_EVENT, onOpen);
  }, [router]);

  useEffect(() => {
    if (!payload) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [payload, close]);

  if (!payload) return null;

  const signupHref = buildSignupUrl({
    redirectPath: payload.redirectPath,
    unlockKey: payload.unlockKey,
    source: payload.source,
  });
  const loginHref = `/auth/login?redirect=${encodeURIComponent(payload.redirectPath)}`;

  const handleGoogleOneTap = async () => {
    if (oauthBusy) return;
    setOauthBusy(true);
    setOauthError('');
    try {
      let nonce = null;
      try {
        recordFirstTouch();
        nonce = beginOAuthAttribution();
      } catch (_) {
        /* non-blocking */
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker';
      const baseCallbackUrl = `${origin}/auth/callback?redirect=${encodeURIComponent(payload.redirectPath)}`;
      const callbackUrl = nonce ? withAttributionNonce(baseCallbackUrl, nonce) : baseCallbackUrl;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: { access_type: 'offline', prompt: 'select_account' },
        },
      });
      if (error) {
        setOauthError(error.message || 'Unable To Start Google Sign-In. Continue With Email Below.');
        setOauthBusy(false);
      }
    } catch (err) {
      setOauthError(err?.message || 'Unable To Start Google Sign-In. Continue With Email Below.');
      setOauthBusy(false);
    }
  };

  return (
    <div
      className={`${styles.kit} ${styles.sheetBackdrop}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sp-quick-signup-title"
      data-testid="quick-signup-sheet"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className={`${styles.frameActive} ${styles.sheetDialog}`}>
        <button
          type="button"
          className={styles.sheetClose}
          aria-label="Close Quick Signup Dialog"
          onClick={close}
        >
          ×
        </button>

        <span className={styles.eyebrowTag}>{payload.eyebrow}</span>
        <h2 id="sp-quick-signup-title" className={styles.sheetTitle}>
          {payload.title}
        </h2>
        <p className={styles.sheetSubtitle}>{payload.subtitle}</p>

        <ul className={styles.unlockBenefits} style={{ gridTemplateColumns: '1fr' }}>
          {payload.benefits.map((item) => (
            <li key={item} className={styles.unlockBenefitItem}>
              <span className={styles.unlockCheck} aria-hidden="true">▸</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <div className={styles.sheetStack}>
          {oauthError && <p className={styles.sheetError}>{oauthError}</p>}

          <button
            type="button"
            className={styles.ctaPrimary}
            onClick={handleGoogleOneTap}
            disabled={oauthBusy}
            data-testid="quick-signup-google-btn"
          >
            <span>{oauthBusy ? 'Connecting To Google...' : 'Continue With Google (1-Tap Free)'}</span>
          </button>

          <div className={styles.sheetDivider}>Or Create Account With Email</div>

          <Link
            href={signupHref}
            className={styles.ctaSecondary}
            onClick={close}
            data-testid="quick-signup-email-link"
          >
            <span>Create Free Account With Email</span>
          </Link>
        </div>

        <p className={styles.sheetSignInRow}>
          Already Have An Account?{' '}
          <Link href={loginHref} onClick={close}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}
