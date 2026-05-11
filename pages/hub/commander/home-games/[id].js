/**
 * Home Game Group Detail Page
 * View group info, upcoming events, members, and RSVP
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import { ArrowLeft, Home, Users, Calendar, MapPin, Clock, DollarSign, Share2, Settings, UserPlus, Check, X, Copy, Loader2, MessageSquare, Star } from 'lucide-react';
import RsvpForm from '../../../../src/components/commander/home-games/RsvpForm';
import TournamentList from '../../../../src/components/home-games/TournamentList';
import PlayerRating from '../../../../src/components/commander/home-games/PlayerRating';
import { supabase } from '../../../../src/lib/supabase';
import { getAccessToken } from '../../../../src/lib/authUtils';
import { toast } from 'react-hot-toast';
import { safeCopyToClipboard } from '../../../../src/lib/clipboard';

// Phase 41/bug-hunt-zero: idempotency-token generator. Used on every
// state-changing POST in this page so a timeout-then-retry doesn't
// double-create the row server-side once the API honors the header.
function makeIdemKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'idem_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function EventCard({ event, onRsvp, userRsvp }) {
  const eventDate = new Date(event.scheduled_date);
  const isPast = eventDate < new Date();
  // B2 fix: use server-authoritative rsvp_yes counter (was rsvp_count before audit)
  const isFull = (event.rsvp_yes ?? event.rsvp_count ?? 0) >= event.max_players;

  return (
    <div className={`cmd-panel p-4 ${isPast ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-white">
            {eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          <p className="text-sm text-[#64748B]">
            {eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-[#64748B]">
            <Users className="w-4 h-4" />
            {(event.rsvp_yes ?? event.rsvp_count ?? 0)}/{event.max_players}
          </span>
          {isFull && <span className="text-xs text-[#EF4444] font-medium">Full</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-[#64748B] mb-4">
        <DollarSign className="w-4 h-4" />
        <span>{event.stakes || '$1/$2'}</span>
        <span className="text-[#4A5E78]">|</span>
        <span>{event.game_type?.toUpperCase() || 'NLHE'}</span>
      </div>

      {!isPast && (
        <div className="flex gap-2">
          {userRsvp === 'yes' ? (
            <>
              <button
                onClick={() => onRsvp?.(event, 'no')}
                className="cmd-btn cmd-btn-secondary flex-1 h-10"
              >
                Cancel
              </button>
              <div className="flex-1 h-10 bg-[#10B981]/10 text-[#10B981] font-medium rounded-lg flex items-center justify-center gap-2">
                <Check className="w-4 h-4" />
                Going
              </div>
            </>
          ) : userRsvp === 'maybe' ? (
            <>
              <button
                onClick={() => onRsvp?.(event, 'yes')}
                className="cmd-btn cmd-btn-primary flex-1 h-10"
              >
                Confirm
              </button>
              <button
                onClick={() => onRsvp?.(event, 'no')}
                className="cmd-btn cmd-btn-secondary flex-1 h-10"
              >
                Decline
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onRsvp?.(event, 'yes')}
                disabled={isFull}
                className="cmd-btn cmd-btn-primary flex-1 h-10 disabled:opacity-50"
              >
                {isFull ? 'Full' : "I'm In"}
              </button>
              <button
                onClick={() => onRsvp?.(event, 'maybe')}
                className="cmd-btn cmd-btn-secondary flex-1 h-10"
              >
                Maybe
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function MemberCard({ member, isHost, onMessage }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="w-10 h-10 rounded-full bg-[#22D3EE]/10 flex items-center justify-center overflow-hidden">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <Users className="w-5 h-5 text-[#22D3EE]" />
        )}
      </div>
      <div className="flex-1">
        <p className="font-medium text-white">{member.display_name || 'Member'}</p>
        <p className="text-sm text-[#64748B]">{member.role || 'player'}</p>
      </div>
      {isHost && (
        <span className="px-2 py-1 bg-[#22D3EE]/10 text-[#22D3EE] text-xs font-medium rounded mr-2">
          Host
        </span>
      )}
      {onMessage && (
        <button
          onClick={() => onMessage(member.user_id)}
          className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
          title="Message Player"
        >
          <MessageSquare className="w-4 h-4 text-[#22D3EE]" />
        </button>
      )}
    </div>
  );
}

export default function HomeGameDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [group, setGroup] = useState(null);
  const [events, setEvents] = useState([]);
  // Dan-fix/tournament-buildout: tournaments fetched separately via
  // rpc_hg_list_tournaments — independent of the commander events API
  // so we don't depend on it returning the new format/structure cols.
  const [tournaments, setTournaments] = useState([]);
  const [members, setMembers] = useState([]);
  const [userMembership, setUserMembership] = useState(null);
  const [rsvps, setRsvps] = useState({});
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [selectedRsvpEvent, setSelectedRsvpEvent] = useState(null);
  const [eventReviews, setEventReviews] = useState([]);
  const [reviewsAvgRating, setReviewsAvgRating] = useState(0);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [userReview, setUserReview] = useState(null);
  // bug-hunt-zero: in-flight guards. rsvpingRef is keyed-by-event so two
  // different events can rsvp in parallel, but the same event cannot be
  // double-clicked into a race. postingRef + reviewIdemRef + dmIdemRef
  // hold stable idempotency tokens for each respective handler.
  const rsvpingRef = useRef({});
  const postingRef = useRef(false);
  const reviewIdemRef = useRef(makeIdemKey());
  const [posts, setPosts] = useState([]);
  const [newPost, setNewPost] = useState('');

  // Get current user ID from token on mount
  useEffect(() => {
    (async () => {
    const token = getAccessToken();

  if (!router.isReady) return null;

    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUserId(payload.sub);
      } catch (e) {
        console.warn('Failed to decode token:', e);
      }
    }
    })();
  }, []);

  // Fetch group data
  const fetchGroup = useCallback(async () => {
      const controller = new AbortController();
      const { signal } = controller;
    if (!id) return;

    try {
      const token = getAccessToken();
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [groupRes, eventsRes, membersRes, postsRes] = await Promise.all([
        fetch(`/api/commander/home-games/groups/${id}`, { headers }),
        fetch(`/api/commander/home-games/events?group_id=${id}`, { headers }),
        fetch(`/api/commander/home-games/groups/${id}/members`, { headers }),
        fetch(`/api/commander/home-games/${id}/posts`, { headers }).catch(() => ({ ok: false }))
      ]);

      const groupData = await groupRes.json();
      const eventsData = await eventsRes.json();
      const membersData = await membersRes.json();

      if (groupData.success || groupData.group) {
        setGroup(groupData.group || groupData.data?.group);
      }
      if (eventsData.success || eventsData.events) {
        setEvents(eventsData.events || eventsData.data?.events || []);
      }

      // Dan-fix/tournament-buildout: parallel fetch of structured tournament
      // data via SECURITY DEFINER RPC. Non-fatal if it fails — the page still
      // renders with an empty tournaments list.
      try {
        const { data: trnData, error: trnErr } = await supabase
          .rpc('rpc_hg_list_tournaments', { p_group_id: id, p_include_past: false });
        if (!trnErr && Array.isArray(trnData)) {
          setTournaments(trnData);
        } else if (trnErr) {
          // Caller may not be group staff — that's fine, just leave it empty.
          console.warn('[home-games/[id]] tournaments fetch:', trnErr.message);
        }
      } catch (trnErr) {
        console.warn('[home-games/[id]] tournaments fetch threw:', trnErr);
      }
      if (membersData.success || membersData.members) {
        setMembers(membersData.members || membersData.data?.members || []);
        // Check if current user is a member (using decoded token ID)
        const token = getAccessToken();
        let userId = null;
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            userId = payload.sub;
          } catch (e) { console.warn('[App] Handled exception:', e?.message || e); }
        }
        const membership = (membersData.members || []).find(m => m.user_id === userId);
        setUserMembership(membership);
      }

      // Posts/announcements
      if (postsRes.ok) {
        const postsData = await postsRes.json();
        if (postsData.success) {
          setPosts(postsData.data?.posts || postsData.posts || []);
        }
      }
    } catch (error) {
      console.warn('Failed to fetch group:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);
  // Realtime listener — live updates for home-games/[id].js
  // v2 suffix forces WebSocket reconnect for sessions that opened before the
  // 2026-04-26 publication migration (realtime didn't include these tables).
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`hg-detail-v2:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_home_games', filter: `group_id=eq.${id}` }, (payload) => { fetchGroup(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_home_posts', filter: `group_id=eq.${id}` }, (payload) => { fetchGroup(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_home_members', filter: `group_id=eq.${id}` }, (payload) => { fetchGroup(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  // Realtime listener — rsvps (v2 suffix forces reconnect for stale sessions)
  useEffect(() => {
    if (events.length === 0) return;
    const gameIds = events.map(e => e.id);
    const ch = supabase
      .channel(`hg-rsvps-v2:group-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_home_rsvps', filter: `game_id=in.(${gameIds.join(',')})` }, (payload) => { fetchGroup(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [events]);

  // Fetch reviews for past events
  useEffect(() => {
    if (events.length === 0) return;
    const pastEvents = events.filter(e => new Date(e.scheduled_date) < new Date());
    if (pastEvents.length === 0) return;

    async function loadReviews() {
      setReviewsLoading(true);
      try {
        const allReviews = [];
        let totalRating = 0;
        let totalCount = 0;
        // Fetch reviews for up to 5 most recent past events
        const recentPast = pastEvents.slice(0, 5);
        for (const event of recentPast) {
          const res = await fetch(`/api/commander/home-games/events/${event.id}/reviews`);
          if (!res.ok) throw new Error(`Request failed (${res.status})`);
          const data = await res.json();
          if (data.success && data.data?.reviews) {
            allReviews.push(...data.data.reviews);
            totalRating += data.data.average_rating * data.data.total_reviews;
            totalCount += data.data.total_reviews;
          }
        }
        setEventReviews(allReviews);
        setReviewsAvgRating(totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : 0);
      } catch (err) {
        console.warn('Load reviews error:', err);
      } finally {
        setReviewsLoading(false);
      }
    }
    loadReviews();
  }, [events]);

  // Join group
  async function handleJoin() {
    const token = getAccessToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/home-games/${id}`);
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`/api/commander/home-games/groups/${id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          // bug-hunt-zero/B-ID-3: idempotency. Server may dedupe on
          // (group_id, user_id); the header lets it deterministically
          // collapse retries of the same logical join attempt.
          'X-Idempotency-Key': makeIdemKey(),
        }
      });

      // bug-hunt-zero/B-ID-1: surface server-side errors to the user.
      // The previous catch swallowed everything into console.warn, so
      // a failed join produced zero UI feedback — clicking the button
      // looked indistinguishable from a successful join.
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const serverMsg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?.message || '';
        throw new Error(serverMsg || `Couldn't join — please try again (${res.status})`);
      }
      if (data.success || data.membership) {
        if (data.membership?.status === 'pending') {
          toast.success('Request sent — waiting for the host to approve you');
        } else {
          toast.success('You joined the group');
        }
        fetchGroup();
      } else if (data.error) {
        throw new Error(data.error?.message || data.error || 'Join failed');
      }
    } catch (error) {
      console.warn('Join failed:', error);
      toast.error(error && error.message ? error.message : 'Failed to join group');
    } finally {
      setJoining(false);
    }
  }

  // RSVP to event
  // bug-hunt-zero/B-ID-3+4: in-flight guard (rsvpingRef keyed by event id)
  // prevents spam-click races that could trip the rsvp-capacity trigger in
  // weird ways (e.g. simultaneous yes-then-no leaving stale waitlist).
  // X-Idempotency-Key lets the server collapse a timeout-then-retry.
  async function handleRsvp(event, status) {
    const token = getAccessToken();
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/home-games/${id}`);
      return;
    }

    const key = String(event.id);
    if (rsvpingRef.current[key]) return; // already in flight for this event
    rsvpingRef.current[key] = true;

    try {
      const res = await fetch(`/api/commander/home-games/events/${event.id}/rsvp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': makeIdemKey(),
        },
        body: JSON.stringify({ response: status })
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();

      // Use the ACTUAL response returned by the server — the DB trigger
      // fn_hg_enforce_rsvp_capacity may silently downgrade 'yes' → 'waitlist'.
      // Never display the optimistic status; always reconcile with server value.
      const actualResponse = data.rsvp?.response || null;

      if (actualResponse) {
        setRsvps(prev => ({ ...prev, [event.id]: actualResponse }));
        if (actualResponse === 'waitlist' && status === 'yes') {
          // B14: game is full — player was auto-waitlisted
          const waitlistPos = data.rsvp?.waitlist_position || '';
          toast(waitlistPos
            ? `You're #${waitlistPos} on the waitlist — the game is full`
            : "You're on the waitlist — the game is full",
            { icon: '⏳' }
          );
        }
        fetchGroup();
      } else if (data.error) {
        const errCode = data.error?.code || data.error;
        if (errCode === 'GAME_STARTED') {
          toast.error('This game started already — messaging the host');
          setTimeout(() => {
            if (data.dm_url) router.push(data.dm_url);
          }, 1500);
        } else {
          toast.error(data.error?.message || data.error || 'Failed to RSVP');
        }
      } else {
        // Fallback for older API shape
        if (data.success !== false) fetchGroup();
      }
    } catch (error) {
      console.warn('RSVP failed:', error);
      toast.error(error.message || 'Failed to RSVP');
    } finally {
      // bug-hunt-zero/B-ID-3: always clear the in-flight marker for this event
      // so subsequent RSVP changes (e.g. yes → no after a server error) work.
      delete rsvpingRef.current[String(event.id)];
    }
  }

  // Start a direct message with a user
  // bug-hunt-zero/B-ID-5: same idempotency-key pattern as the manage page
  // (PR #317). If the server doesn't already dedupe by (host, target),
  // the header lets a future fix collapse retries deterministically.
  async function handleStartDm(targetUserId) {
    if (targetUserId === currentUserId) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${id}/dm-player`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': makeIdemKey(),
        },
        body: JSON.stringify({ target_user_id: targetUserId })
      });
      const data = await res.json();
      if (data.success && data.dm_url) {
        router.push(data.dm_url);
      } else {
        toast.error(data.error?.message || data.error || 'Failed to start message');
      }
    } catch (err) {
      console.warn('DM start failed:', err);
      toast.error('Failed to start message');
    }
  }

  // Copy invite code
  // bug-hunt-zero/B-ID-8: was silently failing in non-HTTPS / iframe / no-permission
  // contexts. The async path checks success and falls back to execCommand; total
  // failure shows the code so the user can copy manually.
  async function copyInviteCode() {
    const code = group?.invite_code;
    if (!code) return;
    const ok = await safeCopyToClipboard(code);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(`Couldn't copy. Code: ${code}`);
    }
  }

  if (loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <div className="text-center">
          <Home className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
          <p className="text-[#64748B]">Group Not Found</p>
          <button
            onClick={() => router.push('/hub/commander/home-games')}
            className="mt-4 cmd-btn cmd-btn-primary"
          >
            Back to Home Games
          </button>
        </div>
      </div>
    );
  }

  const isHost = group.host_id === currentUserId;
  const isMember = !!userMembership;

  return (
    <>
      <SEOHead
                title="Home Game Details"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/hub/commander/home-games')}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">{group.name}</h1>
                <p className="text-sm text-[#64748B]">{members.length} members</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowShareModal(true)}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <Share2 className="w-5 h-5 text-[#64748B]" />
              </button>
              {isHost && (
                <button
                  onClick={() => router.push(`/hub/commander/home-games/${id}/manage`)}
                  className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
                >
                  <Settings className="w-5 h-5 text-[#64748B]" />
                </button>
              )}
              {!isHost && isMember && (
                <button
                  onClick={() => handleStartDm(group.host_id)}
                  className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
                  title="Message Host"
                >
                  <MessageSquare className="w-5 h-5 text-[#22D3EE]" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Group Info */}
          <div className="cmd-panel p-6">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-[#22D3EE]/10 flex items-center justify-center">
                <Home className="w-8 h-8 text-[#22D3EE]" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">{group.name}</h2>
                {group.description && (
                  <p className="text-[#64748B] mt-1">{group.description}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <MapPin className="w-4 h-4" />
                <span>{group.city}, {group.state}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <DollarSign className="w-4 h-4" />
                <span>{group.stakes || '$1/$2'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <Users className="w-4 h-4" />
                <span>{group.max_players} max</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-[#64748B]">
                <Clock className="w-4 h-4" />
                <span>{group.game_type?.toUpperCase() || 'NLHE'}</span>
              </div>
            </div>

            {!isMember && (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="cmd-btn cmd-btn-primary w-full h-12 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {joining ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-5 h-5" />
                    {group.requires_approval ? 'Request to Join' : 'Join Group'}
                  </>
                )}
              </button>
            )}

            {isMember && !isHost && (
              <div className="flex items-center gap-2 p-3 bg-[#10B981]/10 rounded-lg">
                <Check className="w-5 h-5 text-[#10B981]" />
                <span className="text-[#10B981] font-medium">You Are A Member</span>
              </div>
            )}
          </div>

          {/* Tournaments (host mode = Edit + Cancel buttons).
              Edit navigates to the manage page; Cancel calls cancel_home_game
              directly. Tournament IDs that surface here ARE filtered out of
              the cash-games list below so they don't appear twice. */}
          <TournamentList
            tournaments={tournaments}
            mode="host"
            title="Upcoming Tournaments"
            onEdit={() => router.push(`/hub/commander/home-games/${id}/manage?tab=tournaments`)}
            onCancel={async (t) => {
              try {
                const { error: cancelErr } = await supabase.rpc('cancel_home_game', {
                  p_game_id: t.id,
                  p_caller_user_id: currentUserId,
                  p_reason: 'Cancelled by host from group detail page',
                });
                if (cancelErr) throw cancelErr;
                toast.success(`"${t.name}" cancelled`);
                fetchGroup();
              } catch (ex) {
                toast.error(ex?.message || 'Failed to cancel tournament');
              }
            }}
          />

          {/* Upcoming Events */}
          <div>
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#22D3EE]" />
              Upcoming Games
            </h3>

            {/* Filter out events that are already represented in the
                tournament list above (matched by id) to avoid double-render. */}
            {(() => {
              const tournamentIds = new Set((tournaments || []).map((t) => t.id));
              const cashEvents = (events || []).filter(
                (e) => e.format !== 'tournament' && !tournamentIds.has(e.id)
              );
              if (cashEvents.length === 0) {
                return (
                  <div className="cmd-panel p-8 text-center">
                    <Calendar className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                    <p className="text-[#64748B]">No Upcoming Games Scheduled</p>
                  </div>
                );
              }
              return (
                <div className="space-y-3">
                  {cashEvents.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onRsvp={(evt, status) => {
                        if (status) {
                          handleRsvp(evt, status);
                        } else {
                          setSelectedRsvpEvent(evt);
                        }
                      }}
                      userRsvp={rsvps[event.id] || event.user_rsvp}
                    />
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Members */}
          <div>
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#22D3EE]" />
              Members ({members.length})
            </h3>

            <div className="cmd-panel divide-y divide-[#4A5E78]">
              {members.map((member) => (
                <MemberCard
                  key={member.id}
                  member={member}
                  isHost={member.user_id === group.host_id}
                  onMessage={member.user_id !== currentUserId ? () => handleStartDm(member.user_id) : undefined}
                />
              ))}
            </div>
          </div>

          {/* Group Posts/Announcements */}
          {isMember && (
            <div>
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-[#22D3EE]" />
                Posts
              </h3>

              {/* New post form */}
              <div className="cmd-panel p-4 mb-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newPost}
                    onChange={(e) => setNewPost(e.target.value)}
                    placeholder="Share An Update With The Group..."
                    className="flex-1 h-10 px-3 cmd-input"
                  />
                  <button
                    onClick={async () => {
                      // bug-hunt-zero/B-ID-2: post creation was silently failing.
                      // Previous code never checked res.ok, so a 4xx/5xx cleared
                      // the input box and called fetchGroup() — to the user it
                      // looked like a successful post that mysteriously vanished.
                      if (!newPost.trim()) return;
                      if (postingRef.current) return; // block double-tap
                      postingRef.current = true;
                      const content = newPost.trim();
                      try {
                        const token = getAccessToken();
                        const res = await fetch(`/api/commander/home-games/${id}/posts`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${token}`,
                            'X-Idempotency-Key': makeIdemKey(),
                          },
                          body: JSON.stringify({ content })
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok || data.error) {
                          const msg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || `Couldn't post (${res.status})`;
                          throw new Error(msg);
                        }
                        setNewPost('');
                        fetchGroup();
                      } catch (err) {
                        console.warn('Post failed:', err);
                        toast.error(err && err.message ? err.message : 'Failed to post');
                      } finally {
                        postingRef.current = false;
                      }
                    }}
                    disabled={!newPost.trim()}
                    className="cmd-btn cmd-btn-primary px-4 disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              </div>

              {/* Posts list */}
              {posts.length > 0 && (
                <div className="space-y-2">
                  {posts.slice(0, 5).map((post) => (
                    <div key={post.id} className="cmd-panel p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white text-sm">{post.author_name || 'Member'}</span>
                        <span className="text-xs text-[#64748B]">
                          {new Date(post.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-[#C0CDE0]">{post.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Leave a Review */}
          {isMember && events.some(e => new Date(e.scheduled_date) < new Date()) && !userReview && (
            <div>
              <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
                <Star className="w-5 h-5 text-[#22D3EE]" />
                Leave a Review
              </h3>
              <PlayerRating
                event={events.find(e => new Date(e.scheduled_date) < new Date())}
                isLoading={reviewSubmitting}
                existingReview={userReview}
                onSubmit={async (reviewData) => {
                  setReviewSubmitting(true);
                  try {
                    const pastEvent = events.find(e => new Date(e.scheduled_date) < new Date());
                    if (!pastEvent) return;
                    const token = getAccessToken();
                    const res = await fetch(`/api/commander/home-games/events/${pastEvent.id}/reviews`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                        // bug-hunt-zero/B-ID-6: idempotency for the review POST.
                        // Stable across retries until the server settles (2xx/4xx);
                        // network/5xx keep the token so the retry stays deduped.
                        'X-Idempotency-Key': reviewIdemRef.current,
                      },
                      body: JSON.stringify(reviewData)
                    });
                    if (res.ok || (res.status >= 400 && res.status < 500)) {
                      reviewIdemRef.current = makeIdemKey();
                    }
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      const msg = errData?.error?.message || (typeof errData?.error === 'string' ? errData.error : '') || `Couldn't submit review (${res.status})`;
                      throw new Error(msg);
                    }
                    const data = await res.json();
                    if (data.success) {
                      setUserReview(reviewData);
                      toast.success('Review submitted');
                    }
                  } catch (err) {
                    console.warn('Submit review error:', err);
                    toast.error(err && err.message ? err.message : 'Failed to submit review');
                  } finally {
                    setReviewSubmitting(false);
                  }
                }}
              />
            </div>
          )}

          {/* Event Reviews */}
          <div>
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Star className="w-5 h-5 text-[#F59E0B]" />
              Reviews
              {reviewsAvgRating > 0 && (
                <span className="text-sm text-[#64748B] ml-1">
                  ({reviewsAvgRating} avg)
                </span>
              )}
            </h3>

            {reviewsLoading ? (
              <div className="cmd-panel p-6 text-center">
                <Loader2 className="w-6 h-6 animate-spin text-[#22D3EE] mx-auto" />
              </div>
            ) : eventReviews.length === 0 ? (
              <div className="cmd-panel p-8 text-center">
                <MessageSquare className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                <p className="text-[#64748B]">No Reviews Yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {eventReviews.map((review) => (
                  <div key={review.id} className="cmd-panel p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#22D3EE]/10 flex items-center justify-center">
                          {review.profiles?.avatar_url ? (
                            <img src={review.profiles.avatar_url} alt="" width={32} height={32} loading="lazy" decoding="async" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <Users className="w-4 h-4 text-[#22D3EE]" />
                          )}
                        </div>
                        <span className="font-medium text-white text-sm">
                          {review.is_anonymous ? 'Anonymous' : (review.profiles?.display_name || 'Player')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-4 h-4 ${s <= review.rating ? 'text-[#F59E0B] fill-[#F59E0B]' : 'text-[#4A5E78]'}`}
                          />
                        ))}
                      </div>
                    </div>
                    {review.comment && (
                      <p className="text-sm text-[#CBD5E1]">{review.comment}</p>
                    )}
                    <p className="text-xs text-[#64748B] mt-2">
                      {new Date(review.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* RSVP Modal */}
      {selectedRsvpEvent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="cmd-panel cmd-corner-lights w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">RSVP To Game</h3>
              <button
                onClick={() => setSelectedRsvpEvent(null)}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
            <RsvpForm
              event={{
                ...selectedRsvpEvent,
                rsvp_yes: selectedRsvpEvent.rsvp_count || 0,
                allow_guests: true,
                guest_limit: 2
              }}
              currentRsvp={rsvps[selectedRsvpEvent.id] ? { response: rsvps[selectedRsvpEvent.id] } : null}
              onSubmit={async (rsvpData) => {
                await handleRsvp(selectedRsvpEvent, rsvpData.response);
                setSelectedRsvpEvent(null);
              }}
              onClose={() => setSelectedRsvpEvent(null)}
            />
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="cmd-panel cmd-corner-lights w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Invite Players</h3>
              <button
                onClick={() => setShowShareModal(false)}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <p className="text-sm text-[#64748B] mb-4">
              Share this code with players you want to invite
            </p>

            <div className="flex items-center gap-2 p-4 bg-[#0D192E] rounded-lg mb-4">
              <span className="flex-1 text-center text-2xl font-mono font-bold text-white tracking-wider">
                {group.invite_code || 'ABC123'}
              </span>
              <button
                onClick={copyInviteCode}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-[#10B981]" />
                ) : (
                  <Copy className="w-5 h-5 text-[#64748B]" />
                )}
              </button>
            </div>

            <button
              onClick={() => setShowShareModal(false)}
              className="cmd-btn cmd-btn-secondary w-full h-12"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
