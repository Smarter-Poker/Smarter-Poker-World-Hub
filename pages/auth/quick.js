/* ═══════════════════════════════════════════════════════════════════════════
   BACKUP SIGNUP — /auth/quick
   ─────────────────────────────────────────────────────────────────────────
   Emergency signup path. Designed to KEEP WORKING when the main /auth/signup
   form breaks. Independent of:
     - Zustand stores
     - PostHog / analytics
     - validatePassword (HIBP can be down)
     - PWA service worker
     - Most of the React component tree
     - The Supabase JS client (uses raw fetch instead)
     - Most of the project's webpack chunks
   Dependencies it CANNOT escape:
     - Next.js page rendering (if Next is broken, NOTHING works)
     - The middleware (which is why /auth/ is hardcoded into AUTH_ALWAYS_ALLOW)
     - The Supabase /auth/v1/signup REST endpoint (if Supabase is down,
       there's no signup anywhere)

   Why this exists: between 2026-04-24 and 2026-05-03 every signup was
   silently broken. If the main signup.js had a JS error, this page is
   the safety net. Linked from the homepage footer + 500.js error page.

   This page deliberately does NO client-side validation beyond HTML5
   required + minlength=10. The server-side trigger chain enforces
   the rest. The point is to MINIMIZE the surface area where this
   page can break.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { useRouter } from 'next/router';

// Hardcoded fallback to the production project. This file MUST work even
// if env-var loading is broken. The anon key is public so this is safe.
const SUPABASE_URL =
    (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) ||
    'https://kuklfnapbkmacvwxktbh.supabase.co';

export default function QuickSignup() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [first, setFirst] = useState('');
    const [last, setLast] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            // Hit our own server-side endpoint — it owns the anon key and
            // does the same Supabase call, but we keep this page working
            // even if NEXT_PUBLIC_SUPABASE_ANON_KEY isn't bundled.
            const r = await fetch('/api/auth/quick-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    password,
                    first_name: first.trim(),
                    last_name: last.trim(),
                }),
            });
            const body = await r.json().catch(() => ({}));
            if (!r.ok) {
                setError(body.error || `Signup failed (HTTP ${r.status})`);
                setLoading(false);
                return;
            }
            setDone(true);
        } catch (err) {
            setError(err?.message || 'Network error - please try again');
            setLoading(false);
        }
    };

    if (done) {
        return (
            <main style={S.page}>
                <div style={S.card}>
                    <h1 style={S.h1}>Account created</h1>
                    <p style={S.p}>Check your email for a confirmation link, then <a href="/auth/login" style={S.link}>sign in</a>.</p>
                </div>
            </main>
        );
    }

    return (
        <main style={S.page}>
            <div style={S.card}>
                <h1 style={S.h1}>Quick Signup</h1>
                <p style={S.p}>
                    Backup signup path - minimal form, no analytics, no fancy validation.
                    {' '}<a href="/auth/signup" style={S.link}>Use the full signup instead</a>.
                </p>
                <form onSubmit={submit} style={S.form} autoComplete="on">
                    <input
                        type="email"
                        required
                        placeholder="Email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={S.input}
                    />
                    <input
                        type="password"
                        required
                        minLength={10}
                        placeholder="Password (10+ chars)"
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={S.input}
                    />
                    <input
                        type="text"
                        required
                        placeholder="First name"
                        autoComplete="given-name"
                        value={first}
                        onChange={(e) => setFirst(e.target.value)}
                        style={S.input}
                    />
                    <input
                        type="text"
                        required
                        placeholder="Last name"
                        autoComplete="family-name"
                        value={last}
                        onChange={(e) => setLast(e.target.value)}
                        style={S.input}
                    />
                    {error && <div style={S.err}>{error}</div>}
                    <button type="submit" disabled={loading} style={S.btn}>
                        {loading ? 'Creating account…' : 'Create account'}
                    </button>
                </form>
                <p style={{ ...S.p, marginTop: 24, fontSize: 13 }}>
                    By signing up you agree to our <a href="/terms" style={S.link}>Terms</a> and <a href="/privacy" style={S.link}>Privacy Policy</a>.
                </p>
            </div>
        </main>
    );
}

// Inline styles ONLY — no external CSS, no Tailwind, no design tokens.
// Keep this file self-contained.
const S = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1628', padding: 20, fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' },
    card: { width: '100%', maxWidth: 420, background: '#0d1f35', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12, padding: 32, color: '#fff' },
    h1: { fontSize: 24, fontWeight: 600, margin: '0 0 8px' },
    p: { fontSize: 14, color: 'rgba(255,255,255,0.7)', margin: '0 0 24px', lineHeight: 1.5 },
    form: { display: 'flex', flexDirection: 'column', gap: 12 },
    input: { padding: '12px 14px', fontSize: 15, border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: '#fff', outline: 'none' },
    btn: { padding: '14px 20px', fontSize: 15, fontWeight: 600, color: '#fff', background: 'linear-gradient(135deg, #1877F2, #0a5dc2)', border: 'none', borderRadius: 8, cursor: 'pointer', marginTop: 8 },
    err: { padding: 12, background: 'rgba(220,38,38,0.2)', border: '1px solid rgba(220,38,38,0.5)', borderRadius: 8, color: '#f87171', fontSize: 14, textAlign: 'center' },
    link: { color: '#00D4FF', textDecoration: 'underline' },
};
