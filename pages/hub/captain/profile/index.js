/**
 * Player Captain Profile Page
 * View personal stats, achievements, and preferences
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  User,
  Clock,
  DollarSign,
  MapPin,
  Calendar,
  TrendingUp,
  Award,
  Star,
  ChevronRight,
  Settings,
  Bell,
  History,
  Gift,
  Loader2,
  Edit2,
  Zap
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, subtext, color = '#22D3EE' }) {
  return (
    <div className="cap-panel p-4">
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
    <div className="flex items-center gap-3 p-3 cap-panel">
      <div className="w-8 h-8 rounded-full bg-[#22D3EE]/10 border border-[#22D3EE]/30 flex items-center justify-center">
        <span className="text-sm font-bold text-[#22D3EE]">{rank}</span>
      </div>
      <div className="flex-1">
        <p className="font-medium text-white">{venue.name}</p>
        <p className="text-sm text-[#64748B]">{venue.sessions} sessions</p>
      </div>
      <p className="text-sm text-[#64748B]">{venue.hours}h</p>
    </div>
  );
}

export default function PlayerProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [favoriteVenues, setFavoriteVenues] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/profile');
      return;
    }
    fetchProfile();
  }, [router]);

  async function fetchProfile() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const [profileRes, statsRes] = await Promise.all([
        fetch('/api/captain/profile', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/captain/profile/stats', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const profileData = await profileRes.json();
      const statsData = await statsRes.json();

      if (profileData.success) {
        setProfile(profileData.data?.profile);
        setAchievements(profileData.data?.achievements || []);
      }
      if (statsData.success) {
        setStats(statsData.data?.stats);
        setFavoriteVenues(statsData.data?.favoriteVenues || []);
      }
    } catch (err) {
      console.error('Fetch profile failed:', err);
      setProfile(null);
      setStats(null);
      setAchievements([]);
      setFavoriteVenues([]);
    } finally {
      setLoading(false);
    }
  }

  const menuItems = [
    { href: '/hub/captain/history', label: 'Session History', icon: History },
    { href: '/hub/captain/rewards', label: 'Rewards & Comps', icon: Gift },
    { href: '/hub/captain/notifications', label: 'Notifications', icon: Bell },
    { href: '/hub/captain/profile/settings', label: 'Settings', icon: Settings }
  ];

  if (loading) {
    return (
      <div className="cap-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  const memberSince = profile?.member_since ? new Date(profile.member_since) : null;
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <>
      <Head>
        <title>My Profile | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cap-page">
        {/* Header */}
        <header className="cap-header-full">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="cap-icon-box cap-icon-box-glow w-16 h-16">
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
                onClick={() => router.push('/hub/captain/profile/edit')}
                className="p-2 bg-[#132240] border-2 border-[#4A5E78] rounded-lg hover:border-[#22D3EE] transition-colors"
              >
                <Edit2 className="w-5 h-5 text-[#22D3EE]" />
              </button>
            </div>

            {/* Member Level Badge */}
            {stats?.memberLevel && (
              <div className="flex items-center gap-2 cap-badge cap-badge-warning w-fit">
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
                label="Total Buy-ins"
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
            <div className="cap-panel p-4" style={{ borderColor: '#F59E0B', boxShadow: '0 0 20px rgba(245,158,11,0.2)' }}>
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
                  onClick={() => router.push('/hub/captain/venues')}
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
                onClick={() => router.push('/hub/captain/profile/achievements')}
                className="w-full mt-3 py-3 text-[#22D3EE] font-bold text-sm hover:bg-[#22D3EE]/5 rounded-lg transition-colors uppercase tracking-wide"
              >
                View All Achievements
              </button>
            )}
          </section>

          {/* Quick Links */}
          <section>
            <h2 className="font-bold text-white mb-3 uppercase tracking-wide text-sm">Quick Links</h2>
            <div className="cap-panel overflow-hidden p-0">
              {menuItems.map(({ href, label, icon: Icon }, index) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className={`w-full flex items-center justify-between p-4 hover:bg-[#0F1C32] transition-colors ${
                    index < menuItems.length - 1 ? 'border-b border-[#4A5E78]' : ''
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
            onClick={() => router.push('/hub/captain/venues')}
            className="cap-btn cap-btn-primary w-full justify-center text-lg"
          >
            <MapPin className="w-6 h-6" />
            FIND POKER GAMES
          </button>
        </main>
      </div>
    </>
  );
}
