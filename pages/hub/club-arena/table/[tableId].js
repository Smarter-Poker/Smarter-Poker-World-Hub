/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Live Poker Table (Multi-Table Support)
   Supports up to 4 simultaneous tables via MultiTableView

   Hybrid Architecture: Supabase Realtime for live broadcasts,
   HTTP API for all game actions, StateSerializer for crash recovery.
   Auto-reconnects on cold start / server recycle with exponential backoff.
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { supabase } from '../../../../src/lib/supabase';
import { getAuthUser, getAccessToken } from '../../../../src/lib/authUtils';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';

const MultiTableView = dynamic(
  () => import('../../../../src/components/poker/MultiTableView'),
  { ssr: false }
);

const FB = {
  background: '#18191A',
  cardBg: '#242526',
  textPrimary: '#E4E6EB',
  textSecondary: '#B0B3B8',
  primary: '#2374E1',
  danger: '#FA383E',
  border: '#3E4042',
};

const VARIANT_LABELS = {
  nlh: 'NLH', holdem: 'NLH', no_limit_holdem: 'NLH',
  plo4: 'PLO4', plo: 'PLO4', omaha: 'PLO4', omaha4: 'PLO4',
  plo5: 'PLO5', omaha5: 'PLO5',
  plo6: 'PLO6', omaha6: 'PLO6',
  plo8: 'PLO Hi/Lo', omaha_hilo: 'PLO Hi/Lo',
  short_deck: 'Short Deck', '6plus': 'Short Deck',
  ofc: 'OFC', pineapple: 'Pineapple',
};

// Exponential backoff reconnect — 1s, 2s, 4s, 8s, 16s, then give up
async function connectWithRetry(tableId, token, maxAttempts = 5) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch('/api/poker/engine/club-connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ tableId }),
      });
      const r = await res.json();
      if (r.success) return { success: true, data: r };

      // Non-retryable errors
      if (r.code === 'OBSERVERS_RESTRICTED' || r.code === 'OBSERVER_TIME_EXPIRED') {
        return { success: false, fatal: true, error: r.error, code: r.code };
      }

      // On last attempt give up
      if (attempt === maxAttempts) return { success: false, error: r.error };
    } catch (_) {
      if (attempt === maxAttempts) return { success: false, error: 'Network error — check your connection' };
    }

    await new Promise(r => setTimeout(r, delay));
    delay = Math.min(delay * 2, 16000);
  }
  return { success: false, error: 'Could not connect to game server after multiple attempts' };
}

