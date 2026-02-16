/**
 * Room Presets Page
 * /commander/room-presets
 * TC equivalent: "Setups" tile — saved room configurations applied with one click
 * Also includes Hard Stop controls (auto-close at set time)
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Plus, Play, Edit2, Trash2, X, Loader2, Save,
  Zap, Copy, Calendar, CheckCircle, AlertCircle, Layout,
  StopCircle, AlertTriangle, DollarSign
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';
import { hasFeature } from '../../src/lib/commander/tierConfig';

export default function RoomPresetsPage() {
  const router = useRouter();
  const [presets, setPresets] = useState([]);
  const [gameTypes, setGameTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [staff, setStaff] = useState(null);
  const [venueName, setVenueName] = useState('');
  const [currentTier, setCurrentTier] = useState('home_game');

  // Hard Stop state
  const [hardStopEnabled, setHardStopEnabled] = useState(false);
  const [hardStopTime, setHardStopTime] = useState('23:00');
  const [hardStopSaving, setHardStopSaving] = useState(false);
  const [hardStopSuccess, setHardStopSuccess] = useState(null);

  // Auto Comp state
  const [autoCompRate, setAutoCompRate] = useState(0);
  const [autoCompSaving, setAutoCompSaving] = useState(false);
  const [autoCompSuccess, setAutoCompSuccess] = useState(null);

  const [form, setForm] = useState({ name: '', description: '', tables: [] });

  useEffect(() => {
    const stored = localStorage.getItem('commander_staff');
    if (!stored) { router.push('/commander/login'); return; }
    try {
      const s = JSON.parse(stored);
      if (!s.venue_id) { router.push('/commander/login'); return; }
      setStaff(s);
      setVenueName(s.venue_name || '');
    } catch { router.push('/commander/login'); }
    // Read tier from commander_subscription (same pattern as dashboard)
    try {
      const sub = JSON.parse(localStorage.getItem('commander_subscription') || '{}');
      if (sub.tier) setCurrentTier(sub.tier);
    } catch { }
  }, [router]);

  // Fetch hard stop settings
  useEffect(() => {
    if (!staff) return;
    try {
      const stored = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const token = stored.token || stored.access_token;
      if (!token) return;
      fetch('/api/commander/settings', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          if (data?.data) {
            setHardStopEnabled(data.data.hard_stop_enabled || false);
            setHardStopTime(data.data.hard_stop_time || '23:00');
            setAutoCompRate(parseFloat(data.data.auto_comp_rate) || 0);
          }
        })
        .catch(() => { });
    } catch { }
  }, [staff]);

  async function handleHardStopSave() {
    setHardStopSaving(true);
    try {
      const stored = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const token = stored.token || stored.access_token;
      if (!token) return;
      const res = await fetch('/api/commander/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ hard_stop_enabled: hardStopEnabled, hard_stop_time: hardStopTime })
      });
      const data = await res.json();
      if (data.success) {
        setHardStopSuccess('Hard Stop settings saved');
        setTimeout(() => setHardStopSuccess(null), 3000);
      }
    } catch { }
    finally { setHardStopSaving(false); }
  }

  async function handleAutoCompSave() {
    setAutoCompSaving(true);
    try {
      const stored = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      const token = stored.token || stored.access_token;
      if (!token) return;
      const res = await fetch('/api/commander/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ auto_comp_rate: autoCompRate })
      });
      const data = await res.json();
      if (data.success) {
        setAutoCompSuccess('Hourly comp rate saved');
        setTimeout(() => setAutoCompSuccess(null), 3000);
      }
    } catch { }
    finally { setAutoCompSaving(false); }
  }

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
      const headers = { Authorization: `Bearer ${token}` };
      const [presetsRes, typesRes] = await Promise.all([
        fetch('/api/commander/room-presets', { headers }),
        fetch('/api/commander/game-types', { headers })
      ]);
      const [presetsJson, typesJson] = await Promise.all([presetsRes.json(), typesRes.json()]);
      if (presetsJson.success) setPresets(presetsJson.data || []);
      if (typesJson.success) setGameTypes(typesJson.data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (staff) fetchData(); }, [staff, fetchData]);

  async function handleApply(preset) {
    if (!confirm(`Apply "${preset.name}"? This will open tables based on the preset configuration.`)) return;
    setApplying(preset.id);
    setError(null);
    try {
      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
      const res = await fetch(`/api/commander/room-presets?id=${preset.id}&action=apply`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(`"${preset.name}" applied — ${json.data.games_opened} games opened`);
        setTimeout(() => setSuccess(null), 5000);
        fetchData();
      } else {
        setError(json.error || 'Failed to apply preset');
      }
    } catch { setError('Failed to apply preset'); }
    finally { setApplying(null); }
  }

  function addTableRow() {
    setForm(prev => ({
      ...prev,
      tables: [...prev.tables, { game_type_id: '', game_type_name: '', short_code: '', stakes: '', count: 1, min_buyin: 100, max_buyin: 0, max_players: 9 }]
    }));
  }

  function updateTableRow(idx, field, value) {
    setForm(prev => {
      const tables = [...prev.tables];
      tables[idx] = { ...tables[idx], [field]: value };
      // If game type selected, auto-fill from game types
      if (field === 'game_type_id' && value) {
        const gt = gameTypes.find(g => g.id === value);
        if (gt) {
          tables[idx] = {
            ...tables[idx],
            game_type_id: gt.id,
            game_type_name: gt.name,
            short_code: gt.short_code,
            stakes: gt.stakes,
            min_buyin: gt.min_buyin,
            max_buyin: gt.max_buyin,
            max_players: gt.max_players
          };
        }
      }
      return { ...prev, tables };
    });
  }

  function removeTableRow(idx) {
    setForm(prev => ({ ...prev, tables: prev.tables.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!form.name) { setError('Preset name required'); return; }
    if (form.tables.length === 0) { setError('Add at least one table configuration'); return; }
    setError(null);
    try {
      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
      const url = editingId ? `/api/commander/room-presets?id=${editingId}` : '/api/commander/room-presets';
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form)
      });
      const json = await res.json();
      if (json.success) {
        setSuccess(editingId ? 'Preset updated' : 'Preset created');
        setTimeout(() => setSuccess(null), 3000);
        setShowForm(false);
        setEditingId(null);
        setForm({ name: '', description: '', tables: [] });
        fetchData();
      } else {
        setError(json.error || 'Failed to save');
      }
    } catch { setError('Failed to save preset'); }
  }

  async function handleDelete(preset) {
    if (!confirm(`Delete "${preset.name}"? This cannot be undone.`)) return;
    try {
      const token = localStorage.getItem('commander_token') || localStorage.getItem('sb-access-token');
      await fetch(`/api/commander/room-presets?id=${preset.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) { console.error(err); }
  }

  function startEdit(preset) {
    setForm({ name: preset.name, description: preset.description || '', tables: preset.tables || [] });
    setEditingId(preset.id);
    setShowForm(true);
  }

  function getTotalTables(tables) {
    return (tables || []).reduce((sum, t) => sum + (t.count || 1), 0);
  }

  const canManage = staff?.role === 'owner' || staff?.role === 'manager';
  const canHardStop = hasFeature(currentTier, 'close_day');

  return (
    <CommanderLayout title="Room Presets | {venueName || 'Commander'}" backHref="/commander/dashboard">
      <>
        <Head><title>Room Presets | {venueName || 'Commander'}</title></Head>
        <div className="min-h-screen bg-[#18191A] text-[#E4E6EB] font-['Inter']">
          <header className="bg-[#242526] border-b border-[#3A3B3C] sticky top-0 z-50">
            <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="font-bold text-white text-lg">Room Presets</h1>
                  <p className="text-sm text-[#B0B3B8]">One-Click Room Configurations</p>
                </div>
              </div>
              {canManage && !showForm && (
                <button onClick={() => { setForm({ name: '', description: '', tables: [] }); setEditingId(null); setShowForm(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white rounded-xl text-sm font-medium">
                  <Plus className="w-4 h-4" /> New Preset
                </button>
              )}
            </div>
          </header>

          <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {success && <div className="p-3 bg-[#31A24C]/10 rounded-xl text-sm text-[#31A24C] font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4" />{success}</div>}
            {hardStopSuccess && <div className="p-3 bg-[#31A24C]/10 rounded-xl text-sm text-[#31A24C] font-medium flex items-center gap-2"><CheckCircle className="w-4 h-4" />{hardStopSuccess}</div>}
            {error && <div className="p-3 bg-[#EF4444]/10 rounded-xl text-sm text-[#EF4444] flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

            {/* Hard Stop — Charity + Club only */}
            {canHardStop && (
              <div className="bg-[#242526] rounded-2xl border border-[#3A3B3C] overflow-hidden">
                <div className="p-4 border-b border-[#3A3B3C] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#EF4444]/10 rounded-lg flex items-center justify-center">
                      <StopCircle className="w-5 h-5 text-[#EF4444]" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-white">Hard Stop</h2>
                      <p className="text-xs text-[#B0B3B8]">Auto-Close All Cash Games At A Set Time</p>
                    </div>
                  </div>
                  <button
                    onClick={handleHardStopSave}
                    disabled={hardStopSaving}
                    className="px-4 py-2 bg-[#1877F2] text-white rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {hardStopSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  {/* Enable toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-white">Enable Hard Stop</p>
                      <p className="text-sm text-[#B0B3B8]">Automatically Close All Games And Log Out Players At The Scheduled Time</p>
                    </div>
                    <button
                      onClick={() => setHardStopEnabled(!hardStopEnabled)}
                      className={`w-12 h-7 rounded-full transition-colors relative ${hardStopEnabled ? 'bg-[#1877F2]' : 'bg-[#3A3B3C]'}`}
                    >
                      <span className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${hardStopEnabled ? 'right-1' : 'left-1'}`} />
                    </button>
                  </div>
                  {/* Time picker — shown when enabled */}
                  {hardStopEnabled && (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white">Stop Time</p>
                          <p className="text-sm text-[#B0B3B8]">All Cash Games End At This Time</p>
                        </div>
                        <input
                          type="time"
                          value={hardStopTime}
                          onChange={(e) => setHardStopTime(e.target.value)}
                          className="h-10 px-3 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-sm text-white text-center focus:outline-none focus:border-[#1877F2]"
                          style={{ colorScheme: 'dark' }}
                        />
                      </div>
                      <div className="p-3 bg-[#F59E0B]/10 rounded-lg flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-[#F59E0B] mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-[#F59E0B]">
                          At {hardStopTime ? new Date(`2000-01-01T${hardStopTime}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'the set time'}, all open tables will be closed, all active sessions ended, and the room set to closed.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Hourly Comp Rate */}
            {hasFeature(currentTier, 'comps') && (
              <div className="bg-[#242526] rounded-2xl border border-[#3A3B3C] overflow-hidden">
                <div className="p-4 border-b border-[#3A3B3C] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#31A24C]/15 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-[#31A24C]" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-white">Hourly Comp Rate</h2>
                      <p className="text-xs text-[#B0B3B8]">Auto-Award Comps To All Seated Players Per Hour</p>
                    </div>
                  </div>
                  <button
                    onClick={handleAutoCompSave}
                    disabled={autoCompSaving}
                    className="px-4 py-2 bg-[#31A24C] text-white rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                  >
                    {autoCompSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  {/* Quick-select buttons */}
                  <div>
                    <p className="text-sm text-[#B0B3B8] mb-2">Select Rate Per Hour Of Play</p>
                    <div className="flex flex-wrap gap-2">
                      {[0, 0.5, 1, 1.5, 2].map(rate => (
                        <button
                          key={rate}
                          onClick={() => setAutoCompRate(rate)}
                          className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${autoCompRate === rate
                            ? 'bg-[#31A24C]/20 border-[#31A24C] text-[#31A24C]'
                            : 'bg-[#3A3B3C] border-[#4A4B4C] text-[#B0B3B8] hover:border-[#31A24C]/50'
                            }`}
                        >
                          {rate === 0 ? 'Off' : `$${rate.toFixed(2)}/hr`}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Custom input */}
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-[#B0B3B8]">Custom:</p>
                    <div className="flex items-center bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl overflow-hidden">
                      <span className="pl-3 text-sm text-[#B0B3B8]">$</span>
                      <input
                        type="number"
                        value={autoCompRate || ''}
                        onChange={(e) => setAutoCompRate(parseFloat(e.target.value) || 0)}
                        step="0.25"
                        min="0"
                        max="50"
                        placeholder="0.00"
                        className="w-20 px-2 py-2 bg-transparent text-sm text-white focus:outline-none"
                      />
                      <span className="pr-3 text-sm text-[#B0B3B8]">/hr</span>
                    </div>
                  </div>
                  {autoCompRate > 0 && (
                    <div className="p-3 bg-[#31A24C]/10 rounded-lg flex items-start gap-2">
                      <DollarSign className="w-4 h-4 text-[#31A24C] mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-[#31A24C]">
                        Players Will Automatically Earn <strong>${autoCompRate.toFixed(2)}</strong> In Comps For Every Hour They Are Seated At A Cash Game Table.
                      </p>
                    </div>
                  )}
                  {autoCompSuccess && (
                    <div className="p-3 bg-[#31A24C]/10 rounded-lg flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-[#31A24C]" />
                      <p className="text-xs text-[#31A24C]">{autoCompSuccess}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Create/Edit Form */}
            {showForm && (
              <div className="bg-[#242526] rounded-2xl border border-[#3A3B3C] overflow-hidden">
                <div className="p-4 border-b border-[#3A3B3C] flex items-center justify-between">
                  <h2 className="font-semibold text-white">{editingId ? 'Edit Preset' : 'Create Preset'}</h2>
                  <button onClick={() => { setShowForm(false); setEditingId(null); }} className="p-1 hover:bg-[#3A3B3C] rounded"><X className="w-5 h-5 text-[#B0B3B8]" /></button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-[#B0B3B8] uppercase">Preset Name *</label>
                      <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Friday Night" className="w-full mt-1 px-3 py-2.5 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-sm text-white placeholder-[#6A6B6D] focus:outline-none focus:border-[#1877F2]" />
                    </div>
                    <div>
                      <label className="text-xs text-[#B0B3B8] uppercase">Description</label>
                      <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Peak Hours Config" className="w-full mt-1 px-3 py-2.5 bg-[#3A3B3C] border border-[#4A4B4C] rounded-xl text-sm text-white placeholder-[#6A6B6D] focus:outline-none focus:border-[#1877F2]" />
                    </div>
                  </div>

                  {/* Table configurations */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs text-[#B0B3B8] uppercase">Table Configuration</label>
                      <button onClick={addTableRow} className="text-xs text-[#1877F2] hover:text-[#1877F2]/80 flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add Row
                      </button>
                    </div>

                    {form.tables.length === 0 ? (
                      <div className="py-6 text-center border border-dashed border-[#3A3B3C] rounded-xl">
                        <p className="text-sm text-[#B0B3B8]">No tables configured. Click "Add Row" to start.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {form.tables.map((row, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-[#3A3B3C]/30 rounded-xl p-3">
                            <select value={row.game_type_id || ''} onChange={e => updateTableRow(idx, 'game_type_id', e.target.value)}
                              className="flex-1 px-2 py-2 bg-[#3A3B3C] border border-[#4A4B4C] rounded-lg text-sm text-white">
                              <option value="">Select Game Type...</option>
                              {gameTypes.map(gt => (
                                <option key={gt.id} value={gt.id}>{gt.short_code} — {gt.name} {gt.stakes}</option>
                              ))}
                            </select>
                            <div className="w-20">
                              <input type="number" value={row.count || 1} min={1} max={20}
                                onChange={e => updateTableRow(idx, 'count', parseInt(e.target.value) || 1)}
                                className="w-full px-2 py-2 bg-[#3A3B3C] border border-[#4A4B4C] rounded-lg text-sm text-white text-center" />
                              <p className="text-[10px] text-[#B0B3B8] text-center mt-0.5">Tables</p>
                            </div>
                            <button onClick={() => removeTableRow(idx)} className="p-1.5 hover:bg-[#EF4444]/10 rounded-lg">
                              <X className="w-4 h-4 text-[#EF4444]" />
                            </button>
                          </div>
                        ))}
                        <p className="text-xs text-[#B0B3B8] text-right">Total: {getTotalTables(form.tables)} tables</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={handleSave} className="flex-1 py-3 bg-[#1877F2] text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2">
                      <Save className="w-4 h-4" /> {editingId ? 'Update Preset' : 'Save Preset'}
                    </button>
                    <button onClick={() => { setShowForm(false); setEditingId(null); }} className="px-6 py-3 bg-[#3A3B3C] text-[#B0B3B8] rounded-xl text-sm">Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Presets List */}
            {loading ? (
              <div className="py-16 text-center"><Loader2 className="w-8 h-8 animate-spin text-[#1877F2] mx-auto" /></div>
            ) : presets.length === 0 && !showForm ? (
              <div className="bg-[#242526] rounded-2xl border border-[#3A3B3C] p-12 text-center">
                <Layout className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
                <h3 className="text-lg font-medium text-white mb-1">No Room Presets Yet</h3>
                <p className="text-sm text-[#B0B3B8] mb-4">Create Presets To Quickly Configure Your Room With One Click</p>
                {canManage && (
                  <button onClick={() => { setForm({ name: '', description: '', tables: [] }); setShowForm(true); }}
                    className="px-6 py-2.5 bg-[#1877F2] text-white rounded-xl text-sm font-medium">
                    <Plus className="w-4 h-4 inline mr-2" /> Create First Preset
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {presets.map(preset => (
                  <div key={preset.id} className="bg-[#242526] rounded-2xl border border-[#3A3B3C] overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-white text-lg">{preset.name}</h3>
                          {preset.description && <p className="text-xs text-[#B0B3B8] mt-0.5">{preset.description}</p>}
                        </div>
                        <span className="px-2 py-1 rounded-lg bg-[#1877F2]/10 text-[#1877F2] text-xs font-medium">
                          {getTotalTables(preset.tables)} tables
                        </span>
                      </div>

                      {/* Table breakdown */}
                      <div className="space-y-1.5 mb-4">
                        {(preset.tables || []).map((t, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-[#E4E6EB]">{t.short_code || t.game_type_name} {t.stakes}</span>
                            <span className="text-[#B0B3B8]">×{t.count || 1}</span>
                          </div>
                        ))}
                      </div>

                      {preset.last_applied_at && (
                        <p className="text-[10px] text-[#B0B3B8] mb-3">
                          Last applied: {new Date(preset.last_applied_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </p>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button onClick={() => handleApply(preset)} disabled={applying === preset.id}
                          className="flex-1 py-2.5 bg-[#31A24C] text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#31A24C]/80 disabled:opacity-50">
                          {applying === preset.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          Apply Now
                        </button>
                        {canManage && (
                          <>
                            <button onClick={() => startEdit(preset)} className="p-2.5 bg-[#3A3B3C] rounded-xl hover:bg-[#4A4B4C]">
                              <Edit2 className="w-4 h-4 text-[#B0B3B8]" />
                            </button>
                            <button onClick={() => handleDelete(preset)} className="p-2.5 bg-[#3A3B3C] rounded-xl hover:bg-[#EF4444]/10">
                              <Trash2 className="w-4 h-4 text-[#EF4444]" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
        <style jsx>{`
`}</style>
      </>
    </CommanderLayout>
  );
}
