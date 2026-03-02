/**
 * MY VENUES — Employee Portal
 * /hub/my-venues
 * Shows schedule, downs, and time clock for linked staff accounts.
 * Only accessible when user has ≥1 linked venue via commander_staff.linked_user_id
 *
 * Facebook Dark Theme
 */
import SEOHead from '../../src/components/seo/SEOHead';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import { getAuthUser } from '../../src/lib/authUtils';
import { supabase } from '../../src/lib/supabase';
import {
    Building2, Calendar, Layers, Clock, ChevronLeft, ChevronRight,
    Briefcase, Shield, Link2, Copy, CheckCircle, AlertCircle
} from 'lucide-react';

// ── Design tokens ──
const C = {
    bg: '#18191a', surface: '#242526', elevated: '#3a3b3c',
    text: '#e4e6eb', textSec: '#b0b3b8', textMuted: '#65676b',
    blue: '#2374e1', blueDim: 'rgba(35, 116, 225, 0.12)',
    green: '#31a24c', red: '#f02849', cyan: '#00bfff',
    border: '#3E4042', borderLight: '#333536',
    greenDim: 'rgba(49, 162, 76, 0.12)',
    cyanDim: 'rgba(0, 191, 255, 0.12)',
    yellowDim: 'rgba(234, 179, 8, 0.12)',
    yellow: '#eab308',
};

