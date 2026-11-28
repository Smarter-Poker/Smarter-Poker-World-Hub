import { useSignInOpening } from '../../src/world/components/CinematicIntro';
/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — SIGN UP REGISTRATION NODE
   Email/Password Registration with Supabase OTP Email Verification
   Cyan/Electric Blue Aesthetic | Deep Navy Background
   Last Deploy: 2026-01-12 01:18:00 - OTP Code Input Active
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useRef } from 'react';
import ExistingAccountDialog from '../../src/components/auth/ExistingAccountDialog';
import AuthEntryChoices from '../../src/components/auth/AuthEntryChoices';
import { isExistingSignup, isAbortedAuthRequest, signUpWithRecovery } from '../../src/lib/signupOutcome.mjs';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { promotePendingSeoUnlock } from '../../src/components/seo/SmarterUnlockedWelcomeBanner';
import { isEmailVerificationCode } from '../../src/lib/signupExperience.mjs';
import {
  PENDING_PROMO_KEY,
  PENDING_REFERRAL_KEY,
  RESEND_COOLDOWN_SECONDS,
  isReferralInput,
  redeemPendingSignupCodes,
  referralMetadata,
  refFromRedirect,
} from '../../src/lib/pendingSignupCodes.mjs';
import { firstTouchMetadata, beginOAuthAttribution, withAttributionNonce } from '../../src/lib/acquisition/firstTouch.mjs';
import { Mail } from 'lucide-react';
import { getAccessToken } from '../../src/lib/authUtils';
import SignupWelcome from '../../src/components/auth/SignupWelcome';
import { capture, identify, FunnelEvents } from '../../src/lib/analytics';
import {
  authSwitchHref,
  isSafeRelativePath,
  readPendingInvite,
  rememberInvite,
  safeClubArenaPath,
  resolveSignupClubPath,
} from '../../src/lib/clubInvite';
import {
  cleanPromoTokenShape,
  readPendingPromoSignupToken,
  rememberPromoSignupToken,
} from '../../src/lib/promoCampaigns/promoSignupToken.mjs';
// [Phase 6.1.20] Password strength + HIBP breach-list check
import {
  validatePassword,
  validatePasswordLocal,
  estimateEntropyBits,
  entropyToScore,
  MIN_LENGTH as PW_MIN_LENGTH,
  MIN_ENTROPY_BITS,
} from '../../src/lib/passwordStrength';
// Shared with /auth/login and /auth/callback: the code -> message table the
// callback indexes into, the provider allowlist, and the server-side error
// reporter this page previously did not have at all.
import {
  AUTH_ORIGIN_KEY,
  OAUTH_PROVIDERS,
  authErrorMessage,
  reportAuthError,
  takeAuthErrorDetail,
} from '../../src/lib/authErrors';
import { US_COUNTRY, NON_US_COUNTRIES } from '../../src/lib/countries';

// Where a player with no club invite continues after the welcome package offer.
const CLUB_LOBBY_PATH = '/hub/club-arena/';

function formatUnlockPromise(rawUnlock) {
  const key = String(rawUnlock || '').trim().toLowerCase();
  if (!key) return 'Free Account Unlock Ready: Complete Below To Continue Immediately';
  if (key.includes('solver') || key.includes('hand') || key.includes('preflop') || key.includes('range')) {
    return 'Unlocking Free: Full Multi-Position GTO Solver Matrix & 107 Drills';
  }
  if (key.includes('venue') || key.includes('pnm') || key.includes('room') || key.includes('series') || key.includes('tour') || key.includes('calendar') || key.includes('weekend')) {
    return 'Unlocking Free: Live Waitlists, Peak Hours & Tournament Seat Alerts';
  }
  if (key.includes('tool') || key.includes('calc') || key.includes('icm') || key.includes('odds')) {
    return 'Unlocking Free: Cloud Scenario Saves, CSV Exports & GTO Drills';
  }
  if (key.includes('video') || key.includes('watch') || key.includes('channel')) {
    return 'Unlocking Free: Interactive Video Hand Quizzes & Pro Bookmarks';
  }
  if (key.includes('research') || key.includes('press') || key.includes('compare') || key.includes('dataset') || key.includes('facts')) {
    return 'Unlocking Free: Full Interactive Filter Matrix & Cloud Dataset Exports';
  }
  if (key.includes('wire') || key.includes('magazine') || key.includes('news') || key.includes('article')) {
    return 'Unlocking Free: Interactive Weekly GTO Polls, Archives & Pro Alerts';
  }
  if (key.includes('masthead')) {
    return 'Unlocking Free: Full Smarter.Poker Pro Console, GTO Games & Live Intel';
  }
  return 'Unlocking Free: Study Deck Bookmarks, Cheat Sheets & 107 GTO Games';
}

// US States for dropdown
const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
];

// ─────────────────────────────────────────────────────────────────────────────
// 🚫 RESTRICTED STATES — Diamond Arena Prize Redemptions BLOCKED
// Per 2026 AB 831 Standard & State-Specific Regulations
// ─────────────────────────────────────────────────────────────────────────────
const RESTRICTED_STATES = ['WA', 'ID', 'MI', 'NV', 'CA'];

// ─────────────────────────────────────────────────────────────────────────────
// 📝 SIGN UP PAGE — SIMPLIFIED EMAIL/PASSWORD FLOW
// ─────────────────────────────────────────────────────────────────────────────
const months = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];
const days = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 100 }, (_, i) => String(currentYear - i));
const usStates = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

const NON_US_ISO_TO_COUNTRY = Object.freeze({
  AR: 'Argentina',
  AT: 'Austria',
  AU: 'Australia',
  BE: 'Belgium',
  BR: 'Brazil',
  CA: 'Canada',
  CH: 'Switzerland',
  CL: 'Chile',
  CN: 'China',
  CO: 'Colombia',
  CZ: 'Czech Republic',
  DE: 'Germany',
  DK: 'Denmark',
  ES: 'Spain',
  FI: 'Finland',
  FR: 'France',
  GB: 'United Kingdom',
  GR: 'Greece',
  HK: 'Hong Kong',
  HU: 'Hungary',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IN: 'India',
  IT: 'Italy',
  JP: 'Japan',
  KR: 'South Korea',
  MX: 'Mexico',
  MY: 'Malaysia',
  NG: 'Nigeria',
  NL: 'Netherlands',
  NO: 'Norway',
  NZ: 'New Zealand',
  PE: 'Peru',
  PH: 'Philippines',
  PL: 'Poland',
  PT: 'Portugal',
  RO: 'Romania',
  RU: 'Russia',
  SE: 'Sweden',
  SG: 'Singapore',
  TH: 'Thailand',
  TR: 'Turkey',
  TW: 'Taiwan',
  UA: 'Ukraine',
  UK: 'United Kingdom',
  VN: 'Vietnam',
  ZA: 'South Africa',
  AE: 'United Arab Emirates',
});

const TIMEZONE_TO_NON_US_COUNTRY = Object.freeze({
  'America/Toronto': 'Canada',
  'America/Vancouver': 'Canada',
  'America/Montreal': 'Canada',
  'America/Edmonton': 'Canada',
  'America/Winnipeg': 'Canada',
  'America/Halifax': 'Canada',
  'America/St_Johns': 'Canada',
  'America/Regina': 'Canada',
  'America/Moncton': 'Canada',
  'America/Whitehorse': 'Canada',
  'America/Yellowknife': 'Canada',
  'America/Dawson': 'Canada',
  'America/Iqaluit': 'Canada',
  'America/Mexico_City': 'Mexico',
  'America/Monterrey': 'Mexico',
  'America/Tijuana': 'Mexico',
  'America/Cancun': 'Mexico',
  'America/Merida': 'Mexico',
  'America/Chihuahua': 'Mexico',
  'America/Mazatlan': 'Mexico',
  'America/Hermosillo': 'Mexico',
  'America/Sao_Paulo': 'Brazil',
  'America/Fortaleza': 'Brazil',
  'America/Recife': 'Brazil',
  'America/Belem': 'Brazil',
  'America/Manaus': 'Brazil',
  'America/Bahia': 'Brazil',
  'America/Cuiaba': 'Brazil',
  'America/Campo_Grande': 'Brazil',
  'America/Porto_Velho': 'Brazil',
  'America/Rio_Branco': 'Brazil',
  'America/Buenos_Aires': 'Argentina',
  'America/Bogota': 'Colombia',
  'America/Santiago': 'Chile',
  'America/Lima': 'Peru',
  'Europe/London': 'United Kingdom',
  'Europe/Belfast': 'United Kingdom',
  'Europe/Dublin': 'Ireland',
  'Europe/Berlin': 'Germany',
  'Europe/Busingen': 'Germany',
  'Europe/Paris': 'France',
  'Europe/Madrid': 'Spain',
  'Atlantic/Canary': 'Spain',
  'Europe/Rome': 'Italy',
  'Europe/Amsterdam': 'Netherlands',
  'Europe/Stockholm': 'Sweden',
  'Europe/Oslo': 'Norway',
  'Europe/Copenhagen': 'Denmark',
  'Europe/Helsinki': 'Finland',
  'Europe/Zurich': 'Switzerland',
  'Europe/Vienna': 'Austria',
  'Europe/Brussels': 'Belgium',
  'Europe/Lisbon': 'Portugal',
  'Europe/Warsaw': 'Poland',
  'Europe/Prague': 'Czech Republic',
  'Europe/Athens': 'Greece',
  'Europe/Bucharest': 'Romania',
  'Europe/Budapest': 'Hungary',
  'Europe/Kyiv': 'Ukraine',
  'Europe/Kiev': 'Ukraine',
  'Europe/Moscow': 'Russia',
  'Europe/Istanbul': 'Turkey',
  'Asia/Jerusalem': 'Israel',
  'Asia/Dubai': 'United Arab Emirates',
  'Asia/Kolkata': 'India',
  'Asia/Calcutta': 'India',
  'Asia/Tokyo': 'Japan',
  'Asia/Seoul': 'South Korea',
  'Asia/Singapore': 'Singapore',
  'Asia/Manila': 'Philippines',
  'Asia/Hong_Kong': 'Hong Kong',
  'Asia/Taipei': 'Taiwan',
  'Asia/Bangkok': 'Thailand',
  'Asia/Ho_Chi_Minh': 'Vietnam',
  'Asia/Saigon': 'Vietnam',
  'Asia/Jakarta': 'Indonesia',
  'Asia/Kuala_Lumpur': 'Malaysia',
  'Asia/Shanghai': 'China',
  'Pacific/Auckland': 'New Zealand',
  'Pacific/Chatham': 'New Zealand',
  'Africa/Johannesburg': 'South Africa',
  'Africa/Lagos': 'Nigeria',
});

export function inferNonUsCountryFromTimezone(timeZone, validCountries = NON_US_COUNTRIES) {
  const tz = String(timeZone || '').trim();
  if (!tz) return null;
  let candidate = TIMEZONE_TO_NON_US_COUNTRY[tz] || null;
  if (!candidate) {
    if (tz.startsWith('Australia/')) candidate = 'Australia';
    else if (tz.startsWith('Canada/')) candidate = 'Canada';
    else if (tz.startsWith('America/Argentina/')) candidate = 'Argentina';
    else if (tz === 'GB' || tz === 'GB-Eire') candidate = 'United Kingdom';
  }
  if (!candidate) return null;
  if (Array.isArray(validCountries) && !validCountries.includes(candidate)) return null;
  return candidate;
}

function resolveNonUsCountryQuery(rawCountry, validCountries = NON_US_COUNTRIES) {
  const clean = String(rawCountry || '').trim();
  if (!clean) return null;
  const upper = clean.toUpperCase();
  if (upper === 'US' || upper === 'USA' || upper === 'UNITED STATES') return 'US';
  if (NON_US_ISO_TO_COUNTRY[upper]) {
    const mapped = NON_US_ISO_TO_COUNTRY[upper];
    if (!Array.isArray(validCountries) || validCountries.includes(mapped)) return mapped;
  }
  if (Array.isArray(validCountries)) {
    const lower = clean.toLowerCase();
    const matched = validCountries.find((c) => c.toLowerCase() === lower);
    if (matched) return matched;
  }
  return null;
}

