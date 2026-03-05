/**
 * Player Achievements Page
 * View all achievements and progress
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { ArrowLeft, Award, Star, Lock, Loader2 } from 'lucide-react';
import SkeletonLoader from '../../../../src/components/ui/SkeletonLoader';

export default function AchievementsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) router.push('/auth/login?redirect=/hub/commander/profile/achievements');
  }, [router]);

  const { data: swrData, isLoading: loading } = useSWR('/api/commander/profile', (url) => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) return null;
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => d.success ? (d.data?.achievements || []) : []);
  });
  const achievements = swrData || [];

  const unlocked = achievements.filter(a => a.unlocked);
  const locked = achievements.filter(a => !a.unlocked);
  const filtered = filter === 'unlocked' ? unlocked : filter === 'locked' ? locked : achievements;

  if (isLoading || loading) return <div style={{ padding: 40 }}><SkeletonLoader variant="card" count={4} /></div>;

  return (
    <>
      <SEOHead
                title="Player Achievements"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />
      <div className="cmd-page" style={{ fontFamily: 'Inter, sans-serif' }}>
        <header className="cmd-header-bar">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-4">
            <button onClick={() => router.push('/hub/commander/profile')} className="p-2 rounded-lg hover:bg-[#132240]">
              <ArrowLeft size={20} className="text-[#64748B]" />
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Achievements</h1>
              <p className="text-xs text-[#64748B]">{unlocked.length}/{achievements.length} unlocked</p>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {/* Progress Bar */}
          <div className="cmd-panel p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#64748B]">Progress</span>
              <span className="text-sm font-medium text-[#22D3EE]">
                {achievements.length > 0 ? Math.round((unlocked.length / achievements.length) * 100) : 0}%
              </span>
            </div>
            <div className="w-full h-3 bg-[#0B1426] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-[#22D3EE] transition-all"
                style={{ width: `${achievements.length > 0 ? (unlocked.length / achievements.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Filter */}
          <div className="flex gap-2">
            {[
              { key: 'all', label: `All (${achievements.length})` },
              { key: 'unlocked', label: `Unlocked (${unlocked.length})` },
              { key: 'locked', label: `Locked (${locked.length})` }
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filter === f.key
                    ? 'bg-[#22D3EE]/20 text-[#22D3EE] border border-[#22D3EE]/30'
                    : 'text-[#64748B] border border-[#4A5E78] hover:border-[#64748B]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Achievement List */}
          <div className="space-y-2">
            {filtered.map(achievement => {
              const isUnlocked = achievement.unlocked;
              return (
                <div
                  key={achievement.id}
                  className={`cmd-panel p-4 flex items-center gap-4 ${!isUnlocked ? 'opacity-60' : ''}`}
                >
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
                      isUnlocked
                        ? 'bg-[#F59E0B] border-[#F59E0B]'
                        : 'bg-[#132240] border-[#4A5E78]'
                    }`}
                  >
                    {isUnlocked ? (
                      <Award size={24} className="text-white" />
                    ) : (
                      <Lock size={20} className="text-[#64748B]" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`font-medium ${isUnlocked ? 'text-white' : 'text-[#64748B]'}`}>
                        {achievement.name}
                      </p>
                      {isUnlocked && <Star size={14} className="text-[#F59E0B] fill-[#F59E0B]" />}
                    </div>
                    <p className="text-sm text-[#64748B]">{achievement.description}</p>
                    {achievement.progress !== undefined && !isUnlocked && (
                      <div className="mt-2">
                        <div className="w-full h-1.5 bg-[#0B1426] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#4A5E78]"
                            style={{ width: `${Math.min(achievement.progress, 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-[#4A5E78] mt-1">{achievement.progress}% complete</p>
                      </div>
                    )}
                  </div>
                  {isUnlocked && achievement.unlocked_at && (
                    <p className="text-xs text-[#4A5E78] flex-shrink-0">
                      {new Date(achievement.unlocked_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="cmd-panel p-8 text-center">
                <Award size={40} className="mx-auto text-[#4A5E78] mb-2" />
                <p className="text-[#64748B]">No Achievements Found</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
