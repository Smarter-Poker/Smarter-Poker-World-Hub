import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PokerBrainLaunchButton from '../poker-brain/LaunchButton';
import { eventBus, EventType } from '../../engine/EventBus';
import { broadcastSync, listenBroadcast } from '../../lib/broadcastSync';
import { downloadCsv, num, stampedName, toCsv } from '../../lib/horsesAdminTokens';
import { hasPermission } from './operatorPermissions';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import VirtualDataTable from './VirtualDataTable';
import styles from '../../../pages/horses/horses.module.css';

const SYNC_CHANNEL = 'horses-admin-sync';
const ROSTER_PAGE_SIZE = 1000;
const BULK_CHUNK = 500;
const AVATAR_BATCH = 5;
const EMPTY_PERSONA = {
  name: '', gender: 'male', location: '', specialty: 'cash_games',
  stakes: '', bio: '', voice: 'casual',
};
const SPECIALTIES = [
  ['cash_games', 'Cash Games'], ['tournaments', 'Tournaments'],
  ['high_stakes', 'High Stakes'], ['plo', 'PLO'], ['online', 'Online'],
  ['gto', 'GTO'], ['live_reads', 'Live Reads'],
];
const VOICES = [
  'casual', 'analytical', 'enthusiastic', 'experienced',
  'technical', 'street_smart', 'passionate', 'academic',
];

function errorMessage(cause, fallback) {
  return cause?.message || fallback;
}

