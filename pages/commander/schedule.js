/**
 * Staff Schedule
 * /commander/schedule
 * 
 * Daily staff schedule management:
 * - View who's working today
 * - Clock in/out tracking
 * - Dealer table rotation assignments
 * - Break scheduling
 * - Shift creation and editing
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Clock, Users, Plus, Check, X, Coffee,
  RefreshCw, Loader2, ChevronLeft, ChevronRight,
  LogIn, LogOut, Timer, AlertTriangle, Edit2
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

function formatTime(dateStr) {
  if (!dateStr) return '--:--';
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDuration(start, end) {
  if (!start) return '--';
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const mins = Math.floor((e - s) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function StaffSchedule() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [staff, setStaff] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tables, setTables] = useState([]);
  const [rotations, setRotations] = useState([]);
  const [showAddShift, setShowAddShift] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [shiftStart, setShiftStart] = useState('');
  const [shiftEnd, setShiftEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(new Date());

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  useEffect(() => {
    fetchAll();
    const poll = setInterval(fetchAll, 15000);
    const clock = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [date]);

  const fetchAll = async () => {
    try {
      const token = getToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [staffRes, dealersRes, tablesRes, rotationsRes] = await Promise.all([
        fetch('/api/commander/staff', { headers }).then(r => r.json()),
        fetch('/api/commander/dealers', { headers }).then(r => r.json()),
        fetch('/api/commander/tables', { headers }).then(r => r.json()),
        fetch(`/api/commander/dealers/rotations?date=${date}`, { headers }).then(r => r.json()).catch(() => ({ success: true, data: [] }))
      ]);
      if (staffRes.success) setStaff(staffRes.data || []);
      if (dealersRes.success) setDealers(dealersRes.data || []);
      if (tablesRes.success) setTables(tablesRes.data || []);
      if (rotationsRes.success) setRotations(rotationsRes.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const changeDate = (delta) => {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().split('T')[0]);
  };

  const isToday = date === new Date().toISOString().split('T')[0];
  const displayDate = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Combine staff + dealers for schedule
  const allStaff = [
    ...dealers.map(d => ({ ...d, role: 'dealer' })),
    ...staff.filter(s => !dealers.find(d => d.id === s.id)).map(s => ({ ...s, role: s.role || 'staff' }))
  ];

  // Group by role
  const dealerList = allStaff.filter(s => s.role === 'dealer');
  const floorList = allStaff.filter(s => s.role !== 'dealer');

  const clockIn = async (staffId) => {
    try {
      const token = getToken();
      await fetch('/api/commander/staff/' + staffId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clocked_in: true, clock_in_time: new Date().toISOString() })
      });
      fetchAll();
    } catch (err) { console.error(err); }
  };

  const clockOut = async (staffId) => {
    try {
      const token = getToken();
      await fetch('/api/commander/staff/' + staffId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clocked_in: false, clock_out_time: new Date().toISOString() })
      });
      fetchAll();
    } catch (err) { console.error(err); }
  };

  const StaffRow = ({ person }) => {
    const isClockedIn = person.clocked_in || person.status === 'active' || person.status === 'on_duty';
    const isOnBreak = person.status === 'break' || person.on_break;
    const currentTable = rotations.find(r => r.dealer_id === person.id && !r.ended_at);

    return (
      <div className={`flex items-center gap-3 px-4 py-3 border-b border-[#3A3B3C] ${isClockedIn ? '' : 'opacity-50'
        }`}>
        {/* Status dot */}
        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isOnBreak ? 'bg-[#F59E0B]' :
            isClockedIn ? 'bg-[#31A24C]' : 'bg-[#3A3B3C]'
          }`} />

        {/* Name + info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">
            {person.first_name || person.name || 'Staff'} {person.last_name || ''}
          </p>
          <p className="text-[10px] text-[#B0B3B8]">
            {isOnBreak ? 'On Break' :
              isClockedIn ? (currentTable ? `Table ${currentTable.table_number}` : 'On Duty') :
                'Off Duty'}
            {person.clock_in_time && isClockedIn && ` — ${formatDuration(person.clock_in_time)}`}
          </p>
        </div>

        {/* Actions */}
        {isToday && (
          <div className="flex gap-1.5">
            {!isClockedIn ? (
              <button onClick={() => clockIn(person.id)}
                className="px-3 py-1.5 rounded-lg bg-[#31A24C]/10 text-[#31A24C] text-xs font-medium active:bg-[#31A24C]/20">
                <LogIn className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button onClick={() => clockOut(person.id)}
                className="px-3 py-1.5 rounded-lg bg-[#EF4444]/10 text-[#EF4444] text-xs font-medium active:bg-[#EF4444]/20">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <CommanderLayout title="Schedule" backHref="/commander/dashboard">
      <>
        <Head><title>Schedule | Club Commander</title></Head>
        <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">

          {/* Header */}
          <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-bold text-white">Staff Schedule</h1>
            </div>
            <button onClick={fetchAll} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <RefreshCw className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>

          {/* Date selector */}
          <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center justify-between">
            <button onClick={() => changeDate(-1)} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <ChevronLeft className="w-5 h-5 text-[#B0B3B8]" />
            </button>
            <div className="text-center">
              <p className="text-base font-semibold text-white">{displayDate}</p>
              {isToday && <p className="text-xs text-[#1877F2]">Today</p>}
            </div>
            <button onClick={() => changeDate(1)} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <ChevronRight className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>

          {/* Stats */}
          <div className="px-4 py-3 flex gap-2">
            <div className="flex-1 bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-[#31A24C]">{allStaff.filter(s => s.clocked_in || s.status === 'active').length}</p>
              <p className="text-[10px] text-[#B0B3B8]">Clocked In</p>
            </div>
            <div className="flex-1 bg-[#1877F2]/10 border border-[#1877F2]/30 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-[#1877F2]">{dealerList.length}</p>
              <p className="text-[10px] text-[#B0B3B8]">Dealers</p>
            </div>
            <div className="flex-1 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-[#F59E0B]">{allStaff.filter(s => s.status === 'break').length}</p>
              <p className="text-[10px] text-[#B0B3B8]">On Break</p>
            </div>
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-white">{floorList.length}</p>
              <p className="text-[10px] text-[#B0B3B8]">Floor</p>
            </div>
          </div>

          {loading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
            </div>
          ) : (
            <div className="pb-20">
              {/* Dealers */}
              <div className="px-4 pt-3 pb-1">
                <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider">Dealers ({dealerList.length})</h2>
              </div>
              <div className="bg-[#242526] border-y border-[#3A3B3C]">
                {dealerList.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[#B0B3B8]">No Dealers Registered</p>
                ) : dealerList.map(d => <StaffRow key={d.id} person={d} />)}
              </div>

              {/* Floor Staff */}
              <div className="px-4 pt-5 pb-1">
                <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider">Floor & Staff ({floorList.length})</h2>
              </div>
              <div className="bg-[#242526] border-y border-[#3A3B3C]">
                {floorList.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-[#B0B3B8]">No Floor Staff Registered</p>
                ) : floorList.map(s => <StaffRow key={s.id} person={s} />)}
              </div>

              {/* Current Rotation - dealers at tables */}
              {rotations.filter(r => !r.ended_at).length > 0 && (
                <>
                  <div className="px-4 pt-5 pb-1">
                    <h2 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider">Current Table Assignments</h2>
                  </div>
                  <div className="px-4 space-y-2 pt-1">
                    {rotations.filter(r => !r.ended_at).map(r => (
                      <div key={r.id} className="bg-[#242526] border border-[#3A3B3C] rounded-xl px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">Table {r.table_number}</p>
                          <p className="text-xs text-[#B0B3B8]">{r.dealer_name}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-[#B0B3B8]">Since {formatTime(r.started_at)}</p>
                          <p className="text-xs text-[#31A24C]">{formatDuration(r.started_at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <style jsx>{`
`}</style>
      </>
    </CommanderLayout>
  );
}
