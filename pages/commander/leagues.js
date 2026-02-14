/**
 * Leagues Management
 * /commander/leagues
 * Staff page for managing inter-club leagues, seasons, and standings
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Trophy, Plus, Users, Calendar, DollarSign,
  Loader2, ChevronDown, ChevronUp, Edit2, Star, BarChart3
} from 'lucide-react';

export default function LeaguesManagement() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [standings, setStandings] = useState({});
  const [toast, setToast] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Create form
  const [form, setForm] = useState({
    name: '', description: '', scoring_system: 'points',
    season_start: '', season_end: '', prize_pool: ''
  });

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
    if (staff) fetchLeagues();
  }, [staff]);

  const fetchLeagues = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch('/api/commander/leagues?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) setLeagues(json.data.leagues);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchStandings = async (leagueId) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/commander/leagues/${leagueId}/standings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setStandings(prev => ({ ...prev, [leagueId]: json.data.standings }));
      }
    } catch (err) { console.error(err); }
  };

  const handleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      if (!standings[id]) fetchStandings(id);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setToast({ type: 'error', msg: 'League name required' });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    setSubmitting(true);
    try {
      const token = getToken();
      const body = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        scoring_system: form.scoring_system,
        season_start: form.season_start || null,
        season_end: form.season_end || null,
        prize_pool: form.prize_pool ? parseFloat(form.prize_pool) : null,
        venues: [staff.venue_id],
        status: 'active'
      };

      // Use direct supabase insert via a dedicated API or POST to leagues
      const res = await fetch('/api/commander/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      if (json.success || json.data) {
        setToast({ type: 'success', msg: 'League created' });
        setShowCreate(false);
        setForm({ name: '', description: '', scoring_system: 'points', season_start: '', season_end: '', prize_pool: '' });
        fetchLeagues();
      } else {
        setToast({ type: 'error', msg: json.error?.message || 'Failed to create' });
      }
    } catch (err) {
      setToast({ type: 'error', msg: 'Network error' });
    }
    finally { setSubmitting(false); setTimeout(() => setToast(null), 3000); }
  };

  const statusColor = (s) => {
    if (s === 'active') return { bg: '#DEF7EC', text: '#03543F' };
    if (s === 'completed') return { bg: '#E5E7EB', text: '#4B5563' };
    if (s === 'upcoming') return { bg: '#EBF5FF', text: '#1877F2' };
    return { bg: '#F9FAFB', text: '#65676B' };
  };

  return (
    <>
      <Head><title>Leagues | Club Commander</title></Head>
      <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ background: '#1877F2', color: 'white', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/commander/dashboard')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
            <img src="/images/btn-back.png" alt="Back" style={{ height: 32, objectFit: 'contain' }} />
          </button>
          <Trophy size={22} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Leagues</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Manage inter-club seasons and standings</div>
          </div>
          <button onClick={() => setShowCreate(!showCreate)}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, padding: '6px 12px', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Plus size={14} /> New League
          </button>
        </div>

        {toast && (
          <div style={{ margin: 12, padding: '10px 14px', borderRadius: 8, background: toast.type === 'success' ? '#DEF7EC' : '#FEE2E2', color: toast.type === 'success' ? '#03543F' : '#991B1B', fontSize: 14, fontWeight: 600 }}>
            {toast.msg}
          </div>
        )}

        <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
          {/* Create Form */}
          {showCreate && (
            <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '2px solid #1877F2', marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2526', marginBottom: 12 }}>Create New League</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="League Name *"
                  style={{ padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 15 }} />

                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Description (optional)" rows={2}
                  style={{ padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }} />

                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={form.scoring_system} onChange={e => setForm({ ...form, scoring_system: e.target.value })}
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14 }}>
                    <option value="points">Points System</option>
                    <option value="bounty">Bounty System</option>
                    <option value="chips">Chip Count</option>
                    <option value="custom">Custom</option>
                  </select>
                  <input value={form.prize_pool} onChange={e => setForm({ ...form, prize_pool: e.target.value })}
                    placeholder="Prize Pool $" type="number"
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14 }} />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#65676B', fontWeight: 600 }}>Season Start</label>
                    <input type="date" value={form.season_start} onChange={e => setForm({ ...form, season_start: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, color: '#65676B', fontWeight: 600 }}>Season End</label>
                    <input type="date" value={form.season_end} onChange={e => setForm({ ...form, season_end: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button onClick={() => setShowCreate(false)}
                    style={{ flex: 1, padding: '10px 0', border: '1px solid #CED0D4', borderRadius: 8, background: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', color: '#65676B' }}>
                    Cancel
                  </button>
                  <button onClick={handleCreate} disabled={submitting}
                    style={{ flex: 2, padding: '10px 0', border: 'none', borderRadius: 8, background: '#1877F2', color: 'white', fontSize: 14, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {submitting ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} Create League
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Leagues List */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 size={28} color="#1877F2" className="spin" /></div>
          ) : leagues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#65676B', background: 'white', borderRadius: 12 }}>
              No leagues created yet. Tap "New League" to get started.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {leagues.map(league => {
                const isExpanded = expandedId === league.id;
                const sc = statusColor(league.status);
                const leagueStandings = standings[league.id] || [];
                return (
                  <div key={league.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #E4E6EB', overflow: 'hidden' }}>
                    <button onClick={() => handleExpand(league.id)}
                      style={{ width: '100%', padding: '14px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
                      <div style={{ width: 42, height: 42, borderRadius: 10, background: '#EBF5FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Trophy size={20} color="#1877F2" />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 15, color: '#1C2526' }}>{league.name}</div>
                        <div style={{ fontSize: 12, color: '#65676B', display: 'flex', gap: 10, marginTop: 2 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Users size={11} /> {league.player_count} players</span>
                          {league.prize_pool > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><DollarSign size={11} /> ${league.prize_pool}</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: sc.bg, color: sc.text, textTransform: 'uppercase' }}>
                        {league.status}
                      </span>
                      {isExpanded ? <ChevronUp size={16} color="#65676B" /> : <ChevronDown size={16} color="#65676B" />}
                    </button>

                    {isExpanded && (
                      <div style={{ padding: '0 14px 14px', borderTop: '1px solid #E4E6EB' }}>
                        {league.description && (
                          <div style={{ fontSize: 13, color: '#444', marginTop: 10, lineHeight: 1.5 }}>{league.description}</div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                          <div style={{ textAlign: 'center', padding: 8, background: '#F9FAFB', borderRadius: 8 }}>
                            <div style={{ fontSize: 10, color: '#65676B', fontWeight: 600 }}>SCORING</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C2526', textTransform: 'capitalize' }}>{league.scoring_system || 'Points'}</div>
                          </div>
                          <div style={{ textAlign: 'center', padding: 8, background: '#F9FAFB', borderRadius: 8 }}>
                            <div style={{ fontSize: 10, color: '#65676B', fontWeight: 600 }}>START</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C2526' }}>
                              {league.season_start ? new Date(league.season_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', padding: 8, background: '#F9FAFB', borderRadius: 8 }}>
                            <div style={{ fontSize: 10, color: '#65676B', fontWeight: 600 }}>END</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#1C2526' }}>
                              {league.season_end ? new Date(league.season_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                            </div>
                          </div>
                        </div>

                        {/* Standings */}
                        {leagueStandings.length > 0 ? (
                          <div style={{ marginTop: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#65676B', marginBottom: 6 }}>STANDINGS</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {leagueStandings.slice(0, 10).map((s, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: i < 3 ? '#FFFBEB' : '#F9FAFB', borderRadius: 8, fontSize: 13 }}>
                                  <span style={{ fontWeight: 800, fontSize: 16, color: i === 0 ? '#F59E0B' : i === 1 ? '#94A3B8' : i === 2 ? '#CD7F32' : '#65676B', minWidth: 24 }}>
                                    {i + 1}
                                  </span>
                                  <span style={{ flex: 1, fontWeight: 600, color: '#1C2526' }}>{s.player_name || s.display_name || 'Player'}</span>
                                  <span style={{ fontWeight: 800, color: '#1877F2' }}>{s.points || s.total_points || 0} pts</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div style={{ marginTop: 12, padding: 16, textAlign: 'center', color: '#65676B', fontSize: 13, background: '#F9FAFB', borderRadius: 8 }}>
                            No standings yet — players join via the app
                          </div>
                        )}
                      </div>
                    )}
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