const ROLE_COLORS = {
    owner: '#eab308', manager: '#f97316', floor: '#22c55e',
    dualrate: '#06b6d4', cashier: '#a855f7', brush: '#ec4899',
    dealer: '#6b7280', security: '#ef4444',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatTime12(t) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatDate(iso) {
    const d = new Date(iso);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

// ── VENUE CARD ──
function VenueCard({ venue, isSelected, onClick }) {
    const roleColor = ROLE_COLORS[venue.role] || '#6b7280';
    return (
        <button onClick={onClick} style={{
            width: '100%', textAlign: 'left', cursor: 'pointer',
            background: isSelected ? C.elevated : C.surface,
            border: `2px solid ${isSelected ? C.blue : C.border}`,
            borderRadius: 12, padding: 16,
            display: 'flex', alignItems: 'center', gap: 14,
            transition: 'all 0.15s ease',
        }}>
            <div style={{
                width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                background: venue.venue_logo
                    ? `url(${venue.venue_logo}) center/cover`
                    : `linear-gradient(135deg, ${C.blue}, #1a5cc7)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, color: '#fff', fontWeight: 700,
                border: `1px solid ${C.borderLight}`,
            }}>
                {!venue.venue_logo && (venue.venue_name?.[0]?.toUpperCase() || '♠')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {venue.venue_name}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <span style={{
                        padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                        background: `${roleColor}22`, border: `1px solid ${roleColor}55`, color: roleColor,
                    }}>
                        {venue.role}
                    </span>
                    {venue.venue_city && (
                        <span style={{ fontSize: 12, color: C.textMuted }}>
                            {venue.venue_city}{venue.venue_state ? `, ${venue.venue_state}` : ''}
                        </span>
                    )}
                </div>
            </div>
        </button>
    );
}

// ── STAT CARD ──
function StatCard({ label, value, icon: Icon, color }) {
    return (
        <div style={{
            background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '14px 16px', flex: 1, minWidth: 120,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Icon size={16} color={color || C.textMuted} />
                <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.text }}>{value}</div>
        </div>
    );
}

// ── SCHEDULE TAB ──
function ScheduleTab({ staffId, venueId, token }) {
    const [shifts, setShifts] = useState([]);
    const [weekStart, setWeekStart] = useState('');
    const [weekEnd, setWeekEnd] = useState('');
    const [totalShifts, setTotalShifts] = useState(0);
    const [totalHours, setTotalHours] = useState(0);
    const [weekOffset, setWeekOffset] = useState(0);
    const [loading, setLoading] = useState(true);

    const fetchSchedule = useCallback(async () => {
        setLoading(true);
        try {
            const d = new Date();
            d.setDate(d.getDate() + weekOffset * 7);
            const weekParam = d.toISOString().split('T')[0];
            const res = await fetch(`/api/employee/schedule?staff_id=${staffId}&venue_id=${venueId}&week=${weekParam}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const json = await res.json();
            if (json.success) {
                setShifts(json.data.shifts || []);
                setWeekStart(json.data.week_start);
                setWeekEnd(json.data.week_end);
                setTotalShifts(json.data.total_shifts);
                setTotalHours(json.data.total_hours);
            }
        } catch { }
        setLoading(false);
    }, [staffId, venueId, token, weekOffset]);

    useEffect(() => { fetchSchedule(); }, [fetchSchedule]);

    // Group shifts by day
    const shiftsByDay = {};
    shifts.forEach(s => {
        const day = s.shift_date || new Date(s.created_at).toISOString().split('T')[0];
        if (!shiftsByDay[day]) shiftsByDay[day] = [];
        shiftsByDay[day].push(s);
    });

    return (
        <div>
            {/* Week navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}>
                    <ChevronLeft size={18} color={C.text} />
                </button>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
                        {weekStart && weekEnd ? `${formatDate(weekStart)} — ${formatDate(weekEnd)}` : 'This Week'}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
                        {totalShifts} shifts · {totalHours}h scheduled
                    </div>
                </div>
                <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}>
                    <ChevronRight size={18} color={C.text} />
                </button>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}>Loading schedule...</div>
            ) : shifts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: C.surface, borderRadius: 12, border: `1px solid ${C.border}` }}>
                    <Calendar size={32} color={C.textMuted} style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 14, color: C.textMuted }}>No shifts scheduled this week</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {Object.entries(shiftsByDay).sort(([a], [b]) => a.localeCompare(b)).map(([day, dayShifts]) => {
                        const d = new Date(day + 'T12:00:00');
                        return (
                            <div key={day} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 16px' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: C.blue, marginBottom: 8 }}>
                                    {DAY_NAMES[d.getDay()]} · {formatDate(day)}
                                </div>
                                {dayShifts.map((s, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? `1px solid ${C.borderLight}` : 'none' }}>
                                        <span style={{ fontSize: 14, color: C.text }}>
                                            {formatTime12(s.start_time)} — {formatTime12(s.end_time)}
                                        </span>
                                        {s.position && (
                                            <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'capitalize' }}>{s.position}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── DOWNS TAB ──
function DownsTab({ staffId, venueId, token }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch_ = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/employee/downs?staff_id=${staffId}&venue_id=${venueId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const json = await res.json();
                if (json.success) setData(json.data);
            } catch { }
            setLoading(false);
        };
        fetch_();
    }, [staffId, venueId, token]);

    if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}>Loading downs...</div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}>Unable to load data</div>;

    const { stats, downs, active_tables } = data;

    return (
        <div>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatCard label="Total Downs" value={stats.total_downs} icon={Layers} color={C.blue} />
                <StatCard label="Hours on Table" value={stats.total_hours_on_table} icon={Clock} color={C.green} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <StatCard label="Cash Downs" value={stats.cash_downs} icon={Layers} color={C.cyan} />
                <StatCard label="Tournament" value={stats.tournament_downs} icon={Layers} color={C.yellow} />
            </div>

            {/* Active tables */}
            {active_tables.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.green, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                        🔴 Currently Dealing
                    </div>
                    {active_tables.map(t => (
                        <div key={t.id} style={{ background: C.greenDim, border: `1px solid ${C.green}44`, borderRadius: 8, padding: '10px 14px', marginBottom: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Table {t.table_number}</span>
                            {t.game_type && <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 10 }}>{t.game_type}</span>}
                        </div>
                    ))}
                </div>
            )}

            {/* Recent downs list */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Recent Downs (Last 30 Days)
            </div>
            {downs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 14 }}>
                    No downs recorded yet
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {downs.slice(0, 50).map((d, i) => {
                        const duration = d.started_at && d.ended_at
                            ? `${Math.round((new Date(d.ended_at) - new Date(d.started_at)) / 60000)} min`
                            : 'Active';
                        return (
                            <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Table {d.table_number || '?'}</div>
                                    <div style={{ fontSize: 11, color: C.textMuted }}>{formatDateTime(d.started_at)}</div>
                                </div>
                                <span style={{ fontSize: 12, color: d.ended_at ? C.textSec : C.green, fontWeight: 600 }}>{duration}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── TIME CLOCK TAB ──
function TimeClockTab({ staffId, venueId, token }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetch_ = async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/employee/time-entries?staff_id=${staffId}&venue_id=${venueId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                const json = await res.json();
                if (json.success) setData(json.data);
            } catch { }
            setLoading(false);
        };
        fetch_();
    }, [staffId, venueId, token]);

    if (loading) return <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}>Loading time clock...</div>;
    if (!data) return <div style={{ textAlign: 'center', padding: 40, color: C.textMuted }}>Unable to load data</div>;

    const { stats, entries } = data;

    return (
        <div>
            {/* Stats */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <StatCard label="Total Hours" value={stats.total_hours} icon={Clock} color={C.blue} />
                <StatCard label="Days Worked" value={stats.days_worked} icon={Calendar} color={C.green} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                <StatCard label="Avg/Shift" value={`${stats.avg_hours_per_shift}h`} icon={Clock} color={C.cyan} />
                <StatCard label="Status" value={stats.currently_on_shift ? 'On Shift' : 'Off'} icon={Shield} color={stats.currently_on_shift ? C.green : C.textMuted} />
            </div>

            {/* Entries list */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Time Clock History (Last 30 Days)
            </div>
            {entries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 20px', background: C.surface, borderRadius: 10, border: `1px solid ${C.border}`, color: C.textMuted, fontSize: 14 }}>
                    No time clock entries — clock in at the venue kiosk
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {entries.map((e, i) => (
                        <div key={i} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                                    {formatDate(e.clock_in)}
                                </div>
                                <span style={{
                                    fontSize: 12, fontWeight: 700,
                                    color: e.clock_out ? C.blue : C.green,
                                    background: e.clock_out ? C.blueDim : C.greenDim,
                                    padding: '2px 8px', borderRadius: 6,
                                }}>
                                    {e.hours_worked ? `${e.hours_worked}h` : '⏱ Active'}
                                </span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: C.textMuted }}>
                                <span>In: {formatDateTime(e.clock_in)}</span>
                                <span>{e.clock_out ? `Out: ${formatDateTime(e.clock_out)}` : 'Still clocked in'}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ── CLAIM CODE INPUT ──
function ClaimCodeInput({ token, onLinked }) {
    const [code, setCode] = useState('');
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleClaim = async () => {
        if (!code.trim() || code.length < 4) { setError('Enter a valid claim code'); return; }
        setClaiming(true); setError('');
        try {
            const res = await fetch('/api/employee/claim', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ code: code.trim() }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || 'Failed to claim');
            } else {
                setSuccess(data.data.message);
                setCode('');
                setTimeout(() => onLinked(), 1500);
            }
        } catch { setError('Network error'); }
        setClaiming(false);
    };

    return (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Link2 size={18} color={C.blue} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Link to a Venue</span>
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>
                Enter the claim code from your manager to connect your account.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <input
                    type="text"
                    value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
                    placeholder="ABC123"
                    maxLength={8}
                    style={{
                        flex: 1, padding: '10px 14px', borderRadius: 8, fontSize: 16, fontWeight: 700,
                        letterSpacing: 3, textAlign: 'center', fontFamily: 'monospace',
                        background: '#111', border: `1px solid ${C.border}`, color: C.text,
                        outline: 'none',
                    }}
                />
                <button onClick={handleClaim} disabled={claiming || code.length < 4} style={{
                    padding: '10px 20px', borderRadius: 8, border: 'none',
                    background: code.length >= 4 ? C.blue : C.elevated, color: '#fff',
                    fontSize: 13, fontWeight: 600, cursor: code.length >= 4 ? 'pointer' : 'default',
                    opacity: claiming ? 0.6 : 1,
                }}>
                    {claiming ? '...' : 'Link'}
                </button>
            </div>
            {error && <div style={{ color: C.red, fontSize: 12, marginTop: 8 }}>{error}</div>}
            {success && <div style={{ color: C.green, fontSize: 12, marginTop: 8 }}>✅ {success}</div>}
        </div>
    );
}

// ── EMAIL MATCH BANNER ──
function EmailMatchBanner({ matches, token, onLinked }) {
    const [linking, setLinking] = useState(null);

    const handleLink = async (staffId) => {
        setLinking(staffId);
        try {
            const res = await fetch('/api/employee/link-by-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ staff_id: staffId }),
            });
            const data = await res.json();
            if (data.success) {
                setTimeout(() => onLinked(), 1000);
            }
        } catch { }
        setLinking(null);
    };

    if (!matches.length) return null;

    return (
        <div style={{ background: C.yellowDim, border: `1px solid ${C.yellow}44`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <AlertCircle size={16} color={C.yellow} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.yellow }}>Staff Accounts Found</span>
            </div>
            <div style={{ fontSize: 12, color: C.textSec, marginBottom: 12 }}>
                Your email matches staff records at these venues. Click to link your account.
            </div>
            {matches.map(m => (
                <div key={m.staff_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: `1px solid ${C.borderLight}` }}>
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{m.venue_name}</div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>as {m.display_name} ({m.role})</div>
                    </div>
                    <button onClick={() => handleLink(m.staff_id)} disabled={linking === m.staff_id} style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none',
                        background: C.blue, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        opacity: linking === m.staff_id ? 0.6 : 1,
                    }}>
                        {linking === m.staff_id ? '...' : 'Link'}
                    </button>
                </div>
            ))}
        </div>
    );
}

// Nav button style
const navBtn = {
    background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function MyVenuesPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [token, setToken] = useState('');
    const [loading, setLoading] = useState(true);
    const [venues, setVenues] = useState([]);
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [activeTab, setActiveTab] = useState('schedule');
    const [emailMatches, setEmailMatches] = useState([]);

    // Load user and venues
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                router.push('/login?redirect=/hub/my-venues');
                return;
            }
            setUser(session.user);
            setToken(session.access_token);

            // Fetch linked venues
            const res = await fetch('/api/employee/venues', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const json = await res.json();
            if (json.success) {
                setVenues(json.data.venues || []);
                if (json.data.venues?.length > 0 && !selectedVenue) {
                    setSelectedVenue(json.data.venues[0]);
                }
            }

            // Check email matches
            const emailRes = await fetch('/api/employee/link-by-email', {
                headers: { Authorization: `Bearer ${session.access_token}` },
            });
            const emailJson = await emailRes.json();
            if (emailJson.success) {
                setEmailMatches(emailJson.data.matches || []);
            }
        } catch (e) {
            console.error('MyVenues load error:', e);
        }
        setLoading(false);
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleLinked = () => {
        loadData();
    };

    const tabs = [
        { id: 'schedule', label: 'Schedule', icon: Calendar },
        { id: 'downs', label: 'Downs', icon: Layers },
        { id: 'timeclock', label: 'Time Clock', icon: Clock },
    ];

    return (
        <>
            <SEOHead title="My Venues | Smarter.Poker" description="View your schedule, downs, and time clock from venues where you work." path="/hub/my-venues" />
            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
        body { margin: 0; }
      ` }} />

            <div style={{ minHeight: '100vh', background: C.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif', color: C.text }}>
                <UniversalHeader title="My Venues" backHref="/hub" backLabel="← Hub" />

                <div style={{ maxWidth: 700, margin: '0 auto', padding: '20px 16px 80px' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0' }}>
                            <div style={{ width: 40, height: 40, borderRadius: '50%', border: `3px solid ${C.elevated}`, borderTopColor: C.blue, animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                            <div style={{ fontSize: 14, color: C.textSec }}>Loading your venues...</div>
                        </div>
                    ) : (
                        <>
                            {/* Email match banner */}
                            <EmailMatchBanner matches={emailMatches} token={token} onLinked={handleLinked} />

                            {/* Claim code input */}
                            <ClaimCodeInput token={token} onLinked={handleLinked} />

                            {venues.length === 0 ? (
                                /* Empty state */
                                <div style={{ textAlign: 'center', padding: '50px 20px', marginTop: 20 }}>
                                    <Building2 size={48} color={C.textMuted} style={{ marginBottom: 12 }} />
                                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>No Linked Venues</div>
                                    <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
                                        Ask your manager for a claim code to connect your account to a venue.
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {/* Venue selector */}
                                    <div style={{ marginTop: 16, marginBottom: 16 }}>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                            Your Venues ({venues.length})
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {venues.map(v => (
                                                <VenueCard
                                                    key={v.staff_id}
                                                    venue={v}
                                                    isSelected={selectedVenue?.staff_id === v.staff_id}
                                                    onClick={() => setSelectedVenue(v)}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Data tabs */}
                                    {selectedVenue && (
                                        <>
                                            <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: C.surface, borderRadius: 10, padding: 4, border: `1px solid ${C.border}` }}>
                                                {tabs.map(t => (
                                                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                                                        flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                                                        background: activeTab === t.id ? C.blue : 'transparent',
                                                        color: activeTab === t.id ? '#fff' : C.textSec,
                                                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                                        transition: 'all 0.15s ease',
                                                    }}>
                                                        <t.icon size={14} /> {t.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {/* Tab content */}
                                            {activeTab === 'schedule' && <ScheduleTab staffId={selectedVenue.staff_id} venueId={selectedVenue.venue_id} token={token} />}
                                            {activeTab === 'downs' && <DownsTab staffId={selectedVenue.staff_id} venueId={selectedVenue.venue_id} token={token} />}
                                            {activeTab === 'timeclock' && <TimeClockTab staffId={selectedVenue.staff_id} venueId={selectedVenue.venue_id} token={token} />}
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
}
