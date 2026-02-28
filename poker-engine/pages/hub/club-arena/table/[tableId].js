/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Live Poker Table
   Bridges Club Arena tables to the poker engine via LivePokerTable component
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { supabase } from '../../../../src/lib/supabase';

// Dynamic import to avoid SSR issues with LivePokerTable
const LivePokerTable = dynamic(
  () => import('../../../../src/components/poker/LivePokerTable'),
  { ssr: false }
);

// Facebook Dark Theme
const FB = {
  background: '#18191A',
  cardBg: '#242526',
  textPrimary: '#E4E6EB',
  textSecondary: '#B0B3B8',
  border: '#3E4042',
  primary: '#2374E1',
  danger: '#FA383E',
};

export default function ClubArenaTable() {
  const router = useRouter();
  const { tableId } = router.query;

  const [user, setUser] = useState(null);
  const [tableInfo, setTableInfo] = useState(null);
  const [engineReady, setEngineReady] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
      else router.push('/auth/login');
    });
  }, []);

  // Load table info from Club Arena DB + connect to engine
  useEffect(() => {
    if (!tableId || !user) return;

    async function connectTable() {
      setLoading(true);
      setError(null);

      try {
        // 1. Fetch table info from Club Arena 'tables' DB
        const { data: tableData, error: fetchErr } = await supabase
          .from('tables')
          .select('*, clubs(name, logo_url)')
          .eq('id', tableId)
          .single();

        if (fetchErr || !tableData) {
          setError('Table not found');
          setLoading(false);
          return;
        }

        setTableInfo(tableData);

        // 2. Connect engine to this club table
        const res = await fetch('/api/poker/engine/club-connect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId }),
        });

        const result = await res.json();

        if (!result.success) {
          setError(result.error || 'Failed to connect to game engine');
          setLoading(false);
          return;
        }

        setEngineReady(true);
      } catch (err) {
        console.error('Table connect error:', err);
        setError('Connection failed');
      } finally {
        setLoading(false);
      }
    }

    connectTable();
  }, [tableId, user]);

  // Loading state
  if (loading || !user) {
    return (
      <div style={{ background: FB.background, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SEOHead title="Loading Table..." />
        <div style={{ color: FB.textSecondary, fontSize: 16 }}>
          Connecting to table...
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={{ background: FB.background, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <SEOHead title="Table Error" />
        <div style={{ color: FB.danger, fontSize: 18, fontWeight: 700 }}>
          {error}
        </div>
        <button
          onClick={() => router.back()}
          style={{
            background: FB.primary, color: '#fff', border: 'none',
            padding: '10px 24px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
          }}
        >
          Go Back
        </button>
      </div>
    );
  }

  // Render LivePokerTable
  if (engineReady && tableInfo) {
    const variantLabel = {
      nlh: "NL Hold'em", plo4: 'PLO4', plo5: 'PLO5', plo6: 'PLO6',
      plo8: 'PLO Hi/Lo', short_deck: 'Short Deck', ofc: 'OFC',
    }[tableInfo.game_variant] || tableInfo.game_variant?.toUpperCase() || 'NLH';

    return (
      <>
        <SEOHead
          title={`${tableInfo.name} | ${variantLabel} ${tableInfo.small_blind}/${tableInfo.big_blind}`}
          description={`Live poker: ${variantLabel} at ${tableInfo.clubs?.name || 'Club Arena'}`}
        />
        <LivePokerTable
          supabase={supabase}
          tableId={tableId}
          userId={user.id}
          tableName={tableInfo.name}
          clubName={tableInfo.clubs?.name}
          onLeave={() => {
            const clubId = tableInfo.club_id;
            router.push(clubId ? `/hub/club-arena/lobby?club=${clubId}` : '/hub/club-arena');
          }}
        />
      </>
    );
  }

  return null;
}
