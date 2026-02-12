/**
 * Game Start Intelligence
 * /commander/game-start
 * AI recommendations for when to open new tables
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Brain, Play, Pause, AlertTriangle, Clock,
  Users, Loader2, RefreshCw, Zap, Table2
} from 'lucide-react';

const ACTION_STYLES = {
  open_now: { bg: '#DCFCE7', text: '#166534', border: '#22C55E', label: 'OPEN NOW', icon: Play },
  open_soon: { bg: '#FEF9C3', text: '#854D0E', border: '#EAB308', label: 'OPEN SOON', icon: Clock },
  blocked: { bg: '#FEE2E2', text: '#991B1B', border: '#EF4444', label: 'BLOCKED', icon: AlertTriangle },
  monitor: { bg: '#F3F4F6', text: '#4B5563', border: '#D1D5DB', label: 'MONITOR', icon: Pause },
};

export default function GameStartIntelligence() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

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
    if (staff?.venue_id) fetchData();
    const interval = setInterval(() => { if (staff?.venue_id) fetchData(); }, 30000);
    return () => clearInterval(interval);
  }, [staff]);

  const fetchData = async () => {
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/ai/game-start?venue_id=${staff.venue_id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  return (
    <>
      <Head><title>Game Start AI | Club Commander</title></Head>
      <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: '#1877F2', color: 'white', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/commander/dashboard')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
            <ArrowLeft size={22} />
          </button>
          <Brain size={22} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Game Start Intelligence</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              {data?.context ? `${data.context.day} ${data.context.hour}:00${data.context.is_peak ? ' • Peak Hours' : ''}` : 'AI analysis'}
            </div>
          </div>
          <button onClick={fetchData} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
            <RefreshCw size={18} color="white" />
          </button>
        </div>

        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          {/* Venue State */}
          {data?.venue_state && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Waiting', val: data.venue_state.total_waiting, color: '#F59E0B' },
                { label: 'Active', val: data.venue_state.active_tables, color: '#10B981' },
                { label: 'Open', val: data.venue_state.open_tables, color: '#3B82F6' },
                { label: 'Dealers', val: data.venue_state.available_dealers, color: '#8B5CF6' },
              ].map(s => (
                <div key={s.label} style={{ background: 'white', borderRadius: 10, padding: 10, border: '1px solid #E4E6EB', textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div style={{ fontSize: 10, color: '#65676B' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} color="#1877F2" className="spin" /></div>
          ) : !data?.recommendations?.length ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#65676B', background: 'white', borderRadius: 12 }}>
              No one on the waitlist — no game start recommendations
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.recommendations.map((rec, i) => {
                const style = ACTION_STYLES[rec.action] || ACTION_STYLES.monitor;
                const Icon = style.icon;
                return (
                  <div key={i} style={{ background: 'white', borderRadius: 12, border: `2px solid ${style.border}`, overflow: 'hidden' }}>
                    <div style={{ padding: 14 }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: style.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={20} color={style.text} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, color: '#1C2526' }}>{rec.game_type}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: style.bg, color: style.text, border: `1px solid ${style.border}` }}>
                              {style.label}
                            </span>
                            <span style={{ fontSize: 11, color: '#65676B' }}>{rec.confidence} confidence</span>
                          </div>
                        </div>
                      </div>

                      {/* Stats row */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                        <div style={{ padding: 8, background: '#F9FAFB', borderRadius: 8, textAlign: 'center' }}>
                          <Users size={14} color="#1877F2" style={{ margin: '0 auto 2px' }} />
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#1C2526' }}>{rec.waitlist_count}</div>
                          <div style={{ fontSize: 10, color: '#65676B' }}>Waiting</div>
                        </div>
                        <div style={{ padding: 8, background: '#F9FAFB', borderRadius: 8, textAlign: 'center' }}>
                          <Table2 size={14} color="#10B981" style={{ margin: '0 auto 2px' }} />
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#1C2526' }}>{rec.active_tables}</div>
                          <div style={{ fontSize: 10, color: '#65676B' }}>Tables</div>
                        </div>
                        <div style={{ padding: 8, background: '#F9FAFB', borderRadius: 8, textAlign: 'center' }}>
                          <Clock size={14} color="#F59E0B" style={{ margin: '0 auto 2px' }} />
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#1C2526' }}>{rec.oldest_wait_minutes}m</div>
                          <div style={{ fontSize: 10, color: '#65676B' }}>Longest Wait</div>
                        </div>
                      </div>

                      {/* Reasons */}
                      <div style={{ borderTop: '1px solid #F0F2F5', paddingTop: 8 }}>
                        {rec.reasons.map((r, j) => (
                          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', fontSize: 13, color: r.startsWith('⚠') ? '#DC2626' : '#444' }}>
                            {r.startsWith('⚠') ? <AlertTriangle size={12} color="#DC2626" /> : <Zap size={12} color="#10B981" />}
                            <span>{r}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
