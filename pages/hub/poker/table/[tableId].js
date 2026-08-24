/**
 * /hub/poker/table/[tableId] — Live Poker Table Page
 * Real-time multiplayer poker table via Supabase Realtime
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../../src/lib/supabase';
import LivePokerTable from '../../../../src/components/poker/LivePokerTable';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { getAuthUser } from '../../../../src/lib/authUtils';
import BottomNavBar from '../../../../src/components/ui/BottomNavBar';

export default function PokerTablePage() {
  const router = useRouter();
  const { tableId } = router.query;
  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('Player');
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      const authUser = getAuthUser();
      if (authUser) {
        setUserId(authUser.id);

        // Fetch profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', authUser.id)
          .maybeSingle();

        if (profile) {
          setDisplayName(profile.display_name || authUser.email?.split('@')[0] || 'Player');
          setAvatarUrl(profile.avatar_url);
        }
      } else {
        // Anonymous fallback
        const stored = localStorage.getItem('sb-user-id');
        const id = stored || `anon-${Date.now()}`;
        if (!stored) localStorage.setItem('sb-user-id', id);
        setUserId(id);
        setDisplayName(`Guest_${id.slice(-4)}`);
      }
    };
    getUser();
  }, []);
  // Realtime subscription — live updates
  useEffect(() => {

  if (!router.isReady) return null;

    if (!tableId) return;
    const _ch = supabase
      .channel(`poker-table:${tableId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` }, () => {
        console.warn('[PokerTable] Received real-time update for tables');
      })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [tableId]);

  if (!tableId || !userId) {
    return (
      <div style={{
        width: '100%', height: '100vh', paddingBottom: 70,
        background: '#050505',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8a8a9a', fontSize: 16,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>
        Loading table...
        <BottomNavBar />
      </div>
    );
  }

  return (
    <>
      <SEOHead
        title={`Table ${tableId} | Smarter.Poker`}
        description="Play live multiplayer poker in real-time."
        path={`/hub/poker/table/${tableId}`}
      />
      <LivePokerTable
        tableId={tableId}
        supabase={supabase}
        userId={userId}
        displayName={displayName}
        avatarUrl={avatarUrl}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// RETIRED 2026-08-24. This page is the only door into World Hub's second poker
// engine (src/lib/poker-engine + pages/api/poker/engine). Club Arena, served
// from /hub/club-arena/ and backed by the Hetzner server, is the real one.
//
// Why it is closed rather than left lying around:
//
//   - Nothing links here. Every /hub/poker* link in this repo points at
//     poker-near-me or poker-series, which are different, live features. You
//     could only arrive by typing the URL.
//   - It has never been used. hand_history holds 1,390,864 rows and every
//     single one is source='manual', written by the Club Arena engine. This
//     engine writes source='engine-api'. There are zero such rows.
//   - It keeps seats in memory and never writes table_seats, which is where
//     the four-table hard rule is enforced (trg_enforce_four_table_limit). So
//     a player seated through this engine is invisible to that trigger, and to
//     the away-blind cap. A second engine that cannot participate in seat
//     accounting is a way around two binding rules, not a feature.
//   - And it moves real money on the way in: seat.js sit_down calls
//     ChipBridge.lockChips.
//
// The library underneath is NOT dead and must not be deleted: RateLimiter and
// authMiddleware are imported by ~20 live pages/api/club-arena/* routes.
// Closing the door is the whole fix.
// ---------------------------------------------------------------------------
export async function getServerSideProps() {
  return { notFound: true };
}
