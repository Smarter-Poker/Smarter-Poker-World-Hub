/**
 * /hub/poker/table/[tableId] — Live Poker Table Page
 * Real-time multiplayer poker table via Supabase Realtime
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../../../src/lib/supabase';
import LivePokerTable from '../../../../src/components/poker/LivePokerTable';
import SEOHead from '../../../../src/components/seo/SEOHead';

export default function PokerTablePage() {
  const router = useRouter();
  const { tableId } = router.query;
  const [userId, setUserId] = useState(null);
  const [displayName, setDisplayName] = useState('Player');
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);

        // Fetch profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setDisplayName(profile.display_name || session.user.email?.split('@')[0] || 'Player');
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

  if (!tableId || !userId) {
    return (
      <div style={{
        width: '100%', height: '100vh',
        background: '#050505',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#8a8a9a', fontSize: 16,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
      }}>
        Loading table...
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
