/**
 * Floor Calls
 * /commander/floor-calls
 * 
 * Floor managers see:
 * - Pending calls sorted by priority/time
 * - One-tap acknowledge
 * - Resolution tracking
 * - Call history for the day
 * 
 * Designed for quick triage on mobile.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { useRealtimeUpdates } from '../../src/lib/commander/useRealtimeUpdates';
import {
  AlertTriangle, Check, Clock, Loader2,
  RefreshCw, ChevronRight, Bell, XCircle
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const PRIORITY_CONFIG = {
  urgent: { color: '#EF4444', label: 'URGENT', animate: true },
  high: { color: '#F59E0B', label: 'HIGH', animate: false },
  normal: { color: '#1877F2', label: 'Normal', animate: false },
  low: { color: '#B0B3B8', label: 'Low', animate: false }
};

const STATUS_CONFIG = {
  pending: { color: '#EF4444', label: 'Pending' },
  acknowledged: { color: '#F59E0B', label: 'Acknowledged' },
  en_route: { color: '#1877F2', label: 'En Route' },
  resolved: { color: '#31A24C', label: 'Resolved' }
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export default function FloorCalls() {
  const router = useRouter();
  const [calls, setCalls] = useState([]);
  const [resolved, setResolved] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('active'); // active, resolved
  const [now, setNow] = useState(new Date());

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  useEffect(() => {
    fetchCalls();
    const poll = setInterval(fetchCalls, 15000); // 15s fallback — realtime handles instant updates
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  // Realtime: instant floor call updates
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });
  useRealtimeUpdates(venueId, () => fetchCalls(), !!venueId);

  const fetchCalls = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [activeRes, resolvedRes] = await Promise.all([
        fetch('/api/commander/floor-calls?status=pending', { headers }).then(r => r.json()),
        fetch('/api/commander/floor-calls?status=resolved', { headers }).then(r => r.json()).catch(() => ({ data: [] }))
      ]);
      // Also get acknowledged and en_route
      const ackRes = await fetch('/api/commander/floor-calls?status=acknowledged', { headers }).then(r => r.json()).catch(() => ({ data: [] }));
      const routeRes = await fetch('/api/commander/floor-calls?status=en_route', { headers }).then(r => r.json()).catch(() => ({ data: [] }));

      const allActive = [
        ...(activeRes.data || []),
        ...(ackRes.data || []),
        ...(routeRes.data || [])
      ].sort((a, b) => {
        const pOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
        if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
        return new Date(a.created_at) - new Date(b.created_at);
      });
      setCalls(allActive);
      setResolved((resolvedRes.data || []).slice(0, 20));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const updateCall = async (id, status, resolution) => {
    try {
      const token = getToken();
      await fetch('/api/commander/floor-calls', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, status, resolution })
      });
      fetchCalls();
    } catch (err) { console.error(err); }
  };

  const pendingCount = calls.filter(c => c.status === 'pending').length;

  return (
    <>
      <SEOHead
                title="Commander — Floor Calls"
                description="Club Commander Poker Room Management Tool."
                noindex={true}
            />
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-lg font-bold text-white">Floor Calls</h1>
              {pendingCount > 0 && (
                <p className="text-xs text-[#EF4444] font-semibold">{pendingCount} pending</p>
              )}
            </div>
          </div>
          <button onClick={fetchCalls} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] flex">
          <button onClick={() => setTab('active')}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 -mb-px ${tab === 'active' ? 'text-[#EF4444] border-[#EF4444]' : 'text-[#B0B3B8] border-transparent'
              }`}>Active ({calls.length})</button>
          <button onClick={() => setTab('resolved')}
            className={`flex-1 py-3 text-sm font-medium text-center border-b-2 -mb-px ${tab === 'resolved' ? 'text-[#31A24C] border-[#31A24C]' : 'text-[#B0B3B8] border-transparent'
              }`}>Resolved ({resolved.length})</button>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {/* ACTIVE calls */}
            {tab === 'active' && (
              calls.length === 0 ? (
                <div className="py-16 text-center">
                  <Check className="w-12 h-12 text-[#31A24C] mx-auto mb-3" />
                  <p className="text-lg font-bold text-white">All Clear</p>
                  <p className="text-sm text-[#B0B3B8]">No Pending Floor Calls</p>
                </div>
              ) : (
                calls.map(call => {
                  const pConfig = PRIORITY_CONFIG[call.priority] || PRIORITY_CONFIG.normal;
                  const sConfig = STATUS_CONFIG[call.status] || STATUS_CONFIG.pending;
                  return (
                    <CommanderLayout title="Floor Calls{pendingCount > 0 ? ` (${pendingCount})` : ''}" backHref="/commander/dashboard">
                      <div key={call.id}
                        className={`bg-[#242526] border rounded-xl overflow-hidden ${call.priority === 'urgent' ? 'border-[#EF4444]/50 animate-pulse' : 'border-[#3A3B3C]'
                          }`}>
                        <div className="px-4 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-white">Table {call.table_number}</span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                                style={{ backgroundColor: `${pConfig.color}20`, color: pConfig.color }}>
                                {pConfig.label}
                              </span>
                            </div>
                            <span className="text-xs text-[#B0B3B8]">{timeAgo(call.created_at)} ago</span>
                          </div>
                          <p className="text-sm text-white font-medium capitalize">{call.reason?.replace(/_/g, ' ')}</p>
                          {call.description && <p className="text-xs text-[#B0B3B8] mt-1">{call.description}</p>}
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: sConfig.color }} />
                            <span className="text-[10px]" style={{ color: sConfig.color }}>{sConfig.label}</span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex border-t border-[#3A3B3C]">
                          {call.status === 'pending' && (
                            <>
                              <button onClick={() => updateCall(call.id, 'acknowledged')}
                                className="flex-1 py-3 text-xs font-semibold text-[#F59E0B] border-r border-[#3A3B3C] active:bg-[#F59E0B]/10">
                                Acknowledge
                              </button>
                              <button onClick={() => updateCall(call.id, 'en_route')}
                                className="flex-1 py-3 text-xs font-semibold text-[#1877F2] active:bg-[#1877F2]/10">
                                On My Way
                              </button>
                            </>
                          )}
                          {(call.status === 'acknowledged' || call.status === 'en_route') && (
                            <button onClick={() => updateCall(call.id, 'resolved', 'Resolved by floor')}
                              className="flex-1 py-3 text-xs font-semibold text-[#31A24C] active:bg-[#31A24C]/10">
                              Mark Resolved
                            </button>
                          )}
                        </div>
                      </div>
                    </CommanderLayout>
                  );
                })
              )
            )}

            {/* RESOLVED calls */}
            {tab === 'resolved' && (
              resolved.length === 0 ? (
                <p className="py-10 text-center text-[#B0B3B8]">No Resolved Calls Today</p>
              ) : (
                resolved.map(call => (
                  <div key={call.id} className="flex items-center gap-3 px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl opacity-70">
                    <Check className="w-5 h-5 text-[#31A24C] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white">Table {call.table_number} — {call.reason?.replace(/_/g, ' ')}</p>
                      {call.resolution && <p className="text-[10px] text-[#B0B3B8] truncate">{call.resolution}</p>}
                    </div>
                    <span className="text-[10px] text-[#B0B3B8]">{timeAgo(call.responded_at || call.created_at)}</span>
                  </div>
                ))
              )
            )}
          </div>
        )}
      </div>
      <style jsx>{`
`}</style>
    </>
  );
}
