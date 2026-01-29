/**
 * Home Game Group Management Page
 * Host can manage members, schedule events, send announcements
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
  Plus,
  Settings,
  Bell,
  UserMinus,
  UserCheck,
  Clock,
  DollarSign,
  Trash2,
  Edit,
  Loader2,
  X,
  Check,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

function ScheduleEventModal({ isOpen, onClose, onSubmit, group }) {
  const [eventData, setEventData] = useState({
    scheduled_date: '',
    scheduled_time: '19:00',
    stakes: group?.stakes || '$1/$2',
    game_type: group?.game_type || 'nlhe',
    max_players: group?.max_players || 9,
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!eventData.scheduled_date) return;

    setSubmitting(true);
    const datetime = `${eventData.scheduled_date}T${eventData.scheduled_time}:00`;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/home-games/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          group_id: group.id,
          scheduled_date: datetime,
          stakes: eventData.stakes,
          game_type: eventData.game_type,
          max_players: eventData.max_players,
          notes: eventData.notes
        })
      });

      const data = await res.json();
      if (data.success || data.event) {
        onSubmit?.(data.event);
        onClose();
      }
    } catch (error) {
      console.error('Failed to schedule event:', error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="cmd-panel cmd-corner-lights w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
          <h3 className="text-lg font-semibold text-white">Schedule Game</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Date</label>
              <input
                type="date"
                value={eventData.scheduled_date}
                onChange={(e) => setEventData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full h-10 px-3 cmd-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Time</label>
              <input
                type="time"
                value={eventData.scheduled_time}
                onChange={(e) => setEventData(prev => ({ ...prev, scheduled_time: e.target.value }))}
                className="w-full h-10 px-3 cmd-input"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Stakes</label>
            <input
              type="text"
              value={eventData.stakes}
              onChange={(e) => setEventData(prev => ({ ...prev, stakes: e.target.value }))}
              className="w-full h-10 px-3 cmd-input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Max Players</label>
            <div className="flex gap-2">
              {[6, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setEventData(prev => ({ ...prev, max_players: num }))}
                  className={`flex-1 h-10 rounded-lg border font-medium transition-colors ${
                    eventData.max_players === num
                      ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                      : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Notes (optional)</label>
            <textarea
              value={eventData.notes}
              onChange={(e) => setEventData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any special details for this game..."
              rows={2}
              className="w-full px-3 py-2 cmd-input resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-[#4A5E78]">
          <button
            onClick={handleSubmit}
            disabled={!eventData.scheduled_date || submitting}
            className="cmd-btn cmd-btn-primary w-full h-12 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Calendar className="w-5 h-5" />
                Schedule Game
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, isHost, onApprove, onRemove }) {
  const isPending = member.status === 'pending';

  return (
    <div className="flex items-center gap-3 p-4 border-b border-[#4A5E78] last:border-b-0">
      <div className="w-10 h-10 rounded-full bg-[#22D3EE]/10 flex items-center justify-center overflow-hidden">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <Users className="w-5 h-5 text-[#22D3EE]" />
        )}
      </div>

      <div className="flex-1">
        <p className="font-medium text-white">{member.display_name || 'Member'}</p>
        <p className="text-sm text-[#64748B]">
          {isPending ? 'Pending approval' : `Joined ${new Date(member.created_at).toLocaleDateString()}`}
        </p>
      </div>

      {isHost && (
        <span className="px-2 py-1 bg-[#22D3EE]/10 text-[#22D3EE] text-xs font-medium rounded">
          Host
        </span>
      )}

      {isPending && (
        <div className="flex gap-2">
          <button
            onClick={() => onApprove?.(member)}
            className="p-2 bg-[#10B981] text-white rounded-lg hover:bg-[#059669] transition-colors"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove?.(member)}
            className="p-2 bg-[#EF4444] text-white rounded-lg hover:bg-[#DC2626] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {!isPending && !isHost && (
        <button
          onClick={() => onRemove?.(member)}
          className="p-2 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
        >
          <UserMinus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function ManageHomeGamePage() {
  const router = useRouter();
  const { id } = router.query;

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [escrowTransactions, setEscrowTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [activeTab, setActiveTab] = useState('events');
  const [processingEscrow, setProcessingEscrow] = useState(null);

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const headers = { Authorization: `Bearer ${token}` };

      const [groupRes, membersRes, eventsRes, escrowRes] = await Promise.all([
        fetch(`/api/commander/home-games/groups/${id}`, { headers }),
        fetch(`/api/commander/home-games/groups/${id}/members`, { headers }),
        fetch(`/api/commander/home-games/events?group_id=${id}`, { headers }),
        fetch(`/api/commander/escrow?group_id=${id}`, { headers }).catch(() => ({ ok: false }))
      ]);

      const groupData = await groupRes.json();
      const membersData = await membersRes.json();
      const eventsData = await eventsRes.json();

      if (groupData.group || groupData.data?.group) {
        setGroup(groupData.group || groupData.data.group);
      }
      if (membersData.members || membersData.data?.members) {
        setMembers(membersData.members || membersData.data.members || []);
      }
      if (eventsData.events || eventsData.data?.events) {
        setEvents(eventsData.events || eventsData.data.events || []);
      }

      // Escrow data (may not exist yet)
      if (escrowRes.ok) {
        const escrowData = await escrowRes.json();
        if (escrowData.success) {
          setEscrowTransactions(escrowData.data?.transactions || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login');
      return;
    }
    fetchData();
  }, [fetchData, router]);

  async function handleApproveMember(member) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/commander/home-games/groups/${id}/members`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ member_id: member.id, status: 'approved' })
      });
      fetchData();
    } catch (error) {
      console.error('Approve failed:', error);
    }
  }

  async function handleRemoveMember(member) {
    if (!confirm(`Remove ${member.display_name || 'this member'}?`)) return;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/commander/home-games/groups/${id}/members?member_id=${member.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (error) {
      console.error('Remove failed:', error);
    }
  }

  async function handleDeleteEvent(event) {
    if (!confirm('Delete this scheduled game?')) return;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/commander/home-games/events/${event.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  async function handleReleaseEscrow(transaction) {
    if (!confirm(`Release $${transaction.amount} to ${transaction.player_name || 'player'}?`)) return;

    setProcessingEscrow(transaction.id);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/escrow/${transaction.id}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (error) {
      console.error('Release failed:', error);
    } finally {
      setProcessingEscrow(null);
    }
  }

  async function handleRefundEscrow(transaction) {
    if (!confirm(`Refund $${transaction.amount} to ${transaction.player_name || 'player'}?`)) return;

    setProcessingEscrow(transaction.id);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/escrow/${transaction.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: 'Host initiated refund' })
      });

      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (error) {
      console.error('Refund failed:', error);
    } finally {
      setProcessingEscrow(null);
    }
  }

  async function handleDeleteGroup() {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/home-games/groups/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        router.push('/hub/commander/home-games');
      } else {
        alert(data.error?.message || 'Failed to delete group');
      }
    } catch (error) {
      console.error('Delete group failed:', error);
      alert('Failed to delete group');
    }
  }

  async function handleUpdateSettings(newSettings) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/home-games/groups/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });

      const data = await res.json();
      if (data.success || data.group) {
        setGroup(prev => ({ ...prev, ...newSettings }));
      }
    } catch (error) {
      console.error('Update settings failed:', error);
    }
  }

  const pendingEscrow = escrowTransactions.filter(t => t.status === 'pending' || t.status === 'held');
  const completedEscrow = escrowTransactions.filter(t => t.status === 'released' || t.status === 'refunded');
  const totalHeld = pendingEscrow.reduce((sum, t) => sum + (t.amount || 0), 0);

  const pendingMembers = members.filter(m => m.status === 'pending');
  const approvedMembers = members.filter(m => m.status !== 'pending');

  if (loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Manage {group?.name || 'Home Game'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/hub/commander/home-games/${id}`)}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">Manage Group</h1>
                <p className="text-sm text-[#64748B]">{group?.name}</p>
              </div>
            </div>

            <button
              onClick={() => setShowScheduleModal(true)}
              className="cmd-btn cmd-btn-primary flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Schedule Game
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-[#0F1C32] border-b border-[#4A5E78]">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex gap-6">
              {[
                { id: 'events', label: 'Upcoming Games', icon: Calendar },
                { id: 'members', label: `Members (${members.length})`, icon: Users },
                { id: 'finances', label: 'Finances', icon: Wallet, badge: pendingEscrow.length > 0 ? pendingEscrow.length : null },
                { id: 'settings', label: 'Settings', icon: Settings }
              ].map(({ id: tabId, label, icon: Icon, badge }) => (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={`flex items-center gap-2 py-3 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tabId
                      ? 'border-[#22D3EE] text-[#22D3EE]'
                      : 'border-transparent text-[#64748B] hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {tabId === 'members' && pendingMembers.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-[#EF4444] text-white text-xs rounded-full">
                      {pendingMembers.length}
                    </span>
                  )}
                  {badge && (
                    <span className="px-1.5 py-0.5 bg-[#10B981] text-white text-xs rounded-full">
                      {badge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content */}
        <main className="max-w-4xl mx-auto px-4 py-6">
          {/* Events Tab */}
          {activeTab === 'events' && (
            <div className="space-y-4">
              {events.length === 0 ? (
                <div className="cmd-panel p-8 text-center">
                  <Calendar className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                  <p className="text-[#64748B]">No games scheduled</p>
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="mt-4 cmd-btn cmd-btn-primary"
                  >
                    Schedule a Game
                  </button>
                </div>
              ) : (
                events.map((event) => {
                  const eventDate = new Date(event.scheduled_date);
                  return (
                    <div
                      key={event.id}
                      className="cmd-panel p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex items-center gap-4 mt-1 text-sm text-[#64748B]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {eventDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="w-4 h-4" />
                            {event.rsvp_count || 0}/{event.max_players}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4" />
                            {event.stakes}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteEvent(event)}
                        className="p-2 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="space-y-4">
              {pendingMembers.length > 0 && (
                <div className="cmd-panel">
                  <div className="p-4 border-b border-[#4A5E78]">
                    <h3 className="font-semibold text-white">
                      Pending Requests ({pendingMembers.length})
                    </h3>
                  </div>
                  {pendingMembers.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      isHost={false}
                      onApprove={handleApproveMember}
                      onRemove={handleRemoveMember}
                    />
                  ))}
                </div>
              )}

              <div className="cmd-panel">
                <div className="p-4 border-b border-[#4A5E78]">
                  <h3 className="font-semibold text-white">
                    Members ({approvedMembers.length})
                  </h3>
                </div>
                {approvedMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isHost={member.user_id === group?.host_id}
                    onRemove={handleRemoveMember}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Finances Tab */}
          {activeTab === 'finances' && (
            <div className="space-y-4">
              {/* Balance Overview */}
              <div className="cmd-panel p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">Escrow Balance</h3>
                  <div className="flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-[#10B981]" />
                    <span className="text-2xl font-bold text-[#10B981]">${totalHeld.toFixed(2)}</span>
                  </div>
                </div>
                <p className="text-sm text-[#64748B]">
                  Funds held in escrow for upcoming games. Release after games are completed.
                </p>
              </div>

              {/* Pending Transactions */}
              {pendingEscrow.length > 0 && (
                <div className="cmd-panel">
                  <div className="p-4 border-b border-[#4A5E78]">
                    <h3 className="font-semibold text-white">Pending Transactions ({pendingEscrow.length})</h3>
                  </div>
                  <div className="divide-y divide-[#4A5E78]">
                    {pendingEscrow.map((transaction) => (
                      <div key={transaction.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-[#F59E0B]/10 flex items-center justify-center">
                            <ArrowDownLeft className="w-5 h-5 text-[#F59E0B]" />
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {transaction.player_name || 'Player'} - Buy-in
                            </p>
                            <p className="text-sm text-[#64748B]">
                              {new Date(transaction.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-white">${transaction.amount}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReleaseEscrow(transaction)}
                              disabled={processingEscrow === transaction.id}
                              className="px-3 py-1.5 bg-[#10B981] text-white text-sm font-medium rounded-lg hover:bg-[#059669] transition-colors disabled:opacity-50"
                            >
                              {processingEscrow === transaction.id ? (
                                <RefreshCw className="w-4 h-4 animate-spin" />
                              ) : (
                                'Release'
                              )}
                            </button>
                            <button
                              onClick={() => handleRefundEscrow(transaction)}
                              disabled={processingEscrow === transaction.id}
                              className="px-3 py-1.5 bg-[#EF4444] text-white text-sm font-medium rounded-lg hover:bg-[#DC2626] transition-colors disabled:opacity-50"
                            >
                              Refund
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transaction History */}
              <div className="cmd-panel">
                <div className="p-4 border-b border-[#4A5E78]">
                  <h3 className="font-semibold text-white">Transaction History</h3>
                </div>
                {completedEscrow.length === 0 && pendingEscrow.length === 0 ? (
                  <div className="p-8 text-center">
                    <Wallet className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                    <p className="text-[#64748B]">No transactions yet</p>
                    <p className="text-sm text-[#4A5E78] mt-1">
                      Player buy-ins will appear here when escrow is enabled
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#4A5E78]">
                    {completedEscrow.map((transaction) => (
                      <div key={transaction.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            transaction.status === 'released'
                              ? 'bg-[#10B981]/10'
                              : 'bg-[#EF4444]/10'
                          }`}>
                            {transaction.status === 'released' ? (
                              <ArrowUpRight className="w-5 h-5 text-[#10B981]" />
                            ) : (
                              <ArrowDownLeft className="w-5 h-5 text-[#EF4444]" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-white">
                              {transaction.player_name || 'Player'}
                            </p>
                            <p className="text-sm text-[#64748B]">
                              {transaction.status === 'released' ? 'Released' : 'Refunded'} - {new Date(transaction.updated_at || transaction.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <span className={`font-semibold ${
                          transaction.status === 'released' ? 'text-[#10B981]' : 'text-[#EF4444]'
                        }`}>
                          {transaction.status === 'released' ? '+' : '-'}${transaction.amount}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Info Note */}
              <div className="bg-[#F59E0B]/10 rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#F59E0B] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-[#F59E0B]">How Escrow Works</p>
                  <p className="text-sm text-[#F59E0B]/80 mt-1">
                    Players deposit buy-ins before the game. After the game ends, release funds to pay winners or refund if a player couldn't attend.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="space-y-4">
              {/* Basic Settings */}
              <div className="cmd-panel p-6">
                <h3 className="font-semibold text-white mb-4">Group Settings</h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Group Name</label>
                    <input
                      type="text"
                      value={group?.name || ''}
                      onChange={(e) => setGroup(prev => ({ ...prev, name: e.target.value }))}
                      onBlur={(e) => handleUpdateSettings({ name: e.target.value })}
                      className="w-full h-10 px-3 cmd-input"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Description</label>
                    <textarea
                      value={group?.description || ''}
                      onChange={(e) => setGroup(prev => ({ ...prev, description: e.target.value }))}
                      onBlur={(e) => handleUpdateSettings({ description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 cmd-input resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Default Stakes</label>
                      <input
                        type="text"
                        value={group?.stakes || ''}
                        onChange={(e) => setGroup(prev => ({ ...prev, stakes: e.target.value }))}
                        onBlur={(e) => handleUpdateSettings({ stakes: e.target.value })}
                        placeholder="$1/$2"
                        className="w-full h-10 px-3 cmd-input"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Max Players</label>
                      <select
                        value={group?.max_players || 9}
                        onChange={(e) => handleUpdateSettings({ max_players: parseInt(e.target.value) })}
                        className="w-full h-10 px-3 cmd-input"
                      >
                        {[6, 7, 8, 9, 10].map(n => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Privacy Settings */}
              <div className="cmd-panel p-6">
                <h3 className="font-semibold text-white mb-4">Privacy</h3>

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 bg-[#0D192E] rounded-lg cursor-pointer">
                    <div>
                      <p className="font-medium text-white">Require Approval</p>
                      <p className="text-sm text-[#64748B]">New members must be approved before joining</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={group?.requires_approval ?? true}
                      onChange={(e) => handleUpdateSettings({ requires_approval: e.target.checked })}
                      className="w-5 h-5 text-[#22D3EE] border-[#4A5E78] rounded focus:ring-[#22D3EE]"
                    />
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Visibility</label>
                    <select
                      value={group?.visibility || 'private'}
                      onChange={(e) => handleUpdateSettings({ visibility: e.target.value })}
                      className="w-full h-10 px-3 cmd-input"
                    >
                      <option value="private">Private - Invite only</option>
                      <option value="friends">Friends - Visible to friends</option>
                      <option value="public">Public - Anyone can find</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Invite Code */}
              <div className="cmd-panel p-6">
                <h3 className="font-semibold text-white mb-4">Invite Code</h3>
                <div className="flex items-center gap-3">
                  <code className="flex-1 px-4 py-3 bg-[#0D192E] rounded-lg font-mono text-lg tracking-wider text-center">
                    {group?.invite_code || 'N/A'}
                  </code>
                  <button
                    onClick={() => {
                      if (group?.invite_code) {
                        navigator.clipboard.writeText(group.invite_code);
                        alert('Invite code copied!');
                      }
                    }}
                    className="cmd-btn cmd-btn-primary px-4 py-3"
                  >
                    Copy
                  </button>
                </div>
                <p className="text-sm text-[#64748B] mt-2">Share this code with players you want to invite</p>
              </div>

              {/* Danger Zone */}
              <div className="cmd-panel border border-[#EF4444]/30 p-6">
                <h3 className="font-semibold text-[#EF4444] mb-4">Danger Zone</h3>
                <p className="text-sm text-[#64748B] mb-4">
                  Once you delete a group, there is no going back. All scheduled games and member data will be permanently removed.
                </p>
                <button
                  onClick={handleDeleteGroup}
                  className="px-4 py-2 bg-[#EF4444] text-white font-medium rounded-lg hover:bg-[#DC2626]"
                >
                  Delete Group
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Schedule Modal */}
      <ScheduleEventModal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        onSubmit={() => fetchData()}
        group={group}
      />
    </>
  );
}
