/**
 * Home Game Group Detail Page
 * View group info, upcoming events, members, and RSVP
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  Home,
  Users,
  Calendar,
  MapPin,
  Clock,
  DollarSign,
  Share2,
  Settings,
  UserPlus,
  Check,
  X,
  Copy,
  Loader2,
  Bell,
  MessageSquare
} from 'lucide-react';

function EventCard({ event, onRsvp, userRsvp }) {
  const eventDate = new Date(event.scheduled_date);
  const isPast = eventDate < new Date();
  const isFull = event.rsvp_count >= event.max_players;

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
            {event.rsvp_count || 0}/{event.max_players}
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

function MemberCard({ member, isHost }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="w-10 h-10 rounded-full bg-[#22D3EE]/10 flex items-center justify-center overflow-hidden">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <Users className="w-5 h-5 text-[#22D3EE]" />
        )}
      </div>
      <div className="flex-1">
        <p className="font-medium text-white">{member.display_name || 'Member'}</p>
        <p className="text-sm text-[#64748B]">{member.role || 'player'}</p>
      </div>
      {isHost && (
        <span className="px-2 py-1 bg-[#22D3EE]/10 text-[#22D3EE] text-xs font-medium rounded">
          Host
        </span>
      )}
    </div>
  );
}

export default function HomeGameDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [group, setGroup] = useState(null);
  const [events, setEvents] = useState([]);
  const [members, setMembers] = useState([]);
  const [userMembership, setUserMembership] = useState(null);
  const [rsvps, setRsvps] = useState({});
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  // Get current user ID from token on mount
  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUserId(payload.sub);
      } catch (e) {
        console.error('Failed to decode token:', e);
      }
    }
  }, []);

  // Fetch group data
  const fetchGroup = useCallback(async () => {
    if (!id) return;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const [groupRes, eventsRes, membersRes] = await Promise.all([
        fetch(`/api/commander/home-games/groups/${id}`, { headers }),
        fetch(`/api/commander/home-games/events?group_id=${id}`, { headers }),
        fetch(`/api/commander/home-games/groups/${id}/members`, { headers })
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
      if (membersData.success || membersData.members) {
        setMembers(membersData.members || membersData.data?.members || []);
        // Check if current user is a member (using decoded token ID)
        const token = localStorage.getItem('smarter-poker-auth');
        let userId = null;
        if (token) {
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            userId = payload.sub;
          } catch (e) {}
        }
        const membership = (membersData.members || []).find(m => m.user_id === userId);
        setUserMembership(membership);
      }
    } catch (error) {
      console.error('Failed to fetch group:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGroup();
  }, [fetchGroup]);

  // Join group
  async function handleJoin() {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push(`/login?redirect=/hub/commander/home-games/${id}`);
      return;
    }

    setJoining(true);
    try {
      const res = await fetch(`/api/commander/home-games/groups/${id}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (data.success || data.membership) {
        fetchGroup();
      }
    } catch (error) {
      console.error('Join failed:', error);
    } finally {
      setJoining(false);
    }
  }

  // RSVP to event
  async function handleRsvp(event, status) {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push(`/login?redirect=/hub/commander/home-games/${id}`);
      return;
    }

    try {
      const res = await fetch(`/api/commander/home-games/events/${event.id}/rsvp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });

      const data = await res.json();
      if (data.success) {
        setRsvps(prev => ({ ...prev, [event.id]: status }));
        fetchGroup();
      }
    } catch (error) {
      console.error('RSVP failed:', error);
    }
  }

  // Copy invite code
  function copyInviteCode() {
    if (group?.invite_code) {
      navigator.clipboard.writeText(group.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
          <p className="text-[#64748B]">Group not found</p>
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
      <Head>
        <title>{group.name} | Home Games</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

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
                <span className="text-[#10B981] font-medium">You are a member</span>
              </div>
            )}
          </div>

          {/* Upcoming Events */}
          <div>
            <h3 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#22D3EE]" />
              Upcoming Games
            </h3>

            {events.length === 0 ? (
              <div className="cmd-panel p-8 text-center">
                <Calendar className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                <p className="text-[#64748B]">No upcoming games scheduled</p>
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onRsvp={handleRsvp}
                    userRsvp={rsvps[event.id] || event.user_rsvp}
                  />
                ))}
              </div>
            )}
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
                />
              ))}
            </div>
          </div>
        </main>
      </div>

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
