/**
 * Table Vibes / Atmosphere
 * /commander/table-vibes
 * Staff view of aggregated table atmosphere ratings from players
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Flame, Smile, Zap, Loader2, MessageSquare,
  Star, BarChart3
} from 'lucide-react';

const VIBE_COLORS = {
  'Action Game': { bg: '#FEF2F2', text: '#991B1B', border: '#EF4444', emoji: '🔥' },
  'Social Game': { bg: '#ECFDF5', text: '#065F46', border: '#10B981', emoji: '😊' },
  'Grinder Table': { bg: '#F0F2F5', text: '#374151', border: '#6B7280', emoji: '🧊' },
  'Fast Game': { bg: '#EBF5FF', text: '#1E40AF', border: '#3B82F6', emoji: '⚡' },
  'Relaxed Pace': { bg: '#FFFBEB', text: '#92400E', border: '#F59E0B', emoji: '🐢' },
  'Aggressive Game': { bg: '#FEF2F2', text: '#991B1B', border: '#EF4444', emoji: '💪' },
  'Standard Game': { bg: '#F9FAFB', text: '#4B5563', border: '#D1D5DB', emoji: '♠️' },
};

export default function TableVibes() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [vibes, setVibes] = useState([]);
  const [totalRatings, setTotalRatings] = useState(0);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

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
    if (staff?.venue_id) fetchVibes();
  }, [staff, days]);

  const fetchVibes = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/table-ratings?venue_id=${staff.venue_id}&days=${days}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setVibes(json.data.vibes);
        setTotalRatings(json.data.total_ratings);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const renderBar = (value, label, color) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: '#65676B', minWidth: 60, textAlign: 'right' }}>{label}</span>
      <div style={{ flex: 1, height: 14, background: '#F0F2F5', borderRadius: 7, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${(value / 5) * 100}%`, background: color, borderRadius: 7, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#1C2526', minWidth: 24 }}>{value}</span>
    </div>
  );

  return (
    <>
      <Head><title>Table Vibes | Club Commander</title></Head>
      <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: '#1877F2', color: 'white', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/commander/dashboard')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
            <img src="/images/btn-back.png" alt="Back" style={{ height: 38 }} />
          </button>
          <Flame size={22} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Table Vibes</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{totalRatings} player ratings in last {days} days</div>
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          {/* Period */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[{ v: 7, l: '7D' }, { v: 14, l: '14D' }, { v: 30, l: '30D' }, { v: 90, l: '90D' }].map(r => (
              <button key={r.v} onClick={() => setDays(r.v)}
                style={{ flex: 1, padding: '8px 0', border: '1px solid', borderColor: days === r.v ? '#1877F2' : '#CED0D4', borderRadius: 8, background: days === r.v ? '#EBF5FF' : 'white', color: days === r.v ? '#1877F2' : '#65676B', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                {r.l}
              </button>
            ))}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} color="#1877F2" className="spin" /></div>
          ) : vibes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#65676B', background: 'white', borderRadius: 12 }}>
              No table ratings yet — players rate tables after sessions
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {vibes.map(v => {
                const vc = VIBE_COLORS[v.vibe] || VIBE_COLORS['Standard Game'];
                return (
                  <div key={v.table_number} style={{ background: 'white', borderRadius: 12, border: '1px solid #E4E6EB', overflow: 'hidden' }}>
                    <div style={{ padding: 14 }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: vc.bg, border: `2px solid ${vc.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                          {vc.emoji}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: 16, color: '#1C2526' }}>Table {v.table_number}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: vc.bg, color: vc.text, border: `1px solid ${vc.border}` }}>
                              {v.vibe}
                            </span>
                            <span style={{ fontSize: 11, color: '#65676B' }}>{v.rating_count} ratings</span>
                          </div>
                        </div>
                      </div>

                      {/* Rating Bars */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {renderBar(v.avg_action, 'Action', '#EF4444')}
                        {renderBar(v.avg_friendliness, 'Friendly', '#31A24C')}
                        {renderBar(v.avg_pace, 'Pace', '#3B82F6')}
                      </div>

                      {/* Comments */}
                      {v.recent_comments.length > 0 && (
                        <div style={{ marginTop: 10, borderTop: '1px solid #F0F2F5', paddingTop: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#65676B', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <MessageSquare size={11} /> RECENT COMMENTS
                          </div>
                          {v.recent_comments.map((c, i) => (
                            <div key={i} style={{ fontSize: 13, color: '#444', fontStyle: 'italic', padding: '2px 0' }}>"{c}"</div>
                          ))}
                        </div>
                      )}
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
