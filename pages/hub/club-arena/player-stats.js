/* ═══════════════════════════════════════════════════════════════
   Club Arena Player Stats — Native Hub Page (replaces iframe)
   Personal performance dashboard for a player in this club
   ═══════════════════════════════════════════════════════════════ */
import { useState, useEffect, useRef } from 'react';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HubErrorBoundary from '../../../src/components/ui/HubErrorBoundary';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

import s from '../../../src/styles/UnionDashboard.module.css';

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtChips = (n) => {
  const v = Number(n || 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return fmt(v);
};

function StatCard({ label, value, color, icon }) {
  return (
    <div style={{
      background: '#242526', padding: '20px', borderRadius: '12px',
      border: '1px solid #3A3B3C', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ fontSize: '12px', color: '#B0B3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{icon} {label}</div>
      <div style={{ fontSize: '28px', fontWeight: 800, color: color || '#E4E6EB' }}>{value}</div>
    </div>
  );
}

export default function ClubArenaPlayerStatsPage() {
  useTrainingBus('arena-player-stats');
  const router = useRouter();

  const [clubId, setClubId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async (session) => {
      if (cancelled) return;
      const qClub = router.query.club || router.query.clubId;
      const { supabase } = await import('../../../src/lib/supabase');
      let targetClub = qClub;

      if (!targetClub) {
        const { data: mem } = await supabase.from('club_members').select('club_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        targetClub = mem?.club_id;
      }

      if (!targetClub) { setError('No club found.'); setLoading(false); return; }
      setClubId(targetClub);

      try {
        // Fetch membership info
        const { data: membership } = await supabase
          .from('club_members')
          .select('chip_balance, role, joined_at')
          .eq('club_id', targetClub)
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (!membership) { setError('Not a member of this club.'); setLoading(false); return; }

        // Fetch recent transactions
        const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
        const { data: txns } = await supabase
          .from('chip_transactions')
          .select('amount, transaction_type, created_at')
          .eq('club_id', targetClub)
          .or(`from_user_id.eq.${session.user.id},to_user_id.eq.${session.user.id}`)
          .gte('created_at', since30d)
          .order('created_at', { ascending: false })
          .limit(500);

        // Fetch hand count
        const { count: handCount } = await supabase
          .from('hand_histories')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', targetClub)
          .contains('hand_data', { players: [{ id: session.user.id }] });

        // Compute stats
        let totalBuyins = 0, totalCashouts = 0, totalDistributed = 0, txCount = 0;
        const dailyMap = {};

        (txns || []).forEach(tx => {
          txCount++;
          const amt = Math.abs(Number(tx.amount) || 0);
          const day = tx.created_at?.split('T')[0];

          if (['buyin', 'distribute', 'agent_to_player', 'promo_agent_to_player'].includes(tx.transaction_type)) {
            totalDistributed += amt;
          }
          if (['cashout_approved', 'cashout'].includes(tx.transaction_type)) {
            totalCashouts += amt;
          }
          if (['buyin'].includes(tx.transaction_type)) {
            totalBuyins += amt;
          }

          if (day) {
            if (!dailyMap[day]) dailyMap[day] = { in: 0, out: 0 };
            if (['buyin', 'distribute', 'agent_to_player'].includes(tx.transaction_type)) dailyMap[day].in += amt;
            if (['cashout_approved', 'cashout'].includes(tx.transaction_type)) dailyMap[day].out += amt;
          }
        });

        const netFlow = totalDistributed - totalCashouts;
        const daysSince = Math.max(1, Math.ceil((Date.now() - new Date(membership.joined_at).getTime()) / 86400000));

        if (mountedRef.current) {
          setStats({
            chipBalance: membership.chip_balance,
            role: membership.role,
            joinedAt: membership.joined_at,
            daysSince,
            handCount: handCount || 0,
            txCount,
            totalBuyins,
            totalCashouts,
            totalDistributed,
            netFlow,
            dailyMap,
          });
          setLoading(false);
        }
      } catch (err) {
        if (mountedRef.current) { setError(err.message); setLoading(false); }
      }
    };

    (async () => {
      const { supabase } = await import('../../../src/lib/supabase');
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { await init(session); return; }
      setError('login_required'); setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [router.query.club, router.query.clubId]);

  if (loading) {
    return (
      <HubErrorBoundary name="Player Stats">
        <SEOHead title="My Stats | Smarter.Poker" />
        <UniversalHeader />
        <div className={s.container}><div className={s.loading}>Computing Your Performance...</div></div>
      </HubErrorBoundary>
    );
  }

  return (
    <HubErrorBoundary name="Player Stats">
      <SEOHead title="My Stats | Smarter.Poker" />
      <UniversalHeader />

      <div className={s.container}>
        <div className={s.inner}>

          {error === 'login_required' ? (
            <div className={s.error} style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
              <button onClick={() => window.location.href = '/auth/login'} className={s.btnPrimary}>Log In</button>
            </div>
          ) : error ? <div className={s.error}>{error}</div> : null}

          {stats && (
            <>
              {/* Header */}
              <div className={s.pageHeader}>
                <div className={s.pageTitle}>📊 My Performance</div>
                <div className={s.headerActions}>
                  <Link href="/hub/club-arena/lobby" style={{ textDecoration: 'none' }}>
                    <button className={s.btnGhost}>🏠 Lobby</button>
                  </Link>
                </div>
              </div>

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                <StatCard label="Chip Balance" value={fmtChips(stats.chipBalance)} color="#F7C52A" icon="💰" />
                <StatCard label="Hands Played" value={fmt(stats.handCount)} color="#4599FF" icon="🃏" />
                <StatCard label="Total Buy-Ins" value={fmtChips(stats.totalBuyins)} color="#31A24C" icon="📥" />
                <StatCard label="Total Cashouts" value={fmtChips(stats.totalCashouts)} color="#FA383E" icon="📤" />
                <StatCard label="Net Flow (30d)" value={fmtChips(stats.netFlow)} color={stats.netFlow >= 0 ? '#31A24C' : '#FA383E'} icon="📈" />
                <StatCard label="Transactions" value={fmt(stats.txCount)} color="#B0B3B8" icon="🔄" />
              </div>

              {/* Membership Info */}
              <div style={{ background: '#242526', padding: '20px', borderRadius: '12px', border: '1px solid #3A3B3C', marginBottom: '24px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '16px' }}>🎖️ Membership</h3>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '14px' }}>
                  <div><span style={{ color: '#B0B3B8' }}>Role:</span> <span style={{ fontWeight: 700, textTransform: 'capitalize' }}>{stats.role?.replace(/_/g, ' ')}</span></div>
                  <div><span style={{ color: '#B0B3B8' }}>Member for:</span> <span style={{ fontWeight: 700 }}>{stats.daysSince} days</span></div>
                  <div><span style={{ color: '#B0B3B8' }}>Joined:</span> <span>{new Date(stats.joinedAt).toLocaleDateString()}</span></div>
                </div>
              </div>

              {/* Daily Activity Chart (text-based) */}
              <div style={{ background: '#242526', padding: '20px', borderRadius: '12px', border: '1px solid #3A3B3C' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>📅 Daily Activity (Last 30 Days)</h3>
                {Object.keys(stats.dailyMap).length === 0 ? (
                  <div style={{ color: '#65676B', textAlign: 'center', padding: '20px' }}>No activity in the last 30 days</div>
                ) : (
                  <div className={s.tableScroll}>
                    <table className={s.dataTable}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th style={{ textAlign: 'right' }}>Chips In</th>
                          <th style={{ textAlign: 'right' }}>Chips Out</th>
                          <th style={{ textAlign: 'right' }}>Net</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(stats.dailyMap).sort(([a], [b]) => b.localeCompare(a)).slice(0, 30).map(([day, d]) => (
                          <tr key={day}>
                            <td style={{ color: '#B0B3B8' }}>{day}</td>
                            <td style={{ textAlign: 'right', color: '#31A24C' }}>{fmtChips(d.in)}</td>
                            <td style={{ textAlign: 'right', color: '#FA383E' }}>{fmtChips(d.out)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: (d.in - d.out) >= 0 ? '#31A24C' : '#FA383E' }}>{fmtChips(d.in - d.out)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </HubErrorBoundary>
  );
}
