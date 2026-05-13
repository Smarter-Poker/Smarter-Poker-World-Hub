/**
 * Home Game Group Management Page
 * Host can manage members, schedule events, send announcements
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../../src/components/seo/SEOHead';

// Phase 41/audit-sweep-B-mgmt: module-level idempotency-token generator.
// Used by the broadcast, DM, and ScheduleEventModal POSTs so a network
// timeout-then-retry doesn't double-send / double-create. Falls back to a
// time+random suffix when crypto.randomUUID is unavailable.
function makeIdemKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'idem_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
import { ArrowLeft, Users, Calendar, Plus, Settings, UserMinus, Clock, DollarSign, Trash2, Loader2, X, Check, Wallet, ArrowUpRight, ArrowDownLeft, RefreshCw, AlertCircle, Heart, List, Megaphone, MessageSquare, Trophy } from 'lucide-react';
import RSVPManager from '../../../../../src/components/commander/home-games/RSVPManager';
import HomeGamesSeatReservation from '../../../../../src/components/home-games/HomeGamesSeatReservation';
import HostRosterPickerModal from '../../../../../src/components/home-games/HostRosterPickerModal';
import HostCreateTableModal from '../../../../../src/components/home-games/HostCreateTableModal';
import TournamentList from '../../../../../src/components/home-games/TournamentList';
import TournamentEditModal from '../../../../../src/components/home-games/TournamentEditModal';
import { supabase } from '../../../../../src/lib/supabase';
import { useRequireAuth, getAccessToken, getSafeUser } from '../../../../../src/lib/authUtils';
import useTrainingBus from '../../../../../src/hooks/useTrainingBus';
import { busEmit } from '../../../../../src/engine/EventBus';
import { toast } from 'react-hot-toast';
import { safeCopyToClipboard } from '../../../../../src/lib/clipboard';

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
  // Phase 41/audit-sweep-B-mgmt: idempotency token kept stable across
  // retries until a 2xx or 4xx settles (then rotate). Network/5xx errors
  // keep the token so a safe retry doesn't double-create the event.
  const idemKeyRef = useRef(makeIdemKey());

  async function handleSubmit() {
    if (!eventData.scheduled_date) return;

    setSubmitting(true);
    const datetime = `${eventData.scheduled_date}T${eventData.scheduled_time}:00`;

    try {
        const token = getAccessToken();
      const res = await fetch('/api/commander/home-games/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': idemKeyRef.current,
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

      // Server saw and answered (2xx/4xx) → rotate the token so the next
      // attempt is a fresh logical operation. Keep it on 5xx/network so
      // the retry stays deduplicated.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        idemKeyRef.current = makeIdemKey();
      }

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success || data.event) {
        onSubmit?.(data.event);
        onClose();
      } else if (data.error) {
        // B13: surface PAST_SCHEDULED_DATE from the DB trigger
        const errMsg = data.error?.message || data.error || '';
        if (errMsg.includes('PAST_SCHEDULED_DATE') || errMsg.includes('past')) {
          toast.error('Cannot schedule a game in the past — please choose a future date');
        } else {
          toast.error(errMsg || 'Failed to schedule game');
        }
      }
    } catch (error) {
      console.warn('Failed to schedule event:', error);
      toast.error(error.message || 'Failed to schedule game');
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
              placeholder="Any Special Details For This Game..."
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

function MemberRow({ member, isHost, onApprove, onRemove, onMessage }) {
  const isPending = member.status === 'pending';

  return (
    <div className="flex items-center gap-3 p-4 border-b border-[#4A5E78] last:border-b-0">
      <div className="w-10 h-10 rounded-full bg-[#22D3EE]/10 flex items-center justify-center overflow-hidden">
        {member.avatar_url ? (
          <img src={member.avatar_url} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover" style={{borderRadius:'50%'}} />
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
        <span className="px-2 py-1 bg-[#22D3EE]/10 text-[#22D3EE] text-xs font-medium rounded mr-2">
          Host
        </span>
      )}

      {onMessage && (
        <button
          onClick={() => onMessage(member.user_id)}
          className="p-2 mr-2 bg-[#132240] rounded-lg text-[#22D3EE] hover:bg-[#1E3A5F] transition-colors"
          title="Message Player"
        >
          <MessageSquare className="w-4 h-4" />
        </button>
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
  const { checking: authChecking } = useRequireAuth(`/hub/commander/home-games/${id}/manage`);
  useTrainingBus('home-games-manage');

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [escrowTransactions, setEscrowTransactions] = useState([]);
  const [saves, setSaves] = useState([]); // Home Game 'Saves/Followers' tracking
  const [loading, setLoading] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [activeTab, setActiveTab] = useState('events');
  const [processingEscrow, setProcessingEscrow] = useState(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [expandedEventId, setExpandedEventId] = useState(null);
  // Dan-fix/tournament-buildout: tournament list + modal state. Loaded
  // separately via rpc_hg_list_tournaments so we don't depend on the
  // commander events API returning the new format/structure cols.
  const [tournaments, setTournaments] = useState([]);
  const [tournamentModal, setTournamentModal] = useState({ open: false, mode: 'create', target: null });
  const [eventRsvps, setEventRsvps] = useState([]);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [pageSlug, setPageSlug] = useState(null);
  const [pageUrlCopied, setPageUrlCopied] = useState(false);

  // Phase 41/audit-sweep-B-mgmt: in-flight guard for the broadcast action.
  // The button uses window.prompt() then POSTs, so a host who clicks twice
  // can send the same announcement twice (with two prompts). The ref blocks
  // re-entry until the first request settles. Pairs with X-Idempotency-Key
  // so a timeout-then-retry doesn't double-send to N members either.
  const broadcastingRef = useRef(false);
  // bug-hunt-zero/B-MGR-7: re-entry guard for the irreversible delete-group action.
  const deletingGroupRef = useRef(false);

  // Phase 41 — seat reservation + host modals
  const [currentUserId, setCurrentUserId]   = useState(null);
  const [rosterPickerState, setRosterPickerState] = useState(null);
  // shape: { gameId, tableId, seatNumber, maxSeats, occupiedSeats }
  const [createTableState, setCreateTableState]   = useState(null);
  // shape: { gameId, defaults }
  const [seatRefreshKey, setSeatRefreshKey] = useState(0);

  // Resolve the signed-in user once — used to highlight own-seats in the grid.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const u = await getSafeUser(supabase);
        if (!cancelled) setCurrentUserId(u?.id || null);
      } catch { /* ignore — seat grid still renders, own-seat actions just won't light up */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Start a direct message with a user
  // Phase 41/audit-sweep-B-mgmt: idempotency-protected. If the server
  // doesn't dedupe (host_user_id, target_user_id), a network retry could
  // create a second DM session; the header lets a future server-side fix
  // collapse retries deterministically.
  async function handleStartDm(targetUserId) {
    if (!targetUserId) return;
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

  const fetchData = useCallback(async (signal) => {

  if (!router.isReady) return null;

    if (!id) return;

    try {
        const token = getAccessToken();
      const headers = { Authorization: `Bearer ${token}` };

      const fo = signal ? { headers, signal } : { headers };
      const [groupRes, membersRes, eventsRes, escrowRes] = await Promise.all([
        fetch(`/api/commander/home-games/groups/${id}`, fo),
        fetch(`/api/commander/home-games/groups/${id}/members`, fo),
        fetch(`/api/commander/home-games/events?group_id=${id}`, fo),
        fetch(`/api/commander/escrow?group_id=${id}`, fo).catch(() => ({ ok: false }))
      ]);

      const groupData = await groupRes.json();
      const membersData = await membersRes.json();
      const eventsData = await eventsRes.json();

      if (groupData.group || groupData.data?.group) {
        const g = groupData.group || groupData.data.group;
        setGroup(g);
        // Resolve the public page slug (exists only for public groups that
        // have an auto-created social page). Fail-silent on private groups.
        if (g?.id) {
          const { data: sp } = await supabase
            .from('social_pages')
            .select('slug')
            .eq('linked_entity_type', 'home_group')
            .eq('linked_entity_id', g.id)
            .eq('page_type', 'home_game')
            .eq('is_public', true)
            .maybeSingle();
          if (sp?.slug) setPageSlug(sp.slug);
          else setPageSlug(null);
        }
      }
      if (membersData.members || membersData.data?.members) {
        setMembers(membersData.members || membersData.data.members || []);
      }
      if (eventsData.events || eventsData.data?.events) {
        setEvents(eventsData.events || eventsData.data.events || []);
      }

      // Dan-fix/tournament-buildout: parallel SECURITY DEFINER RPC fetch.
      // Independent of the commander events API. Non-fatal if it fails — host
      // sees an empty tournament list and can add one to start over.
      try {
        const { data: trnData, error: trnErr } = await supabase
          .rpc('rpc_hg_list_tournaments', { p_group_id: id, p_include_past: true });
        if (!trnErr && Array.isArray(trnData)) {
          setTournaments(trnData);
        } else if (trnErr) {
          console.warn('[home-games/manage] tournaments fetch:', trnErr.message);
        }
      } catch (trnErr) {
        console.warn('[home-games/manage] tournaments fetch threw:', trnErr);
      }

      // Escrow data (may not exist yet)
      if (escrowRes.ok) {
        const escrowData = await escrowRes.json();
        if (escrowData.success) {
          setEscrowTransactions(escrowData.data?.transactions || []);
        }
      }
      // Fetch Saves Data directly via client supabase
      const { data: savesData, error: savesError } = await supabase
        .from('poker_near_me_favorites')
        .select(`
          *,
          profiles:user_id(id, display_name, avatar_url)
        `)
        .eq('venue_id', id);
        
      if (!savesError && savesData) {
          setSaves(savesData);
      }

    } catch (error) {
      console.warn('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (authChecking) return;
    const _c = new AbortController();
    fetchData(_c.signal);
    return () => _c.abort();
  }, [fetchData, authChecking]);

  // Dan-fix/tournament-buildout: honor ?tab=tournaments query param.
  // When the host clicks "Edit" on a tournament from /hub/commander/home-games/[id].js,
  // they're redirected here with the query param set. Activate the right
  // tab so they land on the tournaments view instead of the default events.
  useEffect(() => {
    if (!router.isReady) return;
    const wanted = router.query?.tab;
    if (typeof wanted === 'string' && wanted.length > 0) {
      setActiveTab(wanted);
    }
  }, [router.isReady, router.query?.tab]);
  // Realtime listener — live updates for home-games/[id]/manage.js
  // v2 suffix forces reconnect for browser sessions opened before the
  // 2026-04-26 publication migration.
  useEffect(() => {
    if (!id) return;
    const ch = supabase
      .channel(`hg-manage-v2:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_home_games', filter: `group_id=eq.${id}` }, () => { fetchData(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commander_home_members', filter: `group_id=eq.${id}` }, () => { fetchData(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function handleApproveMember(member) {
    try {
        const token = getAccessToken();
      await fetch(`/api/commander/home-games/groups/${id}/members`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ member_id: member.id, status: 'approved' })
      });
      busEmit.dataMutated('home-games');
      fetchData();
    } catch (error) {
      console.warn('Approve failed:', error);
      toast.error(error.message || 'Approve failed');
    }
  }

  async function handleRemoveMember(member) {
    if (!confirm(`Remove ${member.display_name || 'this member'}?`)) return;

    // bug-hunt-zero/B-MGR-6: same silent-failure pattern. DELETE goes
    // through, server says no (403 — not the host, 404 — already gone,
    // 409 — protected member), but fetchData() reloads the list with
    // the member still in it and no error toast. Host re-clicks Remove
    // forever and wonders why it doesn't work.
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${id}/members?member_id=${member.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || `Couldn't remove member (${res.status})`;
        throw new Error(msg);
      }
      busEmit.dataMutated('home-games');
      fetchData();
    } catch (error) {
      console.warn('Remove failed:', error);
      toast.error(error.message || 'Remove failed');
    }
  }

  async function loadEventRsvps(eventId) {
    setRsvpLoading(true);
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/events/${eventId}/rsvp`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setEventRsvps(data.rsvps || data.data?.rsvps || []);
    } catch (err) {
      console.warn('Load RSVPs failed:', err);
      setEventRsvps([]);
      // bug-hunt-zero/B-MGR-5: an empty RSVP list could mean "no RSVPs yet"
      // OR "load failed". Without a toast the host can't tell which, so
      // they might think nobody's coming when really the request 500'd.
      toast.error(err && err.message ? `Couldn't load RSVPs: ${err.message}` : 'Failed to load RSVPs');
    } finally {
      setRsvpLoading(false);
    }
  }

  async function handleRsvpAction(rsvpId, action) {
    // bug-hunt-zero/B-MGR-3: was a silent-failure factory — host clicks
    // approve/decline, server 4xx's, list silently reloads showing no
    // change. Now we check res.ok and surface the error.
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/rsvps/${rsvpId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: action })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const msg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || `Couldn't update RSVP (${res.status})`;
        throw new Error(msg);
      }
      if (expandedEventId) loadEventRsvps(expandedEventId);
    } catch (err) {
      setRsvpLoading(false);
      console.warn('RSVP action failed:', err);
      toast.error(err && err.message ? err.message : 'Failed to update RSVP');
    }
  }

  async function handleDeleteEvent(event) {
    if (!confirm('Delete this scheduled game?')) return;

    // bug-hunt-zero/B-MGR-4: silent-failure fix. await fetch with no
    // res.ok check meant a 403/409/500 left the event in place, but
    // fetchData() reloaded the same list so the UI looked unchanged
    // with no indication of failure to the host.
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/events/${event.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || `Couldn't delete event (${res.status})`;
        throw new Error(msg);
      }
      toast.success('Event deleted');
      fetchData();
    } catch (error) {
      setRsvpLoading(false);
      console.warn('Delete failed:', error);
      toast.error(error.message || 'Delete failed');
    }
  }

  async function handleReleaseEscrow(transaction) {
    if (!confirm(`Release $${transaction.amount} to ${transaction.player_name || 'player'}?`)) return;

    setProcessingEscrow(transaction.id);
    // bug-hunt-zero/B-MGR-1: idempotency on a FINANCIAL operation.
    // A timeout-then-retry on a release that actually succeeded could
    // double-credit the player. processingEscrow already blocks local
    // re-entry; this defends against network-layer retries.
    const idemKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'idem_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/escrow/${transaction.id}/release`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': idemKey,
        }
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        busEmit.dataMutated('home-games');
        fetchData();
      } else {
        toast.error(data.error?.message || data.error || 'Failed to release escrow');
      }
    } catch (error) {
      console.warn('Release failed:', error);
      toast.error(error.message || 'Release failed');
    } finally {
      setProcessingEscrow(null);
    }
  }

  async function handleRefundEscrow(transaction) {
    if (!confirm(`Refund $${transaction.amount} to ${transaction.player_name || 'player'}?`)) return;

    setProcessingEscrow(transaction.id);
    // bug-hunt-zero/B-MGR-2: idempotency on the matching financial op.
    // Parity with B-MGR-1. Same retry risk, same fix.
    const idemKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'idem_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/escrow/${transaction.id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': idemKey,
        },
        body: JSON.stringify({ reason: 'Host initiated refund' })
      });

      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (data.success) {
        busEmit.dataMutated('home-games');
        fetchData();
      } else {
        toast.error(data.error?.message || data.error || 'Failed to refund escrow');
      }
    } catch (error) {
      console.warn('Refund failed:', error);
      toast.error(error.message || 'Refund failed');
    } finally {
      setProcessingEscrow(null);
    }
  }

  async function handleDeleteGroup() {
    if (!confirm('Are you sure you want to delete this group? This action cannot be undone.')) return;

    // bug-hunt-zero/B-MGR-7: in-flight guard. The confirm dialog → fetch
    // window is long enough that a frustrated user might double-tap OK.
    // Without this, two parallel DELETE requests fire — the second 404s
    // and the user sees an "already deleted" error that came from their
    // own first request.
    if (deletingGroupRef.current) return;
    deletingGroupRef.current = true;

    setDeleteError(null);
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      // Parse the response body once and check both error paths
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || `Couldn't delete group (${res.status})`;
        throw new Error(msg);
      }
      if (data.success) {
        busEmit.dataMutated('home-games');
        router.push('/hub/commander/home-games');
      } else {
        setDeleteError(data.error?.message || 'Failed to delete group');
      }
    } catch (error) {
      console.warn('Delete group failed:', error);
      setDeleteError(error && error.message ? error.message : 'Failed to delete group');
    } finally {
      deletingGroupRef.current = false;
    }
  }

  async function handleUpdateSettings(newSettings) {
    try {
        const token = getAccessToken();
      const res = await fetch(`/api/commander/home-games/groups/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newSettings)
      });

      // bug-hunt-zero/B-MGR-8: was silently failing. Now we (a) surface
      // server errors to the user via toast, and (b) prefer the
      // server-canonical group from data.group rather than blindly
      // merging the client's newSettings — server may clamp/normalize
      // values (e.g. trim a name, coerce booleans). If only data.success
      // came back, fall back to the optimistic merge since we have no
      // other source of truth.
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const msg = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || `Couldn't update settings (${res.status})`;
        throw new Error(msg);
      }
      if (data.group) {
        setGroup(data.group);
      } else if (data.success) {
        setGroup(prev => ({ ...prev, ...newSettings }));
      }
      toast.success('Settings updated');
    } catch (error) {
      console.warn('Update settings failed:', error);
      toast.error(error && error.message ? error.message : 'Failed to update settings');
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
      <SEOHead
                title="Manage Home Game"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />

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
                { id: 'tournaments', label: 'Tournaments', icon: Trophy,
                  badge: tournaments.filter((t) => t.status === 'scheduled').length > 0
                           ? tournaments.filter((t) => t.status === 'scheduled').length
                           : null },
                { id: 'members', label: `Members (${members.length})`, icon: Users },
                { id: 'saves', label: 'Audience', icon: Heart, badge: saves.length > 0 ? saves.length : null },
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
          {/* Events Tab — Dan-fix/tournament-dedup: filter tournaments OUT
              of the cash-games list (they live on the Tournaments tab now).
              Belt-and-braces: filter by format='tournament' AND by id-set so
              even if the events API doesn't return format, tournament rows
              are still excluded by id. */}
          {activeTab === 'events' && (() => {
            const tournamentIds = new Set((tournaments || []).map((t) => t.id));
            const cashEvents = (events || []).filter(
              (e) => e.format !== 'tournament' && !tournamentIds.has(e.id)
            );
            return (
              <div className="space-y-4">
                {cashEvents.length === 0 ? (
                  <div className="cmd-panel p-8 text-center">
                    <Calendar className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                    <p className="text-[#64748B]">No Games Scheduled</p>
                    <button
                      onClick={() => setShowScheduleModal(true)}
                      className="mt-4 cmd-btn cmd-btn-primary"
                    >
                      Schedule a Game
                    </button>
                  </div>
                ) : (
                  cashEvents.map((event) => {
                  const eventDate = new Date(event.scheduled_date);
                  return (
                    <div
                      key={event.id}
                      className="cmd-panel p-4"
                    >
                      <div className="flex items-center justify-between">
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
                              {/* B2: use server-authoritative rsvp_yes (not legacy rsvp_count) */}
                              {(event.rsvp_yes ?? event.rsvp_count) || 0}/{event.max_players}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-4 h-4" />
                              {event.stakes}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (expandedEventId === event.id) {
                                setExpandedEventId(null);
                              } else {
                                setExpandedEventId(event.id);
                                loadEventRsvps(event.id);
                              }
                            }}
                            className="cmd-btn cmd-btn-secondary text-xs px-3 py-1"
                          >
                            {expandedEventId === event.id ? 'Hide RSVPs' : 'Manage RSVPs'}
                          </button>
                          <button
                            onClick={() => handleDeleteEvent(event)}
                            className="p-2 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                      {expandedEventId === event.id && (
                        <div className="mt-4 pt-4 border-t border-[#4A5E78] space-y-6">
                          <HomeGamesSeatReservation
                            key={`seat-res-${event.id}-${seatRefreshKey}`}
                            gameId={event.id}
                            currentUserId={currentUserId}
                            isHost={true}
                            onOpenRosterPicker={({ tableId, seatNumber, maxSeats, occupiedSeats }) => {
                              // All four values are authoritative — resolved by
                              // HomeGamesSeatReservation from the live tables state.
                              // Previously this hardcoded maxSeats=9 + empty
                              // occupiedSeats, which broke 6-max tables and
                              // offered seats that were already taken.
                              setRosterPickerState({
                                gameId: event.id,
                                tableId,
                                seatNumber: seatNumber || null,
                                maxSeats: maxSeats || 9,
                                occupiedSeats: occupiedSeats || new Set(),
                              });
                            }}
                            onCreateTable={() => {
                              setCreateTableState({
                                gameId: event.id,
                                defaults: {
                                  gameType: event.game_type || 'NLH',
                                  stakes:   event.stakes || '',
                                  format:   event.format || 'cash',
                                  maxSeats: event.max_players || 9,
                                  buyinMin: event.buyin_min,
                                  buyinMax: event.buyin_max
                                }
                              });
                            }}
                          />
                          <RSVPManager
                            rsvps={eventRsvps}
                            event={event}
                            isHost={true}
                            isLoading={rsvpLoading}
                            onApprove={(rsvpId) => handleRsvpAction(rsvpId, 'yes')}
                            onDecline={(rsvpId) => handleRsvpAction(rsvpId, 'no')}
                            onWaitlist={(rsvpId) => handleRsvpAction(rsvpId, 'waitlist')}
                            onRemove={(rsvpId) => handleRsvpAction(rsvpId, 'removed')}
                            onSendMessage={(userId) => handleStartDm(userId)}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              </div>
            );
          })()}

          {/* Tournaments Tab — Dan-fix/tournament-buildout
              Add / Edit / Cancel for tournament events. Tournaments persist
              as commander_home_games rows with format='tournament'; the
              backing RPCs are rpc_hg_create_tournament + rpc_hg_update_tournament
              + cancel_home_game. Realtime listener already subscribes to
              commander_home_games changes so the list refreshes after each
              mutation without an explicit refetch. */}
          {activeTab === 'tournaments' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Tournaments</h2>
                  <p className="text-sm text-[#64748B] mt-0.5">
                    {tournaments.filter((t) => t.status === 'scheduled').length} upcoming
                    {tournaments.filter((t) => t.status === 'cancelled').length > 0 &&
                      ` · ${tournaments.filter((t) => t.status === 'cancelled').length} cancelled`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setTournamentModal({ open: true, mode: 'create', target: null })}
                  className="cmd-btn cmd-btn-primary h-10 px-4 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Tournament
                </button>
              </div>

              {tournaments.length === 0 ? (
                <div className="cmd-panel p-8 text-center">
                  <Trophy className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                  <p className="text-[#64748B]">No Tournaments Scheduled</p>
                  <p className="text-xs text-[#64748B] mt-1">
                    Tournaments inherit the RSVP and seat-reservation systems automatically once created.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTournamentModal({ open: true, mode: 'create', target: null })}
                    className="mt-4 cmd-btn cmd-btn-primary"
                  >
                    Schedule a Tournament
                  </button>
                </div>
              ) : (
                <TournamentList
                  tournaments={tournaments}
                  mode="host"
                  showTitle={false}
                  onEdit={(t) => setTournamentModal({ open: true, mode: 'edit', target: t })}
                  onCancel={async (t) => {
                    try {
                      const { error: cancelErr } = await supabase.rpc('cancel_home_game', {
                        p_game_id: t.id,
                        p_caller_user_id: currentUserId,
                        p_reason: 'Cancelled by host from manage page',
                      });
                      if (cancelErr) throw cancelErr;
                      toast.success(`"${t.name}" cancelled`);
                      // Refresh via fetchData (Realtime should also fire, but
                      // explicit refetch avoids any race on the toast → render).
                      fetchData();
                    } catch (ex) {
                      toast.error(ex?.message || 'Failed to cancel tournament');
                    }
                  }}
                />
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
                      onMessage={handleStartDm}
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
                    onMessage={member.user_id !== group?.host_id ? handleStartDm : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Saves Tab */}
          {activeTab === 'saves' && (
            <div className="space-y-4">
              <div className="cmd-panel">
                <div className="p-4 border-b border-[#4A5E78]">
                  <h3 className="font-semibold text-white">
                    Saves / Favorites ({saves.length})
                  </h3>
                  <p className="text-sm text-[#64748B] mt-1">Users who tapped the Heart button on your Home Game.</p>
                </div>
                {saves.length === 0 ? (
                  <div className="p-8 text-center">
                    <Heart className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                    <p className="text-[#64748B]">No Saves Yet</p>
                    <p className="text-sm text-[#4A5E78] mt-1">
                      When players find and heart your game on Poker Near Me, they appear here.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#4A5E78]">
                    {saves.map((saveItem) => {
                      const profile = saveItem.profiles || {};
                      return (
                        <div key={saveItem.id} className="flex items-center gap-3 p-4">
                          <div className="w-10 h-10 rounded-full bg-[#EF4444]/10 flex items-center justify-center overflow-hidden">
                            {profile.avatar_url ? (
                              <img src={profile.avatar_url} alt="" width={40} height={40} loading="lazy" decoding="async" className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <Heart className="w-5 h-5 text-[#EF4444]" />
                            )}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-white">{profile.display_name || 'Anonymous Poker Player'}</p>
                            <p className="text-sm text-[#64748B]">
                              Saved on {new Date(saveItem.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
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
                    <p className="text-[#64748B]">No Transactions Yet</p>
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

              {/* Roster + Announce Quick Actions */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => router.push(`/hub/commander/home-games/${id}/roster`)}
                  className="cmd-panel p-4 flex flex-col items-center gap-2 hover:bg-[#1A2E4A] transition-colors text-center"
                >
                  <List className="w-6 h-6 text-[#22D3EE]" />
                  <span className="text-sm font-semibold text-white">Database of Players</span>
                  <span className="text-xs text-[#64748B]">View and manage full roster</span>
                </button>
                <button
                  onClick={async () => {
                    // Phase 41/audit-sweep-B-mgmt: block re-entry so a host who
                    // taps Broadcast twice can't fire two independent prompts +
                    // POSTs in parallel.
                    if (broadcastingRef.current) {
                      toast('A broadcast is already being sent…');
                      return;
                    }
                    const msg = window.prompt('Broadcast announcement to all group members:');
                    if (!msg?.trim()) return;
                    broadcastingRef.current = true;
                    // Fresh token per broadcast attempt. Reused only on 5xx /
                    // network errors (retry path) so the second attempt is
                    // deduplicated by the server if it honors the header.
                    const idemKey = makeIdemKey();
                    try {
                      const token = getAccessToken();
                      const res = await fetch(`/api/commander/home-games/groups/${id}/broadcast`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                          'X-Idempotency-Key': idemKey,
                        },
                        body: JSON.stringify({ message_text: msg.trim() })
                      });
                      const data = await res.json();
                      if (data.success) {
                        const r = data.result || {};
                        toast.success(`Sent to ${r.members_notified || 0} members, ${r.followers_notified || 0} followers`);
                      } else {
                        toast.error(data.error?.message || data.error || 'Broadcast failed');
                      }
                    } catch (e) { toast.error('Broadcast failed'); }
                    finally { broadcastingRef.current = false; }
                  }}
                  className="cmd-panel p-4 flex flex-col items-center gap-2 hover:bg-[#1A2E4A] transition-colors text-center"
                >
                  <Megaphone className="w-6 h-6 text-[#F59E0B]" />
                  <span className="text-sm font-semibold text-white">Broadcast</span>
                  <span className="text-xs text-[#64748B]">Message all players</span>
                </button>
              </div>

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

              {/* Contact Info — optional public contact details */}
              <div className="cmd-panel p-6">
                <h3 className="font-semibold text-white mb-1">Contact Info</h3>
                <p className="text-sm text-[#64748B] mb-4">
                  These are shown publicly on your home game card and details page so players can reach you directly.
                </p>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Phone Number</label>
                    <input
                      type="tel"
                      value={group?.contact_phone || ''}
                      onChange={(e) => setGroup(prev => ({ ...prev, contact_phone: e.target.value }))}
                      onBlur={(e) => handleUpdateSettings({ contact_phone: e.target.value.trim() || null })}
                      placeholder="(555) 000-0000"
                      maxLength={30}
                      className="w-full h-10 px-3 cmd-input"
                    />
                    <p className="text-xs text-[#4A5E78] mt-1">Appears as a clickable tel: link on mobile.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Website / Social Link</label>
                    <input
                      type="url"
                      value={group?.website_url || ''}
                      onChange={(e) => setGroup(prev => ({ ...prev, website_url: e.target.value }))}
                      onBlur={(e) => handleUpdateSettings({ website_url: e.target.value.trim() || null })}
                      placeholder="https://yoursite.com"
                      maxLength={255}
                      className="w-full h-10 px-3 cmd-input"
                    />
                    <p className="text-xs text-[#4A5E78] mt-1">Link to your Facebook group, website, or any other URL.</p>
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
                      <p className="text-sm text-[#64748B]">New Members Must Be Approved Before Joining</p>
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
                      <option value="private">Private - Invite Only</option>
                      <option value="friends">Friends - Visible To Friends</option>
                      <option value="public">Public - Anyone Can Find</option>
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
                    onClick={async () => {
                      // bug-hunt-zero/B-MGR-9: was lying to the user on copy
                      // failure. Uses safeCopyToClipboard so the "Copied!"
                      // state only fires after we know the write succeeded.
                      const code = group?.invite_code;
                      if (!code) return;
                      const ok = await safeCopyToClipboard(code);
                      if (ok) {
                        setCopySuccess(true);
                        setTimeout(() => setCopySuccess(false), 2000);
                      } else {
                        toast.error(`Couldn't copy. Code: ${code}`);
                      }
                    }}
                    className="cmd-btn cmd-btn-primary px-4 py-3"
                  >
                    {copySuccess ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                {copySuccess && (
                  <p className="text-sm text-[#10B981] mt-2 font-medium">Invite Code Copied To Clipboard</p>
                )}
                <p className="text-sm text-[#64748B] mt-2">Share This Code With Players You Want To Invite</p>
              </div>

              {/* Public Page — shown only for public groups that have a social page */}
              {pageSlug && (
                <div className="cmd-panel p-6">
                  <div className="flex items-start justify-between mb-4 gap-3 flex-wrap">
                    <div>
                      <h3 className="font-semibold text-white mb-1">Your Public Page</h3>
                      <p className="text-sm text-[#64748B]">
                        Share this URL anywhere — players can view your game, RSVP, and follow for updates without an account.
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 whitespace-nowrap">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', display: 'inline-block' }} />
                      LIVE
                    </span>
                  </div>
                  <div className="flex flex-col md:flex-row gap-4 items-stretch">
                    <div className="flex-1 min-w-0 flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-4 py-3 bg-[#0D192E] rounded-lg font-mono text-sm text-[#E2E8F0] overflow-hidden text-ellipsis whitespace-nowrap" title={`https://smarter.poker/hub/home-games/${pageSlug}`}>
                          smarter.poker/hub/home-games/{pageSlug}
                        </code>
                        <button
                          onClick={async () => {
                            // bug-hunt-zero/B-MGR-10: same fix for the public page URL.
                            const url = `https://smarter.poker/hub/home-games/${pageSlug}`;
                            const ok = await safeCopyToClipboard(url);
                            if (ok) {
                              setPageUrlCopied(true);
                              setTimeout(() => setPageUrlCopied(false), 2000);
                            } else {
                              toast.error(`Couldn't copy. URL: ${url}`);
                            }
                          }}
                          className="cmd-btn cmd-btn-primary px-4 py-3 whitespace-nowrap"
                        >
                          {pageUrlCopied ? 'Copied!' : 'Copy URL'}
                        </button>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <a
                          href={`https://smarter.poker/hub/home-games/${pageSlug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cmd-btn cmd-btn-secondary px-4 py-2 inline-flex items-center gap-2"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                          Open Live
                        </a>
                        <button
                          onClick={() => {
                            const txt = encodeURIComponent(`Join us at ${group?.name || 'our poker home game'}: https://smarter.poker/hub/home-games/${pageSlug}`);
                            window.open(`https://twitter.com/intent/tweet?text=${txt}`, '_blank', 'noopener');
                          }}
                          className="cmd-btn cmd-btn-secondary px-4 py-2 inline-flex items-center gap-2"
                        >
                          Share on X
                        </button>
                        <button
                          onClick={() => {
                            const txt = encodeURIComponent(`Join us at ${group?.name || 'our poker home game'}: https://smarter.poker/hub/home-games/${pageSlug}`);
                            window.open(`https://wa.me/?text=${txt}`, '_blank', 'noopener');
                          }}
                          className="cmd-btn cmd-btn-secondary px-4 py-2 inline-flex items-center gap-2"
                        >
                          WhatsApp
                        </button>
                      </div>
                      <p className="text-xs text-[#64748B] leading-relaxed">
                        This page is indexed by search engines and carries Open Graph metadata — it'll render a rich preview card when shared on social media, iMessage, WhatsApp, and Slack.
                      </p>
                    </div>
                    <div className="flex flex-col items-center gap-2 bg-white p-3 rounded-lg self-start">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&margin=0&format=png&data=${encodeURIComponent(`https://smarter.poker/hub/home-games/${pageSlug}`)}`}
                        alt="QR code to public page"
                        width={140}
                        height={140}
                        style={{ display: 'block' }}
                      />
                      <span className="text-[10px] font-bold text-[#0D192E] tracking-wide">SCAN TO JOIN</span>
                    </div>
                  </div>
                </div>
              )}

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
                {deleteError && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-[#EF4444]">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{deleteError}</span>
                  </div>
                )}
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

      {/* Phase 41 — host-side seat-reservation modals */}
      {rosterPickerState && (
        <HostRosterPickerModal
          groupId={id}
          tableId={rosterPickerState.tableId}
          seatNumber={rosterPickerState.seatNumber}
          maxSeats={rosterPickerState.maxSeats}
          occupiedSeats={rosterPickerState.occupiedSeats}
          onClose={() => setRosterPickerState(null)}
          onSeated={() => setSeatRefreshKey((k) => k + 1)}
        />
      )}
      {createTableState && (
        <HostCreateTableModal
          gameId={createTableState.gameId}
          defaults={createTableState.defaults}
          onClose={() => setCreateTableState(null)}
          onCreated={() => setSeatRefreshKey((k) => k + 1)}
        />
      )}
      {/* Dan-fix/tournament-buildout: single modal handles both add and edit.
          On successful save it refetches via fetchData() — Realtime fires too,
          but the explicit refetch keeps the modal-close → list-update sequence
          tight in slow-network conditions. */}
      <TournamentEditModal
        open={tournamentModal.open}
        mode={tournamentModal.mode}
        groupId={id}
        tournament={tournamentModal.target}
        onClose={() => setTournamentModal({ open: false, mode: 'create', target: null })}
        onSaved={() => {
          setTournamentModal({ open: false, mode: 'create', target: null });
          toast.success(tournamentModal.mode === 'create' ? 'Tournament created' : 'Tournament saved');
          fetchData();
        }}
      />
    </>
  );
}
