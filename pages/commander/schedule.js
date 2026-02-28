/**
 * Staff Schedule — Weekly Shift Planner
 * /commander/schedule
 * 
 * Full weekly scheduling system for all staff roles:
 * - Week grid view with day columns and staff rows
 * - Add/edit/delete shifts
 * - Role filter tabs (All, Dealers, Floor, Cashiers)
 * - Send schedule to all staff via SMS/Email
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  Calendar, Users, Plus, X, Clock, Send, ChevronLeft, ChevronRight,
  Loader2, RefreshCw, Trash2, MessageSquare, Mail, Filter, AlertCircle,
  CheckCircle2
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - day); // rewind to Sunday
  return d.toISOString().split('T')[0];
}

function getWeekDays(weekStart) {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      month: d.toLocaleDateString('en-US', { month: 'short' }),
      isToday: d.toISOString().split('T')[0] === new Date().toISOString().split('T')[0]
    });
  }
  return days;
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')}${ampm}`;
}

function shiftHours(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight shift
  return Math.round(mins / 60 * 10) / 10;
}

const ROLE_FILTERS = [
  { value: 'all', label: 'All Staff', color: '#1877F2' },
  { value: 'dealer', label: 'Dealers', color: '#6B7280' },
  { value: 'floor', label: 'Floor', color: '#059669' },
  { value: 'cashier', label: 'Cashiers', color: '#D97706' },
  { value: 'manager', label: 'Managers', color: '#2563EB' },
  { value: 'brush', label: 'Brush', color: '#D97706' },
];

const ROLE_COLORS = {
  owner: '#7C3AED', manager: '#2563EB', floor: '#059669',
  cashier: '#D97706', brush: '#D97706', dealer: '#6B7280', staff: '#6B7280'
};

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export default function StaffSchedule() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [shifts, setShifts] = useState([]);
  const [allStaff, setAllStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState(null);
  const [addStaffId, setAddStaffId] = useState(null);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [toast, setToast] = useState(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;
  const getVenueId = () => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id || ''; } catch { return ''; }
  };
  const getHeaders = () => {
    const token = getToken();
    const staffSession = localStorage.getItem('commander_staff') || '';
    return { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession, 'Content-Type': 'application/json' };
  };

  // Fetch shifts + staff
  const fetchData = useCallback(async () => {
    const venueId = getVenueId();
    if (!venueId) return;
    try {
      const headers = getHeaders();
      const [shiftsRes, staffRes] = await Promise.all([
        fetch(`/api/commander/schedule/shifts?venue_id=${venueId}&week_start=${weekStart}`, { headers }).then(r => r.json()),
        fetch(`/api/commander/staff?venue_id=${venueId}`, { headers }).then(r => r.json())
      ]);
      if (shiftsRes.success) setShifts(shiftsRes.data || []);
      if (staffRes.success) {
        const list = Array.isArray(staffRes.data) ? staffRes.data : staffRes.data?.staff || [];
        setAllStaff(list.filter(s => s.is_active !== false));
      }
    } catch (err) { console.error('[Schedule] fetch error:', err); }
    finally { setLoading(false); }
  }, [weekStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Navigation
  const changeWeek = (delta) => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + (delta * 7));
    setWeekStart(d.toISOString().split('T')[0]);
    setLoading(true);
  };

  const goToday = () => {
    setWeekStart(getWeekStart(new Date()));
    setLoading(true);
  };

  // Create shift
  const createShift = async (data) => {
    try {
      const venueId = getVenueId();
      const res = await fetch('/api/commander/schedule/shifts', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ venue_id: venueId, ...data })
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
        setShowAddModal(false);
        showToast('Shift added', 'success');
      } else {
        showToast(result.error?.message || 'Failed to add shift', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    }
  };

  // Delete shift
  const deleteShift = async (shiftId) => {
    try {
      const venueId = getVenueId();
      const res = await fetch(`/api/commander/schedule/shifts?id=${shiftId}&venue_id=${venueId}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      const result = await res.json();
      if (result.success) {
        fetchData();
        showToast('Shift deleted', 'success');
      }
    } catch (err) {
      showToast('Failed to delete', 'error');
    }
  };

  // Broadcast
  const broadcastSchedule = async (channel) => {
    setBroadcasting(true);
    setBroadcastResult(null);
    try {
      const venueId = getVenueId();
      const res = await fetch('/api/commander/schedule/broadcast', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ venue_id: venueId, week_start: weekStart, channel })
      });
      const result = await res.json();
      if (result.success) {
        setBroadcastResult(result.data);
        showToast(`Schedule sent to ${result.data.sent} staff`, 'success');
      } else {
        showToast(result.error?.message || 'Broadcast failed', 'error');
      }
    } catch (err) {
      showToast('Network error', 'error');
    }
    setBroadcasting(false);
  };

  const showToast = (msg, type) => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Computed
  const weekDays = getWeekDays(weekStart);
  const weekLabel = `${weekDays[0].month} ${weekDays[0].dayNum} – ${weekDays[6].month} ${weekDays[6].dayNum}`;

  const filteredStaff = roleFilter === 'all'
    ? allStaff
    : allStaff.filter(s => s.role === roleFilter);

  // Stats
  const totalShifts = shifts.length;
  const totalHours = shifts.reduce((sum, s) => sum + shiftHours(s.start_time, s.end_time), 0);
  const staffWithShifts = new Set(shifts.map(s => s.staff_id)).size;

  // Get shifts for a specific staff member on a specific date
  const getShiftsFor = (staffId, date) => shifts.filter(s => s.staff_id === staffId && s.shift_date === date);

  return (
    <CommanderLayout title="Staff Schedule" backHref="/commander/dashboard?card=staff">
      <SEOHead title="Commander — Staff Schedule" description="Weekly staff scheduling for Club Commander." noindex={true} />

      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        {/* Header bar */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#1877F2]" />
              <h1 className="text-lg font-bold text-white">Staff Schedule</h1>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]" title="Refresh">
                <RefreshCw className="w-4 h-4 text-[#B0B3B8]" />
              </button>
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium active:bg-[#1564D4]"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send Schedule</span>
              </button>
            </div>
          </div>
        </div>

        {/* Week navigator */}
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-2">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <button onClick={() => changeWeek(-1)} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <ChevronLeft className="w-5 h-5 text-[#B0B3B8]" />
            </button>
            <div className="text-center">
              <p className="text-base font-semibold text-white">{weekLabel}</p>
              <button onClick={goToday} className="text-xs text-[#1877F2] font-medium">Today</button>
            </div>
            <button onClick={() => changeWeek(1)} className="p-2 rounded-lg active:bg-[#3A3B3C]">
              <ChevronRight className="w-5 h-5 text-[#B0B3B8]" />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="px-4 py-3 max-w-7xl mx-auto">
          <div className="flex gap-2">
            <div className="flex-1 bg-[#1877F2]/10 border border-[#1877F2]/30 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-[#1877F2]">{totalShifts}</p>
              <p className="text-[10px] text-[#B0B3B8]">Shifts</p>
            </div>
            <div className="flex-1 bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-[#31A24C]">{totalHours.toFixed(0)}h</p>
              <p className="text-[10px] text-[#B0B3B8]">Hours</p>
            </div>
            <div className="flex-1 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-[#F59E0B]">{staffWithShifts}</p>
              <p className="text-[10px] text-[#B0B3B8]">Scheduled</p>
            </div>
            <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-center">
              <p className="text-lg font-bold text-white">{allStaff.length}</p>
              <p className="text-[10px] text-[#B0B3B8]">Total Staff</p>
            </div>
          </div>
        </div>

        {/* Role filter */}
        <div className="px-4 pb-3 max-w-7xl mx-auto overflow-x-auto">
          <div className="flex gap-1.5 min-w-max">
            {ROLE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setRoleFilter(f.value)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                style={{
                  backgroundColor: roleFilter === f.value ? f.color + '20' : '#3A3B3C',
                  color: roleFilter === f.value ? f.color : '#B0B3B8',
                  border: roleFilter === f.value ? `1px solid ${f.color}50` : '1px solid transparent'
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Week Grid */}
        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" />
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="py-16 text-center px-4">
            <Users className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
            <p className="text-lg font-semibold text-white mb-1">No Staff Found</p>
            <p className="text-sm text-[#B0B3B8]">
              {roleFilter !== 'all' ? 'Try a different role filter or ' : ''}
              Add staff on the <button onClick={() => router.push('/commander/staff')} className="text-[#1877F2] underline">Staff Management</button> page.
            </p>
          </div>
        ) : (
          <div className="px-2 pb-24 max-w-7xl mx-auto">
            {/* Desktop week grid */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse min-w-[700px]">
                {/* Day headers */}
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-[#18191A] z-10 w-36 px-2 py-2 text-left text-xs font-semibold text-[#B0B3B8] uppercase tracking-wider">
                      Employee
                    </th>
                    {weekDays.map(day => (
                      <th key={day.date} className={`px-1 py-2 text-center min-w-[100px] ${day.isToday ? 'bg-[#1877F2]/5' : ''}`}>
                        <p className="text-xs font-semibold text-[#B0B3B8]">{day.label}</p>
                        <p className={`text-sm font-bold ${day.isToday ? 'text-[#1877F2]' : 'text-white'}`}>{day.dayNum}</p>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-center w-16">
                      <p className="text-xs font-semibold text-[#B0B3B8]">Hours</p>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStaff.map(person => {
                    const personShifts = shifts.filter(s => s.staff_id === person.id);
                    const personHours = personShifts.reduce((sum, s) => sum + shiftHours(s.start_time, s.end_time), 0);
                    const roleColor = ROLE_COLORS[person.role] || '#6B7280';
                    return (
                      <tr key={person.id} className="border-t border-[#3A3B3C]/50 hover:bg-[#242526]/50">
                        {/* Staff name */}
                        <td className="sticky left-0 bg-[#18191A] z-10 px-2 py-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                              style={{ backgroundColor: roleColor + '40' }}>
                              {(person.display_name || person.name || '?')[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate max-w-[110px]">
                                {person.display_name || person.name || 'Staff'}
                              </p>
                              <p className="text-[10px] capitalize" style={{ color: roleColor }}>
                                {person.role || 'staff'}
                              </p>
                            </div>
                          </div>
                        </td>
                        {/* Day cells */}
                        {weekDays.map(day => {
                          const dayShifts = getShiftsFor(person.id, day.date);
                          return (
                            <td key={day.date} className={`px-1 py-1 align-top ${day.isToday ? 'bg-[#1877F2]/5' : ''}`}>
                              {dayShifts.length > 0 ? (
                                <div className="space-y-0.5">
                                  {dayShifts.map(s => (
                                    <div
                                      key={s.id}
                                      className="group relative rounded-lg px-1.5 py-1 text-[10px] font-medium cursor-pointer border transition-colors"
                                      style={{
                                        backgroundColor: roleColor + '15',
                                        borderColor: roleColor + '40',
                                        color: roleColor
                                      }}
                                    >
                                      <p className="leading-tight">{formatTime12(s.start_time)}</p>
                                      <p className="leading-tight">{formatTime12(s.end_time)}</p>
                                      {/* Delete on hover */}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); deleteShift(s.id); }}
                                        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#EF4444] text-white hidden group-hover:flex items-center justify-center"
                                        title="Delete shift"
                                      >
                                        <X className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <button
                                  onClick={() => { setAddDate(day.date); setAddStaffId(person.id); setShowAddModal(true); }}
                                  className="w-full h-10 rounded-lg border border-dashed border-[#3A3B3C]/50 hover:border-[#1877F2]/50 hover:bg-[#1877F2]/5 transition-colors flex items-center justify-center"
                                >
                                  <Plus className="w-3 h-3 text-[#3A3B3C] hover:text-[#1877F2]" />
                                </button>
                              )}
                            </td>
                          );
                        })}
                        {/* Weekly hours */}
                        <td className="px-2 py-2 text-center">
                          <p className="text-sm font-bold text-white">{personHours > 0 ? `${personHours}h` : '—'}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add shift FAB */}
            <button
              onClick={() => { setAddDate(null); setAddStaffId(null); setShowAddModal(true); }}
              className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#1877F2] text-white shadow-lg shadow-[#1877F2]/30 flex items-center justify-center active:bg-[#1564D4] z-20"
            >
              <Plus className="w-7 h-7" />
            </button>
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-xl ${toast.type === 'success' ? 'bg-[#31A24C] text-white' : 'bg-[#EF4444] text-white'
            }`}>
            {toast.msg}
          </div>
        )}

        {/* Add Shift Modal */}
        {showAddModal && (
          <AddShiftModal
            allStaff={allStaff}
            defaultDate={addDate}
            defaultStaffId={addStaffId}
            weekDays={weekDays}
            onClose={() => setShowAddModal(false)}
            onSubmit={createShift}
          />
        )}

        {/* Broadcast Modal */}
        {showBroadcastModal && (
          <BroadcastModal
            weekLabel={weekLabel}
            totalShifts={totalShifts}
            staffCount={staffWithShifts}
            broadcasting={broadcasting}
            result={broadcastResult}
            onSend={broadcastSchedule}
            onClose={() => { setShowBroadcastModal(false); setBroadcastResult(null); }}
          />
        )}
      </div>
    </CommanderLayout>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADD SHIFT MODAL
// ═══════════════════════════════════════════════════════════════

function AddShiftModal({ allStaff, defaultDate, defaultStaffId, weekDays, onClose, onSubmit }) {
  const [staffId, setStaffId] = useState(defaultStaffId || '');
  const [date, setDate] = useState(defaultDate || weekDays[0]?.date || '');
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('22:00');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedStaff = allStaff.find(s => s.id === staffId);
  const hours = shiftHours(startTime, endTime);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!staffId || !date || !startTime || !endTime) return;
    setSaving(true);
    await onSubmit({
      staff_id: staffId,
      staff_name: selectedStaff?.display_name || selectedStaff?.name || '',
      staff_role: selectedStaff?.role || 'staff',
      shift_date: date,
      start_time: startTime,
      end_time: endTime,
      notes: notes.trim() || null
    });
    setSaving(false);
  };

  // Common shift presets
  const presets = [
    { label: 'Morning', start: '08:00', end: '16:00' },
    { label: 'Day', start: '10:00', end: '18:00' },
    { label: 'Swing', start: '14:00', end: '22:00' },
    { label: 'Night', start: '18:00', end: '02:00' },
    { label: 'Graveyard', start: '22:00', end: '06:00' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#242526] rounded-2xl w-full max-w-md border border-[#3A3B3C] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#3A3B3C]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Plus className="w-5 h-5 text-[#1877F2]" />
            Add Shift
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#3A3B3C]">
            <X className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Employee picker */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">Employee</label>
            <select
              value={staffId}
              onChange={e => setStaffId(e.target.value)}
              className="w-full h-12 px-3 bg-[#3A3B3C] text-white rounded-lg border border-[#4A4B4C] text-sm"
              required
            >
              <option value="">Select Employee...</option>
              {allStaff.map(s => (
                <option key={s.id} value={s.id}>
                  {s.display_name || s.name || 'Staff'} — {(s.role || 'staff').charAt(0).toUpperCase() + (s.role || 'staff').slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Date picker */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">Date</label>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map(day => (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => setDate(day.date)}
                  className={`py-2 rounded-lg text-xs font-medium transition-colors ${date === day.date
                    ? 'bg-[#1877F2] text-white'
                    : day.isToday
                      ? 'bg-[#1877F2]/10 text-[#1877F2] border border-[#1877F2]/30'
                      : 'bg-[#3A3B3C] text-[#B0B3B8] hover:bg-[#4A4B4C]'
                    }`}
                >
                  <p>{day.label}</p>
                  <p className="text-sm font-bold">{day.dayNum}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Quick presets */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">Quick Presets</label>
            <div className="flex gap-1.5 flex-wrap">
              {presets.map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => { setStartTime(p.start); setEndTime(p.end); }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${startTime === p.start && endTime === p.end
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-[#3A3B3C] text-[#B0B3B8] hover:bg-[#4A4B4C]'
                    }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Time pickers */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#B0B3B8] mb-1">Start Time</label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full h-12 px-3 bg-[#3A3B3C] text-white rounded-lg border border-[#4A4B4C] text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#B0B3B8] mb-1">End Time</label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full h-12 px-3 bg-[#3A3B3C] text-white rounded-lg border border-[#4A4B4C] text-sm"
                required
              />
            </div>
          </div>

          {hours > 0 && (
            <p className="text-xs text-[#B0B3B8] text-center">
              <Clock className="w-3 h-3 inline mr-1" />{hours} hours
            </p>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-[#B0B3B8] mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., Training shift, Cover for John..."
              className="w-full h-10 px-3 bg-[#3A3B3C] text-white rounded-lg border border-[#4A4B4C] text-sm"
            />
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-12 bg-[#3A3B3C] text-white rounded-xl font-medium text-sm hover:bg-[#4A4B4C]">
              Cancel
            </button>
            <button type="submit" disabled={saving || !staffId || !date}
              className="flex-1 h-12 bg-[#1877F2] text-white rounded-xl font-medium text-sm disabled:opacity-50 active:bg-[#1564D4]">
              {saving ? 'Adding...' : 'Add Shift'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BROADCAST MODAL
// ═══════════════════════════════════════════════════════════════

function BroadcastModal({ weekLabel, totalShifts, staffCount, broadcasting, result, onSend, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-[#242526] rounded-2xl w-full max-w-sm border border-[#3A3B3C] shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-[#3A3B3C]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-[#1877F2]" />
            Send Schedule
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#3A3B3C]">
            <X className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="bg-[#18191A] rounded-xl p-3 text-center space-y-1">
            <p className="text-sm text-[#B0B3B8]">{weekLabel}</p>
            <p className="text-2xl font-bold text-white">{totalShifts} shifts</p>
            <p className="text-xs text-[#B0B3B8]">for {staffCount} employees</p>
          </div>

          <p className="text-sm text-[#B0B3B8] text-center">
            Each employee will receive their personal schedule.
          </p>

          {result ? (
            <div className="bg-[#31A24C]/10 border border-[#31A24C]/30 rounded-xl p-4 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-[#31A24C] mx-auto" />
              <p className="text-sm font-medium text-[#31A24C]">Schedule Sent!</p>
              <p className="text-xs text-[#B0B3B8]">
                ✅ {result.sent} sent | ⏭️ {result.skipped} skipped | ❌ {result.failed} failed
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => onSend('sms')}
                disabled={broadcasting}
                className="w-full h-12 bg-[#31A24C] text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:bg-[#28893E]"
              >
                {broadcasting ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                {broadcasting ? 'Sending...' : 'Send via Text (SMS)'}
              </button>
              <button
                onClick={() => onSend('email')}
                disabled={broadcasting}
                className="w-full h-12 bg-[#3A3B3C] text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-[#4A4B4C]"
              >
                <Mail className="w-4 h-4" />
                Send via Email
              </button>
              <button
                onClick={() => onSend('both')}
                disabled={broadcasting}
                className="w-full h-10 bg-transparent text-[#B0B3B8] rounded-xl font-medium text-xs flex items-center justify-center gap-2 disabled:opacity-50 hover:text-white"
              >
                Send Both (SMS + Email)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
