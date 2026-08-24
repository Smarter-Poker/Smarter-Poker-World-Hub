/**
 * /hub/poker/lobby — Live Poker Lobby Page
 * Browse, filter, and join real-time poker tables
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import PokerLobby from '../../../src/components/poker/PokerLobby';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import SEOHead from '../../../src/components/seo/SEOHead';
import { getAuthUser } from '../../../src/lib/authUtils';
import BottomNavBar from '../../../src/components/ui/BottomNavBar';

export default function PokerLobbyPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      const authUser = getAuthUser();
      if (authUser) {
        setUserId(authUser.id);
      } else {
        // Anonymous fallback for demo
        const stored = localStorage.getItem('sb-user-id');
        if (stored) {
          setUserId(stored);
        } else {
          const anonId = `anon-${Date.now()}`;
          localStorage.setItem('sb-user-id', anonId);
          setUserId(anonId);
        }
      }
    };
    getUser();
  }, []);

  const handleJoinTable = (tableId) => {
    router.push(`/hub/poker/table/${tableId}`);
  };

  return (
    <div style={{ paddingBottom: 70 }}>
      <SEOHead
        title="Poker Lobby | Smarter.Poker"
        description="Browse and join live poker tables. No Limit Hold'em, PLO, Short Deck — play real-time multiplayer poker."
        path="/hub/poker/lobby"
      />
      <UniversalHeader pageDepth={2} />
      <PokerLobby
        supabase={supabase}
        userId={userId}
        onJoinTable={handleJoinTable}
      />
      <BottomNavBar />
    </div>
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
