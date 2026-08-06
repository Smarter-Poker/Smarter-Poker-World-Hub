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
    phone: '',
    promoCode: '',
  });

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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

  // SMS Phone Verification State
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneSendingOtp, setPhoneSendingOtp] = useState(false);
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtp, setPhoneOtp] = useState('');
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [phoneOtpCooldown, setPhoneOtpCooldown] = useState(0);
  const [showPhoneModal, setShowPhoneModal] = useState(false);

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

  // Format phone number
  const formatPhone = (value) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SMS PHONE VERIFICATION FUNCTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const sendPhoneOtp = async () => {
    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setPhoneError('Please enter a valid 10-digit phone number');
      return;
    }

    setPhoneSendingOtp(true);
    setPhoneError('');

    try {
      const res = await fetch('/api/sms/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send code');
      }

      setPhoneOtpSent(true);
      setShowPhoneModal(true); // Show verification modal
      // Start 60-second cooldown
      setPhoneOtpCooldown(60);
      const interval = setInterval(() => {
        setPhoneOtpCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setPhoneError(err.message);
    } finally {
      setPhoneSendingOtp(false);
    }
  };

  const verifyPhoneOtp = async () => {
    if (phoneOtp.length !== 4) {
      setPhoneError('Please Enter The 4-Digit Code');
      return;
    }

    setPhoneVerifying(true);
    setPhoneError('');

    try {
      const cleanPhone = formData.phone.replace(/\D/g, '');
      const res = await fetch('/api/sms/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, code: phoneOtp }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      setPhoneVerified(true);
      setShowPhoneModal(false); // Close modal on success
      setPhoneError('');
    } catch (err) {
      setPhoneError(err.message);
    } finally {
      setPhoneVerifying(false);
    }
  };

  // Reset phone verification if phone number changes
  useEffect(() => {
    if (phoneVerified || phoneOtpSent) {
      setPhoneVerified(false);
      setPhoneOtpSent(false);
      setPhoneOtp('');
      setPhoneError('');
    }
  }, [formData.phone]);

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
    setError('');
    setOauthLoading(provider);
    try {
      const host = (typeof window !== 'undefined' && window.location.hostname) || '';
      if (host.startsWith('www.')) {
        const apex = host.replace(/^www\./, '');
        window.location.replace(
          `https://${apex}/auth/signup?provider=${encodeURIComponent(provider)}`
        );
        return;
      }
    } catch (_originErr) {
      /* SSR — skip */
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
        },
      });
      if (error) throw error;
    } catch (err) {
      console.warn(`${provider} sign in error:`, err);
      setError(err.message || `Failed to sign in with ${provider}`);
      setOauthLoading('');
    }
  };

  // [2026-05-03] Resume OAuth after the www→apex bounce above.
  useEffect(() => {
    if (!router.isReady) return;
    const provider = router.query.provider;
    if (
      typeof provider === 'string' &&
      ['google', 'apple', 'discord', 'facebook'].includes(provider)
    ) {
      const cleanQuery = { ...router.query };
      delete cleanQuery.provider;
      router.replace({ pathname: router.pathname, query: cleanQuery }, undefined, {
        shallow: true,
      });
      handleOAuthSignIn(provider);
    }
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

    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      setError('Please Enter A Valid 10-Digit Phone Number');
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
            // [Phase 6.1.27] The SMS gate above is what stops one handset
            // opening unlimited accounts, and nothing was persisting it.
            // `phone_verified` appeared once in this file — as a PostHog
            // property, not a database write — so profiles.phone_verified
            // was never set by signup. The duplicate-phone guard in
            // pages/api/sms/verify-otp.js only matches rows where it is
            // true, which made that guard a no-op on the signup path.
            // Every free diamond is real money; N throwaway accounts is the
            // cheapest attack on the economy. ensure-profile.js copies both
            // of these onto the profile row it creates.
            phone: cleanPhone.length === 10 ? `+1${cleanPhone}` : null,
            phone_verified: !!phoneVerified,
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
            phone_verified: !!phoneVerified,
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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <SEOHead
        title="Create Account — Smarter.Poker"
        description="Join Smarter.Poker — The Future Of Poker. Free Account With Training, Trivia, Live Games, And More."
        canonical="/auth/signup"
      />

      {step === 'info' ? (
        <>
        <div
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
              backgroundImage: `url('/images/dynamic-signup-bg.jpg')`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              boxShadow: '0 0 50px rgba(0, 212, 255, 0.2)',
            }}
          >
            <style>{`
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
            `}</style>
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
                >
                  {error}
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
                <style>{`
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
                    font-size: 14px !important;
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
                `}</style>

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
                    type="text"
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
                  <label className="auth-label">Date of Birth <span style={{ color: "#00d4ff", fontSize: "9px", textTransform: "none" }}>(Must Be 18+)</span></label>
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

                {/* Phone Number */}
                <div className="auth-field-group">
                  <label className="auth-label">Phone Number</label>
                  <div className="auth-field-row" style={{ alignItems: "center" }}>
                    <span style={{ color: "#fff", fontSize: "14px", padding: "0 12px", background: "rgba(255,255,255,0.1)", height: "36px", display: "flex", alignItems: "center", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.1)" }}>+1</span>
                    <input
                      type="tel"
                      className="auth-input-styled"
                      placeholder=""
                      value={formatPhone(formData.phone)}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      required
                      disabled={phoneVerified}
                      maxLength={14}
                      style={{ color: phoneVerified ? "#31A24C" : "#fff" }}
                    />
                    {!phoneVerified && (
                      <button
                        type="button"
                        onClick={sendPhoneOtp}
                        disabled={
                          phoneSendingOtp ||
                          phoneOtpCooldown > 0 ||
                          formData.phone.replace(/\D/g, "").length !== 10
                        }
                        style={{
                          height: "36px",
                          padding: "0 12px",
                          background: "rgba(0, 110, 255, 0.8)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "4px",
                          cursor: (phoneSendingOtp || phoneOtpCooldown > 0 || formData.phone.replace(/\D/g, "").length !== 10) ? "not-allowed" : "pointer",
                          opacity: (phoneSendingOtp || phoneOtpCooldown > 0 || formData.phone.replace(/\D/g, "").length !== 10) ? 0.5 : 1,
                          fontWeight: "bold",
                          flexShrink: 0,
                          fontSize: "11px",
                          textTransform: "uppercase",
                          transition: "opacity 0.2s"
                        }}
                      >
                        {phoneSendingOtp ? "Sending..." : phoneOtpCooldown > 0 ? `Wait ${phoneOtpCooldown}s` : "Send Code"}
                      </button>
                    )}
                  </div>
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
                </div>
              </div>
              
{/* Checkbox 18+ */}
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                required
                style={{
                  position: 'absolute',
                  top: '80.5%',
                  left: '31%',
                  width: '2%',
                  height: '2%',
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
                    top: '80.5%',
                    left: '31%',
                    width: '2%',
                    height: '2%',
                    pointerEvents: 'none',
                    zIndex: 11,
                  }}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#00D4FF"
                  strokeWidth="3"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              )}

              {/* Create Account Button */}
              <button
                type="submit"
                disabled={loading || aliasAvailable === false || !ageConfirmed || !phoneVerified}
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
                    loading || aliasAvailable === false || !ageConfirmed || !phoneVerified
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
                    <p>By creating an account on Smarter.Poker, you agree to be bound by these Terms of Service. If you do not agree, please do not use our platform.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>2. Eligibility</h3>
                    <p>You must be at least 18 years of age to use Smarter.Poker. By registering, you confirm that you meet this requirement and that the information you provide is accurate and truthful.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>3. Platform Use</h3>
                    <p>Smarter.Poker is a poker training and education platform. You agree to use the platform solely for lawful purposes and in accordance with these Terms. You may not use the platform to engage in any activity that violates applicable law.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>4. Diamonds &amp; Virtual Currency</h3>
                    <p>Diamonds are a virtual currency used within Smarter.Poker. They hold no monetary value and cannot be exchanged for real money. Prize redemptions are subject to eligibility requirements and applicable state regulations.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>5. Restricted States</h3>
                    <p>Prize redemptions may be restricted in certain states including Washington, Idaho, Michigan, Nevada, and California per applicable regulations. Training features remain fully available in all states.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>6. Account Security</h3>
                    <p>You are responsible for maintaining the confidentiality of your account credentials. Notify us immediately at support@smarter.poker if you suspect unauthorized access to your account.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>7. Termination</h3>
                    <p>We reserve the right to suspend or terminate accounts that violate these Terms of Service at our sole discretion.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>8. Contact</h3>
                    <p>For questions about these Terms, contact us at <span style={{ color: '#00d4ff' }}>support@smarter.poker</span>.</p>
                  </>
                ) : (
                  <>
                    <h2 style={{ color: '#00d4ff', marginTop: 0, fontSize: '18px' }}>Privacy Policy</h2>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px', marginBottom: '20px' }}>Last Updated: January 1, 2026</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>1. Information We Collect</h3>
                    <p>We collect information you provide during registration (name, email, date of birth, phone number, location) and usage data generated while using the platform (game sessions, training progress, analytics).</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>2. How We Use Your Information</h3>
                    <p>We use your information to operate the platform, personalize your training experience, send important account notifications, and improve our services. We do not sell your personal data to third parties.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>3. Phone Number</h3>
                    <p>Your phone number is collected for account verification purposes only. We use a secure SMS verification system and do not share your number with third parties for marketing.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>4. Cookies &amp; Analytics</h3>
                    <p>We use cookies and analytics tools (including PostHog) to understand how users interact with the platform. This data is used only for product improvement and is anonymized where possible.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>5. Data Security</h3>
                    <p>All data is encrypted in transit using 256-bit SSL. Passwords are never stored in plain text. We use Supabase for secure, industry-standard data storage.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>6. Your Rights</h3>
                    <p>You have the right to access, correct, or delete your personal data at any time. To exercise these rights, contact us at <span style={{ color: '#00d4ff' }}>support@smarter.poker</span>.</p>

                    <h3 style={{ color: '#fff', fontSize: '14px' }}>7. Contact</h3>
                    <p>For privacy-related questions, contact us at <span style={{ color: '#00d4ff' }}>privacy@smarter.poker</span>.</p>
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

                <p style={styles.emailPendingText}>We've sent a 6-digit verification code to:</p>
                <p style={styles.emailHighlight}>{formData.email}</p>

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
                  <span style={styles.playerNumber}>#{assignedPlayerNumber || '—'}</span>
                  <span style={styles.playerNumberInfo}>
                    Your Universal ID Across PokerIQ, Diamond Arena & Club Arena
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
                    <span style={styles.profileLabel}>Starting Diamonds</span>
                    <span style={styles.profileValue}>💎 500</span>
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
                    router.push('/hub');
                  }}
                  style={styles.submitButton}
                >
                  Enter The Hub →
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

          {/* ═══════════════════════════════════════════════════════════════
                    PHONE VERIFICATION MODAL - iOS SMS AUTOFILL SUPPORT
                    ═══════════════════════════════════════════════════════════════ */}
          {showPhoneModal && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 9999,
                padding: '20px',
              }}
            >
              <div
                style={{
                  background: '#242526',
                  border: '3px solid #555',
                  borderRadius: '8px',
                  padding: '32px 24px',
                  maxWidth: '360px',
                  width: '100%',
                  textAlign: 'center',
                  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.4)',
                }}
              >
                {/* Title */}
                <h2
                  style={{
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    fontSize: '22px',
                    fontWeight: '700',
                    color: '#E4E6EB',
                    margin: '0 0 8px 0',
                  }}
                >
                  Verify Phone
                </h2>

                <p
                  style={{
                    fontSize: '14px',
                    color: '#B0B3B8',
                    margin: '0 0 24px 0',
                  }}
                >
                  Enter The 4-Digit Code Sent To
                  <br />
                  <span style={{ color: '#1877F2', fontWeight: '600' }}>
                    +1 {formatPhone(formData.phone)}
                  </span>
                </p>

                {/* OTP Input - with iOS SMS autofill support */}
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={phoneOtp}
                  onChange={(e) => setPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="• • • •"
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '16px',
                    fontSize: '28px',
                    fontWeight: '700',
                    letterSpacing: '8px',
                    textAlign: 'center',
                    background: '#3A3B3C',
                    border: phoneOtp.length === 4 ? '2px solid #31A24C' : '1px solid #3E4042',
                    borderRadius: '6px',
                    color: '#E4E6EB',
                    outline: 'none',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                  maxLength={4}
                />

                {/* Error message */}
                {phoneError && (
                  <p
                    style={{
                      color: '#F02849',
                      fontSize: '13px',
                      marginTop: '12px',
                      marginBottom: '0',
                    }}
                  >
                    {phoneError}
                  </p>
                )}

                {/* Verify Button */}
                <button
                  type="button"
                  onClick={verifyPhoneOtp}
                  disabled={phoneVerifying || phoneOtp.length !== 4}
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    padding: '14px',
                    background: phoneOtp.length === 4 ? '#1877F2' : 'rgba(100, 100, 100, 0.5)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontWeight: '600',
                    fontSize: '15px',
                    cursor: phoneOtp.length === 4 ? 'pointer' : 'not-allowed',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {phoneVerifying ? 'Verifying...' : 'Verify Code'}
                </button>

                {/* Resend code link */}
                <button
                  type="button"
                  onClick={() => {
                    if (phoneOtpCooldown === 0) {
                      sendPhoneOtp();
                    }
                  }}
                  disabled={phoneOtpCooldown > 0}
                  style={{
                    marginTop: '16px',
                    background: 'none',
                    border: 'none',
                    color: phoneOtpCooldown > 0 ? '#B0B3B8' : '#1877F2',
                    fontSize: '13px',
                    cursor: phoneOtpCooldown > 0 ? 'not-allowed' : 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  {phoneOtpCooldown > 0
                    ? `Resend Code In ${phoneOtpCooldown}s`
                    : "Didn't Get The Code? Resend"}
                </button>

                {/* Cancel button */}
                <button
                  type="button"
                  onClick={() => {
                    setShowPhoneModal(false);
                    setPhoneOtp('');
                    setPhoneError('');
                  }}
                  style={{
                    marginTop: '8px',
                    background: 'none',
                    border: 'none',
                    color: '#B0B3B8',
                    fontSize: '13px',
                    cursor: 'pointer',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
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
