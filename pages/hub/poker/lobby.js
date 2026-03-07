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
import { getAccessToken } from '../../src/lib/authUtils';

export default function PokerLobbyPage() {
  const router = useRouter();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      const token = getAccessToken();
      if (session?.user) {
        setUserId(session.user.id);
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
    <>
      <SEOHead
        title="Poker Lobby | Smarter.Poker"
        description="Browse and join live poker tables. No Limit Hold'em, PLO, Short Deck — play real-time multiplayer poker."
        path="/hub/poker/lobby"
      />
      <UniversalHeader />
      <PokerLobby
        supabase={supabase}
        userId={userId}
        onJoinTable={handleJoinTable}
      />
    </>
  );
}
