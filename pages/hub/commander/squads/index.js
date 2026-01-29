/**
 * Player Squads (Group Waitlist) Page
 * Create and manage group waitlist entries
 * Dark industrial sci-fi gaming theme
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
    forming: 'cmd-badge cmd-badge-warning',
    waiting: 'cmd-badge cmd-badge-primary',
    called: 'cmd-badge cmd-badge-live',
    seated: 'cmd-badge cmd-badge-live',
    expired: 'cmd-badge cmd-badge-chrome'
  };

  const memberCount = squad.members?.length || 0;
  const confirmedCount = squad.members?.filter(m => m.status === 'confirmed').length || 0;

  return (
    <button
      onClick={() => onView(squad.id)}
      className="w-full cmd-panel text-left hover:border-[#22D3EE] transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-white">{squad.name || 'Squad'}</h3>
          <p className="text-sm text-[#64748B]">{squad.venue_name}</p>
        </div>
        <span className={statusColors[squad.status] || statusColors.forming}>
          {squad.status}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm text-[#64748B] mb-3">
        <span className="font-medium text-white">{squad.stakes} {squad.game_type?.toUpperCase()}</span>
        <span className="flex items-center gap-1">
          <Users className="w-4 h-4" />
          {confirmedCount}/{memberCount}
        </span>
      </div>

      {squad.status === 'waiting' && squad.position && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-[#64748B]">Position #{squad.position}</span>
          <span className="flex items-center gap-1 text-[#22D3EE]">
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
    <div className="cmd-panel p-8 text-center">
      <div className="cmd-icon-box cmd-icon-box-glow mx-auto mb-4">
        <Users className="w-8 h-8" />
      </div>
      <h3 className="font-bold text-white mb-2">No Active Squads</h3>
      <p className="text-[#64748B] mb-6">
        Create a squad to join a waitlist with friends and get seated together.
      </p>
      <button
        onClick={onCreateSquad}
        className="cmd-btn cmd-btn-primary"
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
      router.push('/login?redirect=/hub/commander/squads');
      return;
    }
    fetchSquads();
  }, [router]);

  async function fetchSquads() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/squads/my', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success) {
        setSquads(data.data?.squads || []);
        setInvitations(data.data?.invitations || []);
      }
    } catch (err) {
      console.error('Fetch squads failed:', err);
      setSquads([]);
      setInvitations([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvitation(invitationId, accept) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/commander/squads/${invitationId}/${accept ? 'join' : 'decline'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchSquads();
    } catch (err) {
      console.error('Invitation action failed:', err);
    }
  }

  function handleViewSquad(squadId) {
    router.push(`/hub/commander/squads/${squadId}`);
  }

  function handleCreateSquad() {
    router.push('/hub/commander/squads/create');
  }

  const activeSquads = squads.filter(s => !['seated', 'expired'].includes(s.status));
  const pastSquads = squads.filter(s => ['seated', 'expired'].includes(s.status));

  return (
    <>
      <Head>
        <title>Squads | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full">
          <div className="max-w-lg mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-extrabold text-white tracking-wider cmd-text-glow">Squads</h1>
                <p className="text-[#64748B] text-sm">Join waitlists with friends</p>
              </div>
              <button
                onClick={handleCreateSquad}
                className="cmd-icon-box cmd-icon-box-glow"
              >
                <Plus className="w-6 h-6" />
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : (
            <>
              {/* Invitations */}
              {invitations.length > 0 && (
                <section>
                  <h2 className="font-bold text-white uppercase tracking-wide text-sm mb-3 flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#F59E0B]" />
                    Squad Invitations
                  </h2>
                  <div className="space-y-3">
                    {invitations.map(invitation => (
                      <div
                        key={invitation.id}
                        className="cmd-panel"
                        style={{ borderColor: 'rgba(245, 158, 11, 0.5)', boxShadow: '0 0 15px rgba(245, 158, 11, 0.2), 0 8px 32px rgba(0, 0, 0, 0.5)' }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="font-medium text-white">{invitation.name}</h3>
                            <p className="text-sm text-[#64748B]">{invitation.venue_name}</p>
                          </div>
                          <span className="text-sm text-[#64748B]">
                            {invitation.member_count} members
                          </span>
                        </div>
                        <p className="text-sm text-[#64748B] mb-3">
                          {invitation.leader_name} invited you to join for {invitation.stakes} {invitation.game_type?.toUpperCase()}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleInvitation(invitation.id, true)}
                            className="flex-1 cmd-btn cmd-btn-success"
                          >
                            <Check className="w-4 h-4" />
                            Accept
                          </button>
                          <button
                            onClick={() => handleInvitation(invitation.id, false)}
                            className="flex-1 cmd-btn cmd-btn-secondary"
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
                  <h2 className="font-bold text-white uppercase tracking-wide text-sm mb-3">Active Squads</h2>
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
              <section className="cmd-inset rounded-xl p-4">
                <h3 className="font-bold text-white uppercase tracking-wide text-sm mb-3">How Squads Work</h3>
                <ul className="space-y-2 text-sm text-[#64748B]">
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#132240] border border-[#22D3EE] text-[#22D3EE] rounded-full flex items-center justify-center text-xs flex-shrink-0">1</span>
                    Create a squad and invite friends
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#132240] border border-[#22D3EE] text-[#22D3EE] rounded-full flex items-center justify-center text-xs flex-shrink-0">2</span>
                    Once everyone confirms, join the waitlist together
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-5 h-5 bg-[#132240] border border-[#22D3EE] text-[#22D3EE] rounded-full flex items-center justify-center text-xs flex-shrink-0">3</span>
                    Get seated at the same table when available
                  </li>
                </ul>
              </section>

              {/* Past Squads */}
              {pastSquads.length > 0 && (
                <section>
                  <h2 className="font-bold text-white uppercase tracking-wide text-sm mb-3">Past Squads</h2>
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
