/**
 * Commander Owner/Manager Login Page
 * Email + Password for venue owners
 * Facebook color scheme
 */
import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
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

      // Check if user has a commander subscription
      const { data: subs, error: subError } = await supabase
        .from('commander_subscriptions')
        .select('*, venue:poker_venues(*)')
        .eq('owner_id', data.user.id)
        .in('status', ['active', 'trialing'])
        .order('created_at', { ascending: false })
        .limit(1);

      const subscription = subs?.[0] || null;

      if (subError || !subscription) {
        setError('No active Club Commander subscription found for this account.');
        return;
      }

      // Store venue info and redirect to dashboard
      localStorage.setItem('commander_venue', JSON.stringify(subscription.venue));
      localStorage.setItem('commander_subscription', JSON.stringify(subscription));
      router.push('/commander/dashboard');

    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center p-4">
      <Head>
        <title>Sign In | Club Commander</title>
      </Head>

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
              <span className="px-4 bg-[#242526] text-[#B0B3B8]">New to Club Commander?</span>
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
