/**
 * SOCIAL PROFILE COMPLETION GATE
 * ═══════════════════════════════════════════════════════════════════════════
 * 3-step modal shown the first time a user (typically a Google OAuth signup)
 * enters /hub/social-media. Required fields:
 *
 *   1. Full Name      — confirm or edit (pre-filled from Google given+family).
 *   2. @Username      — live availability check + 3 collision-aware suggestions.
 *   3. Phone Number   — required contact info (US country code default).
 *
 * Trigger: profile.social_profile_completed === false.
 * Cannot be dismissed without completing all three. (No close X, no overlay
 * dismiss.) The user can still navigate elsewhere via the bottom nav, but the
 * modal will reappear next time they enter Social Media.
 *
 * Style: matches the Diamond Wallet dark/blue glass aesthetic.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import { busEmit } from '../../engine/EventBus';

const ANIM = `
@keyframes spcgFadeIn  { from { opacity:0; transform:translateY(12px) scale(0.98); } to { opacity:1; transform:translateY(0) scale(1); } }
@keyframes spcgSpin    { to { transform: rotate(360deg); } }
@keyframes spcgPulse   { 0%,100% { box-shadow: 0 0 0 0 rgba(0,180,255,0.0); } 50% { box-shadow: 0 0 18px 2px rgba(0,180,255,0.25); } }
.spcg-input:focus      { outline: none; border-color: #00d4ff !important; box-shadow: 0 0 0 3px rgba(0,212,255,0.18) !important; }
.spcg-btn-primary:not(:disabled):hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,150,255,0.35); }
.spcg-btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }
.spcg-suggestion:hover { background: rgba(0,212,255,0.18) !important; border-color: rgba(0,212,255,0.5) !important; }
`;

const COUNTRIES = [
    { code: '+1',  flag: '🇺🇸', label: 'US/CA' },
    { code: '+44', flag: '🇬🇧', label: 'UK' },
    { code: '+61', flag: '🇦🇺', label: 'AU' },
    { code: '+91', flag: '🇮🇳', label: 'IN' },
    { code: '+52', flag: '🇲🇽', label: 'MX' },
    { code: '+55', flag: '🇧🇷', label: 'BR' },
    { code: '+49', flag: '🇩🇪', label: 'DE' },
    { code: '+33', flag: '🇫🇷', label: 'FR' },
    { code: '+81', flag: '🇯🇵', label: 'JP' },
    { code: '+86', flag: '🇨🇳', label: 'CN' },
];

const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.]{2,19}$/;

// Format phone digits as xxx-xxx-xxxx for +1 (Dan's preferred display format),
// otherwise leave digits with spaces every 3 chars.
function formatPhone(digits, countryCode) {
    const d = (digits || '').replace(/\D/g, '');
    if (countryCode === '+1') {
        if (d.length <= 3) return d;
        if (d.length <= 6) return `${d.slice(0, 3)}-${d.slice(3)}`;
        return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6, 10)}`;
    }
    return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
}

export default function SocialProfileCompletionGate({ profile, onComplete }) {
    // ── Step state ──
    const [step, setStep] = useState(1);
    const [fullName, setFullName] = useState('');
    const [username, setUsername] = useState('');
    const [country, setCountry] = useState('+1');
    const [phoneDigits, setPhoneDigits] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    // ── Username availability state ──
    const [availability, setAvailability] = useState(null); // null | { available, message?, suggestions[] }
    const [checking, setChecking] = useState(false);
    const checkTimerRef = useRef(null);
    const lastCheckedRef = useRef('');
    const fetchIdRef = useRef(0);  // monotonic id — out-of-order fetches discard themselves

    // ── Initialize from profile (Google metadata flowed through ensure-profile) ──
    useEffect(() => {
        if (!profile) return;
        const initialName =
            profile.full_name ||
            [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
            profile.display_name ||
            '';
        setFullName(initialName);
        // Strip @, lowercase, drop disallowed chars, cap at 20
        const cleanedAlias = (profile.username || initialName.replace(/\s+/g, '') || '')
            .replace(/^@+/, '')
            .replace(/[^a-zA-Z0-9_.]/g, '')
            .slice(0, 20);
        setUsername(cleanedAlias);
        // Pre-fill phone if we somehow already have it. Stored format may be
        // "+1 5551234567" (this gate's format), "+15551234567" (E.164), or any
        // user-typed string from profile-edit. Without country-code stripping
        // the modal would render a stored "+15551234567" as "155-123-4567" —
        // an invalid area code starting with 1.
        const rawDigits = (profile.phone || '').replace(/\D/g, '');
        if (rawDigits.length === 11 && rawDigits.startsWith('1')) {
            setCountry('+1');
            setPhoneDigits(rawDigits.slice(1));
        } else if (rawDigits) {
            setPhoneDigits(rawDigits);
        }
    }, [profile]);

    // ── Username availability checker (used by the debounce effect AND by
    //    the submit handler when the server reports username_taken/reserved
    //    so the modal can show fresh suggestion chips immediately).
    const runUsernameCheck = useCallback(async (rawValue) => {
        const u = (rawValue || '').trim();
        if (!u || !USERNAME_RE.test(u)) {
            setAvailability(u && u.length > 0 ? {
                available: false,
                message: 'Use 3–20 chars: letters, numbers, _ or .',
                suggestions: [],
            } : null);
            setChecking(false);
            return null;
        }
        const myId = ++fetchIdRef.current;
        setChecking(true);
        try {
            const token = await getAccessToken();
            const resp = await fetch('/api/profile/check-username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ username: u }),
            });
            const data = await resp.json();
            if (myId !== fetchIdRef.current) return null;
            lastCheckedRef.current = u;
            setAvailability(data);
            return data;
        } catch (_e) {
            if (myId !== fetchIdRef.current) return null;
            const fallback = { available: false, message: 'Could not verify — try again.', suggestions: [] };
            setAvailability(fallback);
            return fallback;
        } finally {
            if (myId === fetchIdRef.current) setChecking(false);
        }
    }, []);

    // ── Debounced username availability check ──
    useEffect(() => {
        if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
        const u = username.trim();
        if (!u || !USERNAME_RE.test(u)) {
            setAvailability(u && u.length > 0 ? {
                available: false,
                message: 'Use 3–20 chars: letters, numbers, _ or .',
                suggestions: [],
            } : null);
            setChecking(false);
            return;
        }
        // If the user typed back to the value we just verified, keep the
        // existing availability state and skip the round-trip.
        if (u === lastCheckedRef.current) return;

        // Clear stale availability so the helper text doesn't lie during the
        // 350ms debounce window (e.g. showing "@bar is available" using the
        // previous result for "foo").
        setAvailability(null);
        setChecking(true);
        checkTimerRef.current = setTimeout(() => { runUsernameCheck(u); }, 350);

        return () => {
            if (checkTimerRef.current) clearTimeout(checkTimerRef.current);
        };
    }, [username, runUsernameCheck]);

    // ── Step validation ──
    const nameValid     = fullName.trim().length >= 2 && fullName.trim().length <= 80 && /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(fullName);
    const usernameValid = USERNAME_RE.test(username.trim()) && availability?.available === true;
    const phoneValid    = phoneDigits.replace(/\D/g, '').length >= 7;

    const handleSubmit = useCallback(async () => {
        if (!nameValid || !usernameValid || !phoneValid) return;
        setSubmitting(true);
        setSubmitError('');
        try {
            const token = await getAccessToken();
            const resp = await fetch('/api/profile/complete-social', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    full_name: fullName.trim(),
                    username:  username.trim(),
                    phone:     `${country} ${phoneDigits.replace(/\D/g, '')}`.trim(),
                }),
            });
            const data = await resp.json();
            if (!resp.ok || !data?.success) {
                // Any username-related error returns user to the username step
                if (data?.error === 'username_taken' || data?.error === 'username_reserved' || data?.error === 'invalid_username') {
                    setSubmitError(data.message || 'Pick a different username.');
                    setStep(2);
                    // Force fresh availability check so suggestion chips appear
                    lastCheckedRef.current = '';
                    runUsernameCheck(username);
                } else if (data?.error === 'invalid_name') {
                    setSubmitError(data.message || 'Please enter a valid name.');
                    setStep(1);
                } else if (data?.error === 'invalid_phone') {
                    setSubmitError(data.message || 'Please enter a valid phone number.');
                    // Already on step 3
                } else {
                    setSubmitError(data?.message || 'Could not save your profile. Try again.');
                }
                return;
            }
            // Success — fire onComplete with the new profile, then notify the
            // event bus so any other open tab/page (profile-edit header, hub
            // shell, etc.) refreshes its cached profile data immediately.
            onComplete?.(data.profile);
            try { busEmit.dataMutated('profile'); } catch (_e) { /* bus is best-effort */ }
            // ── ANTIGRAVITY FIX: Fire window event so UniversalHeader cache updates ──
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('profile-updated'));
            }
        } catch (err) {
            console.warn('[social-gate] submit error:', err);
            setSubmitError('Network error — please try again.');
        } finally {
            setSubmitting(false);
        }
    }, [fullName, username, country, phoneDigits, nameValid, usernameValid, phoneValid, onComplete, runUsernameCheck]);

    return (
        <>
            <style>{ANIM}</style>
            <div style={s.overlay} role="dialog" aria-modal="true" aria-labelledby="spcg-title">
                <div style={s.modal}>
                    <div style={s.header}>
                        <div style={s.iconWrap}>💎</div>
                        <h2 id="spcg-title" style={s.title}>Finish your profile</h2>
                        <p style={s.subtitle}>One quick step before you jump into Social — so other players can find you.</p>
                    </div>

                    {/* Step indicator */}
                    <div style={s.stepRow}>
                        {[1, 2, 3].map((n) => (
                            <div key={n} style={{
                                ...s.stepDot,
                                background: step >= n ? 'linear-gradient(135deg, #00d4ff, #0099ff)' : 'rgba(255,255,255,0.1)',
                                color:      step >= n ? '#001428' : 'rgba(255,255,255,0.5)',
                            }}>{n}</div>
                        ))}
                    </div>

                    {/* ── Step 1: Name ── */}
                    {step === 1 && (
                        <div style={s.stepBlock}>
                            <label style={s.label} htmlFor="spcg-name">Full name</label>
                            <input
                                id="spcg-name"
                                className="spcg-input"
                                style={s.input}
                                type="text"
                                autoComplete="name"
                                placeholder="e.g. Daniel Bekavac"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                maxLength={80}
                                autoFocus
                            />
                            <div style={s.helper}>
                                {nameValid
                                    ? <span style={{ color: '#4ade80' }}>✓ Looks good</span>
                                    : <span style={{ color: 'rgba(255,255,255,0.5)' }}>2–80 characters, real name preferred.</span>}
                            </div>
                            <div style={s.actionsRow}>
                                <span />
                                <button
                                    className="spcg-btn-primary"
                                    style={s.btnPrimary}
                                    disabled={!nameValid}
                                    onClick={() => setStep(2)}
                                >Continue →</button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 2: Username ── */}
                    {step === 2 && (
                        <div style={s.stepBlock}>
                            <label style={s.label} htmlFor="spcg-username">Choose your @username</label>
                            <div style={s.inputGroup}>
                                <span style={s.inputPrefix}>@</span>
                                <input
                                    id="spcg-username"
                                    className="spcg-input"
                                    style={{ ...s.input, paddingLeft: 32 }}
                                    type="text"
                                    autoComplete="off"
                                    spellCheck={false}
                                    placeholder="yourname"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 20))}
                                    maxLength={20}
                                    autoFocus
                                />
                                {checking && <span style={s.spinner} />}
                            </div>
                            <div style={s.helper}>
                                {!username && <span style={{ color: 'rgba(255,255,255,0.5)' }}>3–20 chars: letters, numbers, _ or .</span>}
                                {username && availability?.available === true && <span style={{ color: '#4ade80' }}>✓ @{username} is available</span>}
                                {username && availability?.available === false && (
                                    <span style={{ color: '#f87171' }}>{availability.message || `@${username} is taken`}</span>
                                )}
                            </div>
                            {availability?.suggestions?.length > 0 && (
                                <div style={s.suggestionsRow}>
                                    <span style={s.suggestLabel}>Try:</span>
                                    {availability.suggestions.map((sg) => (
                                        <button
                                            key={sg}
                                            type="button"
                                            className="spcg-suggestion"
                                            style={s.suggestionChip}
                                            onClick={() => setUsername(sg)}
                                        >@{sg}</button>
                                    ))}
                                </div>
                            )}
                            <div style={s.actionsRow}>
                                <button style={s.btnSecondary} onClick={() => setStep(1)}>← Back</button>
                                <button
                                    className="spcg-btn-primary"
                                    style={s.btnPrimary}
                                    disabled={!usernameValid}
                                    onClick={() => setStep(3)}
                                >Continue →</button>
                            </div>
                        </div>
                    )}

                    {/* ── Step 3: Phone ── */}
                    {step === 3 && (
                        <div style={s.stepBlock}>
                            <label style={s.label} htmlFor="spcg-phone">Phone number</label>
                            <div style={s.inputGroup}>
                                <select
                                    style={s.countrySelect}
                                    value={country}
                                    onChange={(e) => setCountry(e.target.value)}
                                    aria-label="Country code"
                                >
                                    {COUNTRIES.map((c) => (
                                        <option key={c.code} value={c.code} style={{ background: '#0a1628' }}>
                                            {c.flag} {c.code} {c.label}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    id="spcg-phone"
                                    className="spcg-input"
                                    style={{ ...s.input, paddingLeft: 12 }}
                                    type="tel"
                                    inputMode="numeric"
                                    autoComplete="tel"
                                    placeholder={country === '+1' ? '555-123-4567' : '5551234567'}
                                    value={formatPhone(phoneDigits, country)}
                                    onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, '').slice(0, 15))}
                                    maxLength={20}
                                    autoFocus
                                />
                            </div>
                            <div style={s.helper}>
                                {phoneValid
                                    ? <span style={{ color: '#4ade80' }}>✓ Looks good</span>
                                    : <span style={{ color: 'rgba(255,255,255,0.5)' }}>We use this for account recovery and friend matching only.</span>}
                            </div>
                            {submitError && <div style={s.errorBox}>{submitError}</div>}
                            <div style={s.actionsRow}>
                                <button style={s.btnSecondary} onClick={() => setStep(2)} disabled={submitting}>← Back</button>
                                <button
                                    className="spcg-btn-primary"
                                    style={s.btnPrimary}
                                    disabled={!phoneValid || !usernameValid || !nameValid || submitting}
                                    onClick={handleSubmit}
                                >
                                    {submitting ? <span style={s.spinner} /> : 'Finish ✓'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

// ── Helper hook: wraps the gate so callers just do
//    const { shouldGate, gate } = useSocialProfileGate(profile, refresh);
//    return (<>{shouldGate && gate}<MyPage/></>)
export function useSocialProfileGate(profile, onProfileUpdated) {
    const shouldGate = !!profile && profile.social_profile_completed === false;
    const gate = shouldGate ? (
        <SocialProfileCompletionGate
            profile={profile}
            onComplete={(updated) => { onProfileUpdated?.(updated); }}
        />
    ) : null;
    return { shouldGate, gate };
}

// ── Self-fetching wrapper: drop into any page that needs to gate the
//    current user's first-time social entry. Fetches profile once, mounts
//    the modal if social_profile_completed is false, dismisses on success.
export function SocialProfileGateForCurrentUser() {
    const [profile, setProfile] = useState(null);
    const [done, setDone]       = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const user = getAuthUser();
                if (!user || cancelled) return;
                // Use RPC because direct table SELECT of phone is blocked at
                // the column-grant layer; RPC enforces auth.uid() = id internally.
                const { data, error } = await supabase
                    .rpc('get_my_full_profile');
                if (cancelled || error) return;
                const profileData = Array.isArray(data) ? data[0] : data;
                if (!profileData) return;
                setProfile(profileData);
            } catch (_e) {
                /* fail open — don't block social media if profile lookup fails */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (done || !profile || profile.social_profile_completed !== false) return null;

    return (
        <SocialProfileCompletionGate
            profile={profile}
            onComplete={(updated) => {
                setProfile((p) => ({ ...(p || {}), ...(updated || {}) }));
                setDone(true);
            }}
        />
    );
}

// ── Styles ──
const s = {
    overlay: {
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(ellipse at center, rgba(0,20,40,0.92) 0%, rgba(0,8,16,0.97) 100%)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, animation: 'spcgFadeIn 0.3s ease-out',
    },
    modal: {
        width: '100%', maxWidth: 440,
        background: 'linear-gradient(180deg, #0a1628 0%, #050a15 100%)',
        border: '1px solid rgba(0,212,255,0.25)',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 40px rgba(0,150,255,0.15)',
        padding: 28,
        color: '#e0f0ff',
        fontFamily: '"Inter", -apple-system, system-ui, sans-serif',
    },
    header: { textAlign: 'center', marginBottom: 20 },
    iconWrap: {
        width: 56, height: 56, margin: '0 auto 12px', borderRadius: '50%',
        background: 'linear-gradient(135deg, #00d4ff, #0099ff)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, animation: 'spcgPulse 2.4s ease-in-out infinite',
    },
    title: { fontSize: 22, fontWeight: 800, margin: 0, fontFamily: '"Orbitron", sans-serif', letterSpacing: 0.3 },
    subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.6)', margin: '8px 0 0', lineHeight: 1.5 },
    stepRow: { display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 24 },
    stepDot: {
        width: 28, height: 28, borderRadius: '50%', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
        transition: 'all 0.25s',
    },
    stepBlock: { display: 'flex', flexDirection: 'column' },
    label: { fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.85)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    inputGroup: { position: 'relative', display: 'flex', alignItems: 'stretch' },
    inputPrefix: {
        position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
        color: 'rgba(255,255,255,0.45)', fontSize: 16, fontWeight: 600, pointerEvents: 'none',
    },
    input: {
        flex: 1,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10,
        padding: '12px 14px',
        color: '#fff', fontSize: 16,
        fontFamily: 'inherit',
        transition: 'all 0.15s',
    },
    countrySelect: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 10, padding: '12px 8px', color: '#fff',
        fontSize: 14, fontFamily: 'inherit', marginRight: 8,
        cursor: 'pointer', minWidth: 92,
    },
    helper: { fontSize: 12, marginTop: 8, minHeight: 18, fontWeight: 500 },
    suggestionsRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 12 },
    suggestLabel: { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600 },
    suggestionChip: {
        background: 'rgba(0,212,255,0.08)',
        border: '1px solid rgba(0,212,255,0.25)',
        borderRadius: 999,
        padding: '6px 12px',
        color: '#7ce0ff', fontSize: 13, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s',
        fontFamily: 'inherit',
    },
    errorBox: {
        marginTop: 12, padding: '10px 12px', borderRadius: 8,
        background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
        color: '#fca5a5', fontSize: 13,
    },
    actionsRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, gap: 12 },
    btnPrimary: {
        background: 'linear-gradient(135deg, #00d4ff 0%, #0099ff 100%)',
        border: 'none',
        borderRadius: 10,
        padding: '11px 22px',
        color: '#001428',
        fontSize: 15,
        fontWeight: 800,
        cursor: 'pointer',
        transition: 'all 0.15s',
        minWidth: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontFamily: 'inherit',
    },
    btnSecondary: {
        background: 'transparent',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 10,
        padding: '11px 18px',
        color: 'rgba(255,255,255,0.75)',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
    },
    spinner: {
        width: 16, height: 16, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.3)',
        borderTopColor: '#fff',
        animation: 'spcgSpin 0.8s linear infinite',
        display: 'inline-block',
    },
};
