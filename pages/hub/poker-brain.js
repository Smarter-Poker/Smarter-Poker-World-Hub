/**
 * Poker Brain HUD — Standalone Page
 * ==================================
 * Renders the full Poker Brain HUD for live game assistance.
 * Uses screen capture of PokerBros (via Android emulator) to detect
 * cards, pot sizes, and stacks, then provides GTO-based recommendations
 * via the Horse Brain decision engine.
 *
 * The HUD component uses browser APIs (canvas, video, Web Audio) so it
 * must be dynamically imported with ssr: false.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';

// Dynamic import: HUD uses canvas, video, Web Audio — no SSR
const PokerBrainHUD = dynamic(
  () => import('../../src/components/poker-brain/HUD'),
  { ssr: false, loading: () => <HUDLoadingPlaceholder /> }
);

function HUDLoadingPlaceholder() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Loading Poker Brain...</p>
      </div>
    </div>
  );
}

export default function PokerBrainPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { variant } = router.query;

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user) {
          setUser(data.session.user);
        } else {
          // Not logged in — redirect to login
          router.replace('/hub?login=1');
          return;
        }
      } catch (err) {
        console.warn('[PokerBrain] Auth check failed:', err);
      }
      setLoading(false);
    };
    checkAuth();
  }, [router]);

  if (loading) {
    return <HUDLoadingPlaceholder />;
  }

  if (!user) {
    return null; // Redirecting to login
  }

  return (
    <>
      <Head>
        <title>Poker Brain | Smarter.Poker</title>
        <meta name="description" content="Live poker HUD with GTO recommendations powered by Horse Brain AI" />
      </Head>
      <PokerBrainHUD
        initialMode="screen"
        initialGameType={variant || 'nlhe'}
        onClose={() => router.push('/hub')}
      />
    </>
  );
}