export default function SignUpPage() {
  const router = useRouter();
  const { beginOpening, cancelOpening, OpeningComponent } = useSignInOpening();

  // Step: 'info' → 'email_pending' → 'success' → redirect
  const [step, setStep] = useState('info');

  // Form data
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    birthMonth: '',
    birthDay: '',
    birthYear: '',
    city: '',
    state: '',
    // Everyone defaults to the US. "Outside The US" reveals the country
    // dropdown, which replaces the State dropdown (2026-10-22, Dan).
    outsideUs: false,
    country: '',
    pokerAlias: '',
    promoCode: '',
  });

  // Track whether the player manually interacted with location fields so smart
  // geo-defaulting never overrides an explicit choice.
  const locationTouchedRef = useRef(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // The provider's own words, handed over by /auth/callback in sessionStorage.
  // Never read from the URL - a red first-party banner that renders whatever a
  // link says is a phishing surface. See src/lib/authErrors.js.
  const [errorDetail, setErrorDetail] = useState(null);
  const [aliasError, setAliasError] = useState('');
  const [aliasChecking, setAliasChecking] = useState(false);
  const [aliasAvailable, setAliasAvailable] = useState(null);

  const [oauthLoading, setOauthLoading] = useState('');

  // Password visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // 18+ Age Verification (2026 AB 831 Compliance)
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // Check if selected state is restricted
  const isRestrictedState = RESTRICTED_STATES.includes(formData.state);

  // Player number assigned after successful registration
  const [assignedPlayerNumber, setAssignedPlayerNumber] = useState(null);

  // Email verification code state
  const [verificationCode, setVerificationCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  // A real resend (2026-10-17). The only way to get a fresh code used to be
  // "Try Again", which threw the player back to the whole sign-up form.
  const [resendIn, setResendIn] = useState(0);
  const [resending, setResending] = useState(false);
  const [resendNote, setResendNote] = useState('');
  const [signupClubPath, setSignupClubPath] = useState(null);
  const [existingAccount, setExistingAccount] = useState(false);
  const signInToExistingAccount = () => {
    try { sessionStorage.setItem('login_email_prefill', formData.email.trim().toLowerCase()); } catch { /* storage may be unavailable */ }
    router.push(authSwitchHref('/auth/login', router.query));
  };

  // PHONE VERIFICATION MOVED OUT OF SIGNUP (2026-10-07, Dan). The number is
  // no longer collected here. A new player verifies it on /hub/verify-phone
  // after email confirmation and first login, which is what pays out the
  // welcome package (30-day VIP card + 500 diamonds); it can be skipped and
  // reached later from the hub hamburger menu.

  // Legal modal: null | 'terms' | 'privacy'
  const [legalModal, setLegalModal] = useState(null);

  // Promo Code Validation State
  const [promoValid, setPromoValid] = useState(null); // null = not checked, true = valid, false = invalid
  const [promoChecking, setPromoChecking] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [promoDetails, setPromoDetails] = useState(null);

  // Referral Code State (player_number)
  const [referralValid, setReferralValid] = useState(null);
  const [referralDetails, setReferralDetails] = useState(null); // { referrerId, playerNumber, referrerName }
  const [isReferralCode, setIsReferralCode] = useState(false); // true if input looks like a referral code
  const [promoOpen, setPromoOpen] = useState(false);

  // Safe same-origin redirect helper (?redirect= or ?next=), preserving clean
  // return paths like /tools/preflop-ranges/btn or /hub/series/5001355.
  const getSafeRedirect = () => {
    const fromRouter = Array.isArray(router.query?.redirect)
      ? router.query.redirect[0]
      : router.query?.redirect || (Array.isArray(router.query?.next) ? router.query.next[0] : router.query?.next);
    let raw = fromRouter;
    if (!raw && typeof window !== 'undefined' && window.location?.search) {
      try {
        const params = new URLSearchParams(window.location.search);
        raw = params.get('redirect') || params.get('next');
      } catch {
        /* ignore malformed search */
      }
    }
    if (typeof raw !== 'string' || !raw) return null;
    if (typeof isSafeRelativePath === 'function') {
      return isSafeRelativePath(raw) ? raw : null;
    }
    if (!raw.startsWith('/') || raw.startsWith('//') || /[\u0000-\u0020\u007f\\]/.test(raw)) return null;
    return raw;
  };

  const buildCallbackUrl = () => {
    const base = `${window.location.origin}/auth/callback`;
    const target = getSafeRedirect();
    return target ? `${base}?next=${encodeURIComponent(target)}` : base;
  };

  // Auto-fill promo/referral code from ?ref=, ?promo=, or ?code= query parameter
  useEffect(() => {
    if (router.isReady) {
      const { ref, promo, code, invite, pt } = router.query;
      // A Share & Invite link (/i/<code>) sends the player here first. Keep
      // the code (first link wins) so it survives email confirmation.
      if (invite) rememberInvite(String(invite));
      if (pt && typeof rememberPromoSignupToken === 'function') {
        rememberPromoSignupToken(Array.isArray(pt) ? pt[0] : pt);
      }
      // A Club Arena invite (/invite/<club>?ref=<player number>) arrives with
      // its ref inside ?redirect=, not at the top level. Read it there too,
      // so the referral is shown and recorded (2026-10-17).
      const nestedRef = !ref ? (refFromRedirect(router.query.redirect) || refFromRedirect(router.query.next)) : null;
      if (nestedRef && !formData.promoCode) {
        setFormData((prev) => ({ ...prev, promoCode: nestedRef }));
        setPromoOpen(true);
      } else if (ref && !formData.promoCode) {
        setFormData((prev) => ({ ...prev, promoCode: String(ref).toUpperCase() }));
        setPromoOpen(true);
      } else if (promo && !formData.promoCode) {
        setFormData((prev) => ({ ...prev, promoCode: String(promo).toUpperCase() }));
        setPromoOpen(true);
      } else if (code && !formData.promoCode) {
        setFormData((prev) => ({ ...prev, promoCode: String(code).toUpperCase() }));
        setPromoOpen(true);
      }
    }
  }, [router.isReady]);

  // [2026-05-03] Pick up email pre-fill from /auth/login (the simple form
  // there now redirects here so users don't end up with under-provisioned
  // accounts). sessionStorage is read once and cleared so refresh doesn't
  // re-overwrite a field the user has since edited.
  useEffect(() => {
    try {
      const prefill =
        typeof window !== 'undefined' && window.sessionStorage?.getItem('signup_email_prefill');
      if (prefill && typeof prefill === 'string' && prefill.includes('@')) {
        setFormData((prev) => (prev.email ? prev : { ...prev, email: prefill }));
        window.sessionStorage.removeItem('signup_email_prefill');
      }
    } catch (_ssErr) {
      /* sessionStorage unavailable (privacy mode) */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Smart client-side geo-defaulting: preserves US default for US visitors and
  // respects explicit ?state= / ?country= query overrides, while pre-selecting
  // Outside The US + matching country for clear international timezones before
  // the player interacts with any location control.
  useEffect(() => {
    if (!router.isReady || locationTouchedRef.current) return;
    const one = (v) => (Array.isArray(v) ? v[0] : v);
    let stateParam = one(router.query?.state);
    let countryParam = one(router.query?.country);
    if ((!stateParam || !countryParam) && typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        if (!stateParam) stateParam = sp.get('state') || '';
        if (!countryParam) countryParam = sp.get('country') || '';
      } catch {
        /* ignore malformed search */
      }
    }

    const cleanState = String(stateParam || '').trim().toUpperCase();
    if (cleanState && US_STATES.includes(cleanState)) {
      setFormData((prev) =>
        locationTouchedRef.current || prev.state || prev.country
          ? prev
          : { ...prev, outsideUs: false, state: cleanState, country: '' }
      );
      return;
    }

    if (countryParam) {
      const resolvedCountry = resolveNonUsCountryQuery(countryParam);
      if (resolvedCountry === 'US') {
        setFormData((prev) =>
          locationTouchedRef.current ? prev : { ...prev, outsideUs: false, country: '' }
        );
        return;
      }
      if (resolvedCountry) {
        setFormData((prev) =>
          locationTouchedRef.current || prev.state || prev.country
            ? prev
            : { ...prev, outsideUs: true, country: resolvedCountry, state: '' }
        );
        return;
      }
    }

    try {
      const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const inferredCountry = inferNonUsCountryFromTimezone(detectedTimeZone);
      if (inferredCountry) {
        setFormData((prev) =>
          locationTouchedRef.current || prev.state || prev.country
            ? prev
            : { ...prev, outsideUs: true, country: inferredCountry, state: '' }
        );
      }
    } catch {
      /* Intl timezone lookup unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Override global html/body background for SmarterPoker Dark theme
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'signup-bg-override';
    style.textContent = 'html, body { background: #18191A !important; }';
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById('signup-bg-override');
      if (el) el.remove();
    };
  }, []);

  // Check alias availability with debounce (3-20 characters allowed)
  useEffect(() => {
    // Must be 3-20 characters
    if (formData.pokerAlias.length < 3) {
      setAliasAvailable(null);
      setAliasError('');
      return;
    }

    if (formData.pokerAlias.length > 20) {
      setAliasAvailable(false);
      setAliasError('Alias Must Be 20 Characters Or Less');
      return;
    }

    const timeout = setTimeout(async () => {
      setAliasChecking(true);
      setAliasError('');

      try {
        // Use RPC function that bypasses RLS for unauthenticated users
        const { data, error } = await supabase.rpc('check_username_available', {
          p_username: formData.pokerAlias,
        });

        if (error) {
          console.warn('Alias check RPC error:', error);
          // Fallback to direct query if RPC doesn't exist
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('profiles')
            .select('username')
            .ilike('username', formData.pokerAlias)
            .limit(1);

          if (fallbackError) throw fallbackError;

          if (fallbackData && fallbackData.length > 0) {
            setAliasAvailable(false);
            setAliasError('This Alias Is Already Taken');
          } else {
            setAliasAvailable(true);
            setAliasError('');
          }
        } else {
          // RPC returns true if available, false if taken
          if (data === true) {
            setAliasAvailable(true);
            setAliasError('');
          } else {
            setAliasAvailable(false);
            setAliasError('This Alias Is Already Taken');
          }
        }
      } catch (err) {
        console.warn('Alias check error:', err);
        setAliasAvailable(null);
      } finally {
        setAliasChecking(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [formData.pokerAlias]);


  // Check promo or referral code validity with debounce
  useEffect(() => {
    // Reset all states when input changes
    setPromoValid(null);
    setPromoError('');
    setPromoDetails(null);
    setReferralValid(null);
    setReferralDetails(null);

    // A player number can be one digit (kingfish is player 1); only a promo
    // code needs three characters before it is worth checking.
    if (!formData.promoCode || (formData.promoCode.length < 3 && !isReferralInput(formData.promoCode))) {
      setIsReferralCode(false);
      return;
    }

    // A referral is a player number (all digits) or a Referral Crew code
    // (SP-56737B: always carries a dash, which no promo code does).
    const isReferral = isReferralInput(formData.promoCode);
    setIsReferralCode(isReferral);

    const timeout = setTimeout(async () => {
      setPromoChecking(true);
      setPromoError('');
      try {
        if (isReferral) {
          // Validate as referral code (player number)
          const res = await fetch('/api/promo/validate-referral-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: formData.promoCode }),
          });
          // A 4xx carries the reason ("No player found...", "expired"): show it.
          if (res.status >= 500) throw new Error(`Request failed (${res.status})`);
          const data = await res.json();
          if (res.ok && data.valid) {
            setReferralValid(true);
            setReferralDetails(data);
            setPromoValid(true); // Shared valid state for border color
            setPromoError('');
          } else {
            setReferralValid(false);
            setPromoValid(false);
            setPromoError(data.error || 'Invalid Referral Code');
          }
        } else {
          // Validate as promo code
          const res = await fetch('/api/promo/validate-promo-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: formData.promoCode }),
          });
          // A 4xx carries the reason ("No player found...", "expired"): show it.
          if (res.status >= 500) throw new Error(`Request failed (${res.status})`);
          const data = await res.json();
          if (res.ok && data.valid) {
            setPromoValid(true);
            setPromoDetails(data);
            setPromoError('');
          } else {
            setPromoValid(false);
            setPromoDetails(null);
            setPromoError(data.error || 'Invalid Promo Code');
          }
        }
      } catch (err) {
        console.warn('Promo/referral validation error:', err);
        setPromoValid(null);
      } finally {
        setPromoChecking(false);
      }
    }, 600);

    return () => clearTimeout(timeout);
  }, [formData.promoCode]);

  // Validate email format
  const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  // Handle OAuth sign in (Google, Apple, SmarterPoker)
  // [2026-05-03] Apex-domain hardening. PKCE stores code_verifier in
  // localStorage on the origin where signInWithOAuth is called. If the
  // user is on www.smarter.poker, Supabase redirects to Google which
  // returns to /auth/callback — but the www→apex middleware redirect
  // strips the user to apex, where the verifier is unreadable, and
  // exchangeCodeForSession fails with "code verifier not found".
  const handleOAuthSignIn = async (provider) => {
    if (loading || oauthLoading) return;
    /* ── www -> apex, and the PKCE code_verifier scope ─────────────────────
       PKCE stores its code_verifier in localStorage on the ORIGIN that called
       signInWithOAuth, and www.smarter.poker is a different origin from
       smarter.poker: start the flow on www and the callback lands on the apex
       where the verifier is unreadable ("code verifier not found").

       Handled by middleware.ts, not here. It 301s every non-API route off www
       (matcher '/((?!api|_next/static|_next/image|favicon.ico).*)'), so the
       client never observes a www hostname and the client-side pre-bounce that
       used to sit in this function was unreachable. It was also harmful: it
       resumed the flow from ?provider= on page load, so any link to
       /auth/signup?provider=facebook auto-launched Meta's consent dialog for
       whoever opened it. A one-shot sessionStorage marker cannot rescue that
       either - sessionStorage is per-origin too, so a marker written on www is
       unreadable on the apex, which is the single hop it existed to survive. */
    const opening = beginOpening();
    setError('');
    setOauthLoading(provider);
    /* Remember which page started the flow. /auth/callback always bounced a
       failure to /auth/login, so a user who clicked Facebook HERE was
       teleported to a different page to read the reason - which reads as "the
       button logged me out", not "here is what went wrong". */
    try {
      sessionStorage.setItem(AUTH_ORIGIN_KEY, '/auth/signup');
    } catch (_e) {
      /* storage disabled - the error still lands, just on /auth/login */
    }

    try {
      // Bind any campaign to THIS flow: a single-use nonce the callback must
      // echo back (src/lib/acquisition/firstTouch.mjs).
      const attributionNonce = beginOAuthAttribution();
      const callbackBase =
        typeof buildCallbackUrl === 'function'
          ? buildCallbackUrl()
          : `${window.location.origin}/auth/callback`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: withAttributionNonce(callbackBase, attributionNonce),
          skipBrowserRedirect: true,
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
          // Supabase's Facebook default is `email` alone - no name, no avatar,
          // which is why an OAuth signup's username fell through to Player<N>.
          // public_profile needs no App Review; email does.
          scopes: provider === 'facebook' ? 'email,public_profile' : undefined,
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error('Unable To Start Sign In.');
      await opening;
      window.location.assign(data.url);
    } catch (err) {
      cancelOpening();
      console.warn(`${provider} sign in error:`, err);
      // PARITY WITH login.js (2026-08-25). This page had no server-side error
      // reporting, so a provider failure was invisible. This closes the
      // exact bug the callback fix was written to close.
      reportAuthError('signup_oauth_init', err);
      setError(err.message || `Failed To Sign In With ${provider}`);
      setOauthLoading('');
    }
  };

  // [2026-05-03] Resume OAuth after the www→apex bounce above, and surface
  // anything /auth/callback bounced back at us. One effect, one router.replace:
  // two effects each writing a copy of router.query snapshotted in the same
  // commit put back whichever param the other had just deleted.
  useEffect(() => {
    if (!router.isReady) return;

    const one = (v) => (Array.isArray(v) ? v[0] : v);
    const emailParam = one(router.query.email);
    if (typeof emailParam === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam.trim())) {
      setFormData((prev) => (prev.email && prev.email.trim() ? prev : { ...prev, email: emailParam.trim().toLowerCase() }));
    }
    const codeRaw = one(router.query.authError);
    const providerRaw = one(router.query.provider);
    const provider =
      typeof providerRaw === 'string' && OAUTH_PROVIDERS.includes(providerRaw)
        ? providerRaw
        : null;

    if (codeRaw) {
      const code = String(codeRaw);
      setError(authErrorMessage(code));
      setErrorDetail(takeAuthErrorDetail(code));
    }

    if (codeRaw || providerRaw) {
      const cleanQuery = { ...router.query };
      delete cleanQuery.authError;
      delete cleanQuery.provider;
      router.replace({ pathname: router.pathname, query: cleanQuery }, undefined, {
        shallow: true,
      });
    }

    // ?provider= is stripped, never acted on - see handleOAuthSignIn above.
    // Auto-launching OAuth from a URL param is a drive-by consent dialog for
    // anyone who clicks a link, and the bounce it was written for is
    // middleware's job now.
    void provider;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMIT: Create account with email/password
  // ─────────────────────────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault();
    // [2026-08-04] Guard against double-submit: the HIBP password check
    // below is an up-to-3s network call. Previously `loading` stayed
    // false until AFTER it resolved, so a second click launched a
    // concurrent signUp — the loser saw "already registered" and got
    // dumped into the email_pending dead-end mid-flow.
    if (loading) return;
    setLoading(true);
    setError('');

    // Validate first and last name
    if (!formData.firstName.trim()) {
      setError('Please Enter Your First Name');
      setLoading(false);
      return;
    }
    if (!formData.lastName.trim()) {
      setError('Please Enter Your Last Name');
      setLoading(false);
      return;
    }

    // Validate alias availability
    if (aliasAvailable === false) {
      setError('Please Choose A Different Poker Alias');
      setLoading(false);
      return;
    }

    if (formData.pokerAlias.length < 3) {
      setError('Poker Alias Must Be At Least 3 Characters');
      setLoading(false);
      return;
    }

    if (formData.pokerAlias.length > 20) {
      setError('Poker Alias Must Be 20 Characters Or Less');
      setLoading(false);
      return;
    }

    if (!isValidEmail(formData.email)) {
      setError('Please Enter A Valid Email Address');
      setLoading(false);
      return;
    }

    // ── [Phase 6.1.20] Password strength + HIBP breach-list ─────────
    // Replaces the old 6-char rule with an entropy check + pwned-
    // passwords API lookup. Network call to HIBP is fail-open (we
    // don't block signup if HIBP is down), but the entropy check is
    // fully local.
    const pwCheck = await validatePassword(formData.password);
    if (!pwCheck.ok) {
      setError(pwCheck.reason || 'Password Does Not Meet Our Security Requirements.');
      setLoading(false);
      return;
    }

    // Location: a US player needs a state; a player outside the US needs a country.
    if (formData.outsideUs ? !formData.country : !formData.state) {
      setError(formData.outsideUs ? 'Please Select Your Country' : 'Please Select Your State');
      setLoading(false);
      return;
    }

    // Birthdate validation - must be 18+ (using dropdown values)
    if (!formData.birthMonth || !formData.birthDay || !formData.birthYear) {
      setError('Please Select Your Complete Birth Date');
      setLoading(false);
      return;
    }

    const birthYearInt = parseInt(formData.birthYear, 10);
    const birthMonthInt = parseInt(formData.birthMonth, 10);
    const birthDayInt = parseInt(formData.birthDay, 10);
    const birthDate = new Date(birthYearInt, birthMonthInt - 1, birthDayInt);

    // JS Date auto-wraps (e.g. Feb 31 -> Mar 2 or Mar 3). We must verify the month/day didn't change!
    if (
      birthDate.getFullYear() !== birthYearInt ||
      birthDate.getMonth() !== birthMonthInt - 1 ||
      birthDate.getDate() !== birthDayInt
    ) {
      setError('Please Enter A Valid Birth Date');
      setLoading(false);
      return;
    }

    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      age < 18 ||
      (age === 18 && monthDiff < 0) ||
      (age === 18 && monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      setError('You Must Be 18 Years Or Older To Create An Account');
      setLoading(false);
      return;
    }

    // 18+ Age Verification Check
    if (!ageConfirmed) {
      setError('You Must Confirm You Are 18+ Years Of Age');
      setLoading(false);
      return;
    }

    setLoading(true);

    // Sanitize: trim whitespace from names before any DB write
    const cleanFirstName = formData.firstName.trim();
    const cleanLastName = formData.lastName.trim();
    const cleanFullName = `${cleanFirstName} ${cleanLastName}`.trim();

    try {
      // The club invite this signup came from, if any. Written into the
      // account's metadata so /auth/callback can claim it even when the
      // confirmation email is opened on another device (2026-10-15).
      const pendingInvite = readPendingInvite();
      const rawQueryPt = Array.isArray(router.query?.pt) ? router.query.pt[0] : router.query?.pt;
      const promoSignupToken =
        (typeof cleanPromoTokenShape === 'function' ? cleanPromoTokenShape(rawQueryPt) : null) ||
        (typeof readPendingPromoSignupToken === 'function' ? readPendingPromoSignupToken() : null);
      // An older /invite/<club>?ref=<n> link has no code; it sends the way
      // back to the club as ?redirect=, kept the same way.
      const rawRedirect = Array.isArray(router.query?.redirect)
        ? router.query.redirect[0]
        : router.query?.redirect || (Array.isArray(router.query?.next) ? router.query.next[0] : router.query?.next);
      const clubJoinPath = typeof safeClubArenaPath === 'function' ? safeClubArenaPath(rawRedirect) : null;

      // Step 1: Create auth user with email/password
      // [2026-08-04] Normalize the email the same way login.js does —
      // "Dan@X.com " and "dan@x.com" must be the same account.
      const { data: authData, error: signUpError } = await signUpWithRecovery(supabase.auth, {
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          data: {
            full_name: cleanFullName,
            first_name: cleanFirstName,
            last_name: cleanLastName,
            poker_alias: formData.pokerAlias,
            city: formData.city,
            state: formData.outsideUs ? null : formData.state,
            country: formData.outsideUs ? formData.country : US_COUNTRY,
            birth_year: parseInt(formData.birthYear),
            birthday: `${formData.birthYear}-${formData.birthMonth}-${formData.birthDay}`,
            // Phone is verified AFTER first login on /hub/verify-phone
            // (2026-10-07); ensure-profile reads phone_verified from the
            // server-side receipt, never from this client metadata.
            phone: null,
            phone_verified: false,
            ...(pendingInvite
              ? {
                  club_invite_code: pendingInvite.code,
                  club_invite_first_seen: new Date(pendingInvite.firstSeen).toISOString(),
                }
              : {}),
            ...(clubJoinPath ? { club_join_path: clubJoinPath } : {}),
            ...(promoSignupToken ? { promo_signup_token: promoSignupToken } : {}),
            // The referrer, by player number. The database records the
            // referral and pays both players when this account's email is
            // confirmed, on whatever device (fn_settle_signup_referral).
            // Written whether or not the debounced check has answered yet, so
            // a fast tap on Create Account cannot drop it; the database
            // resolves it and ignores anything that names nobody.
            ...referralMetadata(formData.promoCode, referralDetails),
            // First UTM-tagged landing (LinkedIn, Reddit, ...), kept on
            // auth.users.raw_user_meta_data. src/lib/acquisition/firstTouch.mjs
            ...firstTouchMetadata(),
          },
          // Enable email confirmation - redirect to /auth/callback after verification
          emailRedirectTo: buildCallbackUrl(),
        },
      });

      if (isExistingSignup(authData, signUpError)) {
        setExistingAccount(true);
        return;
      }
      if (signUpError) throw signUpError;

      console.log('Auth user created:', authData);

      // ── Save pending promo/referral for after email verification ──
      if (formData.promoCode && promoValid && !isReferralCode) {
        localStorage.setItem(PENDING_PROMO_KEY, formData.promoCode);
      }
      if (isReferralCode && referralValid && referralDetails) {
        localStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(referralDetails));
      }

      // ── [Phase 5.1.2] PostHog activation-funnel: signup event ───────
      // Fire client-side so the SDK can auto-populate the UTM / referrer
      // properties it has already captured from window.location. The
      // signup API route also fires a server-side capture as a
      // double-write in case ad-blockers drop the client event — the
      // two dedupe on the same distinctId + event name in PostHog.
      try {
        if (authData?.user?.id) {
          identify(authData.user.id, {
            email: formData.email,
            signup_source: isReferralCode ? 'referral' : formData.promoCode ? 'promo' : 'organic',
            state: formData.outsideUs ? null : formData.state,
            country: formData.outsideUs ? formData.country : US_COUNTRY,
          });
          // [2026-05-03] Deferred — fired only after profile provision.
          // capture(FunnelEvents.SIGNUP, …) — see end of try{} block below.
        }
      } catch (_analyticsErr) {
        console.warn('[App] Handled exception:', _analyticsErr?.message || _analyticsErr);
      }

      // [2026-05-03] Deferred SIGNUP funnel event. Fire AFTER the
      // full provisioning attempt so orphaned auth.users rows (no
      // profile) are tracked separately and don't inflate the funnel.
      try {
        if (authData?.user?.id) {
          capture(FunnelEvents.SIGNUP, {
            has_referral: !!isReferralCode,
            has_promo: !!formData.promoCode && !isReferralCode,
            phone_verified: false,
          });
        }
      } catch (_pcErr) {
        console.warn('[App] Handled exception:', _pcErr?.message || _pcErr);
      }

      // Check if email confirmation is required
      if (authData.user && !authData.session) {
        // Email confirmation required - show pending screen
        setStep('email_pending');
      } else {
        // Auto-confirmed signups (email confirmation off, Dan 2026-10-22) get
        // everything code confirmation gives: promo/referral codes redeemed,
        // player number shown, and the same invitation path.
        const session = authData.session;
        const fetchPlayerNumber = async () => {
          if (!authData?.user) return;
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('player_number')
              .eq('id', authData.user.id)
              .maybeSingle();
            if (profile?.player_number) setAssignedPlayerNumber(profile.player_number);
          } catch (err) {
            console.log('Could not fetch player number:', err);
          }
        };
        const redeemCodes = session?.access_token && authData?.user?.id
          ? redeemPendingSignupCodes({ accessToken: session.access_token, userId: authData.user.id })
          : Promise.resolve();
        const [, , clubNext] = await Promise.all([
          fetchPlayerNumber(),
          redeemCodes,
          resolveSignupClubPath(session, rawRedirect),
        ]);
        const next = clubNext || getSafeRedirect();
        setSignupClubPath(next);
        setStep('success');
        const rawAutoUnlock = Array.isArray(router.query?.unlock) ? router.query.unlock[0] : router.query?.unlock;
        if (typeof promotePendingSeoUnlock === 'function') {
          promotePendingSeoUnlock(rawAutoUnlock);
        }
        // The first screen after signing in is the welcome package offer
        // (Verify or Skip), with or without a club invite (2026-10-23): an
        // uninvited player used to stop here on a screen whose main button
        // went straight to the lobby, and never saw the offer.
        window.location.replace(`/hub/verify-phone?welcome=1&next=${encodeURIComponent(next || CLUB_LOBBY_PATH)}`);
      }
    } catch (err) {
      console.warn('Signup error:', err);
      // Only Auth's explicit duplicate result opens recovery; no email lookup.
      if (isExistingSignup(null, err)) {
        setExistingAccount(true);
      } else {
        reportAuthError('signup_form_submit', err);
        setError(isAbortedAuthRequest(err)
          ? 'Your Connection Dropped Before We Could Create Your Account. Please Check Your Signal And Tap Create Account Again.'
          : 'Failed To Create Account. Please Check Your Details And Try Again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Count down the resend cooldown once a code has been (re)sent.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // The first code goes out with signUp, so the cooldown starts on arrival here.
  useEffect(() => {
    if (step === 'email_pending') setResendIn(RESEND_COOLDOWN_SECONDS);
  }, [step]);

  const handleResendCode = async () => {
    if (resending || resendIn > 0) return;
    setResending(true);
    setResendNote('');
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: formData.email.trim().toLowerCase(),
        options: { emailRedirectTo: buildCallbackUrl() },
      });
      if (resendError) throw resendError;
      setVerificationCode('');
      setResendNote('A New Code Is On Its Way. If You Do Not See It In Your Inbox, Check Your Spam Or Junk Folder. Use The Newest Email.');
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase();
      // Supabase answers a too-soon resend with a 429 "security purposes" message.
      setError(
        msg.includes('security') || msg.includes('rate') || err?.status === 429
          ? 'Please Wait A Moment Before Requesting Another Code.'
          : 'Could Not Send A New Code. Please Try Again.'
      );
      setResendIn(RESEND_COOLDOWN_SECONDS);
    } finally {
      setResending(false);
    }
  };

  // VERIFY: Submit email OTP verification code
  // ─────────────────────────────────────────────────────────────────────────
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!isEmailVerificationCode(verificationCode)) {
      setError('Enter The Six-Digit Verification Code From Your Email.');
      return;
    }

    setVerifying(true);

    try {
      // Verify the OTP code with Supabase
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: formData.email.trim().toLowerCase(),
        token: verificationCode,
        type: 'signup',
      });

      if (verifyError) throw verifyError;

      console.log('Email verified:', data);

      // Everything after the code is independent, so it runs at once: the
      // player waited for each of these in turn before reaching Club Arena.
      const fetchPlayerNumber = async () => {
        if (!data?.user) return;
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('player_number')
            .eq('id', data.user.id)
            .maybeSingle();
          if (profile?.player_number) setAssignedPlayerNumber(profile.player_number);
        } catch (err) {
          console.log('Could not fetch player number:', err);
        }
      };
      // The six-digit code never visits /auth/callback, which is the only
      // place a pending promo or referral code used to be redeemed (2026-10-17).
      const redeemCodes = data?.session?.access_token && data?.user?.id
        ? redeemPendingSignupCodes({ accessToken: data.session.access_token, userId: data.user.id })
        : Promise.resolve();
      const rawVerifyRedirect = Array.isArray(router.query?.redirect)
        ? router.query.redirect[0]
        : router.query?.redirect || (Array.isArray(router.query?.next) ? router.query.next[0] : router.query?.next);
      if (typeof rememberPromoSignupToken === 'function') {
        const rawVerifyPt = Array.isArray(router.query?.pt) ? router.query.pt[0] : router.query?.pt;
        rememberPromoSignupToken(rawVerifyPt || data?.user?.user_metadata?.promo_signup_token);
      }
      const [, , clubNext] = await Promise.all([
        fetchPlayerNumber(),
        redeemCodes,
        resolveSignupClubPath(data?.session, rawVerifyRedirect),
      ]);
      const next = clubNext || getSafeRedirect();
      setSignupClubPath(next);
      setStep('success');
      const rawOtpUnlock = Array.isArray(router.query?.unlock) ? router.query.unlock[0] : router.query?.unlock;
      if (typeof promotePendingSeoUnlock === 'function') {
        promotePendingSeoUnlock(rawOtpUnlock);
      }
      // Offer the earned welcome package before entering Club Arena, invited
      // or not. Verification and Skip For Now both continue to the club.
      window.location.replace(`/hub/verify-phone?welcome=1&next=${encodeURIComponent(next || CLUB_LOBBY_PATH)}`);
    } catch (err) {
      console.warn('Verification error:', err);
      setError(err.message || 'Invalid Verification Code. Please Try Again.');
    } finally {
      setVerifying(false);
    }
  };

  // The form fields, rendered once for the desktop art card and once for the
  // phone layout (CSS decides which tree is visible; both share this state).
  const promoPlayThroughTerms = 'Promo Winnings Require Qualifying Fees Equal To Twice The Original Promo Grant Before Cashout Or Agent Claim-Back. The Remaining Original Promo Chips Require Four Times The Original Grant. The Same Fees Count Toward Both Milestones. Your Own Deposits And Rakeback Stay Separate From These Promo Locks. Tickets Must Use Cashable Player Or Agent Wallet Chips; Promo Chips Can Fund Tournament Entry Directly.';

  const hasQueryPromoOrRef = Boolean(
    router.query?.ref ||
    router.query?.promo ||
    router.query?.code ||
    (typeof refFromRedirect === 'function' && (refFromRedirect(router.query?.redirect) || refFromRedirect(router.query?.next)))
  );
  const isPromoExpanded = promoOpen || Boolean(formData.promoCode) || hasQueryPromoOrRef;

  const signupCompletedSteps = [
    Boolean(formData.firstName.trim()),
    Boolean(formData.lastName.trim()),
    isValidEmail(formData.email),
    formData.password.length >= PW_MIN_LENGTH,
    Boolean(formData.birthMonth && formData.birthDay && formData.birthYear),
    Boolean(formData.city.trim()),
    Boolean(formData.outsideUs ? formData.country : formData.state),
    formData.pokerAlias.length >= 3,
  ].filter(Boolean).length;
  const signupProgressPct = Math.round((signupCompletedSteps / 8) * 100);

  const signupFields = (
    <>
                {/* Real-time Account Progress Indicator */}
                <div
                  data-testid="signup-progress-bar"
                  role="progressbar"
                  aria-label="Free Account Setup Progress"
                  aria-valuenow={signupProgressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{
                    marginBottom: '10px',
                    padding: '8px 10px',
                    background: 'rgba(6, 13, 26, 0.9)',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    borderRadius: '4px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '5px',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      color: '#cbd5e1',
                    }}
                  >
                    <span style={{ color: '#38bdf8' }}>Account Progress: {signupProgressPct}%</span>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>
                      {signupProgressPct === 100 ? 'Ready To Create Free Account' : '100% Free (Takes Under 30 Seconds)'}
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '5px',
                      background: 'rgba(148, 184, 224, 0.16)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(6, signupProgressPct)}%`,
                        height: '100%',
                        background: signupProgressPct === 100 ? '#22c55e' : 'linear-gradient(90deg, #1d4ed8 0%, #38bdf8 100%)',
                        transition: 'width 0.2s ease',
                      }}
                    />
                  </div>
                </div>

                {/* First Name & Last Name */}
                <div className="auth-field-row">
                  <div className="auth-field-group">
                    <label className="auth-label">First Name</label>
                    <input
                      type="text"
                      className="auth-input-styled"
                      placeholder=""
                      value={formData.firstName}
                      onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                      required
                    />
                  </div>
                  <div className="auth-field-group">
                    <label className="auth-label">Last Name</label>
                    <input
                      type="text"
                      className="auth-input-styled"
                      placeholder=""
                      value={formData.lastName}
                      onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div className="auth-field-group">
                  <label className="auth-label">Email Address</label>
                  <input
                    type="email"
                    className="auth-input-styled"
                    placeholder=""
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>

                {/* Password */}
                <div className="auth-field-group">
                  <label className="auth-label">Password</label>
                  <input
                    type="password"
                    className="auth-input-styled"
                    placeholder=""
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={PW_MIN_LENGTH}
                  />
                </div>

                {/* Date of Birth */}
                <div className="auth-field-group">
                  <label className="auth-label">Date Of Birth <span className="auth-label-hint" style={{ color: "#00d4ff", fontSize: "9px", textTransform: "none" }}>(Must Be 18+)</span></label>
                  <div className="auth-field-row">
                    <select
                      className="auth-input-styled"
                      value={formData.birthMonth || ""}
                      onChange={(e) => setFormData({ ...formData, birthMonth: e.target.value })}
                      required
                    >
                      <option value="" disabled>Month</option>
                      {months.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <select
                      className="auth-input-styled"
                      value={formData.birthDay || ""}
                      onChange={(e) => setFormData({ ...formData, birthDay: e.target.value })}
                      required
                    >
                      <option value="" disabled>Day</option>
                      {days.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                    <select
                      className="auth-input-styled"
                      value={formData.birthYear || ""}
                      onChange={(e) => setFormData({ ...formData, birthYear: e.target.value })}
                      required
                    >
                      <option value="" disabled>Year</option>
                      {years.map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Country: United States by default; "Outside The US" reveals the country dropdown */}
                <div className="auth-field-group">
                  <label className="auth-label">Where Do You Live?</label>
                  <div className="auth-field-row" role="radiogroup" aria-label="Where Do You Live?">
                    {[
                      { outside: false, label: 'United States' },
                      { outside: true, label: 'Outside The US' },
                    ].map((opt) => {
                      const active = formData.outsideUs === opt.outside;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          className={`auth-input-styled auth-country-choice${active ? ' is-active' : ''}`}
                          onClick={() => {
                            locationTouchedRef.current = true;
                            setFormData({
                              ...formData,
                              outsideUs: opt.outside,
                              state: opt.outside ? '' : formData.state,
                              country: opt.outside ? formData.country : '',
                            });
                          }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            cursor: 'pointer',
                            fontWeight: active ? 700 : 500,
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* City & State (US) or City & Country (outside the US) */}
                <div className="auth-field-row">
                  <div className="auth-field-group" style={{ flex: formData.outsideUs ? 1 : 2 }}>
                    <label className="auth-label">City</label>
                    <input
                      type="text"
                      className="auth-input-styled"
                      placeholder=""
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                      required
                    />
                  </div>
                  {formData.outsideUs ? (
                    <div className="auth-field-group" style={{ flex: 1 }}>
                      <label className="auth-label">Select Your Country</label>
                      <select
                        className="auth-input-styled"
                        value={formData.country}
                        onChange={(e) => {
                          locationTouchedRef.current = true;
                          setFormData({ ...formData, country: e.target.value });
                        }}
                        required
                      >
                        <option value="" disabled>Select</option>
                        {NON_US_COUNTRIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="auth-field-group" style={{ flex: 1 }}>
                      <label className="auth-label">State</label>
                      <select
                        className="auth-input-styled"
                        value={formData.state}
                        onChange={(e) => {
                          locationTouchedRef.current = true;
                          setFormData({ ...formData, state: e.target.value });
                        }}
                        required
                      >
                        <option value="" disabled>Select</option>
                        {usStates.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Poker Alias */}
                <div className="auth-field-group">
                  <label className="auth-label">Poker Alias <span className="auth-label-hint" style={{ color: "#00d4ff", fontSize: "9px", textTransform: "none" }}>(You Can Change This Later)</span></label>
                  <input
                    type="text"
                    className="auth-input-styled"
                    placeholder=""
                    value={formData.pokerAlias}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        pokerAlias: e.target.value.replace(/[^a-zA-Z0-9_]/g, ""),
                      })
                    }
                    required
                    minLength={3}
                  />
                  {formData.pokerAlias.length >= 3 && aliasAvailable !== null && (
                    <div style={{ fontSize: "11px", fontWeight: "bold", color: aliasAvailable ? "#4ade80" : "#f87171" }}>
                      {aliasAvailable ? "User Name Is Available" : "Username Not Available"}
                    </div>
                  )}
                </div>

                {/* Promo Or Referral Code — collapsed behind toggle unless prefilled or queried */}
                <div className="auth-field-group">
                  <button
                    type="button"
                    className="sp-promo-toggle"
                    aria-expanded={isPromoExpanded}
                    onClick={() => setPromoOpen((prev) => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      width: '100%',
                      minHeight: '44px',
                      padding: '10px 12px',
                      background: 'rgba(8, 17, 33, 0.85)',
                      border: '1px solid rgba(148, 184, 224, 0.28)',
                      borderRadius: '8px',
                      color: '#38bdf8',
                      fontSize: '12px',
                      fontWeight: 600,
                      letterSpacing: '0.2px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      boxSizing: 'border-box',
                    }}
                  >
                    <span>Have A Promo Or Referral Code?</span>
                    <span aria-hidden="true" style={{ color: '#cbd5e1', fontSize: '15px', fontWeight: 700, lineHeight: 1 }}>
                      {isPromoExpanded ? '-' : '+'}
                    </span>
                  </button>
                  {isPromoExpanded && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginTop: '6px',
                        padding: '10px',
                        background: 'rgba(6, 13, 26, 0.85)',
                        border: '1px solid rgba(148, 184, 224, 0.28)',
                        borderRadius: '8px',
                      }}
                    >
                      <label className="auth-label">
                        Promo Or Referral Code{' '}
                        <span className="auth-label-hint" style={{ color: '#38bdf8', fontSize: '9px', textTransform: 'none' }}>
                          (Optional)
                        </span>
                      </label>
                      <input
                        type="text"
                        className="auth-input-styled"
                        placeholder="Enter Code"
                        value={formData.promoCode}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            promoCode: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
                          })
                        }
                        maxLength={20}
                        style={{ textTransform: 'uppercase' }}
                      />
                      {/* THE VALIDATION RAN, NOTHING SHOWED IT (fixed 2026-08-25).
                          The debounced effect above calls
                          /api/promo/validate-{promo,referral}-code and sets
                          promoChecking / promoError / promoDetails - and not one of
                          the three was rendered anywhere. A mistyped code looked
                          exactly like a good one right up until the account was
                          created without the bonus, because handleSignUp only
                          stores the pending code when `promoValid` is true. */}
                      {promoChecking && (
                        <div style={{ marginTop: '4px', color: '#cbd5e1', fontSize: '11px' }}>
                          Checking Code...
                        </div>
                      )}
                      {!promoChecking && promoError && (
                        <div
                          role="alert"
                          style={{ marginTop: '4px', color: '#f87171', fontSize: '11px' }}
                        >
                          {promoError}
                        </div>
                      )}
                      {!promoChecking && promoValid && (
                        <div style={{ marginTop: '4px', color: '#4ade80', fontSize: '11px' }}>
                          {isReferralCode
                            ? `Referral Code Accepted${referralDetails?.username ? ` - ${referralDetails.username}` : ''}`
                            : `Promo Code Accepted${promoDetails?.description ? ` - ${promoDetails.description}` : ''}`}
                        </div>
                      )}
                      <p style={{ ...phoneStyles.termsText, fontSize: '11px', margin: '4px 0 0', color: '#94a3b8' }}>
                        {promoPlayThroughTerms}
                      </p>
                    </div>
                  )}
                </div>
    </>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      {OpeningComponent}
      <SEOHead
        title="Create Account - Smarter.Poker"
        description="Create A Free Smarter.Poker Account: GTO Training, Private Poker Clubs In Poker Arena, Live Poker Room Waitlists, Home Games, Trivia And A Bankroll Manager. Free To Play, No Real-Money Gambling."
        canonical="/auth/signup"
      />

      <ExistingAccountDialog open={existingAccount} onClose={() => setExistingAccount(false)} onSignIn={signInToExistingAccount} />
      {step === 'info' ? (
        <>
        <AuthEntryChoices current="signup" query={router.query} />
        {/* PHONE-FIRST LAYOUT (2026-10-08, Dan). Below 600px the painted
            card's form window is ~164px wide and every field is cramped
            inside a scroll box. On phones the artwork's top (logo, Create
            Account, the social buttons) stays as a header and the form
            renders full-width beneath it with real controls. Both trees
            are always in the DOM and share the same state; CSS picks one,
            so there is no server/client mismatch and no flash. */}
        <style dangerouslySetInnerHTML={{ __html: `
          .sp-signup-phone { display: none; }
          @media (max-width: 599px) {
            .sp-signup-desktop { display: none !important; }
            .sp-signup-phone { display: block; }
          }
        ` }} />
        <div
          className="sp-signup-desktop"
          style={{
            position: 'relative',
            width: '100%',
            height: '100vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#000',
            overflow: 'hidden',
          }}
        >
          <div
            className="dynamic-auth-form"
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: 'min(100vw, 71.4vh)',
              aspectRatio: '10 / 14',
              backgroundImage: `url('/images/dynamic-signup-bg.webp')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              boxShadow: '0 0 50px rgba(0, 212, 255, 0.2)',
            }}
          >
            <style dangerouslySetInnerHTML={{ __html: `
              /* MOBILE (2026-10-07): the form never set a font, so iOS fell back
                 to -webkit-standard (a serif) for every label and input, and the
                 global mobile "input, select { min-height: 44px }" rule in
                 src/index.css stretched the 36px fields (and the 2%-tall
                 checkbox hotspot) to 44px. The card's geometry is owned by
                 the artwork, so it opts out, exactly as /auth/login does. */
              .dynamic-auth-form {
                 font-family: var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              }
              .dynamic-auth-form input, .dynamic-auth-form select, .dynamic-auth-form button {
                 min-height: 0 !important;
                 font-family: inherit;
              }
              .dynamic-auth-form button.sp-promo-toggle {
                 min-height: 44px !important;
              }
              .dynamic-auth-form button.sp-promo-toggle:focus-visible {
                 outline: 2px solid #38bdf8;
                 outline-offset: 2px;
              }
              .dynamic-auth-form input, .dynamic-auth-form select {
                 background: transparent;
                 border: none;
                 color: #fff;
                 font-size: 0.9rem;
                 padding: 0 8px;
                 box-sizing: border-box;
                 outline: none;
                 z-index: 10;
              }
              .dynamic-auth-form input:-webkit-autofill,
              .dynamic-auth-form input:-webkit-autofill:hover, 
              .dynamic-auth-form input:-webkit-autofill:focus, 
              .dynamic-auth-form input:-webkit-autofill:active {
                 transition: background-color 5000s ease-in-out 0s;
                 -webkit-text-fill-color: #fff !important;
              }
              .dynamic-auth-form input[type="checkbox"] {
                 cursor: pointer;
                 opacity: 0;
                 z-index: 20;
              }
              .dynamic-auth-form select {
                 appearance: none;
                 cursor: pointer;
              }
              .dynamic-auth-form option {
                 background: #0b0e14;
                 color: #fff;
              }
            ` }} />
            <form onSubmit={handleSignUp} style={{ width: '100%', height: '100%' }}>
              {/* Back Button */}
              <button
                type="button"
                onClick={() => router.push('/')}
                title="Back"
                style={{
                  position: 'absolute',
                  top: '3.5%',
                  left: '3.5%',
                  width: '8%',
                  height: '3%',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              />

              {/* Floating Error Toast */}
              {error && (
                <div
                  style={{
                    position: 'absolute',
                    top: '15%',
                    left: '10%',
                    width: '80%',
                    padding: '10px',
                    background: 'rgba(240, 40, 73, 0.9)',
                    color: 'white',
                    textAlign: 'center',
                    borderRadius: '8px',
                    zIndex: 50,
                    fontSize: '14px',
                    fontWeight: 'bold',
                  }}
                  role="alert"
                >
                  {error}
                  {/* The provider's own words when /auth/callback bounced us
                      back here. sessionStorage only, never the URL - see
                      src/lib/authErrors.js. */}
                  {errorDetail && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: '11px',
                        fontWeight: 'normal',
                        opacity: 0.85,
                        wordBreak: 'break-word',
                      }}
                    >
                      {errorDetail}
                    </div>
                  )}
                </div>
              )}

              {/* Social Buttons */}
              <button
                type="button"
                onClick={() => handleOAuthSignIn('google')}
                disabled={!!oauthLoading}
                title="Continue With Google"
                style={{
                  position: 'absolute',
                  top: '22.5%',
                  left: '29%',
                  width: '42%',
                  height: '3.5%',
                  background: 'transparent',
                  border: 'none',
                  cursor: oauthLoading ? 'wait' : 'pointer',
                  zIndex: 10,
                }}
              />
              <button
                type="button"
                onClick={() => handleOAuthSignIn('facebook')}
                disabled={!!oauthLoading}
                title="Continue With Facebook"
                style={{
                  position: 'absolute',
                  top: '26.5%',
                  left: '29%',
                  width: '42%',
                  height: '3.5%',
                  background: 'transparent',
                  border: 'none',
                  cursor: oauthLoading ? 'wait' : 'pointer',
                  zIndex: 10,
                }}
              />

              {/* Dynamic Blank Space Form Area */}
              <div
                style={{
                  position: "absolute",
                  top: "36.5%",
                  left: "29%",
                  width: "42%",
                  height: "43%",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  overflowY: "auto",
                  padding: "0 10px",
                  boxSizing: "border-box",
                }}
              >
                {typeof router?.query?.unlock === 'string' && router.query.unlock.trim() && (
                  <div
                    data-testid="signup-unlock-context-desktop"
                    style={{
                      padding: '6px 10px',
                      border: '1px solid #3a7fbd',
                      background: 'linear-gradient(180deg, #12406f 0%, #082341 100%)',
                      color: '#86daff',
                      fontSize: 12,
                      fontWeight: 800,
                      letterSpacing: '0.03em',
                      textAlign: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {formatUnlockPromise(router.query.unlock)}
                  </div>
                )}
                <style dangerouslySetInnerHTML={{ __html: `
                  /* Scrollbar styling for the form area */
                  .dynamic-auth-form div::-webkit-scrollbar {
                    width: 6px;
                  }
                  .dynamic-auth-form div::-webkit-scrollbar-track {
                    background: transparent;
                  }
                  .dynamic-auth-form div::-webkit-scrollbar-thumb {
                    background: rgba(0, 212, 255, 0.3);
                    border-radius: 4px;
                  }
                  .dynamic-auth-form div::-webkit-scrollbar-thumb:hover {
                    background: rgba(0, 212, 255, 0.6);
                  }
                  
                  /* Common Form Styles */
                  .auth-field-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    width: 100%;
                  }
                  .auth-field-row {
                    display: flex;
                    gap: 12px;
                    width: 100%;
                  }
                  .auth-label {
                    color: rgba(255, 255, 255, 0.7);
                    font-size: 11px;
                    font-weight: 500;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    pointer-events: none;
                  }
                  .auth-input-styled {
                    width: 100%;
                    height: 36px;
                    background: rgba(11, 14, 20, 0.7) !important;
                    border: 1px solid rgba(0, 212, 255, 0.2) !important;
                    border-radius: 4px;
                    color: #fff !important;
                    /* 16px, not 14px: iOS Safari zooms the whole page into any
                       focused input smaller than 16px, which is why the form
                       "jumped" on tap (2026-10-08). */
                    font-size: 16px !important;
                    padding: 0 10px !important;
                    box-sizing: border-box;
                    outline: none !important;
                    transition: border-color 0.2s, box-shadow 0.2s;
                  }
                  .auth-input-styled:focus {
                    border-color: rgba(0, 212, 255, 0.8) !important;
                    box-shadow: 0 0 8px rgba(0, 212, 255, 0.3);
                  }
                  .auth-input-styled::placeholder {
                    color: rgba(255, 255, 255, 0.3);
                  }
                  select.auth-input-styled {
                    appearance: auto !important;
                    cursor: pointer;
                  }
                  @media (min-width: 769px) {
                    select.auth-input-styled {
                      font-size: 13px !important;
                      padding: 0 4px !important;
                    }
                  }
                  /* United States / Outside The US: buttons, not inputs, so the
                     16px iOS-zoom floor does not apply; keep each label on one line. */
                  .auth-input-styled.auth-country-choice {
                    font-size: 12px !important;
                    padding: 0 3px !important;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  }
                  .auth-input-styled.auth-country-choice.is-active {
                    border-color: #00d4ff !important;
                    background: rgba(0, 212, 255, 0.16) !important;
                    color: #00d4ff !important;
                    box-shadow: 0 0 0 1px #00d4ff inset;
                  }
                  option {
                    background: #0b0e14;
                    color: #fff;
                  }
                ` }} />

                {signupFields}
              </div>
              
{/* Checkbox 18+ — the box and its label are baked into the artwork.
                  Measured in public/images/dynamic-signup-bg.jpg (819x1024) the
                  box spans x 256-272, y 816-831. The card is 10/14 and the art
                  is 8/10, so background-size: cover scales the art to the card's
                  HEIGHT and crops ~5.4% off each side: on a phone the box lands
                  at left 29.0%, top 79.7%, 2.2% of the card's WIDTH square.
                  The old hotspot used 2% of the HEIGHT for its height (a
                  different scale) and the global mobile "input { min-height:
                  44px }" rule then stretched it to 44px, so the painted mark
                  sat below and right of the box (Dan's screenshot, 2026-10-07).
                  The invisible input now covers the box AND the label text
                  (a 10px box is no tap target), opts out of the min-height,
                  and the mark is drawn inside the painted box. */}
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                required
                aria-label="I Confirm That I Am 18 Years Of Age Or Older And Agree To The Platform's Terms"
                style={{
                  position: 'absolute',
                  top: '78.9%',
                  left: '27.5%',
                  width: '46%',
                  height: '3.6%',
                  minHeight: 0,
                  margin: 0,
                  opacity: 0.01,
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              />
              {/* Render a checkmark if ageConfirmed is true, since the native checkbox is hidden */}
              {ageConfirmed && (
                <svg
                  style={{
                    position: 'absolute',
                    top: '79.55%',
                    left: '29.0%',
                    width: '2.3%',
                    aspectRatio: '1 / 1',
                    height: 'auto',
                    pointerEvents: 'none',
                    zIndex: 11,
                  }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#0072ff"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}

              {/* Create Account Button */}
              <button
                type="submit"
                disabled={loading || aliasAvailable === false || !ageConfirmed}
                title="Create Account"
                style={{
                  position: 'absolute',
                  top: '84%',
                  left: '29%',
                  width: '42%',
                  height: '3.5%',
                  background: 'transparent',
                  border: 'none',
                  cursor:
                    loading || aliasAvailable === false || !ageConfirmed
                      ? 'not-allowed'
                      : 'pointer',
                  zIndex: 10,
                }}
              />

              {/* Terms of Service click zone */}
              <button
                type="button"
                onClick={() => setLegalModal('terms')}
                style={{
                  position: 'absolute',
                  top: '90.5%',
                  left: '49%',
                  width: '10%',
                  height: '1.8%',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              />
              {/* Privacy Policy click zone */}
              <button
                type="button"
                onClick={() => setLegalModal('privacy')}
                style={{
                  position: 'absolute',
                  top: '90.5%',
                  left: '61%',
                  width: '9%',
                  height: '1.8%',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              />

              {/* Sign In Link — covers full "Already Have An Account? Sign In" row */}
              <button
                type="button"
                onClick={() => router.push(authSwitchHref('/auth/login', router.query))}
                title="Sign In"
                style={{
                  position: 'absolute',
                  top: '96.2%',
                  left: '25%',
                  width: '50%',
                  height: '2.5%',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  zIndex: 10,
                }}
              />
            </form>
          </div>
        </div>

        {/* ─── PHONE LAYOUT (<600px) ───────────────────────────────────── */}
        <div className="sp-signup-phone dynamic-auth-form" style={phoneStyles.page}>
          <style dangerouslySetInnerHTML={{ __html: `
            .sp-signup-phone .auth-field-group { display: flex; flex-direction: column; gap: 6px; width: 100%; }
            .sp-signup-phone .auth-field-row { display: flex; gap: 12px; width: 100%; }
            .sp-signup-phone .auth-label {
              color: rgba(255, 255, 255, 0.72); font-size: 12px; font-weight: 600;
              letter-spacing: 0.6px; text-transform: uppercase; pointer-events: none;
            }
            .sp-signup-phone .auth-input-styled {
              width: 100%; height: 48px; min-height: 48px !important;
              background: rgba(11, 14, 20, 0.85) !important;
              border: 1px solid rgba(0, 212, 255, 0.25) !important; border-radius: 10px;
              color: #fff !important; font-size: 16px !important; padding: 0 14px !important;
              box-sizing: border-box; outline: none !important; transition: border-color 0.2s, box-shadow 0.2s;
            }
            .sp-signup-phone .auth-input-styled:focus {
              border-color: rgba(0, 212, 255, 0.85) !important; box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
            }
            .sp-signup-phone .auth-input-styled::placeholder { color: rgba(255, 255, 255, 0.3); }
            .sp-signup-phone select.auth-input-styled { appearance: auto !important; cursor: pointer; }
            .sp-signup-phone.dynamic-auth-form input[type="checkbox"] { opacity: 1; }
            .sp-signup-phone input[type="checkbox"]:focus-visible { outline: 2px solid #00c6ff; outline-offset: 2px; }
            .sp-signup-phone .auth-label-hint { font-size: 12px !important; }
            .sp-signup-phone .auth-field-row select.auth-input-styled { min-width: 0; padding: 0 8px !important; }
            .sp-signup-phone .auth-input-styled.auth-country-choice { font-size: 15px !important; padding: 0 6px !important; white-space: nowrap; }
            .sp-signup-phone .auth-input-styled.auth-country-choice.is-active { border-color: #38bdf8 !important; background: rgba(56, 189, 248, 0.16) !important; color: #38bdf8 !important; box-shadow: 0 0 0 1px #38bdf8 inset; }
            .sp-signup-phone button.sp-google-cta { min-height: 48px !important; }
            .sp-signup-phone button.sp-google-cta:focus-visible,
            .sp-signup-phone button.sp-touch-link:focus-visible { outline: 2px solid #38bdf8; outline-offset: 2px; }
            .sp-signup-phone button.sp-touch-link { min-height: 44px !important; }
            @media (prefers-reduced-motion: reduce) {
              .sp-signup-phone * { transition: none !important; animation: none !important; }
            }
          ` }} />

          {/* Art header: the top 34% of the painted card (logo, Create Account,
              the Google and Facebook buttons) at full width. Hotspots are
              measured against that cropped region: the painted Google button
              sits at rows 113-126 of a 166px header on a 390px phone (68-76%),
              Facebook at 86-89%; each hotspot is 24px tall, centred on its
              button, and they do not overlap. */}
          <div style={phoneStyles.art}>
            <button
              type="button"
              onClick={() => router.push('/')}
              title="Back"
              aria-label="Back"
              style={{ ...phoneStyles.hotspot, top: '0%', left: '0%', width: '17%', height: '22%' }}
            />
            <button
              type="button"
              onClick={() => handleOAuthSignIn('google')}
              disabled={!!oauthLoading}
              title="Continue With Google"
              aria-label="Continue With Google"
              style={{ ...phoneStyles.hotspot, top: '62.5%', left: '27%', width: '46%', height: '14.5%', cursor: oauthLoading ? 'wait' : 'pointer' }}
            />
            <button
              type="button"
              onClick={() => handleOAuthSignIn('facebook')}
              disabled={!!oauthLoading}
              title="Continue With Facebook"
              aria-label="Continue With Facebook"
              style={{ ...phoneStyles.hotspot, top: '77%', left: '27%', width: '46%', height: '14.5%', cursor: oauthLoading ? 'wait' : 'pointer' }}
            />
            <div style={phoneStyles.artFade} />
          </div>

          <form onSubmit={handleSignUp} style={phoneStyles.panel}>
            {/* #SMARTERDESIGN Trust Strip & Primary 1-Tap Google CTA */}
            <div style={phoneStyles.quickStartCard}>
              {typeof router?.query?.unlock === 'string' && router.query.unlock.trim() && (
                <div
                  data-testid="signup-unlock-context"
                  style={{
                    marginBottom: 8,
                    padding: '6px 10px',
                    border: '1px solid #3a7fbd',
                    background: 'linear-gradient(180deg, #12406f 0%, #082341 100%)',
                    color: '#86daff',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    textAlign: 'center',
                  }}
                >
                  {formatUnlockPromise(router.query.unlock)}
                </div>
              )}
              <div style={phoneStyles.trustStrip}>
                100% Free Account • 107 GTO Training Games • 715+ Live Poker Rooms
              </div>
              <div style={phoneStyles.quickStartLabel}>
                Fastest Way: 1-Tap Sign Up With Google
              </div>
              <button
                type="button"
                className="sp-google-cta"
                onClick={() => handleOAuthSignIn('google')}
                disabled={!!oauthLoading}
                style={{
                  ...phoneStyles.googlePrimaryCta,
                  opacity: oauthLoading ? 0.7 : 1,
                  cursor: oauthLoading ? 'wait' : 'pointer',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path
                    fill="#ffffff"
                    d="M21.8 12.23c0-.7-.06-1.38-.18-2.03H12v3.84h5.5a4.7 4.7 0 0 1-2.04 3.09v2.56h3.3c1.93-1.78 3.04-4.4 3.04-7.46Z"
                  />
                  <path
                    fill="#e2e8f0"
                    d="M12 22c2.76 0 5.07-.91 6.76-2.47l-3.3-2.56c-.91.61-2.08.98-3.46.98-2.66 0-4.91-1.8-5.71-4.21H2.88v2.64A10.22 10.22 0 0 0 12 22Z"
                  />
                  <path
                    fill="#cbd5e1"
                    d="M6.29 13.74A6.13 6.13 0 0 1 5.97 12c0-.6.11-1.19.32-1.74V7.62H2.88A10.22 10.22 0 0 0 1.8 12c0 1.65.4 3.21 1.08 4.38l3.41-2.64Z"
                  />
                  <path
                    fill="#ffffff"
                    d="M12 6.05c1.5 0 2.85.52 3.91 1.53l2.93-2.93C17.06 2.99 14.76 2 12 2a10.22 10.22 0 0 0-9.12 5.62l3.41 2.64c.8-2.41 3.05-4.21 5.71-4.21Z"
                  />
                </svg>
                <span>{oauthLoading === 'google' ? 'Connecting To Google...' : 'Continue With Google'}</span>
              </button>
              <button
                type="button"
                className="sp-facebook-cta"
                onClick={() => handleOAuthSignIn('facebook')}
                disabled={!!oauthLoading}
                data-testid="signup-mobile-facebook-cta"
                style={{
                  ...phoneStyles.googlePrimaryCta,
                  marginTop: 8,
                  background: 'linear-gradient(180deg, #172b42 0%, #0b1827 100%)',
                  border: '1px solid #3f5d7b',
                  color: '#f2f7ff',
                  opacity: oauthLoading ? 0.7 : 1,
                  cursor: oauthLoading ? 'wait' : 'pointer',
                }}
              >
                <span>{oauthLoading === 'facebook' ? 'Connecting To Facebook...' : 'Continue With Facebook'}</span>
              </button>
              <div style={phoneStyles.orDivider}>
                <span style={phoneStyles.orLine} />
                <span style={phoneStyles.orText}>Or Create Account With Email</span>
                <span style={phoneStyles.orLine} />
              </div>
            </div>

            {signupFields}

            <label style={phoneStyles.termsRow}>
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                required
                style={phoneStyles.checkbox}
              />
              <span style={phoneStyles.termsText}>
                I Confirm That I Am <strong>18 Years Of Age Or Older</strong> And Agree To The Platform's Terms.
              </span>
            </label>

            {/* The error sits directly above the button the player just
                tapped; at the top of a ten-field form it was off-screen. */}
            {error && (
              <div role="alert" style={phoneStyles.error}>
                {error}
                {errorDetail && <div style={phoneStyles.errorDetail}>{errorDetail}</div>}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || aliasAvailable === false || !ageConfirmed}
              style={{
                ...phoneStyles.submit,
                opacity: loading || aliasAvailable === false || !ageConfirmed ? 0.5 : 1,
              }}
            >
              {loading ? 'Creating Your Account...' : 'Create Account'}
            </button>

            <div style={phoneStyles.ssl}>256-Bit SSL Encrypted</div>
            <div style={phoneStyles.legal}>
              By Signing Up, You Agree To Our{' '}
              <button type="button" className="sp-touch-link" onClick={() => setLegalModal('terms')} style={phoneStyles.legalLink}>Terms Of Service</button>
              {' '}And{' '}
              <button type="button" className="sp-touch-link" onClick={() => setLegalModal('privacy')} style={phoneStyles.legalLink}>Privacy Policy</button>
            </div>
            <div style={phoneStyles.signin}>
              Already Have An Account?{' '}
              <button type="button" className="sp-touch-link" onClick={() => router.push(authSwitchHref('/auth/login', router.query))} style={phoneStyles.signinLink}>Sign In</button>
            </div>
          </form>
        </div>

        {/* ─── Legal Modal ─────────────────────────────────────────────── */}
        {legalModal && (
          <div
            onClick={() => setLegalModal(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(6px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, #0d1117 0%, #0b1929 100%)',
                border: '1px solid rgba(0, 212, 255, 0.3)',
                borderRadius: '16px',
                boxShadow: '0 0 40px rgba(0, 212, 255, 0.15), inset 0 0 40px rgba(0,0,0,0.4)',
                width: '100%',
                maxWidth: '580px',
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Modal Header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid rgba(0, 212, 255, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setLegalModal('terms')}
                    style={{
                      background: legalModal === 'terms' ? 'rgba(0,212,255,0.15)' : 'transparent',
                      border: `1px solid ${legalModal === 'terms' ? 'rgba(0,212,255,0.6)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: '8px',
                      color: legalModal === 'terms' ? '#00d4ff' : 'rgba(255,255,255,0.5)',
                      fontSize: '13px',
                      fontWeight: '600',
                      padding: '6px 14px',
                      cursor: 'pointer',
                    }}
                  >Terms Of Service</button>
                  <button
                    type="button"
                    onClick={() => setLegalModal('privacy')}
                    style={{
                      background: legalModal === 'privacy' ? 'rgba(0,212,255,0.15)' : 'transparent',
                      border: `1px solid ${legalModal === 'privacy' ? 'rgba(0,212,255,0.6)' : 'rgba(255,255,255,0.15)'}`,
                      borderRadius: '8px',
                      color: legalModal === 'privacy' ? '#00d4ff' : 'rgba(255,255,255,0.5)',
                      fontSize: '13px',
                      fontWeight: '600',
                      padding: '6px 14px',
                      cursor: 'pointer',
                    }}
                  >Privacy Policy</button>
                </div>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setLegalModal(null)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(148,184,224,0.28)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '18px',
                    width: '44px',
                    height: '44px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >✕</button>
              </div>

              {/* Modal Body */}
              <div style={{
                padding: '24px',
                overflowY: 'auto',
                color: 'rgba(255,255,255,0.8)',
                fontSize: '13px',
                lineHeight: '1.8',
              }}>
                {legalModal === 'terms' ? (
                  <>
                    <h2 style={{ color: '#00d4ff', marginTop: 0, fontSize: '18px' }}>Terms Of Service</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '20px' }}>Last Updated: November 16, 2026</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>1. Acceptance Of Terms</h3>
                    <p>By Creating An Account On Smarter.Poker, You Agree To Be Bound By These Terms Of Service. If You Do Not Agree, Please Do Not Use Our Platform.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>2. Eligibility</h3>
                    <p>You Must Be At Least 18 Years Of Age To Use Smarter.Poker. By Registering, You Confirm That You Meet This Requirement And That The Information You Provide Is Accurate And Truthful.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>3. Platform Use</h3>
                    <p>Smarter.Poker Is A Poker Training And Education Platform. You Agree To Use The Platform Solely For Lawful Purposes And In Accordance With These Terms. You May Not Use The Platform To Engage In Any Activity That Violates Applicable Law.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>4. Diamonds &amp; Virtual Currency</h3>
                    <p>Diamonds Are A Virtual Currency Used Within Smarter.Poker. They Hold No Monetary Value And Cannot Be Exchanged For Real Money. Prize Redemptions Are Subject To Eligibility Requirements And Applicable State Regulations.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>Club Promo Chips</h3>
                    <p>{promoPlayThroughTerms}</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>5. Restricted States</h3>
                    <p>Prize Redemptions May Be Restricted In Certain States Including Washington, Idaho, Michigan, Nevada, And California Per Applicable Regulations. Training Features Remain Fully Available In All States.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>6. Account Security</h3>
                    <p>You Are Responsible For Maintaining The Confidentiality Of Your Account Credentials. Notify Us Immediately At Support@Smarter.Poker If You Suspect Unauthorized Access To Your Account.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>7. Termination</h3>
                    <p>We Reserve The Right To Suspend Or Terminate Accounts That Violate These Terms Of Service At Our Sole Discretion.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>8. Contact</h3>
                    <p>For Questions About These Terms, Contact Us At <span style={{ color: '#00d4ff' }}>Support@Smarter.Poker</span>.</p>
                  </>
                ) : (
                  <>
                    <h2 style={{ color: '#00d4ff', marginTop: 0, fontSize: '18px' }}>Privacy Policy</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '20px' }}>Last Updated: January 1, 2026</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>1. Information We Collect</h3>
                    <p>We Collect Information You Provide During Registration (Name, Email, Date Of Birth, Phone Number, Location) And Usage Data Generated While Using The Platform (Game Sessions, Training Progress, Analytics).</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>2. How We Use Your Information</h3>
                    <p>We Use Your Information To Operate The Platform, Personalize Your Training Experience, Send Important Account Notifications, And Improve Our Services. We Do Not Sell Your Personal Data To Third Parties.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>3. Phone Number</h3>
                    <p>Your Phone Number Is Collected For Account Verification Purposes Only. We Use A Secure SMS Verification System And Do Not Share Your Number With Third Parties For Marketing.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>4. Cookies &amp; Analytics</h3>
                    <p>We Use Cookies And Analytics Tools (Including PostHog) To Understand How Users Interact With The Platform. This Data Is Used Only For Product Improvement And Is Anonymized Where Possible.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>5. Data Security</h3>
                    <p>All Data Is Encrypted In Transit Using 256-Bit SSL. Passwords Are Never Stored In Plain Text. We Use Supabase For Secure, Industry-Standard Data Storage.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>6. Your Rights</h3>
                    <p>You Have The Right To Access, Correct, Or Delete Your Personal Data At Any Time. To Exercise These Rights, Contact Us At <span style={{ color: '#00d4ff' }}>Support@Smarter.Poker</span>.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>7. Contact</h3>
                    <p>For Privacy-Related Questions, Contact Us At <span style={{ color: '#00d4ff' }}>Privacy@Smarter.Poker</span>.</p>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid rgba(0, 212, 255, 0.15)',
                flexShrink: 0,
                textAlign: 'center',
              }}>
                <button
                  type="button"
                  onClick={() => setLegalModal(null)}
                  style={{
                    background: 'linear-gradient(135deg, #1565c0, #0288d1)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '600',
                    padding: '10px 32px',
                    cursor: 'pointer',
                    boxShadow: '0 0 12px rgba(0,212,255,0.3)',
                  }}
                >Got It</button>
              </div>
            </div>
          </div>
        )}
        </>
      ) : (
        <>
          <style>{`
            .signup-verification-page * { box-sizing: border-box; min-width: 0; }
            .signup-verification-page input:focus-visible { outline: 2px solid #8bd7ff; outline-offset: 3px; }
            .signup-verification-page button:focus-visible { outline: 2px solid #c3edff; outline-offset: 3px; }
          `}</style>
          <div className="signup-verification-page" style={styles.container}>
            {/* ═══════════════════════════════════════════════════════════════
                        EMAIL PENDING — ENTER VERIFICATION CODE
                        ═══════════════════════════════════════════════════════════════ */}
            {step === 'email_pending' && (
              <div style={styles.successContainer}>
                <div style={styles.verificationIcon} aria-hidden="true"><Mail size={36} strokeWidth={1.5} /></div>

                <h2 style={styles.successTitle}>Verify Your Email</h2>

                <p style={styles.emailPendingText}>Enter The Six-Digit Verification Code Sent To:</p>
                <p style={styles.emailHighlight}>{formData.email}</p>
                <p style={styles.emailHint}>If You Do Not See The Code In Your Inbox, Check Your Spam Or Junk Folder.</p>

                {/* THE OTP STEP HAD NO ERROR SURFACE AT ALL (fixed 2026-08-25).
                    handleVerifyCode runs only here and sets errors for an
                    incomplete code and for a rejected one, but the page's only
                    `{error && ...}` render lives inside the `info` branch —
                    so a wrong verification code produced NOTHING: the button
                    stopped spinning and that was the entire feedback. */}
                {error && (
                  <div style={styles.errorBox} role="alert">
                    {error}
                    {errorDetail && (
                      <div style={{ marginTop: 6, fontSize: '12px', opacity: 0.85 }}>
                        {errorDetail}
                      </div>
                    )}
                  </div>
                )}

                <p style={styles.emailHint}>Already Have An Account?{' '}<button type="button" onClick={signInToExistingAccount} style={styles.resendLink}>Sign In</button></p>
                <p id="signup-code-help" style={styles.emailHint}>Use Every Digit In Your Latest Email. You Can Paste The Full Code.</p>
                <form onSubmit={handleVerifyCode} style={styles.otpForm}>
                  <div style={styles.inputGroup}>
                    <label htmlFor="signup-email-code" style={styles.label}>Email Verification Code</label>
                    <input
                      id="signup-email-code"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]{6}"
                      aria-describedby="signup-code-help"
                      value={verificationCode}
                      onChange={(e) =>
                        setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="Enter Code"
                      style={{
                        ...styles.inputSingle,
                        textAlign: 'center',
                        width: '100%',
                        minWidth: 0,
                        boxSizing: 'border-box',
                        fontSize: 'clamp(20px, 5vw, 28px)',
                        fontFamily: 'Inter, sans-serif',
                        fontVariantNumeric: 'tabular-nums',
                        letterSpacing: verificationCode ? '0.18em' : '0.02em',
                        background: 'linear-gradient(180deg, #02060b, #111f2c)',
                        border: '1px solid #4b6c88',
                        borderRadius: 12,
                        boxShadow: 'inset 0 3px 8px #000, 0 1px 0 #657c90',
                      }}
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                    />
                  </div>

                  <button
                    type="submit"
                    style={{
                      ...styles.submitButton,
                      opacity: verifying || !isEmailVerificationCode(verificationCode) ? 0.7 : 1,
                    }}
                    disabled={verifying || !isEmailVerificationCode(verificationCode)}
                  >
                    {verifying ? 'Verifying...' : 'Verify Email'}
                  </button>
                </form>

                <div style={styles.profileSummary}>
                  <div style={styles.profileRow}>
                    <span style={styles.profileLabel}>Alias Reserved</span>
                    <span style={styles.profileValue}>{formData.pokerAlias}</span>
                  </div>
                  <div style={styles.profileRow}>
                    <span style={styles.profileLabel}>Location</span>
                    <span style={styles.profileValue}>
                      {formData.city}, {formData.outsideUs ? formData.country : formData.state}
                    </span>
                  </div>
                </div>

                {resendNote && (
                  <p style={styles.emailHint} role="status">
                    {resendNote}
                  </p>
                )}
                <p style={styles.emailHint}>
                  Didn't Receive It? Check Your Spam Folder, Or{' '}
                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={resending || resendIn > 0}
                    style={{
                      ...styles.resendLink,
                      opacity: resending || resendIn > 0 ? 0.6 : 1,
                    }}
                  >
                    {resending
                      ? 'Sending...'
                      : resendIn > 0
                        ? `Resend Code In ${resendIn}s`
                        : 'Resend Code'}
                  </button>
                  {' '}Or{' '}
                  <button type="button" onClick={() => setStep('info')} style={styles.resendLink}>
                    Change Email
                  </button>
                </p>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                        SUCCESS — ACCOUNT CREATED
                        ═══════════════════════════════════════════════════════════════ */}
            {step === 'success' && (
              <SignupWelcome
                playerNumber={assignedPlayerNumber}
                alias={formData.pokerAlias}
                city={formData.city}
                state={formData.outsideUs ? formData.country : formData.state}
                onContinue={() => window.location.assign(signupClubPath || getSafeRedirect() || '/hub/club-arena')}
                onVerifyPhone={async () => {
                  const rawBtnRedirect = Array.isArray(router.query?.redirect)
                    ? router.query.redirect[0]
                    : router.query?.redirect || (Array.isArray(router.query?.next) ? router.query.next[0] : router.query?.next);
                  const rawBtnPt = Array.isArray(router.query?.pt) ? router.query.pt[0] : router.query?.pt;
                  const btnPt =
                    (typeof cleanPromoTokenShape === 'function' ? cleanPromoTokenShape(rawBtnPt) : null) ||
                    (typeof readPendingPromoSignupToken === 'function' ? readPendingPromoSignupToken() : null);
                  const clubNext = signupClubPath || await resolveSignupClubPath(
                    { access_token: getAccessToken() },
                    rawBtnRedirect
                  );
                  const next = clubNext || getSafeRedirect();
                  router.push(`/hub/verify-phone?welcome=1&next=${encodeURIComponent(next || CLUB_LOBBY_PATH)}${btnPt ? `&pt=${encodeURIComponent(btnPt)}` : ''}`);
                }}
              />
            )}

            {step !== 'success' && step !== 'email_pending' && (
              <>
                <div style={styles.divider}>
                  <span>Or</span>
                </div>

                <button onClick={() => router.push(authSwitchHref('/auth/login', router.query))} style={styles.signupLink}>
                  Already Have An Account? <span style={styles.accentText}>Sign In</span>
                </button>
              </>
            )}
          </div>

        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧠 BRAIN ICON
// ─────────────────────────────────────────────────────────────────────────────
function BrainIcon({ size = 24 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '8px',
        background: 'linear-gradient(135deg, #0a1628, #1a2a4a)',
        border: '2px solid #00D4FF',
        boxShadow: `0 0 ${size / 2}px rgba(0, 212, 255, 0.6)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.6}
        height={size * 0.6}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#00D4FF"
        strokeWidth="2"
      >
        <path d="M12 2a4 4 0 014 4c0 1.5-.8 2.8-2 3.5V12h2a4 4 0 110 8h-8a4 4 0 110-8h2V9.5A4 4 0 018 6a4 4 0 014-4z" />
      </svg>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎨 STYLES — SMARTERPOKER DARK THEME
// ─────────────────────────────────────────────────────────────────────────────
const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(ellipse at 50% 0%, #17324b 0%, #03080e 55%, #010306 100%)',
    width: '100%',
    boxSizing: 'border-box',
    minWidth: 0,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
    padding: 'max(32px, env(safe-area-inset-top)) 16px max(96px, env(safe-area-inset-bottom))',
  },
  bgGrid: {
    display: 'none',
  },
  bgGlow: {
    display: 'none',
  },
  backButton: {
    position: 'fixed',
    top: '24px',
    left: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#3A3B3C',
    border: '1px solid #3E4042',
    borderRadius: '8px',
    color: '#E4E6EB',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    zIndex: 10,
  },
  authCard: {
    width: '100%',
    maxWidth: '480px',
    padding: '32px',
    background: '#242526',
    borderRadius: '8px',
    border: '3px solid #555',
    position: 'relative',
    zIndex: 5,
    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
  },
  logoSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '24px',
  },
  logoImage: {
    width: '100%',
    maxWidth: '340px',
    height: 'auto',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  title: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '24px',
    fontWeight: 700,
    marginTop: '8px',
    marginBottom: '4px',
    color: '#E4E6EB',
  },
  subtitle: {
    fontSize: '14px',
    color: '#B0B3B8',
    textAlign: 'center',
  },
  errorBox: {
    padding: '12px 16px',
    background: 'rgba(240, 40, 73, 0.15)',
    border: '1px solid rgba(240, 40, 73, 0.3)',
    borderRadius: '8px',
    color: '#F02849',
    fontSize: '13px',
    marginBottom: '20px',
    textAlign: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  otpForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '100%',
    marginTop: '12px',
    marginBottom: '20px',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  rowGroup: {
    display: 'flex',
    gap: '12px',
  },
  label: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: 500,
    color: '#B0B3B8',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  labelHint: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '11px',
    fontWeight: 400,
    color: '#1877F2',
    textTransform: 'none',
    letterSpacing: 0,
  },
  inputSingle: {
    padding: '12px 14px',
    background: '#3A3B3C',
    border: '1px solid #3E4042',
    borderRadius: '6px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '15px',
    color: '#E4E6EB',
    outline: 'none',
    transition: 'border-color 0.2s ease',
  },
  selectInput: {
    padding: '12px 14px',
    background: '#3A3B3C',
    border: '1px solid #3E4042',
    borderRadius: '6px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '15px',
    color: '#E4E6EB',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%23B0B3B8' viewBox='0 0 16 16'%3E%3Cpath d='M8 11L3 6h10l-5 5z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
  },
  aliasInputWrapper: {
    position: 'relative',
  },
  aliasStatus: {
    position: 'absolute',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#B0B3B8',
  },
  fieldError: {
    fontSize: '11px',
    color: '#F02849',
  },
  passwordWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  eyeButton: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#B0B3B8',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.2s ease',
  },
  forgotPasswordLink: {
    background: 'none',
    border: 'none',
    color: '#1877F2',
    fontSize: '13px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    cursor: 'pointer',
    marginTop: '8px',
    textAlign: 'right',
    alignSelf: 'flex-end',
    transition: 'color 0.2s ease',
  },
  phoneInput: {
    display: 'flex',
    alignItems: 'center',
    background: '#3A3B3C',
    border: '1px solid #3E4042',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  phonePrefix: {
    padding: '12px 14px',
    background: 'rgba(255, 255, 255, 0.05)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    fontWeight: 600,
    color: '#E4E6EB',
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '15px',
    color: '#E4E6EB',
  },
  submitButton: {
    padding: '14px',
    background: 'linear-gradient(180deg, #38a4ff, #1465ce)',
    border: '1px solid #70c8ff',
    boxShadow: 'inset 0 1px 0 #c1e9ff, inset 0 -3px 0 #084288, 0 8px 20px #000',
    borderRadius: '12px',
    color: '#FFFFFF',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s ease',
    marginTop: '8px',
  },
  terms: {
    fontSize: '11px',
    color: '#B0B3B8',
    textAlign: 'center',
    marginTop: '8px',
  },
  termsLink: {
    color: '#1877F2',
    textDecoration: 'underline',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '24px 0',
    color: '#B0B3B8',
    fontSize: '12px',
  },
  signupLink: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px solid #3E4042',
    borderRadius: '6px',
    color: '#B0B3B8',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    cursor: 'pointer',
    transition: 'background 0.2s ease',
  },
  accentText: {
    color: '#1877F2',
    fontWeight: 600,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SUCCESS SCREEN STYLES
  // ─────────────────────────────────────────────────────────────────────────
  successContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '16px',
    width: '100%',
    maxWidth: 460,
    minWidth: 0,
    boxSizing: 'border-box',
    padding: '28px clamp(18px, 5vw, 30px)',
    borderRadius: 22,
    border: '1px solid #586f83',
    background: 'linear-gradient(145deg, #283b4c 0%, #0c1620 19%, #04090f 72%, #152536 100%)',
    boxShadow: 'inset 0 1px 0 #93aabb, inset 0 -2px 0 #020508, 0 24px 64px #000',
  },
  verificationIcon: {
    width: 76, height: 76, display: 'grid', placeItems: 'center',
    borderRadius: 20, color: '#bceaff', border: '1px solid #6c95b3',
    background: 'linear-gradient(145deg, #49677d, #112433 55%, #06101a)',
    boxShadow: 'inset 0 1px 0 #c8e6f7, inset 0 -2px 0 #02070c, 0 12px 24px #000',
  },
  successIcon: {
    fontSize: '64px',
    animation: 'bounce 1s ease-in-out',
  },
  successTitle: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '24px',
    fontWeight: 700,
    color: '#E4E6EB',
    textAlign: 'center',
    marginBottom: '8px',
  },
  playerNumberCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '24px 40px',
    background: 'rgba(24, 119, 242, 0.1)',
    border: '2px solid #1877F2',
    borderRadius: '8px',
  },
  playerNumberLabel: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '11px',
    fontWeight: 600,
    color: '#B0B3B8',
    textTransform: 'uppercase',
    letterSpacing: '2px',
  },
  playerNumber: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '48px',
    fontWeight: 900,
    color: '#1877F2',
  },
  playerNumberInfo: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '11px',
    color: '#B0B3B8',
    textAlign: 'center',
    maxWidth: '200px',
  },
  profileSummary: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    background: 'linear-gradient(180deg, #182937, #0a121c)',
    borderRadius: '12px',
    border: '1px solid #3f586d',
    boxShadow: 'inset 0 1px 0 #4b6376',
  },
  profileRow: {
    gap: 12,
    flexWrap: 'wrap',
    overflowWrap: 'anywhere',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  profileLabel: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '12px',
    color: '#B0B3B8',
  },
  profileValue: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: 600,
    color: '#E4E6EB',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // RESTRICTED STATE NOTICE STYLES
  // ─────────────────────────────────────────────────────────────────────────
  restrictedNotice: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    background: 'rgba(56, 189, 248, 0.1)',
    border: '1px solid rgba(148, 184, 224, 0.32)',
    borderRadius: '8px',
    marginTop: '8px',
  },
  restrictedIcon: {
    fontSize: '20px',
  },
  restrictedTitle: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    fontWeight: 600,
    color: '#38bdf8',
    marginBottom: '4px',
  },
  restrictedText: {
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#B0B3B8',
    margin: 0,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // 18+ AGE VERIFICATION STYLES
  // ─────────────────────────────────────────────────────────────────────────
  ageCheckbox: {
    marginTop: '8px',
  },
  ageLabel: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginTop: '2px',
    accentColor: '#1877F2',
  },
  ageLabelText: {
    fontSize: '12px',
    lineHeight: 1.5,
    color: '#B0B3B8',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // EMAIL PENDING STYLES
  // ─────────────────────────────────────────────────────────────────────────
  emailPendingText: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '14px',
    color: '#B0B3B8',
    textAlign: 'center',
    marginBottom: '8px',
  },
  emailHighlight: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '16px',
    fontWeight: 600,
    textAlign: 'center',
    marginBottom: '4px',
    maxWidth: '100%',
    overflowWrap: 'anywhere',
    color: '#8bd7ff',
  },
  emailInstructions: {
    padding: '16px',
    background: 'rgba(24, 119, 242, 0.1)',
    border: '1px solid rgba(24, 119, 242, 0.3)',
    borderRadius: '8px',
    marginBottom: '20px',
    textAlign: 'center',
    fontSize: '13px',
    color: '#E4E6EB',
  },
  emailHint: {
    marginTop: '16px',
    fontSize: '12px',
    color: '#B0B3B8',
    textAlign: 'center',
  },
  resendLink: {
    background: 'none',
    border: 'none',
    color: '#1877F2',
    fontSize: '12px',
    cursor: 'pointer',
    textDecoration: 'underline',
    padding: 0,
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SOCIAL SIGN-IN STYLES
  // ─────────────────────────────────────────────────────────────────────────
  socialButtons: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  socialButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    padding: '12px',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s ease',
    border: 'none',
  },
  googleButton: {
    background: '#ffffff',
    color: '#333333',
  },
  facebookButton: {
    background: '#1877F2',
    color: '#ffffff',
  },
  socialDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    margin: '8px 0',
  },
  socialDividerLine: {
    flex: 1,
    height: '1px',
    background: '#3E4042',
  },
  socialDividerText: {
    color: '#B0B3B8',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    whiteSpace: 'nowrap',
  },
  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY TRUST BADGE
  // ─────────────────────────────────────────────────────────────────────────
  securityBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '12px',
    color: '#B0B3B8',
    fontSize: '11px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontWeight: 500,
    letterSpacing: '0.5px',
  },
};

// ── PHONE LAYOUT STYLES (<600px) ──────────────────────────────────────────
const phoneStyles = {
  page: {
    minHeight: '100dvh',
    background: '#060d1a',
    color: '#ffffff',
    fontFamily: "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  art: {
    position: 'relative',
    width: '100%',
    // The art is 819x1024; the header shows its top 34% (through the
    // "Or Sign Up With Email" divider): 0.34 * 1024/819 = 42.5% of the width.
    paddingTop: '42.5%',
    backgroundImage: "url('/images/dynamic-signup-bg.webp')",
    backgroundSize: '100% auto',
    backgroundPosition: 'top center',
    backgroundRepeat: 'no-repeat',
    backgroundColor: '#060d1a',
    overflow: 'hidden',
  },
  artFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '12%',
    background: 'linear-gradient(180deg, rgba(6, 13, 26, 0) 0%, #060d1a 100%)',
    pointerEvents: 'none',
  },
  hotspot: {
    position: 'absolute',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    zIndex: 10,
    minHeight: 0,
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '4px 16px 32px',
    maxWidth: '520px',
    margin: '0 auto',
  },
  quickStartCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px',
    background: '#081121',
    border: '1px solid rgba(148, 184, 224, 0.28)',
    borderRadius: '12px',
    boxSizing: 'border-box',
  },
  trustStrip: {
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.4,
    color: '#cbd5e1',
    textAlign: 'center',
    padding: '6px 8px',
    background: 'rgba(6, 13, 26, 0.75)',
    border: '1px solid rgba(148, 184, 224, 0.22)',
    borderRadius: '8px',
  },
  quickStartLabel: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#38bdf8',
    textAlign: 'center',
    letterSpacing: '0.2px',
  },
  googlePrimaryCta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    width: '100%',
    height: '48px',
    padding: '0 16px',
    background: 'linear-gradient(180deg, #1d4ed8 0%, #0284c7 100%)',
    border: '1px solid rgba(148, 184, 224, 0.45)',
    borderRadius: '10px',
    color: '#ffffff',
    fontSize: '15px',
    fontWeight: 700,
    boxSizing: 'border-box',
    boxShadow: '0 4px 16px rgba(2, 132, 199, 0.28)',
  },
  orDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginTop: '2px',
  },
  orLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(148, 184, 224, 0.24)',
  },
  orText: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#94a3b8',
    whiteSpace: 'nowrap',
  },
  error: {
    padding: '10px 12px',
    background: 'rgba(240, 40, 73, 0.9)',
    color: '#fff',
    textAlign: 'center',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 700,
  },
  errorDetail: { marginTop: 4, fontSize: '11px', fontWeight: 'normal', opacity: 0.85, wordBreak: 'break-word' },
  termsRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    marginTop: '4px',
    cursor: 'pointer',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    opacity: 1,
    margin: '1px 0 0',
    accentColor: '#0072ff',
    flexShrink: 0,
  },
  termsText: { fontSize: '13px', lineHeight: 1.4, color: 'rgba(230, 241, 255, 0.85)' },
  submit: {
    width: '100%',
    // height, not min-height: the card's "min-height: 0 !important" opt-out
    // applies to every button under .dynamic-auth-form.
    height: '50px',
    border: 'none',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: '0 0 24px rgba(0, 198, 255, 0.3)',
    marginTop: '4px',
  },
  ssl: { textAlign: 'center', fontSize: '12px', color: 'rgba(230, 241, 255, 0.55)' },
  legal: { textAlign: 'center', fontSize: '12px', color: 'rgba(230, 241, 255, 0.5)', lineHeight: 1.6 },
  legalLink: {
    background: 'none',
    border: 'none',
    padding: '10px 4px',
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    color: '#38bdf8',
    fontSize: '12px',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  signin: { textAlign: 'center', fontSize: '14px', color: '#cbd5e1', marginTop: '6px' },
  signinLink: {
    background: 'none',
    border: 'none',
    padding: '10px 8px',
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '44px',
    color: '#38bdf8',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
