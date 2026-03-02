/**
 * Commander Owner/Manager Login Page
 * Email + Password for venue owners
 * Facebook color scheme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../src/lib/supabase';

export default function CommanderLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);

  // Pre-fill email from stored staff data if available (remember me)
  useEffect(() => {
    try {
      const staffData = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      if (staffData.email) setEmail(staffData.email);
    } catch { }
    // Show 'session expired' message if redirected from expired session
    if (router.query.expired === '1') {
      setError('Your session has expired. Please sign in again.');
    }
  }, [router.query.expired]);

  // Auto-restore session — if user has valid Supabase session + remember flag, skip login
  useEffect(() => {
    async function checkExistingSession() {
      try {
        const remembered = localStorage.getItem('commander_remember');
        const staffData = localStorage.getItem('commander_staff');
        if (!remembered || !staffData) { setCheckingSession(false); return; }

        // Verify Supabase session is still valid
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          // Session valid — go straight to dashboard (replace to avoid invariant error)
          if (router.pathname !== '/commander/dashboard') {
            router.replace('/commander/dashboard').catch(() => { });
          }
          return;
        }

        // Session expired — try to refresh
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        if (refreshed) {
          if (router.pathname !== '/commander/dashboard') {
            router.replace('/commander/dashboard').catch(() => { });
          }
          return;
        }

        // Refresh failed — keep commander_remember and staff email for pre-fill
        // Only clear session-specific tokens, not the remember flag
        localStorage.removeItem('commander_venue');
        localStorage.removeItem('commander_subscription');
      } catch (err) {
        console.warn('Session restore failed:', err);
      }
      setCheckingSession(false);
    }
    checkExistingSession();
  }, [router]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError(null);

    try {
      // Sign in with Supabase
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) throw authError;

      // Check if user has a commander subscription (server-side to bypass RLS)
      const subRes = await fetch('/api/commander/check-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: data.user.id }),
      });
      const subData = await subRes.json();

      if (!subRes.ok || !subData.subscription) {
        setError('No active Club Commander subscription found for this account.');
        return;
      }

      const subscription = subData.subscription;

      // Store venue info and staff session for dashboard access
      localStorage.setItem('commander_venue', JSON.stringify(subscription.venue));
      localStorage.setItem('commander_subscription', JSON.stringify(subscription));

      // Dashboard checks for commander_staff — set it with owner permissions
      const staffSession = {
        user_id: data.user.id,
        email: data.user.email,
        display_name: subscription.billing_name || data.user.email,
        role: 'owner',
        venue_id: subscription.venue_id,
        venue_name: subscription.venue?.name || 'My Venue',
        permissions: {
          manage_games: true,
          manage_waitlist: true,
          manage_staff: true,
          manage_tables: true,
          manage_tournaments: true,
          manage_settings: true,
          view_analytics: true,
          view_reports: true,
          send_announcements: true,
        }
      };
      localStorage.setItem('commander_staff', JSON.stringify(staffSession));

      // Persist session across browser restarts if "Remember Me" is checked
      if (rememberMe) {
        localStorage.setItem('commander_remember', 'true');
      } else {
        localStorage.removeItem('commander_remember');
      }

      router.replace('/commander/dashboard').catch(() => { });

    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  // Show loading while checking for existing session
  if (checkingSession) return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-4">
      <div className="text-[#8A8D91] text-sm flex items-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Restoring session...
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-4">
      <SEOHead
        title="Club Commander — Sign In"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />

      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/images/club-commander-logo.jpg"
            alt="Club Commander"
            className="w-full max-w-sm mx-auto rounded-lg"
          />
        </div>

        {/* Login Form */}
        <div className="bg-[#242526] rounded-xl p-8 border border-[#3A3B3C]">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-[#E4E6EB] text-sm font-medium mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#3A3B3C] border border-[#4E4F50] rounded-lg px-4 py-3 text-[#E4E6EB] placeholder-[#8A8D91] focus:outline-none focus:border-[#1877F2]"
                placeholder="you@example.com"
                required
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-[#E4E6EB] text-sm font-medium mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#3A3B3C] border border-[#4E4F50] rounded-lg px-4 py-3 text-[#E4E6EB] placeholder-[#8A8D91] focus:outline-none focus:border-[#1877F2] pr-12"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8D91] hover:text-[#E4E6EB]"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rememberMe"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-[#4E4F50] bg-[#3A3B3C] text-[#1877F2] focus:ring-[#1877F2] focus:ring-offset-0 cursor-pointer accent-[#1877F2]"
              />
              <label htmlFor="rememberMe" className="text-[#B0B3B8] text-sm cursor-pointer select-none">
                Remember Me
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-[#F02849]/10 border border-[#F02849]/30 text-[#F02849] px-4 py-2 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1877F2] hover:bg-[#1664d9] disabled:bg-[#3A3B3C] text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#3A3B3C]"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-[#242526] text-[#B0B3B8]">New To Club Commander?</span>
            </div>
          </div>

          {/* Sign Up Link */}
          <Link
            href="/commander/register"
            className="block w-full bg-[#3A3B3C] hover:bg-[#4E4F50] text-[#E4E6EB] font-semibold py-3 px-6 rounded-lg text-center transition-colors"
          >
            Sign Up
          </Link>
        </div>

        {/* Footer */}
        <p className="text-center text-[#65676B] text-xs mt-6">
          Powered by SMARTER.POKER
        </p>
      </div>
    </div>
  );
}
