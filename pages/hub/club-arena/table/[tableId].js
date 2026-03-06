/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Live Poker Table (Multi-Table Support)
   Supports up to 4 simultaneous tables via MultiTableView
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { supabase } from '../../../../src/lib/supabase';

const MultiTableView = dynamic(
  () => import('../../../../src/components/poker/MultiTableView'),
  { ssr: false }
);

const FB = {
  background: '#18191A',
  textSecondary: '#B0B3B8',
  primary: '#2374E1',
  danger: '#FA383E',
};

export default function ClubArenaTable() {
  const router = useRouter();
  if (!router.isReady) return null;
  const { tableId, tournament: tournamentId } = router.query;
  const [user, setUser] = useState(null);
  const [initialTable, setInitialTable] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {    const _c = new AbortController();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUser(session.user);
      else router.push('/auth/login');
    });
    return () => _c.abort();
  }, []);

  useEffect(() => {    const _c = new AbortController();

    if (!tableId || !user) return;
    (async () => {
      setLoading(true); setError(null);
      try {
        const { data: td, error: fe } = await supabase
          .from('tables').select('*, clubs(name, avatar_url)').eq('id', tableId).single();
        if (fe || !td) { setError('Table not found'); setLoading(false); return; }

        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const res = await fetch('/api/poker/engine/club-connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ tableId }),
        });
        const r = await res.json();
        if (!r.success) {
          setError(r.code === 'OBSERVERS_RESTRICTED'
            ? '🔒 Observers are not allowed at this table'
            : r.error || 'Engine connect failed');
          setLoading(false); return;
        }

        const vl = { nlh:"NLH", plo4:'PLO4', plo5:'PLO5', plo6:'PLO6',
          plo8:'PLO Hi/Lo', short_deck:'Short Deck', ofc:'OFC' }[td.game_variant] || 'NLH';

        setInitialTable({
          tableId: td.id, name: td.name, stakes: `${td.small_blind}/${td.big_blind}`,
          variant: vl, clubName: td.clubs?.name || '', clubId: td.club_id,
        });
      } catch (e) { setError('Connection failed'); }
      finally { setLoading(false); }
    })();
    return () => _c.abort();
  }, [tableId, user]);

  const handleExit = useCallback(() => {
    const cid = initialTable?.clubId;
    router.push(cid ? `/hub/club-arena/lobby?club=${cid}` : '/hub/club-arena');
  }, [router, initialTable?.clubId]);

  if (loading || !user) return (
    <div style={{ background: '#18191A', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <SEOHead title="Loading Table..." />
      <div style={{ color: FB.textSecondary, fontSize: 16 }}>Connecting to table...</div>
    </div>
  );

  if (error) return (
    <div style={{ background:'#18191A', minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <SEOHead title="Table Error" />
      <div style={{ color: FB.danger, fontSize: 18, fontWeight: 700 }}>{error}</div>
      <button onClick={() => router.back()} style={{ background: FB.primary, color:'#fff', border:'none', padding:'10px 24px', borderRadius:8, cursor:'pointer' }}>Go Back</button>
    </div>
  );

  if (initialTable) return (
    <>
      <SEOHead title={`${initialTable.name} | ${initialTable.variant} ${initialTable.stakes}`} />
      <MultiTableView supabase={supabase} userId={user.id} initialTable={initialTable} onExit={handleExit} />
    </>
  );
  return null;
}
