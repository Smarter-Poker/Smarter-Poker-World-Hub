/**
 * Leaderboard TV Display — FULLY BUILT OUT
 * /commander/displays/leaderboard
 * 
 * Full-screen TV display showing player leaderboards.
 * Auto-generates leaderboard boards from commander_members data:
 *   - 🏆 Most Visits — top players by visit_count
 *   - ⭐ VIP Members — premium tier members with highest activity
 *   - 🕐 Recent Check-Ins — most recently checked in players
 *   - 📊 Custom Leaderboards — from commander_leaderboards table
 * 
 * Auto-rotates boards every 12 seconds. Wake lock for TV displays.
 * Works for Clubs, Charities, and Home Games.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync } from '../../../src/lib/commander/useCommanderSync';
import DealerTicker from '../../../src/components/commander/shared/DealerTicker';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];

export default function LeaderboardDisplay() {
  const [boards, setBoards] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [now, setNow] = useState(new Date());
  const [venueName, setVenueName] = useState('');
  const wakeLockRef = useRef(null);

  const [venueId] = useState(() => {
    try {
      const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      return staff.venue_id || null;
    } catch { return null; }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH & BUILD LEADERBOARDS FROM REAL DATA
  // ═══════════════════════════════════════════════════════════════════════════
  const fetchData = useCallback(async () => {
    if (!venueId) return;

    try {
      // ── 1. Fetch members with visit data ──
      const membersRes = await fetch(`/api/commander/members?venue_id=${venueId}&limit=100`);
      const membersJson = await membersRes.json();
      const allMembers = membersJson?.data?.members || membersJson?.members || [];

      // Store venue name
      if (allMembers.length > 0 && !venueName) {
        try {
          const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
          setVenueName(staff.venue_name || '');
        } catch { }
      }

      const generatedBoards = [];

      // ── BOARD 1: Most Visits (All Time) ──
      const visitSorted = [...allMembers]
        .filter(m => (m.visit_count || 0) > 0 && m.membership_status === 'active')
        .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
        .slice(0, 15);

      if (visitSorted.length > 0) {
        generatedBoards.push({
          id: 'auto-visits',
          name: '🏆 Most Visits — All Time',
          type: 'visits',
          description: 'Players with the most check-ins',
          entries: visitSorted.map((m, i) => ({
            id: m.id,
            rank: i + 1,
            player_name: formatMemberName(m),
            score: m.visit_count || 0,
            label: `${m.visit_count || 0} visits`,
            avatar: m.photo_url || null,
            tier: m.membership_tier,
            lastCheckin: m.last_checkin,
          })),
        });
      }

      // ── BOARD 2: Recent Check-Ins (Today's Activity) ──
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const recentCheckins = [...allMembers]
        .filter(m => m.last_checkin && new Date(m.last_checkin) >= today && m.membership_status === 'active')
        .sort((a, b) => new Date(b.last_checkin) - new Date(a.last_checkin))
        .slice(0, 15);

      if (recentCheckins.length > 0) {
        generatedBoards.push({
          id: 'auto-today',
          name: '🕐 Today\'s Players',
          type: 'recent',
          description: 'Players checked in today',
          entries: recentCheckins.map((m, i) => ({
            id: m.id,
            rank: i + 1,
            player_name: formatMemberName(m),
            score: m.visit_count || 0,
            label: formatTimeAgo(m.last_checkin),
            avatar: m.photo_url || null,
            tier: m.membership_tier,
          })),
        });
      }

      // ── BOARD 3: VIP Members ──
      const vipMembers = [...allMembers]
        .filter(m => m.membership_tier && m.membership_tier !== 'daily' && m.membership_status === 'active')
        .sort((a, b) => {
          const tierOrder = { platinum: 0, gold: 1, vip: 2, silver: 3, monthly: 4, annual: 5, weekly: 6 };
          const aOrder = tierOrder[a.membership_tier?.toLowerCase()] ?? 99;
          const bOrder = tierOrder[b.membership_tier?.toLowerCase()] ?? 99;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return (b.visit_count || 0) - (a.visit_count || 0);
        })
        .slice(0, 15);

      if (vipMembers.length > 0) {
        generatedBoards.push({
          id: 'auto-vip',
          name: '⭐ VIP Members',
          type: 'vip',
          description: 'Premium members of the club',
          entries: vipMembers.map((m, i) => ({
            id: m.id,
            rank: i + 1,
            player_name: formatMemberName(m),
            score: m.visit_count || 0,
            label: formatTier(m.membership_tier),
            avatar: m.photo_url || null,
            tier: m.membership_tier,
          })),
        });
      }

      // ── BOARD 4: Monthly Visit Leaders ──
      // Check-ins from this month
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthlyCheckins = [...allMembers]
        .filter(m => m.last_checkin && new Date(m.last_checkin) >= monthStart && (m.visit_count || 0) > 0 && m.membership_status === 'active')
        .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
        .slice(0, 15);

      if (monthlyCheckins.length >= 3) {
        generatedBoards.push({
          id: 'auto-monthly',
          name: `📊 ${now.toLocaleDateString('en-US', { month: 'long' })} Leaders`,
          type: 'monthly',
          description: 'Most active players this month',
          entries: monthlyCheckins.map((m, i) => ({
            id: m.id,
            rank: i + 1,
            player_name: formatMemberName(m),
            score: m.visit_count || 0,
            label: `${m.visit_count || 0} visits`,
            avatar: m.photo_url || null,
            tier: m.membership_tier,
          })),
        });
      }

      // ── 2. Also try fetching explicit Commander leaderboards ──
      try {
        const lbRes = await fetch('/api/commander/leaderboards');
        const lbJson = await lbRes.json();
        const explicitLBs = lbJson?.leaderboards || lbJson?.data || [];

        if (Array.isArray(explicitLBs) && explicitLBs.length > 0) {
          for (const lb of explicitLBs.slice(0, 3)) {
            try {
              const entriesRes = await fetch(`/api/commander/leaderboards/${lb.id}/entries`);
              const entriesJson = await entriesRes.json();
              const entries = entriesJson?.entries || entriesJson?.data || [];
              if (entries.length > 0) {
                generatedBoards.push({
                  id: lb.id,
                  name: lb.name || 'Leaderboard',
                  type: lb.leaderboard_type || 'points',
                  description: lb.description || '',
                  entries: entries.map((e, i) => ({
                    id: e.id || `${lb.id}-${i}`,
                    rank: e.rank || i + 1,
                    player_name: e.player_name || e.profiles?.display_name || e.profiles?.username || 'Player',
                    score: e.points || e.score || 0,
                    label: `${(e.points || e.score || 0).toLocaleString()} pts`,
                    avatar: e.profiles?.avatar_url || null,
                  }))
                });
              }
            } catch { }
          }
        }
      } catch { }

      // ── 3. If NO boards generated, show a welcome board ──
      if (generatedBoards.length === 0) {
        generatedBoards.push({
          id: 'welcome',
          name: '🏆 Leaderboard',
          type: 'welcome',
          description: 'Check in members to populate leaderboards',
          entries: [],
        });
      }

      setBoards(generatedBoards);
    } catch (err) {
      console.error('[LeaderboardDisplay] Error:', err);
    }
  }, [venueId]);

  // ── HELPER FUNCTIONS ──
  function formatMemberName(m) {
    const first = m.first_name || '';
    const last = m.last_name || '';
    if (first && last) return `${first} ${last.charAt(0)}.`;
    if (first) return first;
    return m.member_number || 'Member';
  }

  function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function formatTier(tier) {
    if (!tier) return 'Member';
    const labels = {
      platinum: '💎 Platinum',
      gold: '🥇 Gold',
      vip: '⭐ VIP',
      silver: '🥈 Silver',
      monthly: '📅 Monthly',
      annual: '📆 Annual',
      weekly: '📋 Weekly',
      daily: 'Daily',
    };
    return labels[tier.toLowerCase()] || tier;
  }

  function getScoreLabel(board) {
    if (board.type === 'visits' || board.type === 'monthly') return 'Visits';
    if (board.type === 'recent') return 'Checked In';
    if (board.type === 'vip') return 'Tier';
    return 'Points';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ROTATION, CLOCK, POLLING
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [fetchData]);

  // Rotate boards every 12 seconds
  useEffect(() => {
    if (boards.length <= 1) return;
    const rotate = setInterval(() => {
      setActiveIdx(prev => (prev + 1) % boards.length);
    }, 12000);
    return () => clearInterval(rotate);
  }, [boards.length]);

  // Commander Data Bus — instant sync
  useCommanderSync(venueId, fetchData, { entities: ['members'] });

  // Wake lock for TV
  useEffect(() => {
    const req = async () => {
      try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch { }
    };
    req();
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const goFullscreen = () => document.documentElement.requestFullscreen?.();
  const current = boards[activeIdx] || boards[0];
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <CommanderLayout title="Leaderboard Display" backHref="/commander/dashboard?card=displays">
      <style jsx global>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes crownPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        @keyframes goldShimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        .lb-row { animation: slideIn 0.3s ease-out forwards; opacity: 0; }
        .crown-pulse { animation: crownPulse 2s ease-in-out infinite; }
      `}</style>

      <div onClick={goFullscreen}
        className="bg-black text-white font-['Inter'] select-none flex flex-col"
        style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── HEADER ── */}
        <div className="bg-gradient-to-r from-[#1877F2] to-[#6366F1] px-8 py-5 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-3xl font-bold">{current?.name || '🏆 Leaderboard'}</h1>
            <p className="text-sm opacity-70">
              {current?.description || monthName}
              {venueName && <span className="ml-3 opacity-50">• {venueName}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
            {boards.length > 1 && (
              <div className="flex gap-1.5 justify-end mt-1">
                {boards.map((_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-full transition-all duration-300 ${i === activeIdx ? 'bg-white scale-125' : 'bg-white/30'}`} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── LEADERBOARD CONTENT ── */}
        <div className="flex-1 overflow-y-auto min-h-0 px-8 py-4">
          {!current || current.entries.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-4">
              <div className="text-6xl opacity-30">🏆</div>
              <p className="text-2xl text-white/30 font-semibold">No Leaderboard Data Yet</p>
              <p className="text-sm text-white/15 max-w-md text-center">
                Check in members at the kiosk or waitlist desk to start tracking visits.
                Leaderboards will automatically generate once players check in.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* Column headers */}
              <div className="flex items-center px-6 py-2 text-xs text-white/30 uppercase tracking-wider border-b border-white/5">
                <span className="w-16">Rank</span>
                <span className="flex-1">Player</span>
                <span className="w-40 text-right">{getScoreLabel(current)}</span>
              </div>

              {/* Entries */}
              {current.entries.map((entry, i) => {
                const rank = entry.rank || i + 1;
                const isTop3 = rank <= 3;
                const medalColor = isTop3 ? MEDAL_COLORS[rank - 1] : null;

                return (
                  <div key={entry.id || i}
                    className="lb-row flex items-center px-6 py-3 rounded-xl"
                    style={{
                      animationDelay: `${i * 60}ms`,
                      background: isTop3
                        ? `linear-gradient(135deg, ${medalColor}12 0%, ${medalColor}05 100%)`
                        : i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
                      borderLeft: isTop3 ? `4px solid ${medalColor}` : '4px solid transparent',
                    }}>

                    {/* Rank */}
                    <span className="w-16 flex items-center justify-center">
                      {isTop3 ? (
                        <span className={`text-2xl ${rank === 1 ? 'crown-pulse' : ''}`}>{MEDAL_EMOJI[rank - 1]}</span>
                      ) : (
                        <span className="text-lg font-bold text-white/25">{rank}</span>
                      )}
                    </span>

                    {/* Avatar + Name */}
                    <div className="flex-1 flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                        style={{
                          background: isTop3
                            ? `linear-gradient(135deg, ${medalColor}40, ${medalColor}20)`
                            : 'rgba(255,255,255,0.08)',
                          border: isTop3 ? `2px solid ${medalColor}60` : '2px solid rgba(255,255,255,0.05)',
                        }}>
                        {entry.avatar ? (
                          <img src={entry.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold" style={{ color: medalColor || 'rgba(255,255,255,0.3)' }}>
                            {entry.player_name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className={`font-semibold truncate ${isTop3 ? 'text-lg text-white' : 'text-base text-white/70'}`}>
                          {entry.player_name}
                        </div>
                        {entry.tier && entry.tier !== 'daily' && current.type !== 'vip' && (
                          <div className="text-xs text-yellow-400/60 mt-0.5">{formatTier(entry.tier)}</div>
                        )}
                      </div>
                    </div>

                    {/* Score / Label */}
                    <span className={`w-40 text-right font-mono font-bold ${isTop3 ? 'text-xl' : 'text-base text-white/40'}`}
                      style={isTop3 ? { color: medalColor } : {}}>
                      {entry.label || entry.score?.toLocaleString() || '0'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── DEALER TICKER — SLOWED DOWN ── */}
        <div className="flex-shrink-0">
          <DealerTicker
            accentColor="#6366F1"
            bgColor="#000"
            fontSize={18}
            borderColor="rgba(255,255,255,0.1)"
            speed={50}
            showBorder={true}
          />
        </div>

        {/* ── FOOTER ── */}
        <div className="border-t border-white/10 px-8 py-2 flex items-center justify-between flex-shrink-0">
          <p className="text-white/15 text-xs">
            {boards.length > 1 ? `Board ${activeIdx + 1} of ${boards.length}` : 'Live Leaderboard'} • Auto-refreshes
          </p>
          <p className="text-white/15 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
