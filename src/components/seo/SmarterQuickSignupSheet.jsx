import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import {
  recordFirstTouch,
  beginOAuthAttribution,
  withAttributionNonce,
} from '../../lib/acquisition/firstTouch.mjs';
import styles from './SmarterSeoKit.module.css';

function trackFunnelEvent(event, props) {
  trackSeoFunnelEvent(event, props);
}

export const QUICK_SIGNUP_EVENT = 'sp:open-quick-signup';
export const QUICK_SIGNUP_STATE_EVENT = 'sp:quick-signup-state';

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export function buildSignupUrl({ redirectPath = '/hub', unlockKey = '', source = 'seo-unlock', email = '' } = {}) {
  const safeRedirect = sanitizeRedirect(redirectPath);
  const params = new URLSearchParams();
  params.set('redirect', safeRedirect);
  if (unlockKey) params.set('unlock', String(unlockKey).slice(0, 64));
  if (source) params.set('src', String(source).slice(0, 64));
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (cleanEmail && BASIC_EMAIL_RE.test(cleanEmail)) {
    params.set('email', cleanEmail.slice(0, 120));
  }
  return `/auth/signup?${params.toString()}`;
}

export default function SmarterQuickSignupSheet() {
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [oauthProviderBusy, setOauthProviderBusy] = useState('');
  const [oauthError, setOauthError] = useState('');
  const [inlineEmail, setInlineEmail] = useState('');

  const close = useCallback(() => {
    setPayload(null);
    setOauthProviderBusy('');
    setOauthError('');
    setInlineEmail('');
  }, []);

  useEffect(() => {
    const onOpen = (event) => {
      const detail = event?.detail || {};
      setOauthError('');
      setOauthProviderBusy('');
      setInlineEmail('');
      const nextPayload = {
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
      };
      setPayload(nextPayload);
      try {
        trackFunnelEvent('seo_quick_signup_opened', {
          unlock_key: nextPayload.unlockKey,
          source: nextPayload.source,
          redirect_path: nextPayload.redirectPath,
        });
      } catch (_) {
        /* non-blocking */
      }
    };

    window.addEventListener(QUICK_SIGNUP_EVENT, onOpen);
    return () => window.removeEventListener(QUICK_SIGNUP_EVENT, onOpen);
  }, [router]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    try {
      window.dispatchEvent(
        new CustomEvent(QUICK_SIGNUP_STATE_EVENT, { detail: { open: Boolean(payload) } })
      );
    } catch (_) {
      /* ignore */
    }
    if (!payload) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [payload, close]);

  if (!payload) return null;

  const signupHref = buildSignupUrl({
    redirectPath: payload.redirectPath,
    unlockKey: payload.unlockKey,
    source: payload.source,
    email: inlineEmail,
  });
  const loginHref = `/auth/login?redirect=${encodeURIComponent(payload.redirectPath)}`;

  const handleOAuthOneTap = async (provider) => {
    if (oauthProviderBusy) return;
    setOauthProviderBusy(provider);
    setOauthError('');
    try {
      try {
        trackFunnelEvent('seo_quick_signup_oauth_click', {
          provider,
          unlock_key: payload.unlockKey,
          source: payload.source,
          redirect_path: payload.redirectPath,
        });
      } catch (_) {
        /* non-blocking */
      }
      let nonce = null;
      try {
        recordFirstTouch();
        nonce = beginOAuthAttribution();
      } catch (_) {
        /* non-blocking */
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker';
      const cbParams = new URLSearchParams();
      cbParams.set('redirect', payload.redirectPath);
      if (payload.unlockKey) cbParams.set('unlock', String(payload.unlockKey).slice(0, 64));
      if (payload.source) cbParams.set('src', String(payload.source).slice(0, 64));
      const baseCallbackUrl = `${origin}/auth/callback?${cbParams.toString()}`;
      const callbackUrl = nonce ? withAttributionNonce(baseCallbackUrl, nonce) : baseCallbackUrl;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl,
          queryParams: provider === 'google' ? { access_type: 'offline', prompt: 'select_account' } : undefined,
          scopes: provider === 'facebook' ? 'email,public_profile' : undefined,
        },
      });
      if (error) {
        setOauthError(error.message || 'Unable To Start Social Sign-In. Continue With Email Below.');
        setOauthProviderBusy('');
      }
    } catch (err) {
      setOauthError(err?.message || 'Unable To Start Social Sign-In. Continue With Email Below.');
      setOauthProviderBusy('');
    }
  };

  const handleEmailFormSubmit = (e) => {
    e.preventDefault();
    const trimmed = inlineEmail.trim().toLowerCase();
    if (trimmed && !BASIC_EMAIL_RE.test(trimmed)) {
      setOauthError('Please Enter A Valid Email Address Or Leave Blank To Continue.');
      return;
    }
    try {
      trackFunnelEvent('seo_quick_signup_email_continue', {
        has_prefilled_email: Boolean(trimmed),
        unlock_key: payload.unlockKey,
        source: payload.source,
        redirect_path: payload.redirectPath,
      });
    } catch (_) {
      /* non-blocking */
    }
    const target = buildSignupUrl({
      redirectPath: payload.redirectPath,
      unlockKey: payload.unlockKey,
      source: payload.source,
      email: trimmed,
    });
    close();
    router.push(target);
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
            onClick={() => handleOAuthOneTap('google')}
            disabled={Boolean(oauthProviderBusy)}
            data-testid="quick-signup-google-btn"
          >
            <span>
              {oauthProviderBusy === 'google'
                ? 'Connecting To Google...'
                : 'Continue With Google (1-Tap Free)'}
            </span>
          </button>

          <button
            type="button"
            className={styles.btnSharpSecondary}
            style={{ width: '100%', minHeight: 44 }}
            onClick={() => handleOAuthOneTap('facebook')}
            disabled={Boolean(oauthProviderBusy)}
            data-testid="quick-signup-facebook-btn"
          >
            <span>
              {oauthProviderBusy === 'facebook'
                ? 'Connecting To Facebook...'
                : 'Continue With Facebook (1-Tap Free)'}
            </span>
          </button>

          <div className={styles.sheetDivider}>Or Fast-Track With Email</div>

          <form onSubmit={handleEmailFormSubmit} className={styles.sheetEmailForm} noValidate>
            <input
              type="email"
              value={inlineEmail}
              onChange={(ev) => {
                setInlineEmail(ev.target.value);
                if (oauthError) setOauthError('');
              }}
              placeholder="Enter Your Email To Unlock Free"
              aria-label="Enter Your Email To Unlock Free"
              autoComplete="email"
              className={`${styles.sheetEmailInput} no-capitalize`}
              data-testid="quick-signup-email-input"
            />
            <button
              type="submit"
              className={styles.ctaSecondary}
              style={{ width: '100%' }}
              data-testid="quick-signup-email-submit"
            >
              <span>Create Free Account With Email</span>
            </button>
          </form>

          <Link
            href={signupHref}
            onClick={() => {
              try {
                trackFunnelEvent('seo_quick_signup_email_continue', {
                  has_prefilled_email: Boolean(inlineEmail.trim()),
                  unlock_key: payload.unlockKey,
                  source: payload.source,
                  redirect_path: payload.redirectPath,
                });
              } catch (_) {
                /* non-blocking */
              }
              close();
            }}
            className={styles.sheetDirectEmailLink}
            data-testid="quick-signup-email-link"
          >
            Open Full Registration Form Directly
          </Link>
        </div>

        <div className={styles.sheetTrustStrip} aria-label="Account Guarantees">
          <span>100% Free Forever</span>
          <span>No Credit Card</span>
          <span>10-Second Setup</span>
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
