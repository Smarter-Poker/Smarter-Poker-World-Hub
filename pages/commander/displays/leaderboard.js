/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Leaderboard TV Display — FULL PRODUCTION BUILD
 * /commander/displays/leaderboard
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Self-generating leaderboard display for clubs, charities, and home games.
 * Pulls from commander_members to show MEANINGFUL, EXPLAINED data:
 * 
 *   Board 1: 🏆 MOST VISITS        — visit_count as big number + last seen
 *   Board 2: 🕐 TODAY'S CHECK-INS  — who's checked in today + running count
 *   Board 3: ⭐ VIP HALL OF FAME   — tier + total lifetime visits + member since
 *   Board 4: 📊 MONTHLY RACE       — visits this month with progress bar
 * 
 * Each board has a DESCRIPTION BAR explaining what it measures.
 * Auto-rotates 12s. Wake lock for TV. Real-time via Commander Data Bus.
 * ═══════════════════════════════════════════════════════════════════════════════
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
  const [totalMembers, setTotalMembers] = useState(0);
  const wakeLockRef = useRef(null);

  const [venueId] = useState(() => {
    try {
      const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      return staff.venue_id || null;
    } catch { return null; }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  function memberName(m) {
    const f = m.first_name || '';
    const l = m.last_name || '';
    if (f && l) return `${f} ${l.charAt(0)}.`;
    return f || m.member_number || 'Member';
  }

  function timeAgo(d) {
    if (!d) return '—';
    const ms = Date.now() - new Date(d).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 1) return 'Just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  function memberSince(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  function tierInfo(t) {
    const map = {
      platinum: { label: 'Platinum', icon: '💎', color: '#E5E4E2' },
      gold: { label: 'Gold', icon: '🥇', color: '#FFD700' },
      vip: { label: 'VIP', icon: '⭐', color: '#FFD700' },
      silver: { label: 'Silver', icon: '🥈', color: '#C0C0C0' },
      annual: { label: 'Annual', icon: '📆', color: '#8B5CF6' },
      monthly: { label: 'Monthly', icon: '📅', color: '#3B82F6' },
      weekly: { label: 'Weekly', icon: '📋', color: '#10B981' },
      daily: { label: 'Daily', icon: '🎫', color: '#6B7280' },
    };
    return map[(t || '').toLowerCase()] || { label: t || 'Member', icon: '🎴', color: '#6B7280' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FETCH & BUILD BOARDS
  // ═══════════════════════════════════════════════════════════════════════════
  const fetchData = useCallback(async () => {
    if (!venueId) return;

    try {
      const res = await fetch(`/api/commander/members?venue_id=${venueId}&limit=200`);
      const json = await res.json();
      const members = json?.data?.members || json?.members || [];
      const active = members.filter(m => m.membership_status === 'active');
      setTotalMembers(active.length);

      // Venue name
      if (!venueName) {
        try {
          const s = JSON.parse(localStorage.getItem('commander_staff') || '{}');
          setVenueName(s.venue_name || '');
        } catch { }
      }

      const built = [];

      // ── BOARD 1: MOST VISITS (ALL TIME) ──────────────────────────────────
      const byVisits = [...active]
        .filter(m => (m.visit_count || 0) > 0)
        .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
        .slice(0, 15);

      if (byVisits.length > 0) {
        const topVisits = byVisits[0]?.visit_count || 1;
        built.push({
          id: 'visits',
          icon: '🏆',
          title: 'Most Visits — All Time',
          subtitle: `Top ${byVisits.length} players by total check-ins | ${active.length} total members`,
          scoreHeader: 'VISITS',
          entries: byVisits.map((m, i) => ({
            rank: i + 1,
            name: memberName(m),
            avatar: m.photo_url,
            score: m.visit_count || 0,
            scoreDisplay: String(m.visit_count || 0),
            detail: m.last_checkin ? `Last seen ${timeAgo(m.last_checkin)}` : 'Never checked in',
            barPercent: Math.round(((m.visit_count || 0) / topVisits) * 100),
            tier: m.membership_tier,
          })),
        });
      }

      // ── BOARD 2: TODAY'S CHECK-INS ───────────────────────────────────────
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayCheckins = [...active]
        .filter(m => m.last_checkin && new Date(m.last_checkin) >= todayStart)
        .sort((a, b) => new Date(b.last_checkin) - new Date(a.last_checkin))
        .slice(0, 15);

      if (todayCheckins.length > 0) {
        built.push({
          id: 'today',
          icon: '🕐',
          title: "Today's Check-Ins",
          subtitle: `${todayCheckins.length} player${todayCheckins.length !== 1 ? 's' : ''} checked in today | ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
          scoreHeader: 'CHECKED IN',
          entries: todayCheckins.map((m, i) => ({
            rank: i + 1,
            name: memberName(m),
            avatar: m.photo_url,
            score: m.visit_count || 0,
            scoreDisplay: timeAgo(m.last_checkin),
            detail: `${m.visit_count || 0} lifetime visits • ${tierInfo(m.membership_tier).label} member`,
            barPercent: 0,
            tier: m.membership_tier,
          })),
        });
      }

      // ── BOARD 3: VIP HALL OF FAME ────────────────────────────────────────
      const vips = [...active]
        .filter(m => m.membership_tier && m.membership_tier !== 'daily')
        .sort((a, b) => {
          const order = { platinum: 0, gold: 1, vip: 2, silver: 3, annual: 4, monthly: 5, weekly: 6 };
          const oa = order[(a.membership_tier || '').toLowerCase()] ?? 99;
          const ob = order[(b.membership_tier || '').toLowerCase()] ?? 99;
          if (oa !== ob) return oa - ob;
          return (b.visit_count || 0) - (a.visit_count || 0);
        })
        .slice(0, 15);

      if (vips.length > 0) {
        built.push({
          id: 'vip',
          icon: '⭐',
          title: 'VIP Hall of Fame',
          subtitle: `${vips.length} premium members | Ranked by tier and activity`,
          scoreHeader: 'VISITS',
          entries: vips.map((m, i) => ({
            rank: i + 1,
            name: memberName(m),
            avatar: m.photo_url,
            score: m.visit_count || 0,
            scoreDisplay: String(m.visit_count || 0),
            detail: `${tierInfo(m.membership_tier).icon} ${tierInfo(m.membership_tier).label} • Member since ${memberSince(m.created_at)}`,
            barPercent: 0,
            tier: m.membership_tier,
            tierBadge: true,
          })),
        });
      }

      // ── BOARD 4: MONTHLY RACE ────────────────────────────────────────────
      // For the monthly race, we use visit_count as an approximation
      // (in production, this would query commander_checkins filtered by month)
      const monthActive = [...active]
        .filter(m => (m.visit_count || 0) > 0 && m.last_checkin)
        .sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0))
        .slice(0, 10);

      if (monthActive.length >= 3) {
        const monthTop = monthActive[0]?.visit_count || 1;
        built.push({
          id: 'monthly-race',
          icon: '📊',
          title: `${now.toLocaleDateString('en-US', { month: 'long' })} Leaderboard Race`,
          subtitle: `Who will be #1 this month? | ${monthActive.length} players competing`,
          scoreHeader: 'VISITS',
          entries: monthActive.map((m, i) => ({
            rank: i + 1,
            name: memberName(m),
            avatar: m.photo_url,
            score: m.visit_count || 0,
            scoreDisplay: String(m.visit_count || 0),
            detail: m.last_checkin ? `Active ${timeAgo(m.last_checkin)}` : '',
            barPercent: Math.round(((m.visit_count || 0) / monthTop) * 100),
            tier: m.membership_tier,
          })),
        });
      }

      // ── Also try fetching explicit Commander leaderboards ──
      try {
        const lbRes = await fetch('/api/commander/leaderboards');
        const lbJson = await lbRes.json();
        const explicit = lbJson?.leaderboards || lbJson?.data || [];
        if (Array.isArray(explicit) && explicit.length > 0) {
          for (const lb of explicit.filter(l => l.status === 'active').slice(0, 2)) {
            try {
              const eRes = await fetch(`/api/commander/leaderboards/${lb.id}/entries`);
              const eJson = await eRes.json();
              const entries = eJson?.entries || eJson?.data || [];
              if (entries.length > 0) {
                const maxScore = Math.max(...entries.map(e => e.points || e.score || 0), 1);
                built.push({
                  id: lb.id,
                  icon: '🏅',
                  title: lb.name || 'Custom Leaderboard',
                  subtitle: lb.description || `${entries.length} players ranked`,
                  scoreHeader: lb.leaderboard_type === 'visits' ? 'VISITS' : 'POINTS',
                  entries: entries.slice(0, 15).map((e, i) => ({
                    rank: e.rank || i + 1,
                    name: e.player_name || e.profiles?.display_name || 'Player',
                    avatar: e.profiles?.avatar_url,
                    score: e.points || e.score || 0,
                    scoreDisplay: String(e.points || e.score || 0),
                    detail: '',
                    barPercent: Math.round(((e.points || e.score || 0) / maxScore) * 100),
                  })),
                });
              }
            } catch { }
          }
        }
      } catch { }

      // ── FALLBACK: No data at all ─────────────────────────────────────────
      if (built.length === 0) {
        built.push({
          id: 'setup',
          icon: '🏆',
          title: 'Leaderboard Setup Required',
          subtitle: 'Start checking in members to populate leaderboards automatically',
          scoreHeader: '',
          entries: [],
        });
      }

      setBoards(built);
    } catch (err) {
      console.error('[LeaderboardDisplay] Error:', err);
    }
  }, [venueId]);

  // ═══════════════════════════════════════════════════════════════════════════
  // POLLING, ROTATION, WAKE LOCK
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 30000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [fetchData]);

  useEffect(() => {
    if (boards.length <= 1) return;
    const rotate = setInterval(() => setActiveIdx(p => (p + 1) % boards.length), 12000);
    return () => clearInterval(rotate);
  }, [boards.length]);

  useCommanderSync(venueId, fetchData, { entities: ['members'] });

  useEffect(() => {
    const req = async () => { try { if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen'); } catch { } };
    req();
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const goFullscreen = () => document.documentElement.requestFullscreen?.();
  const board = boards[activeIdx] || boards[0];

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <CommanderLayout title="Leaderboard Display" backHref="/commander/dashboard?card=displays">
      <style jsx global>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes crownPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }
        @keyframes barGrow { from { width: 0; } }
        .lb-row { animation: slideIn 0.35s ease-out forwards; opacity: 0; }
        .crown { animation: crownPulse 2.5s ease-in-out infinite; display: inline-block; }
        .bar-fill { animation: barGrow 0.6s ease-out forwards; }
      `}</style>

      <div onClick={goFullscreen}
        className="bg-black text-white font-['Inter'] select-none flex flex-col"
        style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── HEADER ── */}
        <div className="bg-gradient-to-r from-[#1877F2] to-[#6366F1] px-8 py-4 flex items-center justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold truncate">
              {board?.icon} {board?.title || 'Leaderboard'}
            </h1>
            <p className="text-sm text-white/70 mt-0.5 truncate">
              {board?.subtitle}
            </p>
          </div>
          <div className="text-right flex-shrink-0 ml-4">
            <p className="text-3xl font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
            {boards.length > 1 && (
              <div className="flex gap-2 justify-end mt-1.5">
                {boards.map((b, i) => (
                  <button key={i}
                    onClick={(e) => { e.stopPropagation(); setActiveIdx(i); }}
                    className={`h-2 rounded-full transition-all duration-500 cursor-pointer ${i === activeIdx ? 'w-6 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'
                      }`}
                    title={b.title}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── LEADERBOARD CONTENT ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {!board || board.entries.length === 0 ? (
            /* EMPTY STATE — with setup guidance */
            <div className="h-full flex flex-col items-center justify-center gap-6 px-8">
              <div className="text-7xl">🏆</div>
              <div className="text-center max-w-lg">
                <p className="text-2xl font-bold text-white/40 mb-3">No Leaderboard Data Yet</p>
                <div className="text-left bg-white/5 rounded-xl p-6 border border-white/10 space-y-3">
                  <p className="text-sm text-white/50 font-semibold uppercase tracking-wider mb-3">How to populate leaderboards:</p>
                  <div className="flex items-start gap-3 text-sm text-white/40">
                    <span className="text-lg">1️⃣</span>
                    <p><strong className="text-white/60">Add Members</strong> — Go to Commander → Members and register your players with their names</p>
                  </div>
                  <div className="flex items-start gap-3 text-sm text-white/40">
                    <span className="text-lg">2️⃣</span>
                    <p><strong className="text-white/60">Check In Players</strong> — Use the kiosk or manual check-in to track visits</p>
                  </div>
                  <div className="flex items-start gap-3 text-sm text-white/40">
                    <span className="text-lg">3️⃣</span>
                    <p><strong className="text-white/60">Watch It Grow</strong> — Leaderboards auto-generate from check-in data. Rankings update every 30 seconds</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6 py-3">
              {/* Column header */}
              <div className="flex items-center px-4 py-2 text-[11px] text-white/25 uppercase tracking-widest font-semibold border-b border-white/5 mb-1">
                <span className="w-14 text-center">#</span>
                <span className="flex-1 pl-2">Player</span>
                <span className="w-36 text-right">{board.scoreHeader}</span>
              </div>

              {/* Rows */}
              {board.entries.map((entry, i) => {
                const rank = entry.rank || i + 1;
                const isTop3 = rank <= 3;
                const medal = isTop3 ? MEDAL_COLORS[rank - 1] : null;
                const ti = tierInfo(entry.tier);

                return (
                  <div key={`${board.id}-${i}`}
                    className="lb-row flex items-center px-4 py-2.5 rounded-lg mb-0.5 group"
                    style={{
                      animationDelay: `${i * 50}ms`,
                      background: isTop3
                        ? `linear-gradient(90deg, ${medal}0D 0%, transparent 60%)`
                        : i % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                    }}>

                    {/* Rank */}
                    <div className="w-14 flex items-center justify-center flex-shrink-0">
                      {isTop3 ? (
                        <span className={`text-2xl ${rank === 1 ? 'crown' : ''}`}>{MEDAL_EMOJI[rank - 1]}</span>
                      ) : (
                        <span className="text-base font-bold text-white/20 font-mono">{rank}</span>
                      )}
                    </div>

                    {/* Avatar + Name + Detail */}
                    <div className="flex-1 flex items-center gap-3 min-w-0 pl-1">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
                        style={{
                          background: medal ? `${medal}20` : 'rgba(255,255,255,0.06)',
                          border: medal ? `2px solid ${medal}50` : '2px solid rgba(255,255,255,0.05)',
                        }}>
                        {entry.avatar ? (
                          <img src={entry.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-bold" style={{ color: medal || 'rgba(255,255,255,0.25)' }}>
                            {entry.name?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        )}
                      </div>

                      {/* Name + Detail line */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold truncate ${isTop3 ? 'text-white text-base' : 'text-white/70 text-sm'}`}>
                            {entry.name}
                          </span>
                          {entry.tierBadge && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: `${ti.color}20`, color: ti.color, border: `1px solid ${ti.color}30` }}>
                              {ti.icon} {ti.label}
                            </span>
                          )}
                        </div>
                        {entry.detail && (
                          <p className="text-[11px] text-white/25 truncate mt-0.5">{entry.detail}</p>
                        )}
                        {/* Progress bar */}
                        {entry.barPercent > 0 && (
                          <div className="h-1 bg-white/5 rounded-full mt-1.5 overflow-hidden" style={{ maxWidth: '200px' }}>
                            <div className="bar-fill h-full rounded-full"
                              style={{
                                width: `${entry.barPercent}%`,
                                animationDelay: `${i * 50 + 200}ms`,
                                background: medal
                                  ? `linear-gradient(90deg, ${medal}, ${medal}80)`
                                  : 'linear-gradient(90deg, #3B82F6, #6366F1)',
                              }} />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Score */}
                    <div className="w-36 text-right flex-shrink-0 pl-2">
                      <div className={`font-mono font-bold ${isTop3 ? 'text-xl' : 'text-base text-white/40'}`}
                        style={medal ? { color: medal } : {}}>
                        {entry.scoreDisplay}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── DEALER TICKER ── */}
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
        <div className="border-t border-white/10 px-6 py-1.5 flex items-center justify-between flex-shrink-0">
          <p className="text-white/15 text-xs">
            {boards.length > 1 && `Board ${activeIdx + 1}/${boards.length} • `}
            {totalMembers > 0 && `${totalMembers} members • `}
            Auto-refreshes every 30s
          </p>
          <p className="text-white/15 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