export default function StablePanel({ authFetch, showNotification, permissions }) {
  const [personas, setPersonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarResult, setAvatarResult] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PERSONA);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const canWrite = hasPermission(permissions, 'content.write');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const rows = [];
    try {
      for (let offset = 0; offset <= 100000; offset += ROSTER_PAGE_SIZE) {
        const body = await authFetch(`/api/horses/roster?limit=${ROSTER_PAGE_SIZE}&offset=${offset}`);
        if (!Array.isArray(body?.rows)) throw new Error('Roster Response Was Malformed');
        rows.push(...body.rows);
        if (!body.hasMore || body.rows.length === 0) break;
      }
      setPersonas(rows);
      setSelectedIds((current) => {
        const present = new Set(rows.map((row) => row.id));
        return new Set([...current].filter((id) => present.has(id)));
      });
    } catch (cause) {
      setPersonas([]);
      setError(errorMessage(cause, 'The Stable Could Not Be Read'));
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let timer = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; load(); }, 2000);
    };
    const stopBroadcast = listenBroadcast(SYNC_CHANNEL, (message) => {
      if (message?.type === 'sync_update') refresh();
    });
    window.addEventListener('horses-updated', refresh);
    const stopMutation = eventBus.on(EventType.DATA_MUTATED, refresh);
    return () => {
      if (timer) clearTimeout(timer);
      stopBroadcast();
      stopMutation();
      window.removeEventListener('horses-updated', refresh);
    };
  }, [load]);

  const announceUpdate = useCallback(() => {
    window.dispatchEvent(new CustomEvent('horses-updated'));
    broadcastSync(SYNC_CHANNEL, { type: 'sync_update', timestamp: Date.now() });
  }, []);

  const horses = useMemo(() => personas.filter((row) => row.profile_id), [personas]);
  const activeCount = useMemo(() => horses.filter((row) => row.is_active).length, [horses]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return personas.filter((row) => {
      const matches = !query || [row.name, row.alias, row.location]
        .some((value) => String(value || '').toLowerCase().includes(query));
      if (!matches) return false;
      if (filter === 'active') return row.is_active === true;
      if (filter === 'inactive') return row.is_active !== true;
      return true;
    });
  }, [filter, personas, search]);
  const allFilteredSelected = filtered.length > 0 && filtered.every((row) => selectedIds.has(row.id));

  const toggleSelection = useCallback((id) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const toggleAllFiltered = useCallback(() => {
    setSelectedIds((current) => {
      const next = new Set(current);
      const remove = filtered.length > 0 && filtered.every((row) => next.has(row.id));
      filtered.forEach((row) => { if (remove) next.delete(row.id); else next.add(row.id); });
      return next;
    });
  }, [filtered]);

  const runBulk = useCallback(async (ids, buildBody) => {
    let affected = 0;
    let requested = 0;
    let failed = 0;
    let firstError = '';
    for (let index = 0; index < ids.length; index += BULK_CHUNK) {
      const chunk = ids.slice(index, index + BULK_CHUNK);
      try {
        const body = await authFetch('/api/horses/stable-admin', {
          method: 'POST', body: JSON.stringify(buildBody(chunk)),
        });
        affected += Number(body.affected) || 0;
        requested += Number(body.requested) || chunk.length;
      } catch (cause) {
        requested += chunk.length;
        failed += chunk.length;
        if (!firstError) firstError = errorMessage(cause, 'The Bulk Action Failed');
      }
    }
    return { affected, requested, failed, firstError };
  }, [authFetch]);

  const setActive = useCallback(async (ids, nextActive, label) => {
    if (!canWrite || !ids.length) return;
    const idSet = new Set(ids);
    const prior = new Map(personas.filter((row) => idSet.has(row.id)).map((row) => [row.id, row.is_active]));
    setPersonas((rows) => rows.map((row) => idSet.has(row.id) ? { ...row, is_active: nextActive } : row));
    setBulkBusy(true);
    try {
      const result = ids.length === 1
        ? await authFetch('/api/horses/stable-admin', {
          method: 'POST', body: JSON.stringify({ action: 'set_active', id: ids[0], is_active: nextActive }),
        }).then(() => ({ affected: 1, requested: 1, failed: 0, firstError: '' }))
        : await runBulk(ids, (chunk) => ({ action: 'bulk_active', ids: chunk, is_active: nextActive }));
      if (result.affected === 0 && result.firstError) throw new Error(result.firstError);
      const missed = result.requested - result.affected;
      showNotification?.(result.failed
        ? `${label}: ${num(result.affected)} Of ${num(result.requested)} Updated. ${num(result.failed)} Failed: ${result.firstError}`
        : missed > 0 ? `${label}: ${num(result.affected)} Updated, ${num(missed)} No Longer Exist` : label,
      result.failed ? 'error' : missed > 0 ? 'info' : 'success');
      announceUpdate();
      if (ids.length > 1) load();
    } catch (cause) {
      setPersonas((rows) => rows.map((row) => prior.has(row.id) ? { ...row, is_active: prior.get(row.id) } : row));
      showNotification?.(errorMessage(cause, 'Horse Status Could Not Be Changed'), 'error');
    } finally {
      setBulkBusy(false);
    }
  }, [announceUpdate, authFetch, canWrite, load, personas, runBulk, showNotification]);

  const retire = useCallback(async (ids) => {
    if (!canWrite || !ids.length) return;
    const idSet = new Set(ids);
    const removed = personas.filter((row) => idSet.has(row.id));
    setPersonas((rows) => rows.filter((row) => !idSet.has(row.id)));
    setBulkBusy(true);
    try {
      const result = ids.length === 1
        ? await authFetch('/api/horses/stable-admin', {
          method: 'POST', body: JSON.stringify({ action: 'delete_horse', id: ids[0] }),
        }).then(() => ({ affected: 1, requested: 1, failed: 0, firstError: '' }))
        : await runBulk(ids, (chunk) => ({ action: 'bulk_delete', ids: chunk }));
      if (result.affected === 0 && result.firstError) throw new Error(result.firstError);
      setSelectedIds(new Set());
      showNotification?.(result.failed
        ? `Retired ${num(result.affected)} Of ${num(result.requested)}. ${num(result.failed)} Failed: ${result.firstError}`
        : `Retired ${num(result.affected)} Horse${result.affected === 1 ? '' : 's'}`,
      result.failed ? 'error' : 'info');
      announceUpdate();
      if (ids.length > 1) load();
    } catch (cause) {
      setPersonas((rows) => {
        const present = new Set(rows.map((row) => row.id));
        return [...rows, ...removed.filter((row) => !present.has(row.id))]
          .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
      });
      showNotification?.(errorMessage(cause, 'The Horse Could Not Be Retired'), 'error');
    } finally {
      setBulkBusy(false);
    }
  }, [announceUpdate, authFetch, canWrite, load, personas, runBulk, showNotification]);

  const savePersona = async (event) => {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    try {
      const action = editing?.id ? 'update_horse' : 'create_horse';
      const body = await authFetch('/api/horses/stable-admin', {
        method: 'POST',
        body: JSON.stringify({ action, ...(editing?.id ? { id: editing.id } : {}), horse: editing?.id ? form : { ...form, is_active: true } }),
      });
      setPersonas((rows) => editing?.id
        ? rows.map((row) => row.id === body.horse.id ? body.horse : row)
        : [body.horse, ...rows]);
      showNotification?.(`${body.horse.name} ${editing?.id ? 'Updated' : 'Stabled'}`);
      setEditing(null); setForm(EMPTY_PERSONA); announceUpdate();
    } catch (cause) {
      showNotification?.(errorMessage(cause, 'Could Not Save Horse'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const generateAvatars = async () => {
    if (!canWrite) return;
    setAvatarBusy(true); setAvatarResult(null);
    try {
      const body = await authFetch(`/api/horses/generate-avatars?limit=${AVATAR_BATCH}`, { method: 'POST' });
      setAvatarResult(body);
      const failed = (body.results || []).filter((row) => !row.success).length;
      showNotification?.(body.generated
        ? `${num(body.generated)} Avatars Generated${failed ? `, ${num(failed)} Failed` : ''}`
        : body.message || 'No Horses Were Eligible', failed ? 'info' : 'success');
      if (body.generated) await load();
    } catch (cause) {
      showNotification?.(errorMessage(cause, 'Avatars Could Not Be Generated'), 'error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const columns = useMemo(() => [
    { key: 'select', header: 'Select', width: '76px', render: (row) => <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelection(row.id)} aria-label={`Select ${row.name || 'This Horse'}`} /> },
    { key: 'horse', header: 'Horse', width: 'minmax(260px, 1.4fr)', render: (row) => <div className={styles.personaHeader}><div className={styles.personaAvatar}>{row.avatar_url ? <img src={row.avatar_url} alt="" className={styles.avatarImage} loading="lazy" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <span className={styles.avatarFallback} aria-hidden="true">{String(row.name || '?').charAt(0).toUpperCase()}</span>}</div><div className={styles.personaInfo}><strong>{row.name || 'Unnamed'}</strong><span className={styles.alias}>@{row.alias || 'no-alias'}</span></div></div> },
    { key: 'location', header: 'Location', render: (row) => row.location || 'Unknown' },
    { key: 'specialty', header: 'Specialty', render: (row) => String(row.specialty || 'None').replace(/_/g, ' ') },
    { key: 'stakes', header: 'Stakes', render: (row) => row.stakes || 'Not Set' },
    { key: 'voice', header: 'Voice', render: (row) => String(row.voice || 'casual').replace(/_/g, ' ') },
    { key: 'bio', header: 'Bio', width: 'minmax(260px, 1.5fr)', render: (row) => row.bio || 'No Bio.' },
    { key: 'status', header: 'Status', render: (row) => <button type="button" className={styles.filterBtn} disabled={!canWrite || bulkBusy} onClick={() => setActive([row.id], !row.is_active, `Horse ${row.is_active ? 'Rested' : 'Activated'}`)}>{row.is_active ? 'Active' : 'Resting'}</button> },
    { key: 'actions', header: 'Actions', width: '190px', render: (row) => <div className={styles.formActions}><button type="button" className={styles.editBtn} disabled={!canWrite || bulkBusy} onClick={() => { setEditing(row); setForm({ name: row.name || '', gender: row.gender || 'male', location: row.location || '', specialty: row.specialty || 'cash_games', stakes: row.stakes || '', bio: row.bio || '', voice: row.voice || 'casual' }); }}>Edit</button><button type="button" className={styles.deleteBtn} disabled={!canWrite || bulkBusy} onClick={() => setConfirm({ title: `Retire ${row.name}`, body: `Retire ${row.name}? This Permanently Deletes The Horse. It Cannot Be Undone From This Panel.`, label: 'Yes, Retire', tone: 'danger', run: () => retire([row.id]) })}>Retire</button></div> },
  ], [bulkBusy, canWrite, retire, selectedIds, setActive, toggleSelection]);

  const exportRows = () => {
    const rows = selectedIds.size ? personas.filter((row) => selectedIds.has(row.id)) : filtered;
    downloadCsv(stampedName('horses'), toCsv(rows, [
      ['id', 'ID'], ['name', 'Name'], ['alias', 'Alias'], ['gender', 'Gender'],
      ['location', 'Location'], ['specialty', 'Specialty'], ['stakes', 'Stakes'],
      ['voice', 'Voice'], ['is_active', 'Active'], ['avatar_url', 'Avatar URL'], ['bio', 'Bio'],
    ]));
    showNotification?.(`Exported ${num(rows.length)} Horses`);
  };

  return <div className={styles.stableView}>
    <div className={styles.panelHeading}><div><h2>Social Horses</h2><p>Author Identities, Poker Profiles And Content Availability.</p></div><button type="button" className={styles.actionBtn} onClick={load} disabled={loading}>Refresh</button></div>
    {!canWrite ? <div className={styles.warnBanner}>Content Write Permission Is Required To Change The Stable.</div> : null}
    <div className={styles.stableStats}><div className={styles.statBox}><span className={styles.statNumber}>{num(horses.length)}</span><span className={styles.statLabel}>Horses With A Poker Profile</span></div><div className={`${styles.statBox} ${styles.activeBox}`}><span className={styles.statNumber}>{num(activeCount)}</span><span className={styles.statLabel}>Active Horses</span></div><div className={`${styles.statBox} ${styles.inactiveBox}`}><span className={styles.statNumber}>{num(horses.length - activeCount)}</span><span className={styles.statLabel}>Resting Horses</span></div><div className={styles.statBox}><span className={styles.statNumber}>{num(personas.length - horses.length)}</span><span className={styles.statLabel}>Social Only</span></div></div>
    <div className={styles.stableControls}><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} className={styles.searchInput} aria-label="Search Horses" placeholder="Search Horses" /><select value={filter} onChange={(event) => setFilter(event.target.value)} className={styles.filterSelect} aria-label="Filter Horses"><option value="all">All Horses</option><option value="active">Active Only</option><option value="inactive">Resting Only</option></select><PokerBrainLaunchButton /><button type="button" className={styles.btnSuccess} disabled={!canWrite || bulkBusy || !personas.length} onClick={() => setConfirm({ title: 'Activate Every Horse', body: `Activate All ${num(personas.length)} Horses? This Starts Content Generation For Every Eligible Author.`, label: 'Yes, Activate All', tone: 'go', run: () => setActive(personas.map((row) => row.id), true, 'All Horses Activated') })}>Activate All</button><button type="button" className={styles.actionBtn} disabled={!canWrite || bulkBusy || !personas.length} onClick={() => setConfirm({ title: 'Rest Every Horse', body: `Rest All ${num(personas.length)} Horses? This Stops Content Generation For Every Author In The Stable.`, label: 'Yes, Rest All', tone: 'danger', run: () => setActive(personas.map((row) => row.id), false, 'All Horses Rested') })}>Rest All</button><button type="button" className={styles.actionBtn} onClick={exportRows}>Export CSV</button><button type="button" className={styles.actionBtn} disabled={!canWrite || avatarBusy} onClick={() => setConfirm({ title: 'Generate Avatars', body: `Generate Avatars For Up To ${AVATAR_BATCH} Horses? Each One Uses The Paid Image Service And May Take Several Minutes.`, label: `Generate Up To ${AVATAR_BATCH}`, tone: 'go', run: generateAvatars })}>{avatarBusy ? 'Generating Avatars' : 'Generate Avatars'}</button><button type="button" className={styles.btnCreate} disabled={!canWrite} onClick={() => { setEditing({ id: null }); setForm(EMPTY_PERSONA); }}>New Horse</button></div>
    {error ? <div className={styles.errorState} role="alert">The Stable Could Not Be Loaded: {error}</div> : null}
    {avatarBusy ? <div className={styles.warnBanner} role="status">Generating Up To {AVATAR_BATCH} Avatars. Leave This Tab Open Until The Result Appears.</div> : null}
    {avatarResult && !avatarBusy ? <div className={styles.warnBanner} role="status">{num(avatarResult.generated)} Generated{avatarResult.remaining == null ? ', Remaining Count Unavailable' : `, ${num(avatarResult.remaining)} Still Without An Avatar`}.</div> : null}
    <div className={styles.bulkBar}><label className={styles.bulkCheck}><input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} aria-label={allFilteredSelected ? 'Deselect Filtered Horses' : 'Select Filtered Horses'} /><span>Select Filtered</span></label>{selectedIds.size ? <><span className={styles.countPill}>{num(selectedIds.size)} Selected</span><button type="button" className={styles.filterBtn} disabled={bulkBusy || !canWrite} onClick={() => setActive([...selectedIds], true, 'Selected Horses Activated')}>Activate</button><button type="button" className={styles.filterBtn} disabled={bulkBusy || !canWrite} onClick={() => setActive([...selectedIds], false, 'Selected Horses Rested')}>Rest</button><button type="button" className={styles.btnDanger} disabled={bulkBusy || !canWrite} onClick={() => setConfirm({ title: `Retire ${num(selectedIds.size)} Horses`, body: `Retire ${num(selectedIds.size)} Horses? This Permanently Deletes Them.`, label: `Retire ${num(selectedIds.size)}`, tone: 'danger', typed: 'RETIRE', run: () => retire([...selectedIds]) })}>Retire</button><button type="button" className={styles.filterBtn} disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>Clear</button></> : <span className={styles.bulkHint}>Select Horses To Activate, Rest Or Retire Them Together.</span>}</div>
    <VirtualDataTable caption="Social Horses Roster" columns={columns} rows={filtered} loading={loading} loadingLabel="Loading The Stable" empty={personas.length ? 'No Horses Match The Current Search And Filter.' : 'No Horses Are In The Stable Yet.'} getRowKey={(row) => row.id} virtualizeAt={100} height={560} rowHeight={64} />
    {confirm ? <ConfirmDialog title={confirm.title} tone={confirm.tone} confirmLabel={confirm.label} requireTyped={confirm.typed} onCancel={() => setConfirm(null)} onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }}><p>{confirm.body}</p></ConfirmDialog> : null}
    {editing ? <Modal title={editing.id ? `Edit ${editing.name}` : 'New Horse'} onClose={() => { if (!saving) setEditing(null); }} sticky={saving} blockEscape={saving} wide><form onSubmit={savePersona}><div className={styles.formGroup}><label htmlFor="stable-name">Name</label><input id="stable-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div><div className={styles.formRow}><div className={styles.formGroup}><label htmlFor="stable-gender">Gender</label><select id="stable-gender" value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="male">Male</option><option value="female">Female</option></select></div><div className={styles.formGroup}><label htmlFor="stable-location">Location</label><input id="stable-location" required value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} /></div></div><div className={styles.formGroup}><label htmlFor="stable-bio">Bio</label><textarea id="stable-bio" rows="3" required value={form.bio} onChange={(event) => setForm({ ...form, bio: event.target.value })} /></div><div className={styles.formRow}><div className={styles.formGroup}><label htmlFor="stable-specialty">Specialty</label><select id="stable-specialty" value={form.specialty} onChange={(event) => setForm({ ...form, specialty: event.target.value })}>{SPECIALTIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className={styles.formGroup}><label htmlFor="stable-stakes">Stakes</label><input id="stable-stakes" required value={form.stakes} onChange={(event) => setForm({ ...form, stakes: event.target.value })} /></div></div><div className={styles.formGroup}><label htmlFor="stable-voice">Voice</label><select id="stable-voice" value={form.voice} onChange={(event) => setForm({ ...form, voice: event.target.value })}>{VOICES.map((voice) => <option key={voice} value={voice}>{voice.replace(/_/g, ' ')}</option>)}</select></div><div className={styles.formActions}><button type="button" className={styles.btnCancel} disabled={saving} onClick={() => setEditing(null)}>Cancel</button><button type="submit" className={styles.btnSubmit} disabled={saving || !canWrite}>{saving ? 'Saving' : editing.id ? 'Save Changes' : 'Stable Horse'}</button></div></form></Modal> : null}
  </div>;
}
