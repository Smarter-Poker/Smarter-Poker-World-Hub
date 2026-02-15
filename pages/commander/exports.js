/**
 * Exports Hub
 * /commander/exports
 * Create CSV/JSON exports: players, sessions, tournaments, analytics, comps, audit logs
 * Hendon Mob tournament export
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, Download, FileText, Loader2, RefreshCw, CheckCircle2,
  AlertTriangle, Clock, Users, Trophy, BarChart3, Gift, Shield, X
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const EXPORT_TYPES = [
  { value: 'players', label: 'Player Data', icon: Users, desc: 'Member profiles, stats, visit history', color: '#1877F2' },
  { value: 'sessions', label: 'Player Sessions', icon: Clock, desc: 'Check-ins, time played, table assignments', color: '#31A24C' },
  { value: 'tournaments', label: 'Tournaments', icon: Trophy, desc: 'Tournament results, entries, payouts', color: '#F59E0B' },
  { value: 'analytics', label: 'Daily Analytics', icon: BarChart3, desc: 'Daily metrics, revenue, player counts', color: '#A855F7' },
  { value: 'comps', label: 'Comp Transactions', icon: Gift, desc: 'Comp earn/redeem history', color: '#EF4444' },
  { value: 'audit_logs', label: 'Audit Logs', icon: Shield, desc: 'Staff actions, security events', color: '#6B7280' },
];

const STATUS_STYLES = {
  pending: { bg: 'bg-[#F59E0B]/15', text: 'text-[#F59E0B]', label: 'Pending' },
  processing: { bg: 'bg-[#1877F2]/15', text: 'text-[#1877F2]', label: 'Processing' },
  completed: { bg: 'bg-[#31A24C]/15', text: 'text-[#31A24C]', label: 'Ready' },
  failed: { bg: 'bg-[#EF4444]/15', text: 'text-[#EF4444]', label: 'Failed' },
};

export default function ExportsHub() {
  const router = useRouter();
  const [exports, setExports] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [message, setMessage] = useState(null);
  const [showOptions, setShowOptions] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [format, setFormat] = useState('csv');

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem('commander_staff') || '{}'); if (s.venue_id) setVenueId(s.venue_id); } catch {}
  }, []);

  const getToken = () => localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');

  const fetchData = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [expRes, tRes] = await Promise.all([
        fetch(`/api/commander/exports?venue_id=${venueId}`, { headers }),
        fetch(`/api/commander/tournaments?venue_id=${venueId}&status=completed&limit=20`, { headers }),
      ]);
      const expJson = await expRes.json();
      const tJson = await tRes.json();
      setExports(expJson.exports || []);
      setTournaments(tJson.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [venueId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const createExport = async (exportType) => {
    setCreating(exportType);
    try {
      const res = await fetch('/api/commander/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          venue_id: venueId,
          export_type: exportType,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          format,
        })
      });
      const json = await res.json();
      if (json.export) {
        setMessage({ type: 'success', text: 'Export created!' });
        setShowOptions(null);
        fetchData();
      } else {
        setMessage({ type: 'error', text: json.error || 'Export failed' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network error' }); }
    finally { setCreating(null); }
  };

  const downloadExport = (exp) => {
    if (!exp.file_url) return;
    const a = document.createElement('a');
    a.href = exp.file_url;
    a.download = `${exp.export_type}_${exp.created_at?.split('T')[0] || 'export'}.${exp.format || 'csv'}`;
    a.click();
  };

  const exportHendonMob = async (tournamentId) => {
    setCreating('hendon');
    try {
      const res = await fetch(`/api/commander/exports/hendon-mob?tournament_id=${tournamentId}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `hendon_mob_${tournamentId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage({ type: 'success', text: 'Hendon Mob export downloaded!' });
      } else {
        const json = await res.json();
        setMessage({ type: 'error', text: json.error || 'Hendon Mob export failed' });
      }
    } catch (err) { setMessage({ type: 'error', text: 'Network error' }); }
    finally { setCreating(null); }
  };

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 3000); return () => clearTimeout(t); }
  }, [message]);

  return (
    <>
      <Head><title>Data Exports | Club Commander</title></Head>
      <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
        <div className="bg-[#242526] border-b border-[#3A3B3C] px-4 py-3 flex items-center gap-3">
          <button className="cmd-back-btn" onClick={() => router.push('/commander/dashboard')}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">Data Exports</h1>
            <p className="text-xs text-[#B0B3B8]">Download venue data as CSV or JSON</p>
          </div>
          <button onClick={fetchData} className="p-2 rounded-lg active:bg-[#3A3B3C]"><RefreshCw className="w-5 h-5 text-[#B0B3B8]" /></button>
        </div>

        {message && (
          <div className={`mx-4 mt-3 px-4 py-2.5 rounded-xl text-sm font-medium ${
            message.type === 'success' ? 'bg-[#31A24C]/15 text-[#31A24C]' : 'bg-[#EF4444]/15 text-[#EF4444]'
          }`}>{message.text}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-[#1877F2] animate-spin" /></div>
        ) : (
          <div className="px-4 py-4 space-y-4">
            {/* Export Types */}
            <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
              <h3 className="text-sm font-bold text-white mb-3">Create Export</h3>
              <div className="grid grid-cols-2 gap-2">
                {EXPORT_TYPES.map(et => (
                  <button key={et.value} onClick={() => setShowOptions(et.value)}
                    className="bg-[#3A3B3C]/30 rounded-xl p-3 text-left active:bg-[#3A3B3C]/60 border border-transparent hover:border-[#4E4F50]">
                    <div className="flex items-center gap-2 mb-1">
                      <et.icon className="w-4 h-4" style={{ color: et.color }} />
                      <span className="text-sm font-medium text-white">{et.label}</span>
                    </div>
                    <p className="text-[10px] text-[#6A6B6D]">{et.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Hendon Mob */}
            {tournaments.length > 0 && (
              <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl p-4">
                <h3 className="text-sm font-bold text-white mb-2">Hendon Mob Export</h3>
                <p className="text-xs text-[#B0B3B8] mb-3">Export completed tournament results in Hendon Mob format</p>
                <div className="space-y-2">
                  {tournaments.slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center justify-between px-3 py-2 bg-[#3A3B3C]/30 rounded-lg">
                      <div>
                        <p className="text-sm text-white">{t.name}</p>
                        <p className="text-xs text-[#6A6B6D]">
                          {t.created_at ? new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                        </p>
                      </div>
                      <button onClick={() => exportHendonMob(t.id)} disabled={creating === 'hendon'}
                        className="px-3 py-1.5 rounded-lg bg-[#1877F2] text-white text-xs font-medium active:bg-[#1565D8] disabled:opacity-50 flex items-center gap-1">
                        {creating === 'hendon' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        Export
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Exports */}
            <div className="bg-[#242526] border border-[#3A3B3C] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-[#3A3B3C]">
                <h3 className="text-sm font-bold text-white">Recent Exports</h3>
              </div>
              {exports.length > 0 ? (
                <div className="divide-y divide-[#3A3B3C]">
                  {exports.map(exp => {
                    const st = STATUS_STYLES[exp.status] || STATUS_STYLES.pending;
                    return (
                      <CommanderLayout title="Data Exports" backHref="/commander/reports">
                      <div key={exp.id} className="px-4 py-3 flex items-center gap-3">
                        <FileText className="w-5 h-5 text-[#B0B3B8] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white capitalize">{exp.export_type?.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-[#6A6B6D]">
                            {exp.format?.toUpperCase()} • {exp.row_count != null ? `${exp.row_count} rows` : ''}
                            {exp.created_at && ` • ${new Date(exp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                          </p>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${st.bg} ${st.text}`}>{st.label}</span>
                        {exp.status === 'completed' && exp.file_url && (
                          <button onClick={() => downloadExport(exp)}
                            className="w-8 h-8 rounded-lg bg-[#31A24C]/10 flex items-center justify-center active:bg-[#31A24C]/20">
                            <Download className="w-4 h-4 text-[#31A24C]" />
                          </button>
                        )}
                      </div>
                      </CommanderLayout>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center text-[#6A6B6D] text-sm">No exports yet</div>
              )}
            </div>
          </div>
        )}

        {/* Export Options Modal */}
        {showOptions && (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
            <div className="bg-[#242526] w-full rounded-t-3xl">
              <div className="px-4 py-4 border-b border-[#3A3B3C] flex items-center justify-between">
                <h2 className="text-lg font-bold text-white capitalize">Export {showOptions.replace(/_/g, ' ')}</h2>
                <button onClick={() => setShowOptions(null)} className="p-2 rounded-lg active:bg-[#3A3B3C]"><X className="w-5 h-5 text-[#B0B3B8]" /></button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-[#B0B3B8] mb-1.5 block">From Date</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#3A3B3C] border border-[#4E4F50] rounded-xl text-white text-sm focus:border-[#1877F2] focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-[#B0B3B8] mb-1.5 block">To Date</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="w-full px-3 py-2.5 bg-[#3A3B3C] border border-[#4E4F50] rounded-xl text-white text-sm focus:border-[#1877F2] focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-[#B0B3B8] mb-1.5 block">Format</label>
                  <div className="flex gap-2">
                    {['csv', 'json'].map(f => (
                      <button key={f} onClick={() => setFormat(f)}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold uppercase ${
                          format === f ? 'bg-[#1877F2] text-white' : 'bg-[#3A3B3C] text-[#B0B3B8]'
                        }`}>{f}</button>
                    ))}
                  </div>
                </div>
                <button onClick={() => createExport(showOptions)} disabled={creating}
                  className="w-full py-4 rounded-xl bg-[#1877F2] text-white font-bold text-base flex items-center justify-center gap-2 active:bg-[#1565D8] disabled:opacity-50">
                  {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  Create Export
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    <style jsx>{`
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
        }
      `}</style>
    </>
  );
}
