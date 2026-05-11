import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../../src/components/seo/SEOHead';
import { ArrowLeft, Users, Shield, ShieldAlert, BadgeInfo, MessageSquare, Megaphone, Loader2, UserX, X, Send } from 'lucide-react';
import { useRequireAuth, getAccessToken } from '../../../../../src/lib/authUtils';
import { toast } from 'react-hot-toast';

function AnnounceModal({ isOpen, onClose, onSend, sending }) {
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="cmd-panel cmd-corner-lights w-full max-w-lg">
        <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-[#22D3EE]" />
            Broadcast Announcement
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-[#132240] rounded-lg transition-colors">
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-[#64748B] mb-4">
            This will send a Push Notification to all opted-in players. Use this for urgent updates like game cancellations or table changes.
          </p>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your announcement here..."
            rows={4}
            className="w-full p-3 cmd-input resize-none"
          />
        </div>
        <div className="p-4 border-t border-[#4A5E78] flex justify-end gap-3">
          <button onClick={onClose} className="cmd-btn cmd-btn-secondary px-4">
            Cancel
          </button>
          <button
            onClick={() => onSend(message)}
            disabled={!message.trim() || sending}
            className="cmd-btn cmd-btn-primary px-6 flex items-center gap-2 disabled:opacity-50"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Broadcast
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomeGameRosterPage() {
  const router = useRouter();
  const { id } = router.query;
  const { checking } = useRequireAuth(`/hub/commander/home-games/${id}/roster`);
  
  const [group, setGroup] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAnnounce, setShowAnnounce] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchRoster = useCallback(async () => {
    if (!id) return;
    try {
      const token = getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      // Load group to ensure admin/host check
      const groupRes = await fetch(`/api/commander/home-games/groups/${id}`, { headers });
      const groupData = await groupRes.json();
      const g = groupData.group || groupData.data?.group;
      
      setGroup(g);

      // Note: host_id check below is best-effort client-side — the roster API
      // enforces admin/host ownership server-side and returns 403 if not authorized.

      const res = await fetch(`/api/commander/home-games/groups/${id}/roster`, { headers });
      if (!res.ok) throw new Error('Not authorized');
      
      const data = await res.json();
      if (data.success) {
        // Sort roster
        const roleWeight = { owner: 4, host: 4, admin: 3, core: 2, member: 1, follower: 0 };
        const sorted = (data.roster || []).sort((a, b) => {
          if (a.status !== 'banned' && b.status === 'banned') return -1;
          if (a.status === 'banned' && b.status !== 'banned') return 1;
          
          const wA = roleWeight[a.role?.toLowerCase() || ''] ?? 0;
          const wB = roleWeight[b.role?.toLowerCase() || ''] ?? 0;
          if (wA !== wB) return wB - wA;
          
          return (a.display_name || '').localeCompare(b.display_name || '');
        });
        setRoster(sorted);
      }
    } catch (err) {
      toast.error('Failed to load roster or access denied');
      router.push(`/hub/commander/home-games/${id}`);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (router.isReady && !checking) {
      // BUG FIX #21: Removed window.supabaseUser bail — this caused the page
      // to silently get stuck in a loading state if supabaseUser wasn't hydrated
      // before router.isReady fired. All actual auth is enforced server-side
      // (the roster API returns 403 if caller isn't admin/host). Safe to proceed.
      fetchRoster();
    }
  }, [router.isReady, checking, fetchRoster]);

  async function handleStartDm(targetUserId) {
    if (!targetUserId) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${id}/dm-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ target_user_id: targetUserId })
      });
      const data = await res.json();
      if (data.success && data.dm_url) {
        router.push(data.dm_url);
      } else {
        toast.error(data.error?.message || data.error || 'Failed to start message');
      }
    } catch (err) {
      toast.error('Failed to start message');
    }
  }

  async function handleRemove(memberId) {
    if (!confirm('Are you sure you want to remove this player from the group?')) return;
    try {
      const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${id}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ member_id: memberId })
      });
      if (res.ok) {
        toast.success('Player removed');
        fetchRoster();
      }
    } catch (err) {
      toast.error('Failed to remove player');
    }
  }

  async function handleBroadcast(message) {
    setSending(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${id}/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          // bug-hunt-zero/B-ROSTER-1: parallel to the manage.js broadcast fix
          // (PR #317). Without this header a timeout-then-retry could
          // double-notify every member + follower. setSending already blocks
          // local re-entry; this defends against network retries.
          'X-Idempotency-Key': (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'idem_' + Math.random().toString(36).slice(2) + Date.now().toString(36),
        },
        body: JSON.stringify({ message_text: message })
      });
      const data = await res.json();
      if (data.success) {
        const { members_notified, followers_notified } = data.result || { members_notified: 0, followers_notified: 0 };
        toast.success(`Announcement sent! Notified ${members_notified || 0} members and ${followers_notified || 0} followers.`);
        setShowAnnounce(false);
      } else {
        toast.error(data.error?.message || data.error || 'Broadcast failed');
      }
    } catch (err) {
      console.warn(err);
      toast.error('Failed to broadcast message');
    } finally {
      setSending(false);
    }
  }

  if (loading || checking) {
    return <div className="cmd-page flex items-center justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" /></div>;
  }

  return (
    <>
      <SEOHead title="Roster | Commander" noindex={true} />
      <div className="cmd-page">
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => router.push(`/hub/commander/home-games/${id}/manage`)} className="p-2 hover:bg-[#132240] rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">Database of Players</h1>
                <p className="text-sm text-[#64748B]">{group?.name}</p>
              </div>
            </div>
            <button
              onClick={() => setShowAnnounce(true)}
              className="cmd-btn cmd-btn-primary px-4 py-2 flex items-center gap-2"
            >
              <Megaphone className="w-4 h-4" />
              <span className="hidden sm:inline">Announce</span>
            </button>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="cmd-panel overflow-x-auto">
            <table className="w-full min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[#4A5E78] text-sm text-[#64748B]">
                  <th className="p-4 font-medium">Player</th>
                  <th className="p-4 font-medium">Badge</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium">Last Attended</th>
                  <th className="p-4 font-medium text-center">Notifications</th>
                  <th className="p-4 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#4A5E78]">
                {roster.map(p => (
                  <tr key={p.user_id || p.id} className={`hover:bg-[#132240]/50 transition-colors ${p.status === 'banned' ? 'opacity-50' : ''}`}>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#1A2C4D] flex items-center justify-center overflow-hidden shrink-0">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <Users className="w-5 h-5 text-[#64748B]" />
                          )}
                        </div>
                        <span className="font-medium text-white whitespace-nowrap">{p.display_name || 'Member'}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {['owner', 'host'].includes(p.role?.toLowerCase()) && <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-[#22D3EE]/10 text-[#22D3EE]"><Shield className="w-3 h-3" /> Host</span>}
                      {p.role?.toLowerCase() === 'admin' && <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-[#F59E0B]/10 text-[#F59E0B]"><ShieldAlert className="w-3 h-3" /> Admin</span>}
                      {p.role?.toLowerCase() === 'core' && <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded bg-[#8B5CF6]/10 text-[#8B5CF6]">Core</span>}
                      {['member', 'follower'].includes(p.role?.toLowerCase()) && <span className="text-sm text-[#64748B] capitalize">{p.role}</span>}
                    </td>
                    <td className="p-4 capitalize">
                      {p.status === 'banned' ? <span className="text-[#EF4444] font-medium border border-[#EF4444]/30 px-2 py-1 rounded">Banned</span> : <span className="text-[#10B981]">{p.status}</span>}
                    </td>
                    <td className="p-4 text-sm text-[#BAC5D6]">
                      {p.last_attended_date ? new Date(p.last_attended_date).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`text-xs px-2 py-1 rounded ${p.notifications_enabled !== false ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'}`}>
                        {p.notifications_enabled !== false ? 'ON' : 'OFF'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        {p.user_id && (
                          <button onClick={() => handleStartDm(p.user_id)} className="p-2 bg-[#1A2C4D] rounded text-[#22D3EE] hover:bg-[#2A416F] transition-colors" title="Message">
                            <MessageSquare className="w-4 h-4" />
                          </button>
                        )}
                        {p.role !== 'owner' && p.role !== 'host' && (
                          <button onClick={() => handleRemove(p.member_id || p.id)} className="p-2 bg-[#1A2C4D] rounded text-[#EF4444] hover:bg-[#EF4444]/20 transition-colors" title="Remove">
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {roster.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-[#64748B]">No players in roster</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      <AnnounceModal
        isOpen={showAnnounce}
        onClose={() => setShowAnnounce(false)}
        onSend={handleBroadcast}
        sending={sending}
      />
    </>
  );
}
