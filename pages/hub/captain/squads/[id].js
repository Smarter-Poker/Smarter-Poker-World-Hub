/**
 * Squad Detail Page
 * View and manage a specific squad
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ChevronLeft,
  Users,
  MapPin,
  Clock,
  Copy,
  Check,
  X,
  Loader2,
  UserPlus,
  Play,
  Trash2,
  AlertCircle,
  Share2
} from 'lucide-react';

function MemberCard({ member, isLeader, onRemove, canRemove }) {
  const statusColors = {
    confirmed: 'bg-[#10B981]/10 text-[#10B981]',
    pending: 'bg-[#F59E0B]/10 text-[#F59E0B]',
    declined: 'bg-[#EF4444]/10 text-[#EF4444]'
  };

  return (
    <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-[#E5E7EB]">
      <div className="flex items-center gap-3">
        {member.profiles?.avatar_url ? (
          <img
            src={member.profiles.avatar_url}
            alt=""
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-[#1877F2]" />
          </div>
        )}
        <div>
          <p className="font-medium text-[#1F2937]">
            {member.profiles?.display_name || 'Unknown'}
            {member.is_leader && (
              <span className="ml-2 text-xs text-[#1877F2] font-normal">(Leader)</span>
            )}
          </p>
          <span className={`text-xs px-2 py-0.5 rounded ${statusColors[member.status] || statusColors.pending}`}>
            {member.status || 'pending'}
          </span>
        </div>
      </div>
      {canRemove && !member.is_leader && (
        <button
          onClick={() => onRemove(member.player_id)}
          className="p-2 text-[#6B7280] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function SquadDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [squad, setSquad] = useState(null);
  const [userId, setUserId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push(`/login?redirect=/hub/captain/squads/${id}`);
      return;
    }

    // Get user ID from token
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUserId(payload.sub);
    } catch (e) {
      console.error('Token parse error:', e);
    }

    if (id) {
      fetchSquad();
    }
  }, [id, router]);

  async function fetchSquad() {
    setLoading(true);
    try {
      const res = await fetch(`/api/captain/squads/${id}`);
      const data = await res.json();

      if (data.success) {
        setSquad(data.data?.squad);
      } else {
        setError(data.error?.message || 'Squad not found');
      }
    } catch (err) {
      console.error('Fetch squad failed:', err);
      setError('Failed to load squad');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyCode() {
    if (!squad?.invite_code) return;

    try {
      await navigator.clipboard.writeText(squad.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  }

  async function handleShare() {
    if (!squad) return;

    const shareUrl = `${window.location.origin}/hub/captain/squads/join/${squad.invite_code}`;
    const shareData = {
      title: squad.name || 'Join my Squad',
      text: `Join my poker squad for ${squad.stakes} ${squad.game_type?.toUpperCase()} at ${squad.poker_venues?.name}!`,
      url: shareUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error('Share failed:', err);
    }
  }

  async function handleJoinWaitlist() {
    if (!squad) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/squads/${id}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (data.success) {
        fetchSquad();
      } else {
        setError(data.error?.message || 'Failed to join waitlist');
        setTimeout(() => setError(null), 4000);
      }
    } catch (err) {
      console.error('Join waitlist failed:', err);
      setError('Failed to join waitlist');
      setTimeout(() => setError(null), 4000);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveMember(memberId) {
    if (!confirm('Remove this member from the squad?')) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/squads/${id}/members/${memberId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        fetchSquad();
      }
    } catch (err) {
      console.error('Remove member failed:', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDisbandSquad() {
    if (!confirm('Are you sure you want to disband this squad? This cannot be undone.')) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/squads/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ player_id: userId })
      });

      const data = await res.json();
      if (data.success) {
        router.push('/hub/captain/squads');
      }
    } catch (err) {
      console.error('Disband failed:', err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeaveSquad() {
    if (!confirm('Leave this squad?')) return;

    setActionLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/squads/${id}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        router.push('/hub/captain/squads');
      }
    } catch (err) {
      console.error('Leave failed:', err);
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (error && !squad) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-[#EF4444] mx-auto mb-4" />
          <h1 className="text-xl font-bold text-[#1F2937] mb-2">Squad Not Found</h1>
          <p className="text-[#6B7280] mb-4">{error}</p>
          <button
            onClick={() => router.push('/hub/captain/squads')}
            className="px-4 py-2 bg-[#1877F2] text-white rounded-lg font-medium"
          >
            Back to Squads
          </button>
        </div>
      </div>
    );
  }

  const members = squad?.captain_waitlist_group_members || [];
  const confirmedCount = members.filter(m => m.status === 'confirmed').length;
  const isLeader = squad?.leader_id === userId;
  const isMember = members.some(m => m.player_id === userId);
  const canJoinWaitlist = squad?.group_status === 'forming' && confirmedCount >= 2;

  const statusColors = {
    forming: 'bg-[#F59E0B]/10 text-[#F59E0B]',
    waiting: 'bg-[#1877F2]/10 text-[#1877F2]',
    called: 'bg-[#10B981]/10 text-[#10B981]',
    seated: 'bg-[#10B981]/10 text-[#10B981]',
    expired: 'bg-[#6B7280]/10 text-[#6B7280]'
  };

  return (
    <>
      <Head>
        <title>{squad?.name || 'Squad'} | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Error Banner */}
        {error && (
          <div className="fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium bg-[#EF4444]">
            {error}
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/hub/captain/squads')}
                  className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-[#1F2937]">{squad?.name || 'Squad'}</h1>
                  <span className={`text-xs px-2 py-0.5 rounded capitalize ${statusColors[squad?.group_status] || statusColors.forming}`}>
                    {squad?.group_status || 'forming'}
                  </span>
                </div>
              </div>
              <button
                onClick={handleShare}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <Share2 className="w-5 h-5 text-[#6B7280]" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Game Info */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xl font-bold text-[#1F2937]">
                  {squad?.stakes} {squad?.game_type?.toUpperCase()}
                </p>
                <p className="text-[#6B7280] flex items-center gap-1 mt-1">
                  <MapPin className="w-4 h-4" />
                  {squad?.poker_venues?.name || 'Unknown Venue'}
                </p>
              </div>
              {squad?.position && squad?.group_status === 'waiting' && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-[#1877F2]">#{squad.position}</p>
                  <p className="text-sm text-[#6B7280]">in line</p>
                </div>
              )}
            </div>

            {squad?.estimated_wait && squad?.group_status === 'waiting' && (
              <div className="flex items-center gap-2 mt-3 text-sm text-[#6B7280]">
                <Clock className="w-4 h-4" />
                Estimated wait: ~{squad.estimated_wait} min
              </div>
            )}
          </div>

          {/* Invite Code */}
          {squad?.group_status === 'forming' && (
            <div className="bg-[#1877F2]/5 rounded-xl p-4">
              <p className="text-sm text-[#6B7280] mb-2">Share this code with friends</p>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-white rounded-lg px-4 py-3 font-mono text-xl text-center text-[#1F2937] border border-[#E5E7EB]">
                  {squad?.invite_code}
                </div>
                <button
                  onClick={handleCopyCode}
                  className="p-3 bg-[#1877F2] text-white rounded-lg hover:bg-[#1665D8] transition-colors"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {/* Members */}
          <section>
            <h2 className="font-semibold text-[#1F2937] mb-3 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#1877F2]" />
              Members ({confirmedCount}/{members.length})
            </h2>
            <div className="space-y-2">
              {members.map(member => (
                <MemberCard
                  key={member.id}
                  member={member}
                  isLeader={member.is_leader}
                  canRemove={isLeader && squad?.group_status === 'forming'}
                  onRemove={handleRemoveMember}
                />
              ))}
            </div>

            {isLeader && squad?.group_status === 'forming' && (
              <button
                onClick={handleShare}
                className="w-full mt-3 py-3 border-2 border-dashed border-[#E5E7EB] text-[#6B7280] rounded-xl hover:border-[#1877F2] hover:text-[#1877F2] transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                Invite More Friends
              </button>
            )}
          </section>

          {/* Actions */}
          <div className="space-y-3">
            {/* Join Waitlist Button - for leader when all confirmed */}
            {isLeader && squad?.group_status === 'forming' && canJoinWaitlist && (
              <button
                onClick={handleJoinWaitlist}
                disabled={actionLoading}
                className="w-full h-14 bg-[#10B981] text-white text-lg font-semibold rounded-xl hover:bg-[#059669] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Join Waitlist Now
                  </>
                )}
              </button>
            )}

            {/* Waiting for confirmations message */}
            {isLeader && squad?.group_status === 'forming' && !canJoinWaitlist && (
              <div className="bg-[#F59E0B]/10 rounded-xl p-4 text-center">
                <p className="text-[#F59E0B] font-medium">
                  Waiting for {members.length - confirmedCount} member(s) to confirm
                </p>
                <p className="text-sm text-[#6B7280] mt-1">
                  Need at least 2 confirmed members to join waitlist
                </p>
              </div>
            )}

            {/* Leave Squad Button - for non-leaders */}
            {isMember && !isLeader && squad?.group_status === 'forming' && (
              <button
                onClick={handleLeaveSquad}
                disabled={actionLoading}
                className="w-full h-12 border border-[#E5E7EB] text-[#6B7280] font-medium rounded-xl hover:bg-[#F3F4F6] transition-colors disabled:opacity-50"
              >
                Leave Squad
              </button>
            )}

            {/* Disband Squad Button - for leader only */}
            {isLeader && squad?.group_status === 'forming' && (
              <button
                onClick={handleDisbandSquad}
                disabled={actionLoading}
                className="w-full h-12 border border-[#EF4444] text-[#EF4444] font-medium rounded-xl hover:bg-[#EF4444]/5 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Disband Squad
              </button>
            )}
          </div>

          {/* Squad Settings Info */}
          {squad && (
            <section className="bg-[#F3F4F6] rounded-xl p-4">
              <h3 className="font-medium text-[#1F2937] mb-2">Squad Preferences</h3>
              <ul className="space-y-2 text-sm text-[#6B7280]">
                <li className="flex items-center justify-between">
                  <span>Prefer same table</span>
                  <span className={squad.prefer_same_table ? 'text-[#10B981]' : 'text-[#6B7280]'}>
                    {squad.prefer_same_table ? 'Yes' : 'No'}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Accept split seating</span>
                  <span className={squad.accept_split ? 'text-[#10B981]' : 'text-[#6B7280]'}>
                    {squad.accept_split ? 'Yes' : 'No'}
                  </span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Max squad size</span>
                  <span>{squad.max_size || 6}</span>
                </li>
              </ul>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
