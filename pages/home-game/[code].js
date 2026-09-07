/**
 * Public Home Game Page
 * Like a SmarterPoker Page for home game groups
 * Features: Posts, Events, Members, Game Schedule
 * UI: SmarterPoker color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import PokerNearMeFamilyNav from '../../src/components/poker-near-me/PokerNearMeFamilyNav';
import DeepRouteSignalDeck from '../../src/components/poker-near-me/DeepRouteSignalDeck';
import { supabase } from '../../src/lib/supabase';
import { getAccessToken, getAuthUser } from '../../src/lib/authUtils';
import {
  MapPin,
  Users,
  Calendar,
  Clock,
  DollarSign,
  Lock,
  Unlock,
  MessageCircle,
  Share2,
  UserPlus,
  Loader2,
  ThumbsUp,
  Home,
  Repeat,
  Trophy
} from 'lucide-react';

// Dan-fix/tournament-buildout: lookup table for tournament structures.
// Used by UpcomingGameCard when game.format === 'tournament' to render
// a colored pill identifying the format. Centralized here so the same
// palette can be reused if tournaments are surfaced on other cards.
const TOURNAMENT_STRUCTURE_LABELS = {
  turbo:    { label: 'Turbo',    color: '#F97316' },
  standard: { label: 'Standard', color: '#1877F2' },
  deep:     { label: 'Deep',     color: '#A78BFA' },
  bounty:   { label: 'Bounty',   color: '#EF4444' },
  rebuy:    { label: 'Rebuy',    color: '#10B981' },
};

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

const PUBLIC_TABS = [
  { id: 'upcoming', label: 'Upcoming Games' },
  { id: 'about', label: 'About' },
  { id: 'posts', label: 'Discussion' },
];

async function copyPublicUrl(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Permission-denied and non-secure contexts use the DOM fallback below.
    }
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(input);
  if (!copied) throw new Error('Copy is not supported in this browser');
}

async function sharePublicHomeGame({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'Share sheet opened';
    } catch (error) {
      if (error?.name === 'AbortError') return '';
      // Fall through to a clipboard copy if native sharing is unavailable.
    }
  }
  await copyPublicUrl(url);
  return 'Public link copied';
}

function UpcomingGameCard({ game }) {
  const gameDate = new Date(game.scheduled_date);
  // Dan-fix/tournament-buildout: tournaments use max_players as their entries
  // cap (which may be null = unlimited). For cash games, an undefined
  // max_players is still rendered as 0 spots; preserved that behavior here.
  const isTournament = game.format === 'tournament';
  const spotsLeft = game.max_players ? game.max_players - (game.rsvp_yes || 0) : null;
  const structureMeta = isTournament
    ? (TOURNAMENT_STRUCTURE_LABELS[game.structure] || TOURNAMENT_STRUCTURE_LABELS.standard)
    : null;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      {/* Tournament header strip — visible only for format='tournament' */}
      {isTournament && (
        <div
          className="px-4 py-2 flex items-center gap-2 border-b border-[#E5E7EB]"
          style={{ background: `${structureMeta.color}10` }}
        >
          <Trophy className="w-4 h-4" style={{ color: structureMeta.color }} />
          <span className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: structureMeta.color }}>
            Tournament
          </span>
          <span
            className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: `${structureMeta.color}20`,
              color: structureMeta.color,
              border: `1px solid ${structureMeta.color}55`,
            }}
          >
            {structureMeta.label}
          </span>
        </div>
      )}

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
            {game.title || `${GAME_TYPE_LABELS[game.game_type] || game.game_type?.toUpperCase()} ${game.stakes || ''}`.trim()}
          </h3>
          {/* Tournament description, if any */}
          {isTournament && game.description && (
            <p className="text-sm text-[#6B7280] mt-1 line-clamp-2">{game.description}</p>
          )}
          <div className="flex flex-wrap gap-3 mt-2 text-sm text-[#6B7280]">
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {game.start_time}
            </span>
            {!isTournament && game.stakes && (
              <span className="flex items-center gap-1">
                <DollarSign className="w-4 h-4" />
                {game.stakes}
              </span>
            )}
            {game.buyin_min != null && (
              <span className="flex items-center gap-1">
                {isTournament
                  ? `${game.buyin_min === 0 ? 'Free' : `$${Number(game.buyin_min).toLocaleString()}`} buy-in`
                  : `$${game.buyin_min}${game.buyin_max && game.buyin_max !== game.buyin_min ? `-$${game.buyin_max}` : ''} buy-in`}
              </span>
            )}
            {isTournament && game.starting_stack != null && (
              <span className="flex items-center gap-1">
                {Number(game.starting_stack).toLocaleString()} Starting Stack
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
                {game.rsvp_yes || 0} Going
                {game.rsvp_maybe > 0 && ` | ${game.rsvp_maybe} maybe`}
              </span>
            </div>
            <span className={`text-sm font-medium ${
              spotsLeft == null
                ? 'text-[#6B7280]'
                : spotsLeft > 0 ? 'text-[#10B981]' : 'text-[#EF4444]'
            }`}>
              {spotsLeft == null
                ? 'Open registration'
                : spotsLeft > 0 ? `${spotsLeft} spots left` : 'Full'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, discussionHref, onShare }) {
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
            <div key={idx} className={`relative ${post.image_urls.length > 1 ? 'aspect-video overflow-hidden' : ''}`}>
              <img src={url} alt="" className={`${post.image_urls.length > 1 ? 'w-full h-full object-cover' : 'max-w-full block mx-auto'}`} />
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
        <span>{post.likes_count || 0} Likes</span>
        <span>{post.comments_count || 0} Comments</span>
      </div>

      {/* Action Buttons */}
      <div className="px-4 py-2 border-t border-[#E5E7EB] flex items-center gap-2">
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Likes are read-only on this public page"
          className="home-game-code-page__readonly-action flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] rounded-lg"
        >
          <ThumbsUp className="w-5 h-5" />
          <span className="font-medium">Likes Read-Only</span>
        </button>
        <button
          type="button"
          onClick={() => setShowComments(!showComments)}
          aria-expanded={showComments}
          aria-controls={`home-game-post-discussion-${post.id}`}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
        >
          <MessageCircle className="w-5 h-5" />
          <span className="font-medium">Comment</span>
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex-1 flex items-center justify-center gap-2 py-2 text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
        >
          <Share2 className="w-5 h-5" />
          <span className="font-medium">Share</span>
        </button>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div
          id={`home-game-post-discussion-${post.id}`}
          className="px-4 py-3 border-t border-[#E5E7EB] bg-[#F9FAFB]"
        >
          <p className="home-game-code-page__discussion-note">
            Comments Are Managed Inside The Protected Club Commander Group, Not On This Public Profile.
          </p>
          {discussionHref ? (
            <Link className="home-game-code-page__discussion-link" href={discussionHref}>
              Open Group Discussion
            </Link>
          ) : (
            <span className="home-game-code-page__discussion-readonly">Join The Group To Participate.</span>
          )}
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
  const [shareStatus, setShareStatus] = useState('');

  useEffect(() => {
    const authUser = getAuthUser();
    const accessToken = getAccessToken();
    if (authUser?.id && accessToken) setUser({ token: accessToken, id: authUser.id });
  }, []);

  // audit F-17: setIsMember was declared and NEVER CALLED, so isMember stayed
  // false for everyone. Existing members of a private group were shown
  // "Request to Join" and locked out of Upcoming Games and Discussion — the
  // exact content their membership entitles them to. Mirrors the membership
  // lookup in pages/hub/home-games/[slug].js.
  useEffect(() => {
    const groupId = group?.id;
    if (!groupId || !user?.id) { setIsMember(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data: memberRow } = await supabase
          .from('commander_home_members')
          .select('status')
          .eq('group_id', groupId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        // audit 2026-08-14: owner exception added — the host frequently has
        // no commander_home_members row at all (ownership lives on
        // commander_home_groups.owner_id), so the host viewing their own
        // private group was shown "Request to Join". 'active' kept for
        // legacy tolerance though the DB CHECK cannot produce it.
        const ownerException = group?.host_id && user?.id === group.host_id;
        setIsMember(ownerException || ['approved', 'active'].includes(memberRow?.status));
      } catch (e) {
        console.warn('[home-game] membership lookup failed:', e?.message || e);
        if (!cancelled) setIsMember(false);
      }
    })();
    return () => { cancelled = true; };
  }, [group?.host_id, group?.id, user?.id]);

  useEffect(() => {
    if (!router.isReady || !code) return;
    const controller = new AbortController();
    let cancelled = false;

    async function fetchGroupData() {
      setLoading(true);
      setGroup(null);
      setPosts([]);
      try {
        const res = await fetch(`/api/public/home-game/${encodeURIComponent(code)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = await res.json();
        if (!data.success || !data.data?.group) throw new Error(data.error || 'Home game not found');
        if (cancelled) return;
        setGroup(data.data.group);
        setUpcomingGames(data.data.upcoming_games || []);
        setStats(data.data.stats);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.warn('Fetch group data failed:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchGroupData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [code, router.isReady]);

  // This endpoint is intentionally public-only: private discussions live in
  // Club Commander even for verified members. Do not send a private-group
  // request to an endpoint whose contract correctly returns 404 for it.
  useEffect(() => {
    if (!code || !group?.id || group.is_private) {
      setPosts([]);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      try {
        const postsRes = await fetch(
          `/api/public/home-game/${encodeURIComponent(code)}/posts?limit=10`,
          {
            signal: controller.signal,
          }
        );
        if (!postsRes.ok) throw new Error(`Request failed (${postsRes.status})`);
        const postsData = await postsRes.json();
        if (!cancelled) setPosts(postsData.success ? (postsData.data?.posts || []) : []);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('[home-game] posts lookup failed:', error?.message || error);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [code, group?.id, group?.is_private]);

  function handleJoinRequest() {
    if (!user) {
      router.push('/auth/login?redirect=' + encodeURIComponent(router.asPath));
      return;
    }
    router.push(`/hub/commander/home-games/join?code=${code}`);
  }

  function getPublicUrl() {
    const publicCode = group?.club_code || code;
    return `https://smarter.poker/home-game/${encodeURIComponent(publicCode)}`;
  }

  async function handleShare() {
    try {
      const result = await sharePublicHomeGame({
        title: `${group?.name || 'Home Game'} | Smarter.Poker`,
        text: group?.tagline || group?.description || 'View this poker home game on Smarter.Poker.',
        url: getPublicUrl(),
      });
      if (result) setShareStatus(result);
    } catch (error) {
      console.warn('[home-game] share failed:', error?.message || error);
      setShareStatus('Unable to share this link on this device');
    }
  }

  async function handleCopy() {
    try {
      await copyPublicUrl(getPublicUrl());
      setShareStatus('Public link copied');
    } catch (error) {
      console.warn('[home-game] copy failed:', error?.message || error);
      setShareStatus('Unable to copy this link on this device');
    }
  }

  function handleTabKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = PUBLIC_TABS.length - 1;
    else if (event.key === 'ArrowRight') nextIndex = (index + 1) % PUBLIC_TABS.length;
    else nextIndex = (index - 1 + PUBLIC_TABS.length) % PUBLIC_TABS.length;
    setActiveTab(PUBLIC_TABS[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')?.[nextIndex]?.focus();
  }

  if (loading) {
    return (
      <div className="home-game-code-page" data-pnm-realism="machined-v2">
        <UniversalHeader pageDepth={2} />
        <PokerNearMeFamilyNav />
        <main className="home-game-code-page__state" data-pnm-secondary-foundation="interaction-v1">
          <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" aria-hidden="true" />
          <p>Loading Home Game…</p>
        </main>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="home-game-code-page" data-pnm-realism="machined-v2">
        <UniversalHeader pageDepth={2} />
        <PokerNearMeFamilyNav />
        <main className="home-game-code-page__state" data-pnm-secondary-foundation="interaction-v1">
          <div className="text-center">
          <p className="text-[#6B7280] mb-4">Home Game Not Found</p>
          <Link href="/hub/home-games/near-me" className="text-[#10B981] font-medium">
            Browse Home Games
          </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <>
      <SEOHead
        title={`${group.name} - Home Game`}
        description={group.description || `${group.name} - Home game group in ${group.city}, ${group.state}. Join the group on Smarter.Poker.`}
        canonical={`/home-game/${group.club_code || code}`}
        ogImage={group.cover_photo_url || undefined}
      />

      <div className="home-game-code-page min-h-screen bg-[#F9FAFB]" data-pnm-realism="machined-v2">
        <UniversalHeader pageDepth={2} onBackClick={() => router.back()} />
        <PokerNearMeFamilyNav />

        <main data-pnm-secondary-foundation="interaction-v1">
          <DeepRouteSignalDeck
            kind="home_game"
            eyebrow="Private Game Network"
            title={group.name}
            description={group.description || group.tagline || `A player-led poker community${group.city ? ` in ${group.city}, ${group.state}` : ''}.`}
            image={group.cover_photo_url || group.profile_photo_url}
            imageAlt={`${group.name} home game`}
            breadcrumbs={[
              { label: 'Poker Near Me', href: '/hub/poker-near-me/lobby' },
              { label: 'Home Games', href: '/hub/home-games/near-me' },
              { label: group.name },
            ]}
            status={group.is_private ? 'Private group · membership required' : 'Public group directory record'}
            statusTone={upcomingGames.length > 0 ? 'live' : 'neutral'}
            freshness={{ label: 'Published community record' }}
            metrics={[
              { label: 'Location', value: group.city ? `${group.city}, ${group.state}` : 'Shared by host' },
              { label: 'Members', value: group.member_count || 0 },
              { label: 'Upcoming', value: upcomingGames.length },
              { label: 'Cadence', value: FREQUENCY_LABELS[group.frequency] || group.frequency || 'Host scheduled' },
            ]}
            actions={(
              <>
                {isMember ? (
                  <Link href={`/hub/commander/home-games/${group.id}`}>Open Group</Link>
                ) : (
                  <button type="button" onClick={handleJoinRequest}>
                    <UserPlus className="w-4 h-4" aria-hidden="true" />
                    {group.requires_approval ? 'Request To Join' : 'Join Group'}
                  </button>
                )}
                <button type="button" onClick={handleShare}>
                  <Share2 className="w-4 h-4" aria-hidden="true" />
                  Share Group
                </button>
              </>
            )}
          />

          {shareStatus && (
            <p className="home-game-code-page__share-status" role="status" aria-live="polite">
              {shareStatus}
            </p>
          )}

        {/* Profile Section */}
        <div className="max-w-4xl mx-auto px-4 mt-5 relative z-10">
          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            <div className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                {/* Profile Photo */}
                <div className="w-24 h-24 md:w-32 md:h-32 bg-white rounded-xl border-4 border-white shadow-lg flex items-center justify-center">
                  {group.profile_photo_url ? (
                    <img src={group.profile_photo_url} alt="" className="w-full h-full object-cover rounded-lg" loading="lazy" />
                  ) : (
                    <div className="w-full h-full bg-[#10B981]/10 rounded-lg flex items-center justify-center">
                      <Home className="w-12 h-12 text-[#10B981]" />
                    </div>
                  )}
                </div>

                {/* Group Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl md:text-2xl font-bold text-[#1F2937]">{group.name}</h2>
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
                      {group.member_count} Members
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {isMember ? (
                    <Link
                      href={`/hub/commander/home-games/${group.id}`}
                      className="px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg hover:bg-[#059669] transition-colors"
                    >
                      Open Group
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={handleJoinRequest}
                      className="px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg hover:bg-[#059669] transition-colors flex items-center gap-2"
                    >
                      <UserPlus className="w-5 h-5" />
                      {group.requires_approval ? 'Request to Join' : 'Join Group'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleShare}
                    aria-label={`Share ${group.name}`}
                    className="p-2 border border-[#E5E7EB] rounded-lg hover:bg-[#F3F4F6]"
                  >
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
            <div className="flex border-t border-[#E5E7EB] overflow-x-auto" role="tablist" aria-label="Home game sections" aria-orientation="horizontal">
              {PUBLIC_TABS.map((tab, index) => (
                <button
                  key={tab.id}
                  id={`home-game-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls="home-game-panel"
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, index)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
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
                      <span className="text-[#6B7280]">Buy-In</span>
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
                      <img src={group.host_avatar} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover" style={{ borderRadius: '50%' }} />
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
                    This Is A Private Group. Request To Join To See Upcoming Games And Participate In Discussions.
                  </p>
                </div>
              )}
            </div>

            {/* Main Content Area */}
            <div
              id="home-game-panel"
              className="md:col-span-2 space-y-4"
              role="tabpanel"
              aria-labelledby={`home-game-tab-${activeTab}`}
              tabIndex={0}
            >
              {activeTab === 'upcoming' && (
                <>
                  {group.is_private && !isMember ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <Lock className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">Join The Group To See Upcoming Games</p>
                      <button
                        type="button"
                        onClick={handleJoinRequest}
                        className="mt-4 px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg hover:bg-[#059669] transition-colors"
                      >
                        Request To Join
                      </button>
                    </div>
                  ) : upcomingGames.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <Calendar className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No Upcoming Games Scheduled</p>
                      <p className="text-sm text-[#9CA3AF] mt-1">Check Back Later Or Contact The Host</p>
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
                      {group.name} Is A Home Game Group
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
                        {group.member_count} Members
                      </p>
                      <p className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {group.games_hosted || 0} Games Hosted
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
                            Public - Anyone Can Join
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
                        Smarter.Poker/Home-Game/{group.club_code || code}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopy}
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
                  {group.is_private ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <MessageCircle className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">
                        {isMember
                          ? 'Private Discussion Is Available In Club Commander'
                          : 'Join The Group To See Discussions'}
                      </p>
                      {isMember ? (
                        <Link
                          href={`/hub/commander/home-games/${group.id}`}
                          className="mt-4 inline-flex items-center px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg"
                        >
                          Open Private Discussion
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={handleJoinRequest}
                          className="mt-4 px-4 py-2 bg-[#10B981] text-white font-medium rounded-lg"
                        >
                          {group.requires_approval ? 'Request To Join' : 'Join Group'}
                        </button>
                      )}
                    </div>
                  ) : posts.length === 0 ? (
                    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                      <MessageCircle className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                      <p className="text-[#6B7280]">No Posts Yet</p>
                    </div>
                  ) : (
                    posts.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        discussionHref={isMember ? `/hub/commander/home-games/${group.id}` : null}
                        onShare={handleShare}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        </main>

        {/* Footer */}
        <footer className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-[#6B7280]">
          <p>Powered By <a href="https://smarter.poker" className="text-[#10B981]">Smarter Poker</a></p>
        </footer>
      </div>
    </>
  );
}
