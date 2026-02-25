/**
 * Leagues Management
 * /commander/leagues
 * Staff page for managing inter-club leagues, seasons, and standings
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  Trophy, Plus, Users, Calendar, DollarSign,
  Loader2, ChevronDown, ChevronUp, Star, BarChart3
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const STATUS_COLORS = {
  active: { bg: 'bg-[#31A24C]/10', text: 'text-[#31A24C]' },
  completed: { bg: 'bg-[#64748B]/10', text: 'text-[#64748B]' },
  upcoming: { bg: 'bg-[#1877F2]/10', text: 'text-[#1877F2]' },
};

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

  const [form, setForm] = useState({
    name: '', description: '', scoring_system: 'points',
    season_start: '', season_end: '', prize_pool: ''
  });

  const getStaffSession = () => typeof window !== 'undefined'
    ? localStorage.getItem('commander_staff') || '' : '';

  useEffect(() => {
    const stored = localStorage.getItem('commander_staff');
    if (!stored) { router.push('/commander/login').catch(() => { }); return; }
    try {
      const s = JSON.parse(stored);
      if (!s.venue_id) { router.push('/commander/login').catch(() => { }); return; }
      setStaff(s);
    } catch { router.push('/commander/login').catch(() => { }); }
  }, []);

  useEffect(() => {
    if (staff) fetchLeagues();
  }, [staff]);

  const fetchLeagues = async () => {
    setLoading(true);
    try {
      const staffSession = getStaffSession();
      const res = await fetch('/api/commander/leagues?limit=50', {
        headers: { 'x-staff-session': staffSession }
      });
      const json = await res.json();
      if (json.success) setLeagues(json.data?.leagues || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const fetchStandings = async (leagueId) => {
    try {
      const staffSession = getStaffSession();
      const res = await fetch(`/api/commander/leagues/${leagueId}/standings`, {
        headers: { 'x-staff-session': staffSession }
      });
      const json = await res.json();
      if (json.success) {
        setStandings(prev => ({ ...prev, [leagueId]: json.data?.standings || [] }));
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
      const staffSession = getStaffSession();
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

      const res = await fetch('/api/commander/leagues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': staffSession },
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

  if (!staff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <CommanderLayout title="Leagues | Commander" backHref="/commander/dashboard?card=tournaments">
      <SEOHead title="Commander — Leagues" description="Club Commander Poker Room Management Tool." noindex={true} />
      <div className="cmd-page">
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#1877F2]/10 rounded-lg flex items-center justify-center">
                <Trophy className="w-5 h-5 text-[#1877F2]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Leagues</h1>
                <p className="text-sm text-[#64748B]">Manage inter-club seasons and standings</p>
              </div>
            </div>
            <button onClick={() => setShowCreate(!showCreate)}
              className="flex items-center gap-2 px-4 py-2 cmd-btn cmd-btn-primary font-medium rounded-lg">
              <Plus className="w-4 h-4" /> New League
            </button>
          </div>

          {/* Toast */}
          {toast && (
            <div className={`p-3 rounded-lg text-sm font-medium ${toast.type === 'success'
              ? 'bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981]'
              : 'bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444]'
              }`}>
              {toast.msg}
            </div>
          )}

          {/* Create Form */}
          {showCreate && (
            <div className="cmd-panel p-4 border-[#1877F2]/30 space-y-3">
              <h2 className="font-semibold text-white">Create New League</h2>

              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="League Name *"
                className="w-full px-3 py-2.5 bg-[#0D192E] border border-[#1E3A5F] rounded-lg text-white placeholder-[#4A5E78] focus:border-[#1877F2] focus:outline-none" />

              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Description (optional)" rows={2}
                className="w-full px-3 py-2.5 bg-[#0D192E] border border-[#1E3A5F] rounded-lg text-white placeholder-[#4A5E78] focus:border-[#1877F2] focus:outline-none resize-vertical font-[inherit]" />

              <div className="grid grid-cols-2 gap-3">
                <select value={form.scoring_system} onChange={e => setForm({ ...form, scoring_system: e.target.value })}
                  className="px-3 py-2.5 bg-[#0D192E] border border-[#1E3A5F] rounded-lg text-white focus:border-[#1877F2] focus:outline-none">
                  <option value="points">Points System</option>
                  <option value="bounty">Bounty System</option>
                  <option value="chips">Chip Count</option>
                  <option value="custom">Custom</option>
                </select>
                <input value={form.prize_pool} onChange={e => setForm({ ...form, prize_pool: e.target.value })}
                  placeholder="Prize Pool $" type="number"
                  className="px-3 py-2.5 bg-[#0D192E] border border-[#1E3A5F] rounded-lg text-white placeholder-[#4A5E78] focus:border-[#1877F2] focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-[#64748B] font-semibold block mb-1">Season Start</label>
                  <input type="date" value={form.season_start} onChange={e => setForm({ ...form, season_start: e.target.value })}
                    className="w-full px-3 py-2.5 bg-[#0D192E] border border-[#1E3A5F] rounded-lg text-white focus:border-[#1877F2] focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-[#64748B] font-semibold block mb-1">Season End</label>
                  <input type="date" value={form.season_end} onChange={e => setForm({ ...form, season_end: e.target.value })}
                    className="w-full px-3 py-2.5 bg-[#0D192E] border border-[#1E3A5F] rounded-lg text-white focus:border-[#1877F2] focus:outline-none" />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-[#4A5E78] rounded-lg text-[#94A3B8] font-medium hover:bg-[#132240] transition-colors">
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={submitting}
                  className="flex-[2] py-2.5 cmd-btn cmd-btn-primary rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create League
                </button>
              </div>
            </div>
          )}

          {/* Leagues List */}
          {leagues.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <Trophy className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
              <p className="text-[#64748B] mb-4">No leagues created yet. Tap "New League" to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {leagues.map(league => {
                const isExpanded = expandedId === league.id;
                const sc = STATUS_COLORS[league.status] || STATUS_COLORS.upcoming;
                const leagueStandings = standings[league.id] || [];
                return (
                  <div key={league.id} className="cmd-panel overflow-hidden">
                    <button onClick={() => handleExpand(league.id)}
                      className="w-full p-4 flex items-center gap-3 text-left hover:bg-[#132240] transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-[#1877F2]/10 flex items-center justify-center flex-shrink-0">
                        <Trophy className="w-5 h-5 text-[#1877F2]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">{league.name}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-[#64748B]">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {league.player_count || 0} players</span>
                          {league.prize_pool > 0 && <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" /> ${league.prize_pool}</span>}
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium uppercase ${sc.bg} ${sc.text}`}>
                        {league.status}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[#64748B]" /> : <ChevronDown className="w-4 h-4 text-[#64748B]" />}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-[#1E3A5F]">
                        {league.description && (
                          <p className="text-sm text-[#94A3B8] mt-3 leading-relaxed">{league.description}</p>
                        )}

                        <div className="grid grid-cols-3 gap-2 mt-3">
                          <div className="bg-[#0D192E] rounded-lg p-3 text-center">
                            <p className="text-[10px] text-[#64748B] font-semibold uppercase">Scoring</p>
                            <p className="text-sm font-bold text-white capitalize">{league.scoring_system || 'Points'}</p>
                          </div>
                          <div className="bg-[#0D192E] rounded-lg p-3 text-center">
                            <p className="text-[10px] text-[#64748B] font-semibold uppercase">Start</p>
                            <p className="text-sm font-bold text-white">
                              {league.season_start ? new Date(league.season_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                            </p>
                          </div>
                          <div className="bg-[#0D192E] rounded-lg p-3 text-center">
                            <p className="text-[10px] text-[#64748B] font-semibold uppercase">End</p>
                            <p className="text-sm font-bold text-white">
                              {league.season_end ? new Date(league.season_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'TBD'}
                            </p>
                          </div>
                        </div>

                        {/* Standings */}
                        {leagueStandings.length > 0 ? (
                          <div className="mt-3">
                            <p className="text-xs text-[#64748B] font-semibold uppercase tracking-wider mb-2">Standings</p>
                            <div className="space-y-1">
                              {leagueStandings.slice(0, 10).map((s, i) => (
                                <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${i < 3 ? 'bg-[#F59E0B]/5 border border-[#F59E0B]/20' : 'bg-[#0D192E]'}`}>
                                  <span className={`font-bold text-base min-w-[24px] ${i === 0 ? 'text-[#F59E0B]' : i === 1 ? 'text-[#94A3B8]' : i === 2 ? 'text-[#CD7F32]' : 'text-[#64748B]'}`}>
                                    {i + 1}
                                  </span>
                                  <span className="flex-1 font-medium text-white">{s.player_name || s.display_name || 'Player'}</span>
                                  <span className="font-bold text-[#1877F2]">{s.points || s.total_points || 0} pts</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 p-4 text-center text-[#64748B] text-sm bg-[#0D192E] rounded-lg">
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
    </CommanderLayout>
  );
}
