import { useCallback, useEffect, useState } from 'react';
import { Award, Check, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import PreflopSubpageShell from '../../../src/components/memory-games/PreflopSubpageShell';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { supabase } from '../../../src/lib/supabase';

const CATEGORIES = [
  ['all', 'All'], ['basics', 'Basics'], ['mastery', 'Mastery'], ['speed', 'Speed'], ['progress', 'Progress'], ['consistency', 'Streaks'], ['economy', 'Economy'], ['games', 'Games'], ['ai', 'AI'], ['challenges', 'Challenges'],
];

const ACHIEVEMENT_CATALOG = [
  { key: 'first_game', name: 'First Signal', description: 'Complete your first Preflop Charts drill.', code: '01', category: 'basics' },
  { key: 'perfect_memory', name: 'Exact Range', description: 'Complete a range with 100% accuracy.', code: 'AA', category: 'mastery' },
  { key: 'speed_demon', name: 'Fast Fold', description: 'Complete a Speed Drill in under 60 seconds.', code: '60', category: 'speed' },
  { key: 'level_5', name: 'Mid Circuit', description: 'Master and open Level 5.', code: 'L5', category: 'progress' },
  { key: 'level_10', name: 'Full Circuit', description: 'Master and open Level 10.', code: 'LX', category: 'progress' },
  { key: 'streak_7', name: 'Seven-Day Read', description: 'Train for seven consecutive days.', code: '7D', category: 'consistency' },
  { key: 'diamond_1000', name: 'Diamond Run', description: 'Earn 1,000 diamonds from training.', code: '1K', category: 'economy' },
  { key: 'games_100', name: 'Range Veteran', description: 'Complete 100 verified training sessions.', code: 'C', category: 'games' },
  { key: 'grok_25', name: 'Solver Channel', description: 'Complete 25 deterministic solver scenarios.', code: 'AI', category: 'ai' },
];

export default function MemoryGamesAchievements() {
  useTrainingBus('preflop-charts-achievements');
  const { user } = useAvatar();
  const [achievements, setAchievements] = useState(ACHIEVEMENT_CATALOG);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAchievements = useCallback(async () => {
    setLoading(true); setError('');
    if (!user?.id) { setAchievements(ACHIEVEMENT_CATALOG); setLoading(false); return; }
    try {
      const { data, error: rpcError } = await supabase.rpc('get_user_achievements', { p_user_id: user.id });
      if (rpcError) throw rpcError;
      const rows = Array.isArray(data) ? data : [];
      const byKey = new Map(rows.map((item) => [item.key || item.achievement_key, item]));
      const catalogKeys = new Set(ACHIEVEMENT_CATALOG.map((item) => item.key));
      setAchievements([
        ...ACHIEVEMENT_CATALOG.map((item) => ({ ...item, ...(byKey.get(item.key) || {}) })),
        ...rows.filter((item) => !catalogKeys.has(item.key || item.achievement_key)),
      ]);
    } catch (fetchError) {
      console.warn('[PreflopAchievements] Fetch failed:', fetchError?.message || fetchError);
      setAchievements(ACHIEVEMENT_CATALOG);
      setError('Unlock status could not be synchronized. The achievement catalog is still available.');
    } finally { setLoading(false); }
  }, [user?.id]);

  useEffect(() => { fetchAchievements(); }, [fetchAchievements]);
  const filtered = selectedCategory === 'all' ? achievements : achievements.filter((item) => item.category === selectedCategory);
  const unlocked = achievements.filter((item) => item.unlocked).length;
  const percent = achievements.length ? Math.round((unlocked / achievements.length) * 100) : 0;
  const nextLocked = achievements.find((item) => !item.unlocked);

  return (
    <>
      <SEOHead title="Preflop Charts Achievements" description="Track verified Preflop Charts milestones and mastery awards." canonical="/hub/preflop-charts/achievements" />
      <PreflopSubpageShell eyebrow="AWARD VAULT // PLAYER MILESTONES" title="Range distinctions" description="Permanent records for precision, consistency, speed, and progression." metric={`${percent}%`}>
        <section className="preflop-award-progress" aria-label={`${unlocked} of ${achievements.length} achievements unlocked`}>
          <ShieldCheck size={28} aria-hidden /><div><small>VAULT COMPLETION</small><strong>{unlocked} / {achievements.length} unlocked</strong><div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><i style={{ '--award-progress': `${percent}%` }} /></div></div>{nextLocked && <span>Next target<strong>{nextLocked.name}</strong></span>}
        </section>
        {error && <div className="preflop-subpage-error" role="alert"><span>{error}</span><button type="button" onClick={fetchAchievements}><RefreshCw size={15} aria-hidden /> Retry</button></div>}
        <div className="preflop-mode-rail" role="tablist" aria-label="Achievement category">
          {CATEGORIES.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={selectedCategory === key} onClick={() => setSelectedCategory(key)}>{label}</button>)}
        </div>
        {loading ? <div className="preflop-subpage-loading">Synchronizing award vault…</div> : <section className="preflop-award-grid" aria-label="Achievements">
          {filtered.map((item, index) => <article key={item.key || `${item.name}-${index}`} data-unlocked={item.unlocked || undefined}>
            <div className="preflop-award-code"><span>{item.code || String(index + 1).padStart(2, '0')}</span>{item.unlocked ? <Check size={15} aria-label="Unlocked" /> : <LockKeyhole size={14} aria-label="Locked" />}</div>
            <Award size={19} aria-hidden /><small>{(item.category || 'achievement').toUpperCase()}</small><h2>{item.name}</h2><p>{item.description}</p>
            {item.unlocked_at && <time dateTime={item.unlocked_at}>Unlocked {new Date(item.unlocked_at).toLocaleDateString()}</time>}
          </article>)}
        </section>}
      </PreflopSubpageShell>
    </>
  );
}
