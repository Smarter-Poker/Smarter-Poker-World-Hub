/**
 * Public Club Page
 * Like a Facebook Page for poker venues/clubs
 * Features: Posts, Photos, Events, Reviews, Live Games
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import {
  MapPin,
  Phone,
  Globe,
  Clock,
  Users,
  Star,
  Heart,
  MessageCircle,
  Share2,
  ChevronRight,
  Calendar,
  DollarSign,
  CheckCircle,
  Image as ImageIcon,
  Trophy,
  Zap,
  Play,
  Loader2,
  ExternalLink,
  ThumbsUp,
  Send,
  MoreHorizontal
} from 'lucide-react';

const GAME_TYPE_LABELS = {
  nlh: 'No-Limit Hold\'em',
  nlhe: 'No-Limit Hold\'em',
  plo: 'Pot-Limit Omaha',
  plo8: 'PLO Hi-Lo',
  mixed: 'Mixed Games',
  limit: 'Limit Hold\'em',
  stud: 'Seven Card Stud',
  omaha: 'Omaha'
};

function LiveGameCard({ game }) {
  return (
    <div className="flex items-center justify-between p-3 bg-[#F3F4F6] rounded-lg">
      <div>
        <p className="font-medium text-[#1F2937]">
          {GAME_TYPE_LABELS[game.game_type] || game.game_type?.toUpperCase()} {game.stakes}
        </p>
        <p className="text-sm text-[#6B7280]">
          {game.current_players}/{game.max_players} players
        </p>
      </div>
      <div className={`px-2 py-1 rounded text-xs font-medium ${
        game.status === 'running'
          ? 'bg-[#10B981]/10 text-[#10B981]'
          : 'bg-[#F59E0B]/10 text-[#F59E0B]'
      }`}>
        {game.status === 'running' ? 'Live' : 'Forming'}
      </div>
    </div>
  );
}

function PostCard({ post, onLike, onComment }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#1877F2]/10 rounded-full flex items-center justify-center">
          <Users className="w-5 h-5 text-[#1877F2]" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-[#1F2937]">{post.author_name || 'Venue'}</p>
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
          <span className="px-2 py-1 bg-[#1877F2]/10 text-[#1877F2] text-xs font-medium rounded">
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
              {idx === 3 && post.image_urls.length > 4 && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="text-white font-semibold text-lg">+{post.image_urls.length - 4}</span>
                </div>
              )}
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
        <button
          onClick={() => onLike?.(post.id)}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
        >
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
        <button
          className="flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
        >
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
              className="flex-1 h-10 px-4 bg-white border border-[#E5E7EB] rounded-full focus:outline-none focus:ring-2 focus:ring-[#1877F2] text-sm"
            />
            <button className="p-2 text-[#1877F2] hover:bg-[#1877F2]/10 rounded-full">
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewCard({ review }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-[#F59E0B]/10 rounded-full flex items-center justify-center">
          <Star className="w-5 h-5 text-[#F59E0B]" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[#1F2937]">Player Review</p>
            <div className="flex items-center">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${i < review.overall_rating ? 'text-[#F59E0B] fill-current' : 'text-[#E5E7EB]'}`}
                />
              ))}
            </div>
          </div>
          <p className="text-xs text-[#6B7280]">
            {new Date(review.created_at).toLocaleDateString()}
          </p>
        </div>
        {review.is_verified && (
          <span className="flex items-center gap-1 text-xs text-[#10B981]">
            <CheckCircle className="w-3 h-3" />
            Verified
          </span>
        )}
      </div>
      {review.title && (
        <p className="font-medium text-[#1F2937] mb-2">{review.title}</p>
      )}
      {review.content && (
        <p className="text-sm text-[#6B7280]">{review.content}</p>
      )}
      {review.games_played?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {review.games_played.map((game, idx) => (
            <span key={idx} className="px-2 py-0.5 bg-[#F3F4F6] rounded text-xs text-[#6B7280]">
              {game}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TournamentCard({ tournament }) {
  const startDate = new Date(tournament.scheduled_start);

  return (
    <div className="flex items-center gap-3 p-3 bg-[#F3F4F6] rounded-lg">
      <div className="w-12 h-12 bg-white rounded-lg flex flex-col items-center justify-center border border-[#E5E7EB]">
        <span className="text-xs text-[#6B7280] uppercase">
          {startDate.toLocaleDateString('en-US', { month: 'short' })}
        </span>
        <span className="text-lg font-bold text-[#1F2937]">
          {startDate.getDate()}
        </span>
      </div>
      <div className="flex-1">
        <p className="font-medium text-[#1F2937]">{tournament.name}</p>
        <p className="text-sm text-[#6B7280]">
          ${tournament.buyin_amount} Buy-in
          {tournament.guaranteed_prize && ` | $${tournament.guaranteed_prize.toLocaleString()} GTD`}
        </p>
      </div>
      <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
    </div>
  );
}

export default function ClubPage() {
  const router = useRouter();
  const { id } = router.query;

  const [venue, setVenue] = useState(null);
  const [posts, setPosts] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('posts');
  const [isFollowing, setIsFollowing] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (token) {
      // Parse user from token if needed
      setUser({ token });
    }
  }, []);

  useEffect(() => {
    if (!id) return;

    async function fetchVenueData() {
      setLoading(true);
      try {
        // Fetch venue info
        const res = await fetch(`/api/public/venue/${id}`);
        const data = await res.json();
        if (data.success) {
          setVenue(data.data.venue);
          setLiveGames(data.data.live_games || []);
          setTournaments(data.data.upcoming_tournaments || []);
        }

        // Fetch posts
        const postsRes = await fetch(`/api/public/venue/${id}/posts?limit=10`);
        const postsData = await postsRes.json();
        if (postsData.success) {
          setPosts(postsData.data?.posts || []);
        }

        // Fetch photos
        const photosRes = await fetch(`/api/public/venue/${id}/photos?limit=20`);
        const photosData = await photosRes.json();
        if (photosData.success) {
          setPhotos(photosData.data?.photos || []);
        }

        // Fetch reviews
        const reviewsRes = await fetch(`/api/public/venue/${id}/reviews?limit=10`);
        const reviewsData = await reviewsRes.json();
        if (reviewsData.success) {
          setReviews(reviewsData.data?.reviews || []);
        }
      } catch (error) {
        console.error('Fetch venue data failed:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchVenueData();
  }, [id]);

  async function handleFollow() {
    if (!user) {
      router.push('/auth/login?redirect=' + encodeURIComponent(router.asPath));
      return;
    }

    try {
      const res = await fetch(`/api/commander/venues/${id}/follow`, {
        method: isFollowing ? 'DELETE' : 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setIsFollowing(!isFollowing);
      }
    } catch (error) {
      console.error('Follow failed:', error);
    }
  }

  async function handleLike(postId) {
    if (!user) {
      router.push('/auth/login?redirect=' + encodeURIComponent(router.asPath));
      return;
    }
    // Like logic here
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#6B7280] mb-4">Venue not found</p>
          <Link href="/" className="text-[#1877F2] font-medium">
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.overall_rating, 0) / reviews.length).toFixed(1)
    : venue.trust_score || '4.0';

  return (
    <>
      <Head>
        <title>{venue.name} | Smarter Poker</title>
        <meta name="description" content={venue.tagline || `${venue.name} - Poker room in ${venue.city}, ${venue.state}`} />
        <meta property="og:title" content={`${venue.name} | Smarter Poker`} />
        <meta property="og:description" content={venue.tagline || `Poker room in ${venue.city}, ${venue.state}`} />
        {venue.cover_photo_url && <meta property="og:image" content={venue.cover_photo_url} />}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Cover Photo */}
        <div className="relative h-48 md:h-64 bg-gradient-to-r from-[#1877F2] to-[#0B5FCC]">
          {venue.cover_photo_url && (
            <img
              src={venue.cover_photo_url}
              alt={venue.name}
              className="w-full h-full object-cover"
            />
          )}
        </div>

        {/* Profile Section */}
        <div className="max-w-4xl mx-auto px-4 -mt-16 relative z-10">
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                {/* Profile Photo */}
                <div className="w-24 h-24 md:w-32 md:h-32 bg-white rounded-xl border-4 border-white shadow-lg flex items-center justify-center -mt-16 md:-mt-20">
                  {venue.profile_photo_url ? (
                    <img src={venue.profile_photo_url} alt="" className="w-full h-full object-cover rounded-lg" />
                  ) : (
                    <div className="w-full h-full bg-[#1877F2]/10 rounded-lg flex items-center justify-center">
                      <Users className="w-12 h-12 text-[#1877F2]" />
                    </div>
                  )}
                </div>

                {/* Venue Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl md:text-2xl font-bold text-[#1F2937]">{venue.name}</h1>
                    {venue.is_featured && (
                      <CheckCircle className="w-5 h-5 text-[#1877F2]" />
                    )}
                  </div>
                  <p className="text-[#6B7280] mb-2">
                    {venue.venue_type === 'casino' ? 'Casino' :
                     venue.venue_type === 'card_room' ? 'Card Room' :
                     venue.venue_type === 'poker_club' ? 'Poker Club' : 'Venue'}
                    {venue.city && ` in ${venue.city}, ${venue.state}`}
                  </p>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-[#F59E0B] fill-current" />
                      <span className="font-medium">{averageRating}</span>
                      <span className="text-[#6B7280]">({reviews.length || venue.review_count || 0} reviews)</span>
                    </span>
                    <span className="flex items-center gap-1 text-[#6B7280]">
                      <Heart className="w-4 h-4" />
                      {venue.follower_count || 0} followers
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={handleFollow}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      isFollowing
                        ? 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                        : 'bg-[#1877F2] text-white hover:bg-[#1664d9]'
                    }`}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </button>
                  <button className="p-2 border border-[#E5E7EB] rounded-lg hover:bg-[#F3F4F6]">
                    <Share2 className="w-5 h-5 text-[#6B7280]" />
                  </button>
                </div>
              </div>

              {/* Quick Info */}
              <div className="mt-4 flex flex-wrap gap-4 text-sm text-[#6B7280]">
                {venue.address && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {venue.address}, {venue.city}, {venue.state}
                  </span>
                )}
                {venue.phone && (
                  <a href={`tel:${venue.phone}`} className="flex items-center gap-1 hover:text-[#1877F2]">
                    <Phone className="w-4 h-4" />
                    {venue.phone}
                  </a>
                )}
                {venue.website && (
                  <a href={venue.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-[#1877F2]">
                    <Globe className="w-4 h-4" />
                    Website
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {venue.hours_weekday && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {venue.hours_weekday}
                  </span>
                )}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-t border-[#E5E7EB] overflow-x-auto">
              {[
                { id: 'posts', label: 'Posts' },
                { id: 'about', label: 'About' },
                { id: 'photos', label: 'Photos' },
                { id: 'reviews', label: 'Reviews' },
                { id: 'events', label: 'Events' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-[#1877F2] text-[#1877F2]'
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
            {/* Left Sidebar - Live Info */}
            <div className="space-y-4">
              {/* Live Games */}
              {venue.commander_enabled && liveGames.length > 0 && (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 bg-[#10B981] rounded-full animate-pulse" />
                    <h3 className="font-semibold text-[#1F2937]">Live Games</h3>
                  </div>
                  <div className="space-y-2">
                    {liveGames.slice(0, 5).map((game) => (
                      <LiveGameCard key={game.id} game={game} />
                    ))}
                  </div>
                  <Link
                    href={`/hub/commander/waitlist?venue=${id}`}
                    className="block mt-3 text-center text-sm font-medium text-[#1877F2] hover:underline"
                  >
                    Join Waitlist
                  </Link>
                </div>
              )}

              {/* Games Offered */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                <h3 className="font-semibold text-[#1F2937] mb-3">Games Offered</h3>
                <div className="flex flex-wrap gap-2">
                  {(venue.games_offered || []).map((game) => (
                    <span key={game} className="px-2 py-1 bg-[#F3F4F6] rounded text-sm text-[#1F2937]">
                      {game}
                    </span>
                  ))}
                </div>
                {venue.stakes_cash?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-[#E5E7EB]">
                    <p className="text-xs text-[#6B7280] mb-2">Cash Stakes</p>
                    <div className="flex flex-wrap gap-1">
                      {venue.stakes_cash.map((stake) => (
                        <span key={stake} className="px-2 py-0.5 bg-[#10B981]/10 text-[#10B981] rounded text-xs font-medium">
                          {stake}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Amenities */}
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                <h3 className="font-semibold text-[#1F2937] mb-3">Amenities</h3>
                <div className="space-y-2">
                  {venue.has_bad_beat_jackpot && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <Trophy className="w-4 h-4 text-[#F59E0B]" />
                      Bad Beat Jackpot
                    </div>
                  )}
                  {venue.has_food_service && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <CheckCircle className="w-4 h-4 text-[#10B981]" />
                      Food Service
                    </div>
                  )}
                  {venue.has_hotel && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <CheckCircle className="w-4 h-4 text-[#10B981]" />
                      Hotel On-Site
                    </div>
                  )}
                  {venue.has_valet && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <CheckCircle className="w-4 h-4 text-[#10B981]" />
                      Valet Parking
                    </div>
                  )}
                  {venue.has_comps && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <CheckCircle className="w-4 h-4 text-[#10B981]" />
                      Comps Available
                    </div>
                  )}
                  {venue.poker_tables && (
                    <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                      <Users className="w-4 h-4 text-[#1877F2]" />
                      {venue.poker_tables} Tables
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content Area */}
            <div className="md:col-span-2 space-y-4">
              {activeTab === 'posts' && (
                <>
                  {posts.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <MessageCircle className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No posts yet</p>
                    </div>
                  ) : (
                    posts.map((post) => (
                      <PostCard key={post.id} post={post} onLike={handleLike} />
                    ))
                  )}
                </>
              )}

              {activeTab === 'about' && (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-6">
                  <h2 className="font-semibold text-[#1F2937] mb-4">About {venue.name}</h2>
                  {venue.about ? (
                    <p className="text-[#6B7280] whitespace-pre-wrap">{venue.about}</p>
                  ) : (
                    <p className="text-[#6B7280]">
                      {venue.name} is a {venue.venue_type === 'casino' ? 'casino' : 'poker room'} located in {venue.city}, {venue.state}.
                      {venue.poker_tables && ` The poker room features ${venue.poker_tables} tables.`}
                      {venue.hours_weekday && ` Hours: ${venue.hours_weekday}.`}
                    </p>
                  )}

                  {/* Contact Info */}
                  <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
                    <h3 className="font-semibold text-[#1F2937] mb-3">Contact Information</h3>
                    <div className="space-y-2">
                      {venue.address && (
                        <p className="flex items-start gap-2 text-sm text-[#6B7280]">
                          <MapPin className="w-4 h-4 mt-0.5" />
                          {venue.address}, {venue.city}, {venue.state} {venue.zip_code}
                        </p>
                      )}
                      {venue.phone && (
                        <p className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-[#6B7280]" />
                          <a href={`tel:${venue.phone}`} className="text-[#1877F2]">{venue.phone}</a>
                        </p>
                      )}
                      {venue.poker_room_phone && venue.poker_room_phone !== venue.phone && (
                        <p className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-[#6B7280]" />
                          <a href={`tel:${venue.poker_room_phone}`} className="text-[#1877F2]">
                            {venue.poker_room_phone} (Poker Room)
                          </a>
                        </p>
                      )}
                      {venue.email && (
                        <p className="flex items-center gap-2 text-sm">
                          <Send className="w-4 h-4 text-[#6B7280]" />
                          <a href={`mailto:${venue.email}`} className="text-[#1877F2]">{venue.email}</a>
                        </p>
                      )}
                      {venue.website && (
                        <p className="flex items-center gap-2 text-sm">
                          <Globe className="w-4 h-4 text-[#6B7280]" />
                          <a href={venue.website} target="_blank" rel="noopener noreferrer" className="text-[#1877F2]">
                            {venue.website}
                          </a>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'photos' && (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                  <h2 className="font-semibold text-[#1F2937] mb-4">Photos</h2>
                  {photos.length === 0 ? (
                    <div className="p-8 text-center">
                      <ImageIcon className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No photos yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {photos.map((photo) => (
                        <div key={photo.id} className="aspect-square bg-[#F3F4F6] rounded-lg overflow-hidden">
                          <img src={photo.url} alt={photo.caption || ''} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'reviews' && (
                <div className="space-y-4">
                  {/* Rating Summary */}
                  <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-3xl font-bold text-[#1F2937]">{averageRating}</p>
                        <div className="flex items-center justify-center">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${i < Math.round(parseFloat(averageRating)) ? 'text-[#F59E0B] fill-current' : 'text-[#E5E7EB]'}`}
                            />
                          ))}
                        </div>
                        <p className="text-sm text-[#6B7280]">{reviews.length} reviews</p>
                      </div>
                      <div className="flex-1">
                        <button className="w-full h-10 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors">
                          Write a Review
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Reviews List */}
                  {reviews.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <Star className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No reviews yet</p>
                      <p className="text-sm text-[#9CA3AF] mt-1">Be the first to review!</p>
                    </div>
                  ) : (
                    reviews.map((review) => (
                      <ReviewCard key={review.id} review={review} />
                    ))
                  )}
                </div>
              )}

              {activeTab === 'events' && (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                  <h2 className="font-semibold text-[#1F2937] mb-4">Upcoming Tournaments</h2>
                  {tournaments.length === 0 ? (
                    <div className="p-8 text-center">
                      <Calendar className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No upcoming tournaments</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tournaments.map((tournament) => (
                        <TournamentCard key={tournament.id} tournament={tournament} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-[#6B7280]">
          <p>Powered by <a href="https://smarter.poker" className="text-[#1877F2]">Smarter Poker</a></p>
        </footer>
      </div>
    </>
  );
}
