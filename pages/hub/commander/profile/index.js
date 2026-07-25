/**
 * Player Commander Profile Page
 * View personal stats, achievements, and preferences
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import SkeletonLoader from '../../../../src/components/ui/SkeletonLoader';
import { User, Clock, DollarSign, MapPin, Calendar, TrendingUp, Award, Star, ChevronRight, Settings, Bell, History, Gift, Edit2, Globe } from 'lucide-react';
import { supabase } from '../../../../src/lib/supabase';
import { getAuthUser, getAccessToken, useRequireAuth } from '../../../../src/lib/authUtils';
import useTrainingBus from '../../../../src/hooks/useTrainingBus';
import CommanderPageShell from '../../../../src/components/commander/CommanderPageShell';

function StatCard({ icon: Icon, label, value, subtext, color = '#22D3EE' }) {
  return (
    <div className="cmd-panel p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center border-2"
          style={{ backgroundColor: `${color}15`, borderColor: `${color}40` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-sm text-[#64748B]">{label}</p>
          {subtext && <p className="text-xs text-[#64748B]">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

function AchievementBadge({ achievement }) {
  const isUnlocked = achievement.unlocked;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${isUnlocked ? 'bg-[#F59E0B]/10 border border-[#F59E0B]/30' : 'bg-[#0F1C32] border border-[#4A5E78]'}`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${isUnlocked ? 'bg-[#F59E0B] border-[#F59E0B]' : 'bg-[#132240] border-[#4A5E78]'}`}>
        <Award className={`w-6 h-6 ${isUnlocked ? 'text-white' : 'text-[#64748B]'}`} />
      </div>
      <div className="flex-1">
        <p className={`font-medium ${isUnlocked ? 'text-white' : 'text-[#64748B]'}`}>
          {achievement.name}
        </p>
        <p className="text-sm text-[#64748B]">{achievement.description}</p>
      </div>
      {isUnlocked && (
        <Star className="w-5 h-5 text-[#F59E0B] fill-[#F59E0B]" />
      )}
    </div>
  );
}

function FavoriteVenue({ venue, rank }) {
  return (
    <div className="flex items-center gap-3 p-3 cmd-panel">
      <div className="w-8 h-8 rounded-full bg-[#22D3EE]/10 border border-[#22D3EE]/30 flex items-center justify-center">
        <span className="text-sm font-bold text-[#22D3EE]">{rank}</span>
      </div>
      <div className="flex-1">
        <p className="font-medium text-white">{venue.name}</p>
        {/* 2026-07-25 audit fix: favorite_venues rows carry id/name/city/state
            only — show location instead of undefined session counts. */}
        <p className="text-sm text-[#64748B]">
          {venue.sessions != null
            ? `${venue.sessions} sessions`
            : [venue.city, venue.state].filter(Boolean).join(', ') || 'Recent venue'}
        </p>
      </div>
      {venue.hours != null && <p className="text-sm text-[#64748B]">{venue.hours}h</p>}
    </div>
  );
}

