/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — SIGN UP REGISTRATION NODE
   Email/Password Registration with Supabase OTP Email Verification
   Cyan/Electric Blue Aesthetic | Deep Navy Background
   Last Deploy: 2026-01-12 01:18:00 - OTP Code Input Active
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { supabase } from '../../src/lib/supabase';
import { capture, identify, FunnelEvents } from '../../src/lib/analytics';
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

export default function SignUpPage() {
  const router = useRouter();

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
    pokerAlias: '',
    promoCode: '',
  });

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

  // Auto-fill promo/referral code from ?ref= or ?promo= query parameter
  useEffect(() => {
    if (router.isReady) {
      const { ref, promo } = router.query;
      if (ref && !formData.promoCode) {
        setFormData((prev) => ({ ...prev, promoCode: String(ref).toUpperCase() }));
      } else if (promo && !formData.promoCode) {
        setFormData((prev) => ({ ...prev, promoCode: String(promo).toUpperCase() }));
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
      setAliasError('Alias must be 20 characters or less');
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
            setAliasError('This alias is already taken');
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
            setAliasError('This alias is already taken');
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

    if (!formData.promoCode || formData.promoCode.length < 3) {
      setIsReferralCode(false);
      return;
    }

    // Determine if this looks like a referral code (all digits) or promo code
    const isNumeric = /^\d+$/.test(formData.promoCode);
    setIsReferralCode(isNumeric);

    const timeout = setTimeout(async () => {
      setPromoChecking(true);
      setPromoError('');
      try {
        if (isNumeric) {
          // Validate as referral code (player number)
          const res = await fetch('/api/promo/validate-referral-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: formData.promoCode }),
          });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const data = await res.json();
          if (res.ok && data.valid) {
            setReferralValid(true);
            setReferralDetails(data);
            setPromoValid(true); // Shared valid state for border color
            setPromoError('');
          } else {
            setReferralValid(false);
            setPromoValid(false);
            setPromoError(data.error || 'Invalid referral code');
          }
        } else {
          // Validate as promo code
          const res = await fetch('/api/promo/validate-promo-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: formData.promoCode }),
          });
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const data = await res.json();
          if (res.ok && data.valid) {
            setPromoValid(true);
            setPromoDetails(data);
            setPromoError('');
          } else {
            setPromoValid(false);
            setPromoDetails(null);
            setPromoError(data.error || 'Invalid promo code');
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
          // Supabase's Facebook default is `email` alone - no name, no avatar,
          // which is why an OAuth signup's username fell through to Player<N>.
          // public_profile needs no App Review; email does.
          scopes: provider === 'facebook' ? 'email,public_profile' : undefined,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.warn(`${provider} sign in error:`, err);
      // PARITY WITH login.js (2026-08-25). This page had no server-side error
      // reporting, so a provider failure was invisible. This closes the
      // exact bug the callback fix was written to close.
      reportAuthError('signup_oauth_init', err);
      setError(err.message || `Failed to sign in with ${provider}`);
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
      setError(pwCheck.reason || 'Password does not meet our security requirements.');
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
      // Step 1: Create auth user with email/password
      // [2026-08-04] Normalize the email the same way login.js does —
      // "Dan@X.com " and "dan@x.com" must be the same account.
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        options: {
          data: {
            full_name: cleanFullName,
            first_name: cleanFirstName,
            last_name: cleanLastName,
            poker_alias: formData.pokerAlias,
            city: formData.city,
            state: formData.state,
            birth_year: parseInt(formData.birthYear),
            birthday: `${formData.birthYear}-${formData.birthMonth}-${formData.birthDay}`,
            // Phone is verified AFTER first login on /hub/verify-phone
            // (2026-10-07); ensure-profile reads phone_verified from the
            // server-side receipt, never from this client metadata.
            phone: null,
            phone_verified: false,
          },
          // Enable email confirmation - redirect to /auth/callback after verification
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (signUpError) throw signUpError;

      console.log('Auth user created:', authData);

      // ── Save pending promo/referral for after email verification ──
      if (formData.promoCode && promoValid && !isReferralCode) {
        localStorage.setItem('smarter-poker-pending-promo', formData.promoCode);
      }
      if (isReferralCode && referralValid && referralDetails) {
        localStorage.setItem('smarter-poker-pending-referral', JSON.stringify(referralDetails));
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
            state: formData.state,
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
        // Email already confirmed or auto-confirmed - show success
        setStep('success');
      }
    } catch (err) {
      console.warn('Signup error:', err);
      // ── [Phase 6.1.19] Account enumeration defense ──────────────────
      // If Supabase returned "User already registered" (or any variant
      // that would leak whether the email maps to a real account), we
      // normalise the UX to look identical to a successful signup that
      // requires email confirmation. The legitimate owner of that
      // address will get a confirmation/password-reset email from
      // Supabase anyway (or can use the magic-link path on /auth/login);
      // an attacker gets the same UI either way, with no enumeration
      // signal. All other errors (validation, rate limit, network)
      // continue to display a generic failure.
      const msg = (err?.message || '').toLowerCase();
      const looksLikeEnumeration =
        msg.includes('already registered') ||
        msg.includes('user already') ||
        msg.includes('email already') ||
        msg.includes('duplicate key') ||
        msg.includes('identity already exists');
      if (looksLikeEnumeration) {
        setStep('email_pending');
      } else {
        // Parity with login.js (2026-08-25): this page had no server-side
        // capture at all, so a signup that failed for a real reason showed the
        // user a generic sentence and left no record anywhere. The enumeration
        // branch above is deliberately NOT reported - it is a normal outcome
        // dressed up as one, and logging it would recreate the very signal the
        // branch exists to suppress.
        reportAuthError('signup_form_submit', err);
        setError('Failed to create account. Please check your details and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFY: Submit email OTP verification code
  // ─────────────────────────────────────────────────────────────────────────
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');

    // [2026-07-25] Supabase email OTP tokens are 6 digits. This screen
    // previously said "4-Digit" with maxLength=4, which made it
    // IMPOSSIBLE to type a valid code — the only working path was the
    // email link. (The SMS phone OTP really is 4 digits — different flow.)
    if (verificationCode.length < 6) {
      setError('Please Enter The 6-Digit Verification Code');
      return;
    }

    setVerifying(true);

    try {
      // Verify the OTP code with Supabase
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: formData.email,
        token: verificationCode,
        type: 'signup',
      });

      if (verifyError) throw verifyError;

      console.log('Email verified:', data);

      // Try to get player number if available
      if (data.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('player_number')
            .eq('id', data.user.id)
            .maybeSingle();

          if (profile?.player_number) {
            setAssignedPlayerNumber(profile.player_number);
          }
        } catch (err) {
          console.log('Could not fetch player number:', err);
        }
      }

      // Email verified successfully - show success
      setStep('success');
    } catch (err) {
      console.warn('Verification error:', err);
      setError(err.message || 'Invalid verification code. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  // The form fields, rendered once for the desktop art card and once for the
  // phone layout (CSS decides which tree is visible; both share this state).
  const signupFields = (
    <>
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
                  <label className="auth-label">Date Of Birth <span style={{ color: "#00d4ff", fontSize: "9px", textTransform: "none" }}>(Must Be 18+)</span></label>
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

                {/* City & State */}
                <div className="auth-field-row">
                  <div className="auth-field-group" style={{ flex: 2 }}>
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
                  <div className="auth-field-group" style={{ flex: 1 }}>
                    <label className="auth-label">State</label>
                    <select
                      className="auth-input-styled"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      required
                    >
                      <option value="" disabled>Select</option>
                      {usStates.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Poker Alias */}
                <div className="auth-field-group">
                  <label className="auth-label">Poker Alias <span style={{ color: "#00d4ff", fontSize: "9px", textTransform: "none" }}>(You Can Change This Later)</span></label>
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

                {/* Promo Code */}
                <div className="auth-field-group">
                  <label className="auth-label">Promo Or Referral Code <span style={{ color: "#00d4ff", fontSize: "9px", textTransform: "none" }}>(Optional)</span></label>
                  <input
                    type="text"
                    className="auth-input-styled"
                    placeholder="ENTER CODE"
                    value={formData.promoCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        promoCode: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                      })
                    }
                    maxLength={20}
                    style={{ textTransform: "uppercase" }}
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
                    <div style={{ marginTop: '6px', color: '#9aa5b6', fontSize: '11px' }}>
                      Checking Code...
                    </div>
                  )}
                  {!promoChecking && promoError && (
                    <div
                      role="alert"
                      style={{ marginTop: '6px', color: '#ff6b6b', fontSize: '11px' }}
                    >
                      {promoError}
                    </div>
                  )}
                  {!promoChecking && promoValid && (
                    <div style={{ marginTop: '6px', color: '#31A24C', fontSize: '11px' }}>
                      {isReferralCode
                        ? `Referral Code Accepted${referralDetails?.username ? ` - ${referralDetails.username}` : ''}`
                        : `Promo Code Accepted${promoDetails?.description ? ` - ${promoDetails.description}` : ''}`}
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
      <SEOHead
        title="Create Account - Smarter.Poker"
        description="Create A Free Smarter.Poker Account: GTO Training, Private Poker Clubs In Poker Arena, Live Poker Room Waitlists, Home Games, Trivia And A Bankroll Manager. Free To Play, No Real-Money Gambling."
        canonical="/auth/signup"
      />

      {step === 'info' ? (
        <>
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
                onClick={() => router.push('/auth/login')}
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
            .sp-signup-phone input[type="checkbox"] { opacity: 1; }
          ` }} />

          {/* Art header: the top 34% of the painted card (logo, Create Account,
              the Google and Facebook buttons) at full width. Hotspots are
              measured against that cropped region. */}
          <div style={phoneStyles.art} aria-hidden="false">
            <button
              type="button"
              onClick={() => router.push('/')}
              title="Back"
              aria-label="Back"
              style={{ ...phoneStyles.hotspot, top: '9%', left: '3%', width: '11%', height: '10%' }}
            />
            <button
              type="button"
              onClick={() => handleOAuthSignIn('google')}
              disabled={!!oauthLoading}
              title="Continue With Google"
              aria-label="Continue With Google"
              style={{ ...phoneStyles.hotspot, top: '66%', left: '29%', width: '42%', height: '10.5%', cursor: oauthLoading ? 'wait' : 'pointer' }}
            />
            <button
              type="button"
              onClick={() => handleOAuthSignIn('facebook')}
              disabled={!!oauthLoading}
              title="Continue With Facebook"
              aria-label="Continue With Facebook"
              style={{ ...phoneStyles.hotspot, top: '79%', left: '29%', width: '42%', height: '10.5%', cursor: oauthLoading ? 'wait' : 'pointer' }}
            />
            <div style={phoneStyles.artFade} />
          </div>

          <form onSubmit={handleSignUp} style={phoneStyles.panel} noValidate={false}>
            {error && (
              <div role="alert" style={phoneStyles.error}>
                {error}
                {errorDetail && <div style={phoneStyles.errorDetail}>{errorDetail}</div>}
              </div>
            )}

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
              <button type="button" onClick={() => setLegalModal('terms')} style={phoneStyles.legalLink}>Terms Of Service</button>
              {' '}And{' '}
              <button type="button" onClick={() => setLegalModal('privacy')} style={phoneStyles.legalLink}>Privacy Policy</button>
            </div>
            <div style={phoneStyles.signin}>
              Already Have An Account?{' '}
              <button type="button" onClick={() => router.push('/auth/login')} style={phoneStyles.signinLink}>Sign In</button>
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
                  onClick={() => setLegalModal(null)}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '18px',
                    width: '32px',
                    height: '32px',
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
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '20px' }}>Last Updated: January 1, 2026</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>1. Acceptance Of Terms</h3>
                    <p>By Creating An Account On Smarter.Poker, You Agree To Be Bound By These Terms Of Service. If You Do Not Agree, Please Do Not Use Our Platform.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>2. Eligibility</h3>
                    <p>You Must Be At Least 18 Years Of Age To Use Smarter.Poker. By Registering, You Confirm That You Meet This Requirement And That The Information You Provide Is Accurate And Truthful.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>3. Platform Use</h3>
                    <p>Smarter.Poker Is A Poker Training And Education Platform. You Agree To Use The Platform Solely For Lawful Purposes And In Accordance With These Terms. You May Not Use The Platform To Engage In Any Activity That Violates Applicable Law.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>4. Diamonds &amp; Virtual Currency</h3>
                    <p>Diamonds Are A Virtual Currency Used Within Smarter.Poker. They Hold No Monetary Value And Cannot Be Exchanged For Real Money. Prize Redemptions Are Subject To Eligibility Requirements And Applicable State Regulations.</p>

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
          <div style={styles.container}>
            {/* ═══════════════════════════════════════════════════════════════
                        EMAIL PENDING — ENTER VERIFICATION CODE
                        ═══════════════════════════════════════════════════════════════ */}
            {step === 'email_pending' && (
              <div style={styles.successContainer}>
                <div style={styles.successIcon}>📧</div>

                <h2 style={styles.successTitle}>Verify Your Email</h2>

                <p style={styles.emailPendingText}>We've Sent A 6-Digit Verification Code To:</p>
                <p style={styles.emailHighlight}>{formData.email}</p>

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

                <form onSubmit={handleVerifyCode} style={styles.otpForm}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Enter Verification Code</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={verificationCode}
                      onChange={(e) =>
                        setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      placeholder="• • • • • •"
                      style={{
                        ...styles.inputSingle,
                        textAlign: 'center',
                        fontSize: '28px',
                        fontFamily: 'Orbitron, monospace',
                        letterSpacing: '12px',
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
                      opacity: verifying || verificationCode.length < 6 ? 0.7 : 1,
                    }}
                    disabled={verifying || verificationCode.length < 6}
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
                      {formData.city}, {formData.state}
                    </span>
                  </div>
                </div>

                <p style={styles.emailHint}>
                  Didn't Receive It? Check Your Spam Folder Or{' '}
                  <button onClick={() => setStep('info')} style={styles.resendLink}>
                    Try Again
                  </button>
                </p>
              </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════
                        SUCCESS — ACCOUNT CREATED
                        ═══════════════════════════════════════════════════════════════ */}
            {step === 'success' && (
              <div style={styles.successContainer}>
                <div style={styles.successIcon}>🎉</div>

                <h2 style={styles.successTitle}>Welcome To Smarter.Poker!</h2>

                <div style={styles.playerNumberCard}>
                  <span style={styles.playerNumberLabel}>Your Player Number</span>
                  <span style={styles.playerNumber}>#{assignedPlayerNumber || '-'}</span>
                  <span style={styles.playerNumberInfo}>
                    Your Universal ID Across PokerIQ, Training & Club Arena
                  </span>
                </div>

                <div style={styles.profileSummary}>
                  <div style={styles.profileRow}>
                    <span style={styles.profileLabel}>Alias</span>
                    <span style={styles.profileValue}>{formData.pokerAlias}</span>
                  </div>
                  <div style={styles.profileRow}>
                    <span style={styles.profileLabel}>Location</span>
                    <span style={styles.profileValue}>
                      {formData.city}, {formData.state}
                    </span>
                  </div>
                  <div style={styles.profileRow}>
                    <span style={styles.profileLabel}>Welcome Package</span>
                    <span style={styles.profileValue}>VIP Card + 💎 500 (Verify Phone)</span>
                  </div>
                  <div style={styles.profileRow}>
                    <span style={styles.profileLabel}>Skill Tier</span>
                    <span style={styles.profileValue}>Newcomer</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    // Set flag so hub plays intro animation
                    sessionStorage.setItem('just_authenticated', 'true');
                    // A brand-new player's first screen is the welcome package:
                    // verify a phone for the VIP card + 500 diamonds, or skip.
                    router.push('/hub/verify-phone?welcome=1');
                  }}
                  style={styles.submitButton}
                >
                  Claim Welcome Package →
                </button>
              </div>
            )}

            {step !== 'success' && step !== 'email_pending' && (
              <>
                <div style={styles.divider}>
                  <span>Or</span>
                </div>

                <button onClick={() => router.push('/auth/login')} style={styles.signupLink}>
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
    background: '#18191A',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    position: 'relative',
    padding: '40px 20px',
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
    background: '#1877F2',
    border: 'none',
    borderRadius: '6px',
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
    gap: '20px',
    padding: '20px 0',
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
    background: '#3A3B3C',
    borderRadius: '8px',
    border: '1px solid #3E4042',
  },
  profileRow: {
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
    background: 'rgba(255, 200, 0, 0.1)',
    border: '1px solid rgba(255, 200, 0, 0.3)',
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
    color: '#ffc800',
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
    color: '#1877F2',
    textAlign: 'center',
    marginBottom: '20px',
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
    background: '#070a12',
    color: '#e6f1ff',
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
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  artFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '18%',
    background: 'linear-gradient(180deg, rgba(7, 10, 18, 0) 0%, #070a12 100%)',
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
  legal: { textAlign: 'center', fontSize: '11px', color: 'rgba(230, 241, 255, 0.5)', lineHeight: 1.6 },
  legalLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    minHeight: 0,
    color: '#00c6ff',
    fontSize: '11px',
    textDecoration: 'underline',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  signin: { textAlign: 'center', fontSize: '14px', color: 'rgba(230, 241, 255, 0.7)', marginTop: '6px' },
  signinLink: {
    background: 'none',
    border: 'none',
    padding: 0,
    minHeight: 0,
    color: '#00c6ff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
