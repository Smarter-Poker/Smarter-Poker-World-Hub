/**
 * Public Home Game Page
 * Like a Facebook Page for home game groups
 * Features: Posts, Events, Members, Game Schedule
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import {
  MapPin,
  Users,
  Calendar,
  Clock,
  DollarSign,
  Lock,
  Unlock,
  Star,
  Heart,
  MessageCircle,
  Share2,
  ChevronRight,
  CheckCircle,
  UserPlus,
  Loader2,
  ThumbsUp,
  Send,
  Home,
  Repeat
} from 'lucide-react';

const GAME_TYPE_LABELS = {
  nlh: 'No-Limit Hold\'em',
  nlhe: 'No-Limit Hold\'em',
  plo: 'Pot-Limit Omaha',
  plo8: 'PLO Hi-Lo',
  mixed: 'Mixed Games',
  limit: 'Limit Hold\'em'
};

const FREQUENCY_LABELS = {
  weekly: 'Weekly',
  biweekly: 'Every 2 Weeks',
  monthly: 'Monthly',
  irregular: 'Irregular'
};

function UpcomingGameCard({ game }) {
  const gameDate = new Date(game.scheduled_date);
  const spotsLeft = game.max_players - (game.rsvp_yes || 0);

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      <div className="flex">
        {/* Date Column */}
        <div className="w-20 bg-[#1877F2] text-white flex flex-col items-center justify-center py-4">
          <span className="text-xs uppercase">
            {gameDate.toLocaleDateString('en-US', { month: 'short' })}
          </span>
          <span className="text-2xl font-bold">
            {gameDate.getDate()}
          </span>
          <span className="text-xs">
            {gameDate.toLocaleDateString('en-US', { weekday: 'short' })}
          </span>
        </div>

        {/* Game Details */}
        <div className="flex-1 p-4">
          <h3 className="font-semibold text-[#1F2937]">
            {game.title || `${GAME_TYPE_LABELS[game.game_type] || game.game_type?.toUpperCase()} ${game.stakes}`}
          </h3>
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-[#6B7280]">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {game.start_time}
            </span>
            {game.stakes && (
              <span className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                {game.stakes}
              </span>
            )}
            {game.buyin_min && (
              <span className="flex items-center gap-1">
                ${game.buyin_min}{game.buyin_max && game.buyin_max !== game.buyin_min ? `-$${game.buyin_max}` : ''} buy-in
              </span>
            )}
          </div>
          <div className="flex items-center justify-between mt-3">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {[...Array(Math.min(game.rsvp_yes || 0, 4))].map((_, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 bg-[#1877F2]/10 rounded-full border-2 border-white flex items-center justify-center"
                  >
                    <Users className="w-3 h-3 text-[#1877F2]" />
                  </div>
                ))}
              </div>
              <span className="text-sm text-[#6B7280]">
                {game.rsvp_yes || 0} going
                {game.rsvp_maybe > 0 && ` | ${game.rsvp_maybe} maybe`}
              </span>
            </div>
            <span className={`text-sm font-medium ${spotsLeft > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
              {spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#10B981]/10 rounded-full flex items-center justify-center">
          <Home className="w-5 h-5 text-[#10B981]" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-[#1F2937]">Group Post</p>
          <p className="text-xs text-[#6B7280]">
            {new Date(post.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit'
            })}
          </p>
        </div>
        {post.is_pinned && (
          <span className="px-2 py-1 bg-[#10B981]/10 text-[#10B981] text-xs font-medium rounded">
            Pinned
          </span>
        )}
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <p className="text-[#1F2937] whitespace-pre-wrap">{post.content}</p>
      </div>

      {/* Post Images */}
      {post.image_urls?.length > 0 && (
        <div className={`grid gap-1 ${post.image_urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {post.image_urls.slice(0, 4).map((url, idx) => (
            <div key={idx} className="relative aspect-video bg-[#F3F4F6]">
              <img src={url} alt="" className="w-full h-full object-cover" />
            </div>
          ))}
        </div>
      )}

      {/* Engagement Stats */}
      <div className="px-4 py-2 flex items-center justify-between text-sm text-[#6B7280]">
        <span>{post.likes_count || 0} likes</span>
        <span>{post.comments_count || 0} comments</span>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-2 border-t border-[#E5E7EB] flex items-center gap-2">
        <button className="flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors">
          <ThumbsUp className="w-5 h-5" />
          <span className="font-medium">Like</span>
        </button>
        <button
          onClick={() => setShowComments(!showComments)}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="font-medium">Comment</span>
        </button>
        <button className="flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors">
          <Share2 className="w-5 h-5" />
          <span className="font-medium">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="px-4 py-3 border-t border-[#E5E7EB] bg-[#F9FAFB]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="Write a comment..."
              className="flex-1 h-10 px-4 bg-white border border-[#E5E7EB] rounded-full focus:outline-none focus:ring-2 focus:ring-[#10B981] text-sm"
            />
            <button className="p-2 text-[#10B981] hover:bg-[#10B981]/10 rounded-full">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomeGamePage() {
  const router = useRouter();
  const { code } = router.query;

  const [group, setGroup] = useState(null);
  const [upcomingGames, setUpcomingGames] = useState([]);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming');
  const [user, setUser] = useState(null);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (token) {
      setUser({ token });
    }
  }, []);

  useEffect(() => {
    if (!code) return;

    async function fetchGroupData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/public/home-game/${code}`);
        const data = await res.json();
        if (data.success) {
          setGroup(data.data.group);
          setUpcomingGames(data.data.upcoming_games || []);
          setStats(data.data.stats);
        }

        // Fetch posts if not private or if member
        if (data.data?.group && !data.data.group.is_private) {
          const postsRes = await fetch(`/api/public/home-game/${code}/posts?limit=10`);
          const postsData = await postsRes.json();
          if (postsData.success) {
            setPosts(postsData.data?.posts || []);
          }
        }
      } catch (error) {
        console.error('Fetch group data failed:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchGroupData();
  }, [code]);

  function handleJoinRequest() {
    if (!user) {
      router.push('/auth/login?redirect=' + encodeURIComponent(router.asPath));
      return;
    }
    router.push(`/hub/captain/home-games/join?code=${code}`);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6B7280] mb-4">Home game not found</p>
          <Link href="/" className="text-[#10B981] font-medium">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{group.name} | Smarter Poker Home Games</title>
        <meta name="description" content={group.description || `${group.name} - Home game group in ${group.city}, ${group.state}`} />
        <meta property="og:title" content={`${group.name} | Smarter Poker`} />
        <meta property="og:description" content={group.description || `Home game group in ${group.city}, ${group.state}`} />
        {group.cover_photo_url && <meta property="og:image" content={group.cover_photo_url} />}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Cover Photo */}
        <div className="relative h-48 md:h-64 bg-gradient-to-r from-[#10B981] to-[#059669]">
          {group.cover_photo_url && (
            <img
              src={group.cover_photo_url}
              alt={group.name}
              className="w-full h-full object-cover"
            />
          )}
          {group.is_private && (
            <div className="absolute top-4 right-4 px-3 py-1 bg-black/50 text-white text-sm rounded-full flex items-center gap-1">
              <Lock className="w-4 h-4" />
              Private Group
            </div>
          )}
        </div>

        {/* Profile Section */}
        <div className="max-w-4xl mx-auto px-4 -mt-16 relative z-10">
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                {/* Profile Photo */}
                <div className="w-24 h-24 md:w-32 md:h-32 bg-white rounded-xl border-4 border-white shadow-lg flex items-center justify-center -mt-16 md:-mt-20">
                  {group.profile_photo_url ? (
                    <img src={group.profile_photo_url} alt="" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <div className="w-full h-full bg-[#10B981]/10 rounded-lg flex items-center justify-center">
                      <Home className="w-12 h-12 text-[#10B981]" />
                    </div>
                  )}
                </div>

                {/* Group Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl md:text-2xl font-bold text-[#1F2937]">{group.name}</h1>
                    {group.is_private ? (
                      <Lock className="w-5 h-5 text-[#6B7280]" />
                    ) : (
                      <Unlock className="w-5 h-5 text-[#10B981]" />
                    )}
                  </div>
                  {group.tagline && (
                    <p className="text-[#6B7280] mb-2">{group.tagline}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    {group.city && (
                      <span className="flex items-center gap-1 text-[#6B7280]">
                        <MapPin className="w-4 h-4" />
                        {group.city}, {group.state}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[#6B7280]">
                      <Users className="w-4 h-4" />
                      {group.member_count} members
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {isMember ? (
                    <Link
                      href={`/hub/captain/home-games/${group.id}`}
                      className="px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg hover:bg-[#059669] transition-colors"
                    >
                      Open Group
                    </Link>
                  ) : (
                    <button
                      onClick={handleJoinRequest}
                      className="px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg hover:bg-[#059669] transition-colors flex items-center gap-2"
                    >
                      <UserPlus className="w-5 h-5" />
                      {group.requires_approval ? 'Request to Join' : 'Join Group'}
                    </button>
                  )}
                  <button className="p-2 border border-[#E5E7EB] rounded-lg hover:bg-[#F3F4F6]">
                    <Share2 className="w-5 h-5 text-[#6B7280]" />
                  </button>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-[#F9FAFB] rounded-lg">
                  <p className="text-2xl font-bold text-[#1F2937]">{group.member_count}</p>
                  <p className="text-xs text-[#6B7280]">Members</p>
                </div>
                <div className="text-center p-3 bg-[#F9FAFB] rounded-lg">
                  <p className="text-2xl font-bold text-[#1F2937]">{group.games_hosted || 0}</p>
                  <p className="text-xs text-[#6B7280]">Games Hosted</p>
                </div>
                <div className="text-center p-3 bg-[#F9FAFB] rounded-lg">
                  <p className="text-2xl font-bold text-[#1F2937]">{stats?.games_last_90_days || 0}</p>
                  <p className="text-xs text-[#6B7280]">Last 90 Days</p>
                </div>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-t border-[#E5E7EB] overflow-x-auto">
              {[
                { id: 'upcoming', label: 'Upcoming Games' },
                { id: 'about', label: 'About' },
                { id: 'posts', label: 'Discussion' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-[#10B981] text-[#10B981]'
                      : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="grid md:grid-cols-3 gap-6">
            {/* Left Sidebar */}
            <div className="space-y-4">
              {/* Game Details */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                <h3 className="font-semibold text-[#1F2937] mb-3">Game Details</h3>
                <div className="space-y-3">
                  {group.default_game_type && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#6B7280]">Game Type</span>
                      <span className="font-medium text-[#1F2937]">
                        {GAME_TYPE_LABELS[group.default_game_type] || group.default_game_type?.toUpperCase()}
                      </span>
                    </div>
                  )}
                  {group.default_stakes && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#6B7280]">Stakes</span>
                      <span className="font-medium text-[#1F2937]">{group.default_stakes}</span>
                    </div>
                  )}
                  {group.typical_buyin_min && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#6B7280]">Buy-in</span>
                      <span className="font-medium text-[#1F2937]">
                        ${group.typical_buyin_min}
                        {group.typical_buyin_max && group.typical_buyin_max !== group.typical_buyin_min
                          ? ` - $${group.typical_buyin_max}`
                          : ''}
                      </span>
                    </div>
                  )}
                  {group.max_players && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#6B7280]">Max Players</span>
                      <span className="font-medium text-[#1F2937]">{group.max_players}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Schedule */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                <h3 className="font-semibold text-[#1F2937] mb-3">Typical Schedule</h3>
                <div className="space-y-3">
                  {group.frequency && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <Repeat className="w-4 h-4" />
                      {FREQUENCY_LABELS[group.frequency] || group.frequency}
                    </div>
                  )}
                  {group.typical_day && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <Calendar className="w-4 h-4" />
                      {group.typical_day}s
                    </div>
                  )}
                  {group.typical_time && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <Clock className="w-4 h-4" />
                      {group.typical_time}
                    </div>
                  )}
                </div>
              </div>

              {/* Host Info */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                <h3 className="font-semibold text-[#1F2937] mb-3">Host</h3>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#10B981]/10 rounded-full flex items-center justify-center">
                    {group.host_avatar ? (
                      <img src={group.host_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                    ) : (
                      <Users className="w-5 h-5 text-[#10B981]" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-[#1F2937]">{group.host}</p>
                    <p className="text-xs text-[#6B7280]">Group Organizer</p>
                  </div>
                </div>
              </div>

              {/* Join Instructions for Private Groups */}
              {group.is_private && !isMember && (
                <div className="bg-[#F9FAFB] rounded-xl border border-[#E5E7EB] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lock className="w-5 h-5 text-[#6B7280]" />
                    <h3 className="font-semibold text-[#1F2937]">Private Group</h3>
                  </div>
                  <p className="text-sm text-[#6B7280]">
                    This is a private group. Request to join to see upcoming games and participate in discussions.
                  </p>
                </div>
              )}
            </div>

            {/* Main Content Area */}
            <div className="md:col-span-2 space-y-4">
              {activeTab === 'upcoming' && (
                <>
                  {group.is_private && !isMember ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <Lock className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">Join the group to see upcoming games</p>
                      <button
                        onClick={handleJoinRequest}
                        className="mt-4 px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg hover:bg-[#059669] transition-colors"
                      >
                        Request to Join
                      </button>
                    </div>
                  ) : upcomingGames.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <Calendar className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No upcoming games scheduled</p>
                      <p className="text-sm text-[#9CA3AF] mt-1">Check back later or contact the host</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {upcomingGames.map((game) => (
                        <UpcomingGameCard key={game.id} game={game} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {activeTab === 'about' && (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
                  <h2 className="font-semibold text-[#1F2937] mb-4">About {group.name}</h2>
                  {group.description ? (
                    <p className="text-[#6B7280] whitespace-pre-wrap">{group.description}</p>
                  ) : (
                    <p className="text-[#6B7280]">
                      {group.name} is a home game group
                      {group.city && ` based in ${group.city}, ${group.state}`}.
                      {group.frequency && ` Games are typically held ${FREQUENCY_LABELS[group.frequency]?.toLowerCase()}`}
                      {group.typical_day && ` on ${group.typical_day}s`}.
                    </p>
                  )}

                  {/* Group Rules / Info */}
                  <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
                    <h3 className="font-semibold text-[#1F2937] mb-3">Group Info</h3>
                    <div className="space-y-2 text-sm text-[#6B7280]">
                      <p className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        {group.member_count} members
                      </p>
                      <p className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {group.games_hosted || 0} games hosted
                      </p>
                      <p className="flex items-center gap-2">
                        {group.is_private ? (
                          <>
                            <Lock className="w-4 h-4" />
                            Private - {group.requires_approval ? 'Approval required to join' : 'Members only'}
                          </>
                        ) : (
                          <>
                            <Unlock className="w-4 h-4" />
                            Public - Anyone can join
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Club Code for sharing */}
                  <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
                    <h3 className="font-semibold text-[#1F2937] mb-3">Share This Group</h3>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-4 py-2 bg-[#F3F4F6] rounded-lg font-mono text-sm">
                        smarter.poker/home-game/{group.club_code}
                      </div>
                      <button
                        onClick={() => navigator.clipboard.writeText(`https://smarter.poker/home-game/${group.club_code}`)}
                        className="px-4 py-2 border border-[#E5E7EB] rounded-lg hover:bg-[#F3F4F6] text-sm font-medium"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'posts' && (
                <>
                  {group.is_private && !isMember ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <MessageCircle className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">Join the group to see discussions</p>
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <MessageCircle className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No posts yet</p>
                    </div>
                  ) : (
                    posts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-[#6B7280]">
          <p>Powered by <a href="https://smarter.poker" className="text-[#10B981]">Smarter Poker</a></p>
        </footer>
      </div>
    </>
  );
}