export default function ClubArenaTable() {
  const router = useRouter();
  if (!router.isReady) return null;

  const { tableId, tournament: tournamentId } = router.query;
  useTrainingBus('club-arena-table');
  const [user, setUser] = useState(null);
  const [initialTable, setInitialTable] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connectStatus, setConnectStatus] = useState('Connecting to table…');
  const retryRef = useRef(false);

  // Auth guard
  useEffect(() => {
    const authUser = getAuthUser();
    if (authUser) setUser(authUser);
    else router.push('/auth/login');
  }, []);

  // Engine connect with retry
  useEffect(() => {
    if (!tableId || !user || retryRef.current) return;
    retryRef.current = true;

    (async () => {
      setLoading(true);
      setError(null);

      // 1. Fetch table metadata from DB
      const { data: td, error: fe } = await supabase
        .from('tables')
        .select('*, clubs(name, avatar_url)')
        .eq('id', tableId)
        .maybeSingle();

      if (fe || !td) {
        setError('Table not found');
        setLoading(false);
        return;
      }

      // 2. Get auth token
      const token = getAccessToken();

      // 3. Connect to engine with retry backoff
      setConnectStatus('Connecting to poker engine…');
      const result = await connectWithRetry(tableId, token);

      if (!result.success) {
        if (result.code === 'OBSERVERS_RESTRICTED') {
          setError('[LOCKED] Observers are not allowed at this table');
        } else if (result.code === 'OBSERVER_TIME_EXPIRED') {
          setError('[TIME] Observer time limit reached (30 minutes). Please join the waitlist to play.');
        } else {
          setError(result.error || 'Could not connect to game server');
        }
        setLoading(false);
        return;
      }

      // 4. Build initial table config
      const variant = VARIANT_LABELS[td.game_variant] || 'NLH';
      setInitialTable({
        tableId: td.id,
        name: td.name,
        stakes: `${td.small_blind}/${td.big_blind}`,
        variant,
        clubName: td.clubs?.name || '',
        clubId: td.club_id,
        tournamentId: tournamentId || null,
        // Pass observer time limit info to the UI if set
        observerTimeLimit: result.data?.observerTimeLimit || null,
      });

      setLoading(false);
    })();
  }, [tableId, user, initialTable]);

  // Realtime: re-run engine connect if table status changes (e.g., table restarted)
  useEffect(() => {
    if (!tableId) return;

    const ch = supabase
      .channel(`ca-table-status:${tableId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tables', filter: `id=eq.${tableId}` },
        (payload) => {
          // If table was reset/restarted by admin, force a full reconnect.
          // Clear initialTable state and reset retryRef — the connect useEffect
          // depends on [tableId, user] and won't re-run on its own, so we also
          // clear initialTable which the engine connect effect checks on entry.
          if (payload.new?.status === 'waiting' && initialTable) {
            retryRef.current = false;
            setInitialTable(null); // Triggers re-render; connect effect sees retryRef=false + user set
            setError(null);
            setLoading(true);
          }
        }
      )
      .subscribe((_status) => {});

    return () => supabase.removeChannel(ch);
  }, [tableId, initialTable]);

  const handleExit = useCallback(() => {
    const cid = initialTable?.clubId;
    router.push(cid ? `/hub/club-arena/lobby?club=${cid}` : '/hub/club-arena');
  }, [router, initialTable?.clubId]);

  const handleRetry = useCallback(() => {
    retryRef.current = false;
    setError(null);
    setLoading(true);
    // Trigger re-connect by re-running the effect
    setUser(u => ({ ...u }));
  }, []);

  // ── Loading screen ──
  if (loading || !user) return (
    <div style={{
      background: FB.background, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16,
    }}>
      <SEOHead title="Connecting to Table…" />
      <div style={{
        width: 48, height: 48, border: `3px solid ${FB.border}`,
        borderTop: `3px solid ${FB.primary}`,
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <div style={{ color: FB.textSecondary, fontSize: 15 }}>{connectStatus}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  // ── Error screen ──
  if (error) return (
    <div style={{
      background: FB.background, minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24,
    }}>
      <SEOHead title="Table Error" />
      <div style={{
        background: FB.cardBg, border: `1px solid ${FB.border}`,
        borderRadius: 16, padding: '32px 28px', maxWidth: 420, width: '100%',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>[WARN]</div>
        <div style={{ color: FB.danger, fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Connection Error
        </div>
        <div style={{ color: FB.textSecondary, fontSize: 14, marginBottom: 24, lineHeight: 1.5 }}>
          {error}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleRetry}
            style={{
              background: FB.primary, color: '#fff', border: 'none',
              padding: '10px 22px', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: 14,
            }}
          >
            Retry
          </button>
          <button
            onClick={() => router.back()}
            style={{
              background: 'transparent', color: FB.textSecondary,
              border: `1px solid ${FB.border}`,
              padding: '10px 22px', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: 14,
            }}
          >
            ← Go Back
          </button>
        </div>
      </div>
    </div>
  );

  // ── Live table ──
  if (initialTable) return (
    <>
      <SEOHead title={`${initialTable.name} | ${initialTable.variant} ${initialTable.stakes}`} />
      <MultiTableView
        supabase={supabase}
        userId={user.id}
        initialTable={initialTable}
        onExit={handleExit}
      />
    </>
  );

  return null;
}
