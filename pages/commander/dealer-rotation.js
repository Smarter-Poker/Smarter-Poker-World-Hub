/**
 * Dealer Rotation Manager
 * /commander/dealer-rotation
 * 
 * Floor managers use this to:
 * - See all active dealers and their current table assignments
 * - Push dealers (rotate to next table)
 * - Send dealers on break
 * - View rotation history for the shift
 * - Auto-suggest next rotation based on time at table
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, RefreshCw, Clock, Users, Loader2,
  ArrowRightLeft, Coffee, CheckCircle2, ChevronRight
} from 'lucide-react';

function minutesSince(dateStr) {
  if (!dateStr) return 0;
  return Math.floor((new Date() - new Date(dateStr)) / 60000);
}

export default function DealerRotation() {
  const router = useRouter();
  const [dealers, setDealers] = useState([]);
  const [tables, setTables] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [pushTarget, setPushTarget] = useState(null); // dealer being pushed

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 10000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

  const fetchData = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [dealersRes, tablesRes, rotationsRes] = await Promise.all([
        fetch('/api/commander/dealers', { headers }).then(r => r.json()),
        fetch('/api/commander/tables', { headers }).then(r => r.json()),
        fetch('/api/commander/dealers/rotations', { headers }).then(r => r.json()).catch(() => ({ data: [] }))
      ]);
      if (dealersRes.data) setDealers(dealersRes.data);
      if (tablesRes.data) setTables(tablesRes.data);
      if (rotationsRes.data) setRotations(rotationsRes.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  // Get current assignment for each dealer
  const getAssignment = (dealerId) => {
    return rotations.find(r => r.dealer_id === dealerId && !r.ended_at);
  };

  // Tables that need a dealer (active with no dealer assigned)
  const activeTables = tables.filter(t => t.status === 'active');
  const assignedTableNums = rotations.filter(r => !r.ended_at).map(r => r.table_number);
  const unassignedTables = activeTables.filter(t => !assignedTableNums.includes(t.table_number || t.number));

  const pushDealer = async (dealerId, newTableNumber) => {
    try {
      const token = getToken();
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // End current rotation
      const current = getAssignment(dealerId);
      if (current) {
        await fetch('/api/commander/dealers/rotations', {
          method: 'PUT', headers,
          body: JSON.stringify({ id: current.id, ended_at: new Date().toISOString() })
        }).catch(() => {});
      }

      // Start new rotation
      if (newTableNumber) {
        await fetch('/api/commander/dealers/rotations', {
          method: 'POST', headers,
          body: JSON.stringify({
            dealer_id: dealerId,
            table_number: newTableNumber,
            dealer_name: dealers.find(d => d.id === dealerId)?.name || 'Unknown'
          })
        }).catch(() => {});
      }

      setPushTarget(null);
      fetchData();
    } catch (err) { console.error(err); }
  };

  const sendOnBreak = async (dealerId) => {
    const current = getAssignment(dealerId);
    if (current) {
      try {
        const token = getToken();
        await fetch('/api/commander/dealers/rotations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: current.id, ended_at: new Date().toISOString(), break_after: true })
        }).catch(() => {});
        fetchData();
      } catch (err) { console.error(err); }
    }
  };

  const PUSH_THRESHOLD = 30; // minutes before highlighting for rotation

  if (loading) return (
    <div className="min-h-screen bg-[#18191A] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
    </div>
  );

  // Split dealers into assigned and available
  const assignedDealers = dealers.filter(d => getAssignment(d.id));
  const availableDealers = dealers.filter(d => !getAssignment(d.id) && d.status === 'active');

  return (
    <>
      <Head><title>Dealer Rotation | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

        {/* Header */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/commander/dashboard')} className="cmd-back-btn">
              <ArrowLeft size={16} /> Back
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">Dealer Rotation</h1>
              <p className="text-xs text-[#B0B3B8]">
                {assignedDealers.length} dealing · {availableDealers.length} available · {unassignedTables.length} tables need dealer
              </p>
            </div>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]">
            <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        <div className="p-4 space-y-4">

          {/* Unassigned tables warning */}
          {unassignedTables.length > 0 && (
            <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl p-3">
              <p className="text-sm font-semibold text-[#F59E0B]">
                {unassignedTables.length} active table{unassignedTables.length > 1 ? 's' : ''} without a dealer
              </p>
              <p className="text-xs text-[#B0B3B8] mt-0.5">
                Tables: {unassignedTables.map(t => t.table_number || t.number).join(', ')}
              </p>
            </div>
          )}

          {/* Currently dealing */}
          <div>
            <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Currently Dealing</h2>
            {assignedDealers.length === 0 ? (
              <p className="py-4 text-center text-[#B0B3B8] text-sm">No dealers currently assigned</p>
            ) : (
              <div className="space-y-2">
                {assignedDealers.map(dealer => {
                  const assignment = getAssignment(dealer.id);
                  const mins = minutesSince(assignment?.started_at);
                  const overdue = mins >= PUSH_THRESHOLD;
                  return (
                    <div key={dealer.id}
                      className={`bg-[#242526] border rounded-xl overflow-hidden ${
                        overdue ? 'border-[#F59E0B]/50' : 'border-[#3A3B3C]'
                      }`}>
                      <div className="px-4 py-3 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          overdue ? 'bg-[#F59E0B]/10' : 'bg-[#1877F2]/10'
                        }`}>
                          <Users className={`w-5 h-5 ${overdue ? 'text-[#F59E0B]' : 'text-[#1877F2]'}`} />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-white">{dealer.name || `${dealer.first_name} ${dealer.last_name}`}</p>
                          <p className="text-xs text-[#B0B3B8]">
                            Table {assignment?.table_number} · <span className={overdue ? 'text-[#F59E0B] font-bold' : ''}>{mins}m</span>
                          </p>
                        </div>
                        {overdue && (
                          <span className="text-[10px] font-bold text-[#F59E0B] bg-[#F59E0B]/10 px-2 py-1 rounded">PUSH</span>
                        )}
                      </div>

                      {/* Push target selection */}
                      {pushTarget === dealer.id ? (
                        <div className="px-4 py-3 border-t border-[#3A3B3C] bg-[#1A1B1C]">
                          <p className="text-xs text-[#B0B3B8] mb-2">Push to table:</p>
                          <div className="flex flex-wrap gap-2">
                            {activeTables.map(t => {
                              const tNum = t.table_number || t.number;
                              const isCurrentTable = tNum === assignment?.table_number;
                              return (
                                <button key={tNum} onClick={() => !isCurrentTable && pushDealer(dealer.id, tNum)}
                                  disabled={isCurrentTable}
                                  className={`px-3 py-2 rounded-lg text-sm font-medium ${
                                    isCurrentTable ? 'bg-[#3A3B3C] text-[#6A6B6D]' : 'bg-[#1877F2]/20 text-[#1877F2] active:bg-[#1877F2]/30'
                                  }`}>T{tNum}</button>
                              );
                            })}
                            <button onClick={() => setPushTarget(null)}
                              className="px-3 py-2 rounded-lg text-sm text-[#B0B3B8] bg-[#3A3B3C]">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex border-t border-[#3A3B3C]">
                          <button onClick={() => setPushTarget(dealer.id)}
                            className="flex-1 py-2.5 text-xs font-semibold text-[#1877F2] flex items-center justify-center gap-1 active:bg-[#1877F2]/10 border-r border-[#3A3B3C]">
                            <ArrowRightLeft className="w-3.5 h-3.5" /> Push
                          </button>
                          <button onClick={() => sendOnBreak(dealer.id)}
                            className="flex-1 py-2.5 text-xs font-semibold text-[#F59E0B] flex items-center justify-center gap-1 active:bg-[#F59E0B]/10">
                            <Coffee className="w-3.5 h-3.5" /> Break
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Available dealers */}
          {availableDealers.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider mb-2">Available</h2>
              <div className="space-y-1">
                {availableDealers.map(dealer => (
                  <div key={dealer.id} className="flex items-center gap-3 px-4 py-3 bg-[#242526] border border-[#3A3B3C] rounded-xl">
                    <div className="w-8 h-8 rounded-full bg-[#31A24C]/10 flex items-center justify-center">
                      <CheckCircle2 className="w-4 h-4 text-[#31A24C]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-white">{dealer.name || `${dealer.first_name} ${dealer.last_name}`}</p>
                    </div>
                    {unassignedTables.length > 0 && (
                      <button onClick={() => pushDealer(dealer.id, unassignedTables[0]?.table_number || unassignedTables[0]?.number)}
                        className="text-xs font-semibold text-[#1877F2] px-3 py-1.5 rounded-lg bg-[#1877F2]/10 active:bg-[#1877F2]/20">
                        Assign →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
