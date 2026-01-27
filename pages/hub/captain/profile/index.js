/**
 * Player Captain Profile Page
 * View personal stats, achievements, and preferences
 * UI: Facebook color scheme, no emojis, Inter font
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
  Edit2
} from 'lucide-react';

function StatCard({ icon: Icon, label, value, subtext, color = '#1877F2' }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-bold text-[#1F2937]">{value}</p>
          <p className="text-sm text-[#6B7280]">{label}</p>
          {subtext && <p className="text-xs text-[#9CA3AF]">{subtext}</p>}
        </div>
      </div>
    </div>
  );
}

function AchievementBadge({ achievement }) {
  const isUnlocked = achievement.unlocked;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg ${isUnlocked ? 'bg-[#F59E0B]/10' : 'bg-[#F3F4F6]'}`}>
      <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isUnlocked ? 'bg-[#F59E0B]' : 'bg-[#E5E7EB]'}`}>
        <Award className={`w-6 h-6 ${isUnlocked ? 'text-white' : 'text-[#9CA3AF]'}`} />
      </div>
      <div className="flex-1">
        <p className={`font-medium ${isUnlocked ? 'text-[#1F2937]' : 'text-[#9CA3AF]'}`}>
          {achievement.name}
        </p>
        <p className="text-sm text-[#6B7280]">{achievement.description}</p>
      </div>
      {isUnlocked && (
        <Star className="w-5 h-5 text-[#F59E0B] fill-[#F59E0B]" />
      )}
    </div>
  );
}

function FavoriteVenue({ venue, rank }) {
  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-[#E5E7EB]">
      <div className="w-8 h-8 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
        <span className="text-sm font-bold text-[#1877F2]">{rank}</span>
      </div>
      <div className="flex-1">
        <p className="font-medium text-[#1F2937]">{venue.name}</p>
        <p className="text-sm text-[#6B7280]">{venue.sessions} sessions</p>
      </div>
      <p className="text-sm text-[#6B7280]">{venue.hours}h</p>
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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
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

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="w-8 h-8" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">{profile?.display_name || 'Player'}</h1>
                  <p className="text-white/80 text-sm">
                    {stats?.memberLevel || 'Member'} since {memberSince?.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) || 'N/A'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/hub/captain/profile/edit')}
                className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-colors"
              >
                <Edit2 className="w-5 h-5" />
              </button>
            </div>

            {/* Member Level Badge */}
            {stats?.memberLevel && (
              <div className="flex items-center gap-2 bg-white/10 rounded-lg px-4 py-2 w-fit">
                <Star className="w-5 h-5 text-[#F59E0B] fill-[#F59E0B]" />
                <span className="font-medium">{stats.memberLevel} Member</span>
                {stats.compBalance > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-[#10B981] text-white text-xs rounded">
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
            <h2 className="font-semibold text-[#1F2937] mb-3">Your Stats</h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Calendar}
                label="Sessions"
                value={stats?.totalSessions || 0}
                color="#1877F2"
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
            <div className="bg-gradient-to-r from-[#F59E0B] to-[#F97316] text-white rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm">Current Streak</p>
                  <p className="text-2xl font-bold">{stats.currentStreak} days</p>
                </div>
                <TrendingUp className="w-10 h-10 opacity-50" />
              </div>
            </div>
          )}

          {/* Favorite Venues */}
          {favoriteVenues.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-[#1F2937]">Favorite Venues</h2>
                <button
                  onClick={() => router.push('/hub/captain/venues')}
                  className="text-sm text-[#1877F2] font-medium"
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
              <h2 className="font-semibold text-[#1F2937]">Achievements</h2>
              <span className="text-sm text-[#6B7280]">
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
                className="w-full mt-3 py-3 text-[#1877F2] font-medium text-sm hover:bg-[#1877F2]/5 rounded-lg transition-colors"
              >
                View All Achievements
              </button>
            )}
          </section>

          {/* Quick Links */}
          <section>
            <h2 className="font-semibold text-[#1F2937] mb-3">Quick Links</h2>
            <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
              {menuItems.map(({ href, label, icon: Icon }, index) => (
                <button
                  key={href}
                  onClick={() => router.push(href)}
                  className={`w-full flex items-center justify-between p-4 hover:bg-[#F9FAFB] transition-colors ${
                    index < menuItems.length - 1 ? 'border-b border-[#E5E7EB]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-[#6B7280]" />
                    <span className="font-medium text-[#1F2937]">{label}</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
                </button>
              ))}
            </div>
          </section>

          {/* Find Games CTA */}
          <button
            onClick={() => router.push('/hub/captain/venues')}
            className="w-full h-14 bg-[#1877F2] text-white text-lg font-semibold rounded-xl hover:bg-[#1665D8] transition-colors flex items-center justify-center gap-2"
          >
            <MapPin className="w-6 h-6" />
            Find Poker Games
          </button>
        </main>
      </div>
    </>
  );
}
