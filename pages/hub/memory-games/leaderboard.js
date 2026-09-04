import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Medal, RefreshCw, ShieldCheck, Target } from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import PreflopSubpageShell from '../../../src/components/memory-games/PreflopSubpageShell';
import PreflopTabRail from '../../../src/components/memory-games/PreflopTabRail';
import ResponsiveTable from '../../../src/components/ui/ResponsiveTable';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { accuracyToPercent } from '../../../src/lib/preflopRangeLab';
import { supabase } from '../../../src/lib/supabase';

const GAME_MODES = [
  { key: 'range', label: 'Range Lab' },
  { key: 'speed_drill', label: 'Speed Drill' },
  { key: 'pressure_cooker', label: 'Pressure' },
  { key: 'pattern_recognition', label: 'Patterns' },
  { key: 'mixed_strategy', label: 'Mixed' },
  { key: 'spot_trainer', label: 'Spot Trainer' },
  { key: 'tournament', label: 'Tournament' },
];

function formatTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  return `${Math.floor(total / 60)}:${Math.floor(total % 60).toString().padStart(2, '0')}`;
}

const rankingColumns = [
  { key: 'rank', label: 'Rank', render: (row) => <strong>#{row.rank}</strong> },
  { key: 'player', label: 'Player', render: (row) => <>{row.profiles?.username || 'Anonymous player'}{row.current && <span className="preflop-ranking-you">YOU</span>}</> },
  { key: 'level', label: 'Level', align: 'right', render: (row) => `L${row.level || 1}` },
  { key: 'score', label: 'Score', align: 'right', render: (row) => Number(row.score || 0).toLocaleString() },
  { key: 'accuracy', label: 'Accuracy', align: 'right', render: (row) => `${accuracyToPercent(row.accuracy, row.score).toFixed(1)}%` },
  { key: 'time', label: 'Time', align: 'right', render: (row) => <span className="preflop-ranking-time"><Clock3 size={13} aria-hidden />{formatTime(row.time_taken)}</span> },
  {
    key: 'perfect',
    label: 'Perfect',
    align: 'right',
    render: (row) => ((row.perfect_game || accuracyToPercent(row.accuracy, row.score) >= 99.5)
      ? <span className="preflop-ranking-perfect"><ShieldCheck size={16} aria-hidden /> Yes</span>
      : <span className="preflop-ranking-perfect" style={{ color: '#7590a1' }}>No</span>),
  },
];

export default function MemoryGamesLeaderboard() {
  useTrainingBus('preflop-charts-leaderboard');
  const { user } = useAvatar();
  const [selectedMode, setSelectedMode] = useState('range');
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('memory_leaderboards')
        .select(`id,user_id,game_mode,level,score,accuracy,time_taken,perfect_game,created_at,profiles:user_id(username,avatar_url)`)
        .eq('game_mode', selectedMode)
        .order('score', { ascending: false })
        .order('time_taken', { ascending: true, nullsFirst: false })
        .limit(50);
      if (queryError) throw queryError;
      setLeaderboard(data || []);
    } catch (queryError) {
      console.warn('[PreflopLeaderboard] Fetch failed:', queryError?.message || queryError);
      setLeaderboard([]);
      setError('Rankings could not be loaded. Refresh the board or try another mode.');
    } finally {
      setLoading(false);
    }
  }, [selectedMode]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  useEffect(() => {
    const channel = supabase
      .channel(`preflop-leaderboard:${selectedMode}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_leaderboards', filter: `game_mode=eq.${selectedMode}` }, fetchLeaderboard)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchLeaderboard, selectedMode]);

  const userRank = useMemo(() => {
    const index = leaderboard.findIndex((entry) => entry.user_id === user?.id);
    return index >= 0 ? index + 1 : null;
  }, [leaderboard, user?.id]);
  const podium = leaderboard.slice(0, 3);

  return (
    <>
      <SEOHead title="Preflop Charts Leaderboard" description="Live Smarter.Poker Preflop Charts rankings by training mode." canonical="/hub/preflop-charts/leaderboard" />
      <PreflopSubpageShell eyebrow="GLOBAL SIGNAL // LIVE RANKINGS" title="Range command ranks" description="Compare verified personal-best results across every Preflop Charts training mode." metric={leaderboard.length ? `TOP ${leaderboard.length}` : 'LIVE'}>
        <PreflopTabRail items={GAME_MODES} selected={selectedMode} onSelect={setSelectedMode} ariaLabel="Leaderboard game mode" />

        {userRank && <div className="preflop-user-rank"><Target size={20} aria-hidden /><span><small>YOUR CURRENT POSITION</small><strong>#{userRank} In {GAME_MODES.find((mode) => mode.key === selectedMode)?.label}</strong></span></div>}
        {error && <div className="preflop-subpage-error" role="alert"><span>{error}</span><button type="button" onClick={fetchLeaderboard}><RefreshCw size={15} aria-hidden /> Refresh</button></div>}

        {!loading && podium.length > 0 && <section className="preflop-podium" aria-label="Top three players">
          {podium.map((entry, index) => <article key={entry.id} data-rank={index + 1}><Medal size={22} aria-hidden /><span>0{index + 1}</span><h2>{entry.profiles?.username || 'Anonymous player'}</h2><strong>{Number(entry.score || 0).toLocaleString()}</strong><small>{accuracyToPercent(entry.accuracy, entry.score).toFixed(1)}% Accuracy</small></article>)}
        </section>}

        <section className="preflop-subpage-panel" aria-labelledby="ranking-table-title">
          <div className="preflop-panel-heading"><div><span>TOP 50 // PERSONAL BESTS</span><h2 id="ranking-table-title">Live Ranking Board</h2></div><button type="button" onClick={fetchLeaderboard} disabled={loading} aria-label="Refresh leaderboard"><RefreshCw size={16} aria-hidden /></button></div>
          {loading ? <div className="preflop-subpage-loading">Synchronizing Rankings…</div> : leaderboard.length === 0 ? <div className="preflop-subpage-empty"><TrophyIcon /><h3>No Verified Entries Yet</h3><p>Complete This Mode To Establish The First Personal Best.</p></div> : (
            <div className="preflop-ranking-board">
              {/* Mobile phase 2: a real table above 768px, one labelled card per
                  row at or below it (ResponsiveTable), never a sideways scroll. */}
              <ResponsiveTable
                columns={rankingColumns}
                rows={leaderboard.map((entry, index) => ({ ...entry, rank: index + 1, current: entry.user_id === user?.id }))}
                keyField="id"
                caption="Live ranking board"
              />
            </div>
          )}
        </section>
      </PreflopSubpageShell>
    </>
  );
}

function TrophyIcon() { return <Medal size={28} aria-hidden />; }
