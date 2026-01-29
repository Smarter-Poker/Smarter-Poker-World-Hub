/**
 * Home Game Group Management Page
 * Host can manage members, schedule events, send announcements
 * UI: Facebook color scheme, no emojis, Inter font
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
  Check
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
      const res = await fetch('/api/club-commander/home-games/events', {
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-semibold text-[#1F2937]">Schedule Game</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">Date</label>
              <input
                type="date"
                value={eventData.scheduled_date}
                onChange={(e) => setEventData(prev => ({ ...prev, scheduled_date: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">Time</label>
              <input
                type="time"
                value={eventData.scheduled_time}
                onChange={(e) => setEventData(prev => ({ ...prev, scheduled_time: e.target.value }))}
                className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Stakes</label>
            <input
              type="text"
              value={eventData.stakes}
              onChange={(e) => setEventData(prev => ({ ...prev, stakes: e.target.value }))}
              className="w-full h-10 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Max Players</label>
            <div className="flex gap-2">
              {[6, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setEventData(prev => ({ ...prev, max_players: num }))}
                  className={`flex-1 h-10 rounded-lg border font-medium transition-colors ${
                    eventData.max_players === num
                      ? 'border-[#1877F2] bg-[#1877F2] text-white'
                      : 'border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Notes (optional)</label>
            <textarea
              value={eventData.notes}
              onChange={(e) => setEventData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Any special details for this game..."
              rows={2}
              className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleSubmit}
            disabled={!eventData.scheduled_date || submitting}
            className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
    <div className="flex items-center gap-3 p-4 border-b border-[#E5E7EB] last:border-b-0">
      <div className="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center overflow-hidden">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
        ) : (
          <Users className="w-5 h-5 text-[#1877F2]" />
        )}
      </div>

      <div className="flex-1">
        <p className="font-medium text-[#1F2937]">{member.display_name || 'Member'}</p>
        <p className="text-sm text-[#6B7280]">
          {isPending ? 'Pending approval' : `Joined ${new Date(member.created_at).toLocaleDateString()}`}
        </p>
      </div>

      {isHost && (
        <span className="px-2 py-1 bg-[#1877F2]/10 text-[#1877F2] text-xs font-medium rounded">
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
          className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors"
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
  const [loading, setLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [activeTab, setActiveTab] = useState('events');

  const fetchData = useCallback(async () => {
    if (!id) return;

    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const headers = { Authorization: `Bearer ${token}` };

      const [groupRes, membersRes, eventsRes] = await Promise.all([
        fetch(`/api/club-commander/home-games/groups/${id}`, { headers }),
        fetch(`/api/club-commander/home-games/groups/${id}/members`, { headers }),
        fetch(`/api/club-commander/home-games/events?group_id=${id}`, { headers })
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
      await fetch(`/api/club-commander/home-games/groups/${id}/members`, {
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
      await fetch(`/api/club-commander/home-games/groups/${id}/members?member_id=${member.id}`, {
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
      await fetch(`/api/club-commander/home-games/events/${event.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  const pendingMembers = members.filter(m => m.status === 'pending');
  const approvedMembers = members.filter(m => m.status !== 'pending');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Manage {group?.name || 'Home Game'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push(`/hub/club-commander/home-games/${id}`)}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937]">Manage Group</h1>
                <p className="text-sm text-[#6B7280]">{group?.name}</p>
              </div>
            </div>

            <button
              onClick={() => setShowScheduleModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Schedule Game
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-white border-b border-[#E5E7EB]">
          <div className="max-w-4xl mx-auto px-4">
            <div className="flex gap-6">
              {[
                { id: 'events', label: 'Upcoming Games', icon: Calendar },
                { id: 'members', label: `Members (${members.length})`, icon: Users },
                { id: 'settings', label: 'Settings', icon: Settings }
              ].map(({ id: tabId, label, icon: Icon }) => (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={`flex items-center gap-2 py-3 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tabId
                      ? 'border-[#1877F2] text-[#1877F2]'
                      : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                  {tabId === 'members' && pendingMembers.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-[#EF4444] text-white text-xs rounded-full">
                      {pendingMembers.length}
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
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                  <Calendar className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                  <p className="text-[#6B7280]">No games scheduled</p>
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="mt-4 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg"
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
                      className="bg-white rounded-xl border border-[#E5E7EB] p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-semibold text-[#1F2937]">
                          {eventDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex items-center gap-4 mt-1 text-sm text-[#6B7280]">
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
                        className="p-2 text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors"
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
                <div className="bg-white rounded-xl border border-[#E5E7EB]">
                  <div className="p-4 border-b border-[#E5E7EB]">
                    <h3 className="font-semibold text-[#1F2937]">
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

              <div className="bg-white rounded-xl border border-[#E5E7EB]">
                <div className="p-4 border-b border-[#E5E7EB]">
                  <h3 className="font-semibold text-[#1F2937]">
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

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 space-y-6">
              <div>
                <h3 className="font-semibold text-[#1F2937] mb-4">Group Settings</h3>
                <p className="text-sm text-[#6B7280]">
                  Group settings management coming soon. For now, you can schedule games and manage members.
                </p>
              </div>

              <div className="pt-4 border-t border-[#E5E7EB]">
                <button className="text-[#EF4444] text-sm font-medium hover:underline">
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
