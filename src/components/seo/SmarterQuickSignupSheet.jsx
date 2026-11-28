import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabase';
import { trackSeoFunnelEvent } from '../../lib/seo/seoFunnelTelemetry';
import { getSeoOfferExperiment, getAiWelcomeContext } from '../../lib/seo/seoExperiment';
import { recordPendingSeoUnlock } from './SmarterUnlockedWelcomeBanner';
import {
  recordFirstTouch,
  recordUnlockIntent,
  beginOAuthAttribution,
  withAttributionNonce,
} from '../../lib/acquisition/firstTouch.mjs';
import styles from './SmarterSeoKit.module.css';

const PLATFORM_COUNTS_TTL_MS = 5 * 60 * 1000;
const STATIC_SOCIAL_PROOF = Object.freeze({
  verifiedRooms: 473,
  liveTables: null,
  gtoGames: 107,
});

let cachedPlatformProof = null;
let cachedPlatformProofAt = 0;
let inflightPlatformProof = null;

function parsePlatformCountsResponse(data) {
  const publicPlayable = Number(data?.directory?.public_playable || 0);
  const catalogActive = Number(data?.directory?.catalog_active || 0);
  const verifiedRooms = publicPlayable > 0
    ? publicPlayable
    : catalogActive > 0
      ? catalogActive
      : STATIC_SOCIAL_PROOF.verifiedRooms;

  const livePublished = Number(data?.current_tables?.published || 0);
  const liveTables = data?.current_tables?.live_count_known && livePublished > 0
    ? livePublished
    : null;

  return {
    verifiedRooms,
    liveTables,
    gtoGames: STATIC_SOCIAL_PROOF.gtoGames,
  };
}

