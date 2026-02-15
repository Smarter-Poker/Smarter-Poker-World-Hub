/**
 * Shift Handoff
 * /commander/shift-handoff
 * Outgoing floor passes context to incoming shift
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, ArrowRightLeft, CheckCircle2, Clock, Users, AlertTriangle,
  Loader2, Send, FileText, Star, ListChecks, MessageSquare, LayoutGrid,
  ChevronDown, ChevronUp
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

export default function ShiftHandoff() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [mode, setMode] = useState('menu'); // menu | create | history
  const [handoffs, setHandoffs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Form state
  const [notes, setNotes] = useState('');
  const [issues, setIssues] = useState('');
  const [vipAlerts, setVipAlerts] = useState('');
  const [pendingActions, setPendingActions] = useState('');
  const [incomingName, setIncomingName] = useState('');

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token') : null;

  useEffect(() => {
    const stored = localStorage.getItem('commander_staff');
    if (!stored) { router.push('/commander/login'); return; }
    try {
      const s = JSON.parse(stored);
      if (!s.venue_id) { router.push('/commander/login'); return; }
      setStaff(s);
    } catch { router.push('/commander/login'); }
  }, []);

  useEffect(() => {
    if (staff?.venue_id) fetchHandoffs();
  }, [staff]);

  const fetchHandoffs = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/shift-handoff?venue_id=${staff.venue_id}&limit=30`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) setHandoffs(json.data.handoffs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleSubmit = async () => {
    if (!notes.trim() && !issues.trim()) {
      setToast({ type: 'error', msg: 'Add notes or issues before submitting' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken();
      const res = await fetch('/api/commander/shift-handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          venue_id: staff.venue_id,
          staff_name: staff.name || staff.display_name || 'Floor Staff',
          notes: notes.trim() || null,
          issues: issues.trim() || null,
          vip_alerts: vipAlerts.trim() || null,
          pending_actions: pendingActions.trim() || null,
          incoming_staff_name: incomingName.trim() || null
        })
      });
      const json = await res.json();
      if (json.success) {
        setToast({ type: 'success', msg: 'Shift handoff submitted' });
        setNotes(''); setIssues(''); setVipAlerts(''); setPendingActions(''); setIncomingName('');
        setMode('history');
        fetchHandoffs();
      } else {
        setToast({ type: 'error', msg: json.error?.message || 'Failed to submit' });
      }
    } catch (err) {
      setToast({ type: 'error', msg: 'Network error' });
    }
    finally { setSubmitting(false); setTimeout(() => setToast(null), 3000); }
  };

  const handleAcknowledge = async (handoffId) => {
    try {
      const token = getToken();
      const res = await fetch('/api/commander/shift-handoff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          handoff_id: handoffId,
          staff_name: staff.name || staff.display_name || 'Floor Staff'
        })
      });
      const json = await res.json();
      if (json.success) {
        setToast({ type: 'success', msg: 'Handoff acknowledged' });
        fetchHandoffs();
      }
    } catch (err) { console.error(err); }
    finally { setTimeout(() => setToast(null), 3000); }
  };

  const pendingHandoffs = handoffs.filter(h => h.status === 'pending');

  const formatTime = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <>
      <Head><title>Shift Handoff | Club Commander</title></Head>
      <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ background: '#1877F2', color: 'white', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="cmd-back-btn" onClick={() => mode === 'menu' ? router.push('/commander/dashboard') : setMode('menu')}>
            <ArrowLeft size={16} /> Back
          </button>
          <ArrowRightLeft size={22} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Shift Handoff</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Pass floor context to incoming shift</div>
          </div>
          {pendingHandoffs.length > 0 && (
            <div style={{ marginLeft: 'auto', background: '#EF4444', borderRadius: 12, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>
              {pendingHandoffs.length} Pending
            </div>
          )}
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ margin: 12, padding: '10px 14px', borderRadius: 8, background: toast.type === 'success' ? '#DEF7EC' : '#FEE2E2', color: toast.type === 'success' ? '#03543F' : '#991B1B', fontSize: 14, fontWeight: 600 }}>
            {toast.msg}
          </div>
        )}

        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          {/* Menu Mode */}
          {mode === 'menu' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Pending alert */}
              {pendingHandoffs.length > 0 && (
                <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 10, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <AlertTriangle size={18} color="#D97706" />
                    <span style={{ fontWeight: 700, color: '#92400E', fontSize: 15 }}>Incoming Handoff Waiting</span>
                  </div>
                  {pendingHandoffs.map(h => (
                    <div key={h.id} style={{ background: 'white', borderRadius: 8, padding: 12, marginTop: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1C2526' }}>From: {h.outgoing_staff_name}</div>
                      <div style={{ fontSize: 12, color: '#65676B' }}>{formatTime(h.handoff_time)}</div>
                      <div style={{ fontSize: 13, color: '#444', marginTop: 6 }}>
                        {h.open_tables_count} tables, {h.active_players_count} players, {h.waitlist_count} waiting
                      </div>
                      <button onClick={() => { setExpandedId(h.id); setMode('history'); }}
                        style={{ marginTop: 8, background: '#1877F2', color: 'white', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                        Review & Acknowledge
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <button onClick={() => setMode('create')}
                style={{ background: 'white', border: '2px solid #1877F2', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#EBF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={22} color="#1877F2" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#1C2526' }}>Create Handoff</div>
                  <div style={{ fontSize: 13, color: '#65676B' }}>Document floor state and pass to next shift</div>
                </div>
              </button>

              <button onClick={() => setMode('history')}
                style={{ background: 'white', border: '1px solid #E4E6EB', borderRadius: 12, padding: 20, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: '#F0F2F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={22} color="#65676B" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#1C2526' }}>Handoff History</div>
                  <div style={{ fontSize: 13, color: '#65676B' }}>View past shift handoffs and notes</div>
                </div>
              </button>
            </div>
          )}

          {/* Create Mode */}
          {mode === 'create' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2526', marginBottom: 4 }}>Outgoing Floor: {staff?.name || staff?.display_name || 'Staff'}</div>
                <div style={{ fontSize: 13, color: '#65676B' }}>{new Date().toLocaleString()}</div>
              </div>

              {/* Incoming staff (optional) */}
              <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: '#1C2526', display: 'block', marginBottom: 6 }}>
                  <Users size={15} style={{ display: 'inline', verticalAlign: -2 }} /> Incoming Staff Name (optional)
                </label>
                <input value={incomingName} onChange={e => setIncomingName(e.target.value)}
                  placeholder="Who's taking over?"
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' }} />
              </div>

              {/* General notes */}
              <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: '#1C2526', display: 'block', marginBottom: 6 }}>
                  <MessageSquare size={15} style={{ display: 'inline', verticalAlign: -2 }} /> Floor Notes *
                </label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
                  placeholder="General floor state — how the room is running, player mood, game quality, upcoming events..."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              {/* Active issues */}
              <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: '#EF4444', display: 'block', marginBottom: 6 }}>
                  <AlertTriangle size={15} style={{ display: 'inline', verticalAlign: -2 }} /> Active Issues
                </label>
                <textarea value={issues} onChange={e => setIssues(e.target.value)} rows={3}
                  placeholder="Player disputes, equipment problems, short-staffed, anything needing attention..."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              {/* VIP alerts */}
              <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: '#F59E0B', display: 'block', marginBottom: 6 }}>
                  <Star size={15} style={{ display: 'inline', verticalAlign: -2 }} /> VIP / Player Alerts
                </label>
                <textarea value={vipAlerts} onChange={e => setVipAlerts(e.target.value)} rows={2}
                  placeholder="VIPs in the room, player to watch, high rollers expected..."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              {/* Pending actions */}
              <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
                <label style={{ fontWeight: 600, fontSize: 14, color: '#1877F2', display: 'block', marginBottom: 6 }}>
                  <ListChecks size={15} style={{ display: 'inline', verticalAlign: -2 }} /> Pending Actions
                </label>
                <textarea value={pendingActions} onChange={e => setPendingActions(e.target.value)} rows={2}
                  placeholder="Table changes planned, games to open/close, promotions to run..."
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
              </div>

              <button onClick={handleSubmit} disabled={submitting}
                style={{ background: '#1877F2', color: 'white', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 16, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {submitting ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
                Submit Handoff
              </button>

              <div style={{ fontSize: 12, color: '#65676B', textAlign: 'center' }}>
                Floor snapshot (tables, players, waitlist) is captured automatically
              </div>
            </div>
          )}

          {/* History Mode */}
          {mode === 'history' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} color="#1877F2" className="spin" /></div>
              ) : handoffs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#65676B' }}>No handoffs recorded yet</div>
              ) : handoffs.map(h => {
                const isExpanded = expandedId === h.id;
                const tables = h.table_snapshot || [];
                return (
                  <CommanderLayout title="Shift Handoff" backHref="/commander/dashboard">
                  <div key={h.id} style={{ background: 'white', borderRadius: 12, border: h.status === 'pending' ? '2px solid #F59E0B' : '1px solid #E4E6EB', overflow: 'hidden' }}>
                    {/* Header */}
                    <button onClick={() => setExpandedId(isExpanded ? null : h.id)}
                      style={{ width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: h.status === 'acknowledged' ? '#DEF7EC' : '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {h.status === 'acknowledged' ? <CheckCircle2 size={18} color="#03543F" /> : <Clock size={18} color="#D97706" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#1C2526' }}>
                          {h.outgoing_staff_name} {h.incoming_staff_name ? ` → ${h.incoming_staff_name}` : ''}
                        </div>
                        <div style={{ fontSize: 12, color: '#65676B' }}>{formatTime(h.handoff_time)}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: h.status === 'acknowledged' ? '#DEF7EC' : '#FEF3C7', color: h.status === 'acknowledged' ? '#03543F' : '#92400E' }}>
                          {h.status === 'acknowledged' ? 'ACK' : 'PENDING'}
                        </span>
                        {isExpanded ? <ChevronUp size={16} color="#65676B" /> : <ChevronDown size={16} color="#65676B" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '0 14px 14px', borderTop: '1px solid #E4E6EB' }}>
                        {/* Floor snapshot */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 12 }}>
                          {[
                            { label: 'Tables', val: h.open_tables_count, icon: LayoutGrid, color: '#1877F2' },
                            { label: 'Players', val: h.active_players_count, icon: Users, color: '#31A24C' },
                            { label: 'Waiting', val: h.waitlist_count, icon: Clock, color: '#F59E0B' },
                            { label: 'Incidents', val: h.open_incidents_count, icon: AlertTriangle, color: '#EF4444' },
                          ].map(s => (
                            <div key={s.label} style={{ textAlign: 'center', padding: 8, background: '#F9FAFB', borderRadius: 8 }}>
                              <s.icon size={16} color={s.color} style={{ margin: '0 auto 2px' }} />
                              <div style={{ fontSize: 18, fontWeight: 800, color: '#1C2526' }}>{s.val}</div>
                              <div style={{ fontSize: 10, color: '#65676B' }}>{s.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Table detail */}
                        {tables.length > 0 && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#65676B', marginBottom: 6 }}>TABLE SNAPSHOT</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {tables.map((t, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#F9FAFB', borderRadius: 6, fontSize: 13 }}>
                                  <span style={{ fontWeight: 700, color: '#1877F2', minWidth: 24 }}>T{t.table_number}</span>
                                  <span style={{ flex: 1, color: '#444' }}>{t.game}</span>
                                  <span style={{ fontWeight: 600, color: t.players >= t.max_seats ? '#EF4444' : '#31A24C' }}>
                                    {t.players}/{t.max_seats}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Notes sections */}
                        {h.notes && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#65676B', marginBottom: 4 }}>FLOOR NOTES</div>
                            <div style={{ fontSize: 14, color: '#1C2526', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{h.notes}</div>
                          </div>
                        )}
                        {h.issues && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 4 }}>ACTIVE ISSUES</div>
                            <div style={{ fontSize: 14, color: '#1C2526', whiteSpace: 'pre-wrap', lineHeight: 1.5, background: '#FEF2F2', padding: 10, borderRadius: 8 }}>{h.issues}</div>
                          </div>
                        )}
                        {h.vip_alerts && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 4 }}>VIP / PLAYER ALERTS</div>
                            <div style={{ fontSize: 14, color: '#1C2526', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{h.vip_alerts}</div>
                          </div>
                        )}
                        {h.pending_actions && (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#1877F2', marginBottom: 4 }}>PENDING ACTIONS</div>
                            <div style={{ fontSize: 14, color: '#1C2526', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{h.pending_actions}</div>
                          </div>
                        )}

                        {/* Acknowledge button */}
                        {h.status === 'pending' && (
                          <button onClick={() => handleAcknowledge(h.id)}
                            style={{ marginTop: 14, width: '100%', background: '#31A24C', color: 'white', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            <CheckCircle2 size={18} /> Acknowledge Handoff
                          </button>
                        )}

                        {h.acknowledged_at && (
                          <div style={{ marginTop: 10, fontSize: 12, color: '#31A24C', fontWeight: 600, textAlign: 'center' }}>
                            Acknowledged by {h.incoming_staff_name} at {formatTime(h.acknowledged_at)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  </CommanderLayout>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`
        .cmd-back-btn {
          background: none;
          border: 1px solid #444;
          border-radius: 10px;
          padding: 8px 14px;
          color: #ccc;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
        }
        .cmd-back-btn:hover {
          border-color: #666;
          color: #fff;
        }.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