export default function PlayerProfilePage() {
  const router = useRouter();

  const [recommendations, setRecommendations] = useState([]);
  const [hasClubPage, setHasClubPage] = useState(null);

  const { checking: authChecking } = useRequireAuth('/hub/commander/profile');
  useTrainingBus('profile');

  const { data: swrData, isLoading: loading, mutate: refreshProfile } = useSWR('/api/commander/profile', async () => {
    const token = getAccessToken();
    if (!token) return null;
    const h = { Authorization: `Bearer ${token}` };
    const [profileRes, statsRes] = await Promise.all([
      fetch('/api/commander/profile', { headers: h }).catch(() => ({ ok: false })),
      fetch('/api/commander/profile/stats', { headers: h }).catch(() => ({ ok: false }))
    ]);
    if (!profileRes.ok) throw new Error(`Request failed (${profileRes.status})`);
    const [profileData, statsData] = await Promise.all([profileRes.json(), statsRes.json()]);
    // Fire AI recommendations in background
    if (profileData.success && profileData.data?.profile?.id) {
      fetch(`/api/commander/ai/recommendations/${profileData.data.profile.id}`, { headers: h })
        .then(r => r.json())
        .then(rec => { if (rec.success) setRecommendations(rec.data?.recommendations || []); })
        .catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
    }
    // 2026-07-25 audit fix: achievements live at data.profile.achievements (not
    // data.achievements), stats come back snake_case (total_sessions,
    // total_hours, ...), and favorite venues ride on the profile — the old
    // reads all resolved to undefined/[]. Guard missing fields to 0/empty.
    const rawStats = statsData.success ? (statsData.data?.stats || null) : null;
    const mappedStats = rawStats ? {
      totalSessions: rawStats.total_sessions ?? 0,
      totalHours: rawStats.total_hours ?? 0,
      totalBuyins: rawStats.total_buyins ?? 0,
      avgSession: (rawStats.total_sessions > 0 && rawStats.total_hours != null)
        ? Math.round((rawStats.total_hours / rawStats.total_sessions) * 10) / 10
        : 0,
      compBalance: rawStats.total_comps_earned ?? 0
    } : null;
    const rawAchievements = profileData.success
      ? (profileData.data?.profile?.achievements || profileData.data?.achievements || [])
      : [];
    return {
      profile: profileData.success ? profileData.data?.profile : null,
      // API only returns earned achievements — mark them unlocked for the UI.
      achievements: rawAchievements.map(a => ({ ...a, unlocked: a.unlocked ?? true })),
      stats: mappedStats,
      favoriteVenues: profileData.success ? (profileData.data?.profile?.favorite_venues || []) : []
    };
  });
  const profile = swrData?.profile || null;
  const achievements = swrData?.achievements || [];
  const stats = swrData?.stats || null;
  const favoriteVenues = swrData?.favoriteVenues || [];

  // Check if user has a club page
  useEffect(() => {
    const _c = new AbortController();

    (async () => {
      try {
        const user = getAuthUser();
        if (user) {
          const res = await fetch(`/api/social/pages?owner_id=${user.id}`);
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const json = await res.json();
          setHasClubPage(json.success && json.data && json.data.length > 0 ? json.data[0].id : false);
        }
      } catch (e) { setHasClubPage(false); }
    })();
    return () => _c.abort();
  }, []);
  // Realtime subscription — live updates
  useEffect(() => {
    if (!profile?.id) return;
    const _ch = supabase
      .channel(`cmd-profile:${profile.id}`)
      // commander_members has no user_id column (venue-scoped membership cards
      // joined by email/phone, not by auth.uid). Subscription removed —
      // refreshProfile is also triggered by other events.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'commander_player_stats', filter: `player_id=eq.${profile.id}` }, () => { refreshProfile(); })
      .subscribe();
    return () => { supabase.removeChannel(_ch); };
  }, [profile?.id, refreshProfile]);

  const menuItems = [
    { href: hasClubPage ? `/hub/social-media?viewPage=${hasClubPage}` : '/hub/social-media?createPage=true', label: hasClubPage ? 'Club Page' : 'Create Club Page', icon: Globe },
    { href: '/hub/commander/history', label: 'Session History', icon: History },
    { href: '/hub/commander/rewards', label: 'Rewards & Comps', icon: Gift },
    { href: '/hub/commander/notifications', label: 'Notifications', icon: Bell },
    { href: '/hub/commander/profile/settings', label: 'Settings', icon: Settings }
  ];

  if (loading) return <div style={{ padding: 40 }}><SkeletonLoader variant="profile" count={1} /></div>;

  const memberSince = profile?.member_since ? new Date(profile.member_since) : null;
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <CommanderPageShell>
    <>
      <SEOHead
        title="Player Profile"
        description="Smarter.Poker — The Future Of The Game."
        noindex={true}
      />

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="cmd-icon-box cmd-icon-box-glow w-16 h-16">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-white tracking-wider">{profile?.display_name || 'Player'}</h1>
                  <p className="text-[#64748B] text-sm font-medium">
                    {stats?.memberLevel || 'Member'} since {memberSince?.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) || 'N/A'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/hub/commander/profile/edit')}
                className="p-2 bg-[#132240] border-2 border-[#4A5E78] rounded-lg hover:border-[#22D3EE] transition-colors"
              >
                <Edit2 className="w-5 h-5 text-[#22D3EE]" />
              </button>
            </div>

            {/* Member Level Badge */}
            {stats?.memberLevel && (
              <div className="flex items-center gap-2 cmd-badge cmd-badge-warning w-fit">
                <Star className="w-5 h-5 text-[#F59E0B] fill-[#F59E0B]" />
                <span>{stats.memberLevel} Member</span>
                {stats.compBalance > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-[#10B981] text-white text-xs rounded font-bold">
                    ${stats.compBalance} comps
                  </span>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Stats Grid */}
          <section>
            <h2 className="font-bold text-white mb-3 uppercase tracking-wide text-sm">Your Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Calendar}
                label="Sessions"
                value={stats?.totalSessions || 0}
                color="#22D3EE"
              />
              <StatCard
                icon={Clock}
                label="Hours Played"
                value={`${stats?.totalHours || 0}h`}
                color="#10B981"
              />
              <StatCard
                icon={DollarSign}
                label="Total Buy-Ins"
                value={`$${(stats?.totalBuyins || 0).toLocaleString()}`}
                color="#F59E0B"
              />
              <StatCard
                icon={TrendingUp}
                label="Avg Session"
                value={`${stats?.avgSession || 0}h`}
                color="#8B5CF6"
              />
            </div>
          </section>

          {/* Streak */}
          {stats?.currentStreak > 0 && (
            <div className="cmd-panel p-4" style={{ borderColor: '#F59E0B', boxShadow: '0 0 20px rgba(245,158,11,0.2)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[#F59E0B] text-sm font-bold uppercase tracking-wide">Current Streak</p>
                  <p className="text-2xl font-bold text-white">{stats.currentStreak} days</p>
                </div>
                <TrendingUp className="w-10 h-10 text-[#F59E0B] opacity-50" />
              </div>
            </div>
          )}

          {/* Favorite Venues */}
          {favoriteVenues.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-bold text-white uppercase tracking-wide text-sm">Favorite Venues</h2>
                <button
                  onClick={() => router.push('/hub/commander/venues')}
                  className="text-sm text-[#22D3EE] font-bold uppercase tracking-wide"
                >
                  Find More
                </button>
              </div>
              <div className="space-y-2">
                {favoriteVenues.slice(0, 3).map((venue, index) => (
                  <FavoriteVenue key={venue.id} venue={venue} rank={index + 1} />
                ))}
              </div>
            </section>
          )}

          {/* AI Recommendations */}
          {recommendations.length > 0 && (
            <section>
              <h2 className="font-bold text-white mb-3 uppercase tracking-wide text-sm">Recommended For You</h2>
              <div className="space-y-2">
                {recommendations.slice(0, 3).map((rec, index) => (
                  <button
                    key={rec.id || index}
                    onClick={() => rec.venue_id && router.push(`/hub/commander/venues/${rec.venue_id}`)}
                    className="w-full text-left cmd-panel p-4 hover:border-[#22D3EE] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{rec.title || rec.game_type}</p>
                        <p className="text-sm text-[#64748B]">{rec.reason || rec.description}</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-[#64748B]" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Achievements */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-white uppercase tracking-wide text-sm">Achievements</h2>
              <span className="text-sm text-[#64748B] font-bold">
                {unlockedCount}/{achievements.length} unlocked
              </span>
            </div>
            <div className="space-y-2">
              {achievements.slice(0, 4).map((achievement) => (
                <AchievementBadge key={achievement.id} achievement={achievement} />
              ))}
            </div>
            {achievements.length > 4 && (
              <button
                onClick={() => router.push('/hub/commander/profile/achievements')}
                className="w-full mt-3 py-3 text-[#22D3EE] font-bold text-sm hover:bg-[#22D3EE]/5 rounded-lg transition-colors uppercase tracking-wide"
              >
                View All Achievements
              </button>
            )}
          </section>

          {/* Quick Links */}
          <section>
            <h2 className="font-bold text-white mb-3 uppercase tracking-wide text-sm">Quick Links</h2>
            <div className="cmd-panel overflow-hidden p-0">
              {menuItems.map(({ href, label, icon: Icon }, index) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className={`w-full flex items-center justify-between p-4 hover:bg-[#0F1C32] transition-colors ${index < menuItems.length - 1 ? 'border-b border-[#4A5E78]' : ''
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-[#64748B]" />
                    <span className="font-medium text-white">{label}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#64748B]" />
                </button>
              ))}
            </div>
          </section>

          {/* Find Games CTA */}
          <button
            onClick={() => router.push('/hub/commander/venues')}
            className="cmd-btn cmd-btn-primary w-full justify-center text-lg"
          >
            <MapPin className="w-6 h-6" />
            FIND POKER GAMES
          </button>
        </main>
      </div>
    </>
    </CommanderPageShell>
  );
}
