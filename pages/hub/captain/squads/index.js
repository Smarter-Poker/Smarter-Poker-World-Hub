/**
 * Player Squads (Group Waitlist) Page
 * Create and manage group waitlist entries
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Users,
  Plus,
  Clock,
  MapPin,
  ChevronRight,
  Loader2,
  UserPlus,
  Check,
  X,
  AlertCircle
} from 'lucide-react';

function SquadCard({ squad, onView }) {
  const statusColors = {
    forming: 'bg-[#F59E0B]/10 text-[#F59E0B]',
    waiting: 'bg-[#1877F2]/10 text-[#1877F2]',
    called: 'bg-[#10B981]/10 text-[#10B981]',
    seated: 'bg-[#10B981]/10 text-[#10B981]',
    expired: 'bg-[#6B7280]/10 text-[#6B7280]'
  };

  const memberCount = squad.members?.length || 0;
  const confirmedCount = squad.members?.filter(m => m.status === 'confirmed').length || 0;

  return (
    <button
      onClick={() => onView(squad.id)}
      className="w-full bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-[#1F2937]">{squad.name || 'Squad'}</h3>
          <p className="text-sm text-[#6B7280]">{squad.venue_name}</p>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${statusColors[squad.status] || statusColors.forming}`}>
          {squad.status}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-[#6B7280] mb-3">
        <span className="font-medium text-[#1F2937]">{squad.stakes} {squad.game_type?.toUpperCase()}</span>
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {confirmedCount}/{memberCount}
        </span>
      </div>

      {squad.status === 'waiting' && squad.position && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#6B7280]">Position #{squad.position}</span>
          <span className="flex items-center gap-1 text-[#1877F2]">
            <Clock className="w-4 h-4" />
            ~{squad.estimated_wait || '--'} min
          </span>
        </div>
      )}

      {squad.status === 'forming' && (
        <div className="text-sm text-[#F59E0B]">
          Waiting for {memberCount - confirmedCount} member(s) to confirm
        </div>
      )}
    </button>
  );
}

function EmptyState({ onCreateSquad }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
      <div className="w-16 h-16 bg-[#1877F2]/10 rounded-full flex items-center justify-center mx-auto mb-4">
        <Users className="w-8 h-8 text-[#1877F2]" />
      </div>
      <h3 className="font-semibold text-[#1F2937] mb-2">No Active Squads</h3>
      <p className="text-[#6B7280] mb-6">
        Create a squad to join a waitlist with friends and get seated together.
      </p>
      <button
        onClick={onCreateSquad}
        className="inline-flex items-center gap-2 px-6 py-3 bg-[#1877F2] text-white rounded-xl font-medium hover:bg-[#1665D8] transition-colors"
      >
        <Plus className="w-5 h-5" />
        Create Squad
      </button>
    </div>
  );
}

export default function SquadsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [squads, setSquads] = useState([]);
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/squads');
      return;
    }
    fetchSquads();
  }, [router]);

  async function fetchSquads() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/squads/my', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setSquads(data.data?.squads || []);
        setInvitations(data.data?.invitations || []);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      // Mock data
      setSquads([
        {
          id: 1,
          name: 'Friday Night Crew',
          venue_id: 1,
          venue_name: 'Bellagio Poker Room',
          game_type: 'nlhe',
          stakes: '$2/$5',
          status: 'waiting',
          position: 3,
          estimated_wait: 25,
          prefer_same_table: true,
          members: [
            { id: 1, name: 'You', status: 'confirmed', is_leader: true },
            { id: 2, name: 'Mike', status: 'confirmed' },
            { id: 3, name: 'Sarah', status: 'confirmed' }
          ]
        },
        {
          id: 2,
          name: 'PLO Group',
          venue_id: 2,
          venue_name: 'Aria Poker Room',
          game_type: 'plo',
          stakes: '$1/$2',
          status: 'forming',
          members: [
            { id: 1, name: 'You', status: 'confirmed', is_leader: true },
            { id: 4, name: 'Tom', status: 'pending' }
          ]
        }
      ]);
      setInvitations([
        {
          id: 3,
          name: 'Tournament Warmup',
          venue_name: 'Wynn Poker Room',
          game_type: 'nlhe',
          stakes: '$1/$3',
          leader_name: 'Alex',
          member_count: 4
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvitation(invitationId, accept) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/captain/squads/${invitationId}/${accept ? 'join' : 'decline'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSquads();
    } catch (err) {
      console.error('Action failed:', err);
      // Update mock data
      setInvitations(prev => prev.filter(i => i.id !== invitationId));
      if (accept) {
        fetchSquads();
      }
    }
  }

  function handleViewSquad(squadId) {
    router.push(`/hub/captain/squads/${squadId}`);
  }

  function handleCreateSquad() {
    router.push('/hub/captain/squads/create');
  }

  const activeSquads = squads.filter(s => !['seated', 'expired'].includes(s.status));
  const pastSquads = squads.filter(s => ['seated', 'expired'].includes(s.status));

  return (
    <>
      <Head>
        <title>Squads | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Squads</h1>
                <p className="text-white/80 text-sm">Join waitlists with friends</p>
              </div>
              <button
                onClick={handleCreateSquad}
                className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : (
            <>
              {/* Invitations */}
              {invitations.length > 0 && (
                <section>
                  <h2 className="font-semibold text-[#1F2937] mb-3 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#F59E0B]" />
                    Squad Invitations
                  </h2>
                  <div className="space-y-3">
                    {invitations.map(invitation => (
                      <div
                        key={invitation.id}
                        className="bg-white rounded-xl border border-[#F59E0B] p-4"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-medium text-[#1F2937]">{invitation.name}</h3>
                            <p className="text-sm text-[#6B7280]">{invitation.venue_name}</p>
                          </div>
                          <span className="text-sm text-[#6B7280]">
                            {invitation.member_count} members
                          </span>
                        </div>
                        <p className="text-sm text-[#6B7280] mb-3">
                          {invitation.leader_name} invited you to join for {invitation.stakes} {invitation.game_type?.toUpperCase()}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleInvitation(invitation.id, true)}
                            className="flex-1 py-2 bg-[#10B981] text-white rounded-lg font-medium hover:bg-[#059669] transition-colors flex items-center justify-center gap-1"
                          >
                            <Check className="w-4 h-4" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleInvitation(invitation.id, false)}
                            className="flex-1 py-2 bg-[#F3F4F6] text-[#6B7280] rounded-lg font-medium hover:bg-[#E5E7EB] transition-colors flex items-center justify-center gap-1"
                          >
                            <X className="w-4 h-4" />
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Active Squads */}
              {activeSquads.length > 0 ? (
                <section>
                  <h2 className="font-semibold text-[#1F2937] mb-3">Active Squads</h2>
                  <div className="space-y-3">
                    {activeSquads.map(squad => (
                      <SquadCard
                        key={squad.id}
                        squad={squad}
                        onView={handleViewSquad}
                      />
                    ))}
                  </div>
                </section>
              ) : invitations.length === 0 ? (
                <EmptyState onCreateSquad={handleCreateSquad} />
              ) : null}

              {/* How It Works */}
              <section className="bg-[#1877F2]/5 rounded-xl p-4">
                <h3 className="font-semibold text-[#1F2937] mb-3">How Squads Work</h3>
                <ul className="space-y-2 text-sm text-[#6B7280]">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#1877F2] text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">1</span>
                    Create a squad and invite friends
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#1877F2] text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">2</span>
                    Once everyone confirms, join the waitlist together
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#1877F2] text-white rounded-full flex items-center justify-center text-xs flex-shrink-0">3</span>
                    Get seated at the same table when available
                  </li>
                </ul>
              </section>

              {/* Past Squads */}
              {pastSquads.length > 0 && (
                <section>
                  <h2 className="font-semibold text-[#1F2937] mb-3">Past Squads</h2>
                  <div className="space-y-3">
                    {pastSquads.map(squad => (
                      <SquadCard
                        key={squad.id}
                        squad={squad}
                        onView={handleViewSquad}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