function fetchCachedPlatformProof() {
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return Promise.resolve(STATIC_SOCIAL_PROOF);
  }
  const now = Date.now();
  if (cachedPlatformProof && now - cachedPlatformProofAt < PLATFORM_COUNTS_TTL_MS) {
    return Promise.resolve(cachedPlatformProof);
  }
  if (inflightPlatformProof) return inflightPlatformProof;

  inflightPlatformProof = fetch('/api/poker/platform-counts', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data && data.success) {
        cachedPlatformProof = parsePlatformCountsResponse(data);
        cachedPlatformProofAt = Date.now();
        return cachedPlatformProof;
      }
      return cachedPlatformProof || STATIC_SOCIAL_PROOF;
    })
    .catch(() => cachedPlatformProof || STATIC_SOCIAL_PROOF)
    .finally(() => {
      inflightPlatformProof = null;
    });

  return inflightPlatformProof;
}

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
  const [magicLinkBusy, setMagicLinkBusy] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [magicLinkError, setMagicLinkError] = useState('');
  const [experimentVariant, setExperimentVariant] = useState('control-gto');
  const [aiWelcome, setAiWelcome] = useState(null);
  const [socialProof, setSocialProof] = useState(STATIC_SOCIAL_PROOF);

  const close = useCallback(() => {
    setPayload(null);
    setOauthProviderBusy('');
    setOauthError('');
    setInlineEmail('');
    setMagicLinkBusy(false);
    setMagicLinkSent(false);
    setMagicLinkError('');
  }, []);

  useEffect(() => {
    const onOpen = (event) => {
      const detail = event?.detail || {};
      const activeVariant = getSeoOfferExperiment();
      const activeAi = getAiWelcomeContext();
      setExperimentVariant(activeVariant);
      setAiWelcome(activeAi);
      setOauthError('');
      setOauthProviderBusy('');
      setInlineEmail('');
      setMagicLinkBusy(false);
      setMagicLinkSent(false);
      setMagicLinkError('');
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
        recordUnlockIntent({
          unlockKey: nextPayload.unlockKey,
          source: nextPayload.source,
          experimentVariant: activeVariant,
          aiEngine: activeAi?.engine || '',
        });
        trackFunnelEvent('seo_quick_signup_opened', {
          unlock_key: nextPayload.unlockKey,
          source: nextPayload.source,
          redirect_path: nextPayload.redirectPath,
          experiment_variant: activeVariant,
          ...(activeAi ? { ai_engine: activeAi.engine } : {}),
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

    let cancelled = false;
    fetchCachedPlatformProof().then((counts) => {
      if (!cancelled && counts) setSocialProof(counts);
    });

    const onKeyDown = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [payload, close]);

  if (!payload) return null;

  const isVipOfferVariant = experimentVariant === 'welcome-vip-500';
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
          experiment_variant: experimentVariant,
          ...(aiWelcome ? { ai_engine: aiWelcome.engine } : {}),
        });
      } catch (_) {
        /* non-blocking */
      }
      let nonce = null;
      try {
        recordFirstTouch();
        recordUnlockIntent({
          unlockKey: payload.unlockKey,
          source: payload.source,
          experimentVariant,
          aiEngine: aiWelcome?.engine || '',
        });
        nonce = beginOAuthAttribution();
        recordPendingSeoUnlock({
          unlockKey: payload.unlockKey,
          source: payload.source,
          redirectPath: payload.redirectPath,
        });
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
      recordUnlockIntent({
        unlockKey: payload.unlockKey,
        source: payload.source,
        experimentVariant,
        aiEngine: aiWelcome?.engine || '',
      });
      recordPendingSeoUnlock({
        unlockKey: payload.unlockKey,
        source: payload.source,
        redirectPath: payload.redirectPath,
      });
      trackFunnelEvent('seo_quick_signup_email_continue', {
        has_prefilled_email: Boolean(trimmed),
        unlock_key: payload.unlockKey,
        source: payload.source,
        redirect_path: payload.redirectPath,
        experiment_variant: experimentVariant,
        ...(aiWelcome ? { ai_engine: aiWelcome.engine } : {}),
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

  const handleMagicLinkSignIn = async () => {
    if (magicLinkBusy) return;
    setOauthError('');
    setMagicLinkError('');
    setMagicLinkSent(false);

    const trimmed = inlineEmail.trim().toLowerCase();
    if (!trimmed || !BASIC_EMAIL_RE.test(trimmed)) {
      setMagicLinkError('Enter Your Account Email Above To Receive A 1-Click Sign-In Link');
      return;
    }

    setMagicLinkBusy(true);
    try {
      try {
        recordPendingSeoUnlock({
          unlockKey: payload.unlockKey,
          source: payload.source,
          redirectPath: payload.redirectPath,
        });
      } catch (_) {
        /* non-blocking */
      }

      const origin = typeof window !== 'undefined' ? window.location.origin : 'https://smarter.poker';
      const cbParams = new URLSearchParams();
      cbParams.set('redirect', payload.redirectPath);
      if (payload.unlockKey) cbParams.set('unlock', String(payload.unlockKey).slice(0, 64));
      if (payload.source) cbParams.set('src', String(payload.source).slice(0, 64));
      const callbackUrl = `${origin}/auth/callback?${cbParams.toString()}`;

      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: callbackUrl,
          shouldCreateUser: false,
        },
      });

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (
          msg.includes('signups not allowed') ||
          msg.includes('user not found') ||
          msg.includes('not found') ||
          msg.includes('no user') ||
          error.status === 422
        ) {
          setMagicLinkError('No Existing Account Found For That Email - Click Create Free Account Above.');
        } else {
          setMagicLinkError(error.message || 'Unable To Send Magic Sign-In Link Right Now. Try Again In A Moment.');
        }
        return;
      }

      try {
        trackFunnelEvent('seo_quick_signup_magic_link_sent', {
          unlock_key: payload.unlockKey,
          source: payload.source,
          redirect_path: payload.redirectPath,
          experiment_variant: experimentVariant,
          ...(aiWelcome ? { ai_engine: aiWelcome.engine } : {}),
        });
      } catch (_) {
        /* non-blocking */
      }

      setMagicLinkSent(true);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      if (
        msg.includes('signups not allowed') ||
        msg.includes('user not found') ||
        msg.includes('not found') ||
        msg.includes('no user')
      ) {
        setMagicLinkError('No Existing Account Found For That Email - Click Create Free Account Above.');
      } else {
        setMagicLinkError(err?.message || 'Unable To Send Magic Sign-In Link Right Now. Try Again In A Moment.');
      }
    } finally {
      setMagicLinkBusy(false);
    }
  };

  const googleButtonLabel =
    oauthProviderBusy === 'google'
      ? 'Connecting To Google...'
      : isVipOfferVariant
        ? 'Unlock Free + 30-Day VIP With Google (1-Tap)'
        : 'Continue With Google (1-Tap Free)';

  const welcomeOfferCopy = isVipOfferVariant
    ? 'Welcome Bonus: Includes Free 30-Day VIP + 500 Diamonds On Phone Verify'
    : 'Includes Free 30-Day VIP + 500 Diamonds On Phone Verify';

  return (
    <div
      className={`${styles.kit} ${styles.sheetBackdrop}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sp-quick-signup-title"
      data-testid="quick-signup-sheet"
      data-experiment-variant={experimentVariant}
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

        {aiWelcome ? (
          <div
            data-testid="quick-signup-ai-welcome"
            style={{
              margin: '0 44px 8px 0',
              padding: '6px 10px',
              borderRadius: 0,
              border: '1px solid #38bdf8',
              background: 'linear-gradient(90deg, rgba(16, 62, 110, 0.92) 0%, rgba(7, 25, 46, 0.92) 100%)',
              color: '#86daff',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.03em',
              lineHeight: 1.35,
            }}
          >
            {aiWelcome.eyebrow}
          </div>
        ) : null}

        <span className={styles.eyebrowTag}>{payload.eyebrow}</span>
        <h2 id="sp-quick-signup-title" className={styles.sheetTitle}>
          {payload.title}
        </h2>
        <p className={styles.sheetSubtitle}>{payload.subtitle}</p>

        <div
          data-testid="quick-signup-welcome-offer"
          style={{
            margin: '0 0 12px',
            padding: '8px 12px',
            borderRadius: 0,
            border: '1px solid #3a7fbd',
            background: 'linear-gradient(180deg, #10355d 0%, #071b33 100%)',
            boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.32)',
            color: '#f2f7ff',
            fontSize: 12.5,
            fontWeight: 700,
            letterSpacing: '0.02em',
            lineHeight: 1.35,
          }}
        >
          <span style={{ color: '#86daff', marginRight: 6 }} aria-hidden="true">▸</span>
          <span>{welcomeOfferCopy}</span>
        </div>

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
            <span>{googleButtonLabel}</span>
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
                if (magicLinkError) setMagicLinkError('');
                if (magicLinkSent) setMagicLinkSent(false);
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

          <button
            type="button"
            className={styles.btnSharpSecondary}
            data-testid="quick-sheet-magic-link-btn"
            disabled={magicLinkBusy}
            onClick={handleMagicLinkSignIn}
            style={{
              width: '100%',
              minHeight: 40,
              padding: '8px 12px',
              borderRadius: 0,
              borderColor: '#2563eb',
              background: '#0b1120',
              color: '#38bdf8',
              fontSize: 12.5,
              whiteSpace: 'normal',
              lineHeight: 1.3,
              textAlign: 'center',
            }}
          >
            {magicLinkBusy
              ? 'Sending Magic Sign-In Link...'
              : 'Already Have An Account? Email 1-Click Magic Sign-In Link'}
          </button>

          {magicLinkSent ? (
            <p
              data-testid="quick-sheet-magic-link-sent"
              role="status"
              style={{
                margin: 0,
                padding: '10px 12px',
                borderRadius: 0,
                border: '1px solid #10b981',
                background: 'rgba(6, 78, 59, 0.36)',
                color: '#a7f3d0',
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              Magic Sign-In Link Sent! Check Your Inbox To Return Directly Here.
            </p>
          ) : null}

          {magicLinkError ? (
            <p
              className={styles.sheetError}
              data-testid="quick-sheet-magic-link-error"
              role="alert"
            >
              {magicLinkError}
            </p>
          ) : null}

          <Link
            href={signupHref}
            onClick={() => {
              try {
                recordUnlockIntent({
                  unlockKey: payload.unlockKey,
                  source: payload.source,
                  experimentVariant,
                  aiEngine: aiWelcome?.engine || '',
                });
                recordPendingSeoUnlock({
                  unlockKey: payload.unlockKey,
                  source: payload.source,
                  redirectPath: payload.redirectPath,
                });
                trackFunnelEvent('seo_quick_signup_email_continue', {
                  has_prefilled_email: Boolean(inlineEmail.trim()),
                  unlock_key: payload.unlockKey,
                  source: payload.source,
                  redirect_path: payload.redirectPath,
                  experiment_variant: experimentVariant,
                  ...(aiWelcome ? { ai_engine: aiWelcome.engine } : {}),
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

        <div
          className={styles.sheetTrustStrip}
          aria-label="Live Platform Social Proof"
          data-testid="quick-signup-live-proof"
          style={{ borderColor: '#2c5278', color: '#86daff' }}
        >
          <span>{`${socialProof.verifiedRooms.toLocaleString()} Listed Poker Rooms`}</span>
          {socialProof.liveTables ? (
            <span>{`${socialProof.liveTables.toLocaleString()} Live Tables Running`}</span>
          ) : null}
          <span>{`${socialProof.gtoGames} GTO Training Games`}</span>
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
