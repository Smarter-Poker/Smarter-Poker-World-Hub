/**
 * Public Club Page
 * Like a Facebook Page for poker venues/clubs
 * Features: Posts, Photos, Events, Reviews, Live Games
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../src/lib/supabase';
import SEOHead from '../../src/components/seo/SEOHead';
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
  MoreHorizontal,
  X
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
      <div className={`px-2 py-1 rounded text-xs font-medium ${game.status === 'running'
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
            <div key={idx} className={`relative flex items-center justify-center bg-[#F3F4F6] overflow-hidden ${post.image_urls.length === 1 ? 'max-h-[500px]' : 'aspect-video'}`}>
              <img src={url} alt="" className={`${post.image_urls.length === 1 ? 'max-w-full max-h-[500px] object-contain' : 'w-full h-full object-cover'}`} />
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
              placeholder="Write A Comment..."
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
  const reviewerName = review.reviewer?.display_name || 'Anonymous';
  const reviewerAvatar = review.reviewer?.avatar_url;
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start gap-3 mb-3">
        {reviewerAvatar ? (
          <img src={reviewerAvatar} alt={reviewerName} className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <div className="w-10 h-10 bg-[#1877F2]/10 rounded-full flex items-center justify-center">
            <span className="text-sm font-semibold text-[#1877F2]">{reviewerName.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-[#1F2937]">{reviewerName}</p>
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
  const startDate = new Date(tournament.scheduled_start || tournament.start_time);
  const buyIn = tournament.buyin_amount || tournament.buy_in_amount || 0;
  const gtd = tournament.guaranteed_prize;
  const gameType = tournament.game_type;

  const GAME_LABELS = { NLH: "NL Hold'em", PLO: 'PLO', PLO5: 'PLO-5', PLO8: 'PLO Hi-Lo' };

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
          {startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          {gameType ? ` · ${GAME_LABELS[gameType] || gameType}` : ''}
          {buyIn ? ` · $${buyIn} Buy-in` : ''}
          {gtd ? ` · $${gtd.toLocaleString()} GTD` : ''}
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
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewContent, setReviewContent] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewSuccess, setReviewSuccess] = useState('');

  // Post creation state
  const [postContent, setPostContent] = useState('');
  const [postMedia, setPostMedia] = useState([]);
  const [postUploading, setPostUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const postMediaRef = useRef(null);

  useEffect(() => {
    async function loadUser() {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, username, avatar_url')
            .eq('id', authUser.id)
            .maybeSingle();
          setUser({
            id: authUser.id,
            email: authUser.email,
            display_name: profile?.display_name || profile?.username || 'Player',
            avatar_url: profile?.avatar_url
          });
        }
      } catch (e) {
        console.error('Auth check error:', e);
      }
    }
    loadUser();
  }, []);

  // Check follow status when user and page id are available
  useEffect(() => {
    if (!id || !user?.id) return;
    async function checkFollowStatus() {
      try {
        const res = await fetch(`/api/social/pages/follow?page_id=${id}&requester_id=${user.id}`);
        const json = await res.json();
        if (json.success) {
          setIsFollowing(json.is_following || false);
        }
      } catch (e) {
        console.error('Follow status check error:', e);
      }
    }
    checkFollowStatus();
  }, [id, user]);

  useEffect(() => {
    if (!id) return;

    async function fetchVenueData() {
      setLoading(true);
      try {
        // Fetch venue info (works with both UUID and slug via API fallback)
        const res = await fetch(`/api/public/venue/${id}`);
        const data = await res.json();
        if (data.success) {
          setVenue(data.data.venue);
          setLiveGames(data.data.live_games || []);
          setTournaments(data.data.upcoming_tournaments || []);

          // Use the resolved venue ID for subsequent calls (handles slug-based access)
          const resolvedId = data.data.venue.id || id;

          // Fetch posts
          const postsRes = await fetch(`/api/public/venue/${resolvedId}/posts?limit=10`);
          const postsData = await postsRes.json();
          if (postsData.success) {
            setPosts(postsData.data?.posts || []);
          }

          // Fetch photos
          const photosRes = await fetch(`/api/public/venue/${resolvedId}/photos?limit=20`);
          const photosData = await photosRes.json();
          if (photosData.success) {
            setPhotos(photosData.data?.photos || []);
          }

          // Fetch reviews
          const reviewsRes = await fetch(`/api/public/venue/${resolvedId}/reviews?limit=10`);
          const reviewsData = await reviewsRes.json();
          if (reviewsData.success) {
            setReviews(reviewsData.data?.reviews || []);
          }
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
    // Use pre-loaded user if available, otherwise do inline auth check
    let activeUserId = user?.id;
    if (!activeUserId) {
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser) {
          activeUserId = freshUser.id;
          // Also populate user state so future clicks are instant
          const { data: profile } = await supabase
            .from('profiles')
            .select('display_name, username, avatar_url')
            .eq('id', freshUser.id)
            .maybeSingle();
          setUser({
            id: freshUser.id,
            email: freshUser.email,
            display_name: profile?.display_name || profile?.username || 'Player',
            avatar_url: profile?.avatar_url
          });
        }
      } catch (e) {
        console.error('Inline auth check failed:', e);
      }
    }

    if (!activeUserId) {
      router.push('/auth/signin?redirect=' + encodeURIComponent(router.asPath));
      return;
    }

    try {
      const res = await fetch('/api/social/pages/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: id,
          user_id: activeUserId,
          action: isFollowing ? 'unfollow' : undefined
        })
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
    if (!user?.id) {
      router.push('/auth/signin?redirect=' + encodeURIComponent(router.asPath));
      return;
    }
    // Like logic here
  }

  // Post media upload handler
  const handlePostMediaSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const remaining = 10 - postMedia.length;
    if (remaining <= 0) return;
    const toUpload = files.slice(0, remaining);
    setPostUploading(true);
    const uploaded = [];
    for (const file of toUpload) {
      const isVideo = file.type.startsWith('video/');
      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'club-posts');
        formData.append('prefix', venue?.social_page_id || id);
        const res = await fetch('/api/social/upload', { method: 'POST', body: formData });
        const json = await res.json();
        if (json.success && json.url) {
          uploaded.push({ type: json.type || (isVideo ? 'video' : 'photo'), url: json.url });
        } else {
          console.error('[ClubPage] Upload failed:', json.error);
          alert('Upload failed: ' + (json.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('[ClubPage] Upload error:', err);
        alert('Upload failed: ' + err.message);
      }
    }
    setPostMedia(prev => [...prev, ...uploaded]);
    setPostUploading(false);
    if (postMediaRef.current) postMediaRef.current.value = '';
  };

  // Create post handler
  const handleCreatePost = async () => {
    if (!postContent.trim() && postMedia.length === 0) return;
    if (!user?.id) return;
    setPosting(true);
    try {
      const mediaUrls = postMedia.map(m => m.url);
      const contentType = postMedia.some(m => m.type === 'video') ? 'video' : (postMedia.length > 0 ? 'image' : 'text');
      const pageId = venue?.social_page_id || id;
      const res = await fetch('/api/social/pages/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: pageId,
          author_id: user.id,
          content: postContent.trim(),
          content_type: contentType,
          media_urls: mediaUrls
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        // Add to posts list with mapped shape for PostCard
        setPosts(prev => [{
          ...json.data,
          author_name: user.display_name || 'Venue',
          image_urls: mediaUrls,
          likes_count: 0,
          comments_count: 0,
          shares_count: 0
        }, ...prev]);
        setPostContent('');
        setPostMedia([]);
      } else if (json.error) {
        alert('Post failed: ' + json.error);
      }
    } catch (e) {
      console.error('Post error:', e);
      alert('Post failed: ' + e.message);
    }
    setPosting(false);
  };

  // Review submission handler
  const handleSubmitReview = async () => {
    if (!user?.id) {
      setReviewError('You must be signed in to leave a review');
      return;
    }
    if (reviewRating === 0) {
      setReviewError('Please select a star rating');
      return;
    }
    setReviewSubmitting(true);
    setReviewError('');
    setReviewSuccess('');
    try {
      const resolvedId = venue?.id || id;
      const res = await fetch('/api/social/pages/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_id: resolvedId,
          reviewer_id: user.id,
          overall_rating: reviewRating,
          title: reviewTitle.trim() || null,
          content: reviewContent.trim() || null
        })
      });
      const data = await res.json();
      if (data.success) {
        setReviewSuccess(data.updated ? 'Review updated!' : 'Review submitted!');
        setShowReviewForm(false);
        setReviewRating(0);
        setReviewTitle('');
        setReviewContent('');
        // Refresh reviews
        const reviewsRes = await fetch(`/api/public/venue/${resolvedId}/reviews?limit=10`);
        const reviewsData = await reviewsRes.json();
        if (reviewsData.success) {
          setReviews(reviewsData.data?.reviews || []);
        }
      } else {
        setReviewError(data.error || 'Failed to submit review');
      }
    } catch (e) {
      setReviewError('Failed to submit review. Please try again.');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const handleWriteReviewClick = () => {
    if (!user?.id) {
      router.push('/auth/signin?redirect=' + encodeURIComponent(router.asPath));
      return;
    }
    setShowReviewForm(true);
    setReviewError('');
    setReviewSuccess('');
  };

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
          <p className="text-[#6B7280] mb-4">Venue Not Found</p>
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
      <SEOHead
        title={`${venue.name} — Poker Room`}
        description={venue.tagline || `${venue.name} — Poker room in ${venue.city}, ${venue.state}. Live games, tournaments, and more on Smarter.Poker.`}
        canonical={`/club/${id}`}
        ogImage={venue.cover_photo_url || undefined}
        jsonLd={{
          '@type': 'LocalBusiness',
          name: venue.name,
          description: venue.tagline || `Poker room in ${venue.city}, ${venue.state}`,
          address: {
            '@type': 'PostalAddress',
            streetAddress: venue.address,
            addressLocality: venue.city,
            addressRegion: venue.state,
          },
          telephone: venue.phone,
          url: `https://smarter.poker/club/${id}`,
          image: venue.cover_photo_url,
          aggregateRating: reviews.length > 0 ? {
            '@type': 'AggregateRating',
            ratingValue: averageRating,
            reviewCount: reviews.length,
          } : undefined,
        }}
      />

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
          {/* Back Button */}
          <button
            onClick={() => router.back()}
            className="absolute top-4 left-4 flex items-center gap-1 px-3 py-2 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Back
          </button>
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
                        venue.venue_type === 'poker_club' ? 'Poker Club' :
                          venue.venue_type === 'charity' ? 'Charity' :
                            venue.venue_type === 'home_game' ? 'Home Game' : 'Venue'}
                    {venue.city && ` in ${venue.city}, ${venue.state}`}
                  </p>
                  {venue.address && (
                    <p className="text-sm text-[#6B7280] mb-2 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {venue.address}{venue.city ? `, ${venue.city}` : ''}{venue.state ? `, ${venue.state}` : ''}
                    </p>
                  )}
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
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${isFollowing
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
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
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
                </div>
              )}

              {/* Join Waitlist — always visible when Commander is enabled */}
              {venue.commander_enabled && (
                <Link
                  href={`/hub/commander/waitlist/${venue.linked_venue_id || id}`}
                  className="block w-full text-center py-3 px-4 bg-[#1877F2] text-white font-semibold rounded-xl hover:bg-[#1664d9] transition-colors shadow-sm"
                >
                  Join Waitlist
                </Link>
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
                <h3 className="font-semibold text-[#1F2937] mb-3">Poker Room Features</h3>
                <div className="space-y-2">
                  {/* Dynamic amenities from JSON metadata */}
                  {venue.amenities && Object.entries(venue.amenities)
                    .filter(([, v]) => v === true)
                    .map(([key]) => {
                      const labels = {
                        food_service: 'Food Service', food_tableside: 'Food Tableside',
                        order_food_at_table: 'Order Food at Table', full_bar: 'Full Bar',
                        cocktail_service: 'Cocktail Service', self_serve_drinks: 'Self Serve Drink Station',
                        snack_bar: 'Snack Bar', room_service: 'Room Service',
                        free_parking: 'Free Parking', self_parking: 'Self Parking',
                        valet_parking: 'Valet Parking', parking_garage: 'Parking Garage',
                        hotel_onsite: 'Hotel On-Site', discounted_hotel: 'Discounted Hotel Rates',
                        phone_in_list: 'Phone-in Waitlist', check_cashing: 'Check Cashing',
                        currency_exchange: 'Currency Exchange', safe_deposit: 'Safe Deposit Boxes',
                        atm_onsite: 'ATM On-Site', coat_check: 'Coat Check',
                        comps_program: 'Comps Program', loyalty_program: 'Loyalty Program',
                        rewards_card: 'Player Rewards Card', hourly_drawings: 'Hourly Drawings',
                        jackpot_promos: 'Jackpot Promotions',
                        non_smoking: 'Non-Smoking', smoking_area: 'Smoking Area',
                        massage: 'Massage Service', nearby_restrooms: 'Nearby Restrooms',
                        wifi: 'Free WiFi', usb_chargers: 'USB Chargers',
                        charging_stations: 'Charging Stations', televisions: 'Televisions',
                        tvs_at_tables: 'TVs at Tables',
                        auto_shufflers: 'Auto Shufflers', rfid_tables: 'RFID Tables',
                        live_streaming: 'Live Streaming',
                        private_room: 'Private Card Room', high_limit: 'High-Limit Room',
                        tournament_room: 'Tournament Room', membership_required: 'Membership Required',
                      };
                      return (
                        <div key={key} className="flex items-center gap-2 text-sm text-[#6B7280]">
                          <CheckCircle className="w-4 h-4 text-[#10B981]" />
                          {labels[key] || key.replace(/_/g, ' ')}
                        </div>
                      );
                    })
                  }
                  {/* Fallback: legacy hardcoded fields for venues not yet using JSON amenities */}
                  {!venue.amenities && (
                    <>
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
                    </>
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
                  {/* Post Composer (for page owner) */}
                  {user?.id && (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 mb-4">
                      <div className="flex items-start gap-3">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 bg-[#1877F2]/10 rounded-full flex items-center justify-center">
                            <span className="text-sm font-semibold text-[#1877F2]">{(user.display_name || 'P').charAt(0).toUpperCase()}</span>
                          </div>
                        )}
                        <div className="flex-1">
                          <textarea
                            value={postContent}
                            onChange={(e) => setPostContent(e.target.value)}
                            placeholder={`Write something about ${venue?.name || 'this club'}...`}
                            className="w-full p-3 bg-[#F0F2F5] rounded-xl border-none focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none text-sm"
                            rows={2}
                          />
                          {/* Image Preview Strip */}
                          {postMedia.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {postMedia.map((m, idx) => (
                                <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden">
                                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                                  <button
                                    onClick={() => setPostMedia(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
                                  >
                                    <X className="w-3 h-3 text-white" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Action Row */}
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-2">
                              <input
                                type="file"
                                accept="image/*,video/*"
                                multiple
                                ref={postMediaRef}
                                onChange={handlePostMediaSelect}
                                className="hidden"
                              />
                              <button
                                onClick={() => postMediaRef.current?.click()}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#45bd62] hover:bg-[#45bd62]/10 rounded-lg transition-colors"
                                disabled={postUploading}
                              >
                                <ImageIcon className="w-5 h-5" />
                                {postUploading ? 'Uploading...' : 'Photo/Video'}
                              </button>
                            </div>
                            <button
                              onClick={handleCreatePost}
                              disabled={posting || postUploading || (!postContent.trim() && postMedia.length === 0)}
                              className="px-5 py-1.5 bg-[#1877F2] text-white text-sm font-semibold rounded-lg hover:bg-[#1664d9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {posting ? 'Posting...' : 'Post'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {posts.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <MessageCircle className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No Posts Yet</p>
                      {user?.id && <p className="text-sm text-[#9CA3AF] mt-1">Be The First To Post!</p>}
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
                      <p className="text-[#6B7280]">No Photos Yet</p>
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
                        <button
                          onClick={handleWriteReviewClick}
                          className="w-full h-10 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors"
                        >
                          Write a Review
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Reviews List */}
                  {reviews.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <Star className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No Reviews Yet</p>
                      <p className="text-sm text-[#9CA3AF] mt-1">Be The First To Review!</p>
                      <button onClick={handleWriteReviewClick} className="mt-3 px-4 py-2 bg-[#1877F2] text-white rounded-lg text-sm font-medium hover:bg-[#1664d9] transition-colors">Write A Review</button>
                    </div>
                  ) : (
                    reviews.map((review) => (
                      <ReviewCard key={review.id} review={review} />
                    ))
                  )}
                  {reviewSuccess && (
                    <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded-lg text-sm">{reviewSuccess}</div>
                  )}
                </div>
              )}

              {/* Review Form Modal */}
              {showReviewForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-[#1F2937]">Write A Review</h3>
                      <button onClick={() => setShowReviewForm(false)} className="text-[#6B7280] hover:text-[#1F2937]">
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <p className="text-sm text-[#6B7280] mb-4">Reviewing As <strong>{user?.display_name || 'Player'}</strong></p>

                    {/* Star Rating */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#1F2937] mb-2">Rating *</label>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setReviewRating(star)}
                            className="p-1 transition-transform hover:scale-110"
                          >
                            <Star
                              className={`w-8 h-8 ${star <= reviewRating
                                ? 'text-[#F59E0B] fill-current'
                                : 'text-[#D1D5DB]'
                                }`}
                            />
                          </button>
                        ))}
                        {reviewRating > 0 && (
                          <span className="ml-2 text-sm text-[#6B7280]">
                            {reviewRating === 1 ? 'Poor' : reviewRating === 2 ? 'Fair' : reviewRating === 3 ? 'Good' : reviewRating === 4 ? 'Very Good' : 'Excellent'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Title */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#1F2937] mb-1">Title (optional)</label>
                      <input
                        type="text"
                        value={reviewTitle}
                        onChange={(e) => setReviewTitle(e.target.value)}
                        placeholder="Sum Up Your Experience"
                        maxLength={100}
                        className="w-full px-3 py-2 border border-[#D1D5DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent"
                      />
                    </div>

                    {/* Content */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#1F2937] mb-1">Your Review (optional)</label>
                      <textarea
                        value={reviewContent}
                        onChange={(e) => setReviewContent(e.target.value)}
                        placeholder="Tell Others About Your Experience..."
                        rows={4}
                        maxLength={2000}
                        className="w-full px-3 py-2 border border-[#D1D5DB] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent resize-none"
                      />
                    </div>

                    {reviewError && (
                      <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">{reviewError}</div>
                    )}

                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowReviewForm(false)}
                        className="flex-1 py-2.5 border border-[#D1D5DB] rounded-lg text-sm font-medium text-[#6B7280] hover:bg-[#F9FAFB] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSubmitReview}
                        disabled={reviewSubmitting || reviewRating === 0}
                        className="flex-1 py-2.5 bg-[#1877F2] text-white rounded-lg text-sm font-medium hover:bg-[#1664d9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {reviewSubmitting ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</>
                        ) : 'Submit Review'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'events' && (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
                  <h2 className="font-semibold text-[#1F2937] mb-4">Upcoming Tournaments</h2>
                  {tournaments.length === 0 ? (
                    <div className="p-8 text-center">
                      <Calendar className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No Upcoming Tournaments</p>
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
          <p>Powered By <a href="https://smarter.poker" className="text-[#1877F2]">Smarter Poker</a></p>
        </footer>
      </div>
    </>
  );
}
