import React, { useCallback, useEffect, useRef, useState } from 'react';
import { T, when } from '../../lib/horsesAdminTokens';
import { BROADCAST_TAB_ID, broadcastSync, listenBroadcast } from '../../lib/broadcastSync';
import {
  selectPatchOperatorContext,
  selectSocialSettings,
  useStableAdminStore,
} from '../../stores/stableAdminStore';
import { hasPermission } from './operatorPermissions';
import styles from '../../../pages/horses/horses.module.css';

const SYNC_CHANNEL = 'horses-admin-sync';

/**
 * The one setting this page owns (Phase 10, 2026-10-06).
 *
 * The live content engine (workers src/lib/content-engine/Fleet.ts) reads
 * exactly two things from the settings surfaces: content_settings.engine_enabled,
 * the master switch, and horse_post_modes.enabled per mode. The posting
 * schedule, the model select, the temperature slider and the Auto-Publish
 * switch that used to sit on this page steered nothing: no live code read one
 * back, and the model names were false for an engine that calls no model. A
 * control that steers nothing is a promise the page cannot keep, so they are
 * gone, and the route refuses their keys.
 *
 * `false` is the DEFAULT for an unread row, never a value this page writes on
 * its own: the switch stays locked until the live row is read, and the word
 * beside it says Unknown until then.
 */
const DEFAULTS = Object.freeze({ engine_enabled: false });

/** `puzzle_what_would_you_do` reads as "Puzzle What Would You Do". */
export function modeTitle(mode) {
  return String(mode || '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** "Approved By ... On ..." from the row, or the honest alternative. */
export function approvalLine(row) {
  if (!row || !row.approved_at) return 'Not Yet Approved';
  return `Approved By ${row.approved_by || 'Unknown'} On ${when(row.approved_at, true)}`;
}

export default function SettingsPanel({ authFetch, showNotification, onNavigate, permissions }) {
  const sharedSettings = useStableAdminStore(selectSocialSettings);
  const patchContext = useStableAdminStore(selectPatchOperatorContext);
  const [settings, setSettings] = useState(() => ({ ...DEFAULTS, ...(sharedSettings || {}) }));
  const [loaded, setLoaded] = useState(sharedSettings !== null);
  const [loading, setLoading] = useState(sharedSettings === null);
  const [readError, setReadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  // The posting modes: null until the list is read, so an unread list can
  // never render as "no modes".
  const [modes, setModes] = useState(null);
  const [modesLoading, setModesLoading] = useState(true);
  const [modesError, setModesError] = useState('');
  const [modeSaveError, setModeSaveError] = useState('');
  const [flipping, setFlipping] = useState(null);
  const timerRef = useRef(null);
  const pendingRef = useRef(null);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const inFlightRef = useRef(0);
  const readSequence = useRef(0);
  const modeSequence = useRef(0);
  const flippingRef = useRef(null);
  const canWrite = hasPermission(permissions, 'content.write');
  const canOpenFleet = !Array.isArray(permissions)
    || permissions.length === 0
    || permissions.includes('*')
    || permissions.includes('fleet.read');

  const load = useCallback(async () => {
    const sequence = ++readSequence.current;
    setLoading(true);
    setReadError('');
    // Operator route, service role: content_settings is not readable from a
    // browser (pages/api/horses/stable-admin.js, read_settings).
    let result;
    try {
      const body = await authFetch('/api/horses/stable-admin?action=read_settings');
      result = { data: body?.settings || null, error: null };
    } catch (cause) {
      result = { data: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
    if (!mountedRef.current || sequence !== readSequence.current) return;
    if (result.error) {
      setLoaded(false);
      setReadError(result.error.message || 'Settings Could Not Be Read');
    } else if (result.data) {
      const next = { ...DEFAULTS, ...result.data };
      setSettings(next);
      setLoaded(true);
      patchContext({ socialSettings: next });
    } else {
      setLoaded(false);
      patchContext({ socialSettings: null });
    }
    setLoading(false);
  }, [authFetch, patchContext]);

  const loadModes = useCallback(async () => {
    const sequence = ++modeSequence.current;
    setModesLoading(true);
    setModesError('');
    // Same route, same reason: horse_post_modes is a server-only table.
    let result;
    try {
      const body = await authFetch('/api/horses/stable-admin?action=read_post_modes');
      result = { data: Array.isArray(body?.modes) ? body.modes : null, error: null };
    } catch (cause) {
      result = { data: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
    if (!mountedRef.current || sequence !== modeSequence.current) return;
    if (result.error) {
      setModes(null);
      setModesError(result.error.message || 'The Posting Modes Could Not Be Read');
    } else if (result.data) {
      setModes(result.data);
    } else {
      // A 200 without the list is not a read either.
      setModes(null);
      setModesError('The Posting Modes Could Not Be Read');
    }
    setModesLoading(false);
  }, [authFetch]);

  useEffect(() => {
    mountedRef.current = true;
    load();
    loadModes();
    return () => { mountedRef.current = false; readSequence.current++; modeSequence.current++; };
  }, [load, loadModes]);

  const flush = useCallback(async () => {
    if (savingRef.current || !mountedRef.current) return;
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    inFlightRef.current += 1;
    savingRef.current = true;
    setSaving(true); setSaveError('');
    try {
      const body = await authFetch('/api/horses/stable-admin', {
        method: 'POST', body: JSON.stringify({ action: 'save_settings', settings: payload }),
      });
      if (!mountedRef.current) return;
      if (typeof body?.settings?.engine_enabled !== 'boolean') throw new Error('The Saved Settings Receipt Could Not Be Confirmed');
      const next = { ...DEFAULTS, ...body.settings };
      // A second edit may have landed while this request was in flight. Do not
      // paint the older response over that newer draft; its own timer will
      // persist it.
      if (!pendingRef.current) {
        setSettings(next);
        patchContext({ socialSettings: next });
      }
      setSavedAt(new Date());
      window.dispatchEvent(new CustomEvent('horses-settings-updated'));
      broadcastSync(SYNC_CHANNEL, { type: 'sync_update', timestamp: Date.now(), tabId: BROADCAST_TAB_ID });
    } catch (cause) {
      if (!mountedRef.current) return;
      const message = cause?.message || 'Settings Could Not Be Saved';
      setSaveError(message);
      showNotification?.(`Setting Not Saved: ${message}`, 'error');
      // The switch must show the row, not the hope: re-read it.
      pendingRef.current = null;
      await load();
    } finally {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      savingRef.current = inFlightRef.current > 0;
      if (mountedRef.current) {
        setSaving(savingRef.current);
        if (pendingRef.current) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = null;
          void flush();
        }
      }
    }
  }, [authFetch, load, patchContext, showNotification]);

  const update = useCallback((key, value) => {
    if (!loaded || !canWrite) {
      showNotification?.(canWrite
        ? 'Settings Were Never Read, So Nothing Can Be Saved. Reload And Try Again.'
        : 'Content Write Permission Is Required To Save Settings.', 'error');
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return;
    // The payload is the PATCH, never the whole row: only a key this page owns
    // can reach the route, and the row's id and stamp never travel back.
    readSequence.current += 1;
    setLoading(false);
    const next = { ...(pendingRef.current || {}), [key]: value };
    pendingRef.current = next;
    setSettings((current) => {
      const draft = { ...current, ...next };
      patchContext({ socialSettings: draft });
      return draft;
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; flush(); }, 700);
  }, [canWrite, flush, loaded, patchContext, showNotification]);

  /**
   * One switch, one call, one audited write. No debounce and no batching: a
   * mode flip is a deliberate act and the route records each one. The list
   * shown afterwards is what the table holds, never what the browser hoped:
   * the route re-reads every row after its write and sends the list back, and
   * when that list is missing (or the write failed) the panel re-reads it.
   */
  const flipMode = useCallback(async (mode, enabled) => {
    if (!loaded || !canWrite) {
      showNotification?.(canWrite
        ? 'Settings Were Never Read, So No Posting Mode Can Be Changed. Reload And Try Again.'
        : 'Content Write Permission Is Required To Change A Posting Mode.', 'error');
      return;
    }
    // A second click while the first is in flight is dropped, not queued.
    if (flippingRef.current) return;
    modeSequence.current += 1;
    setModesLoading(false);
    flippingRef.current = mode;
    setFlipping(mode);
    setModeSaveError('');
    let listed = false;
    try {
      const body = await authFetch('/api/horses/stable-admin', {
        method: 'POST', body: JSON.stringify({ action: 'set_post_mode', mode, enabled }),
      });
      if (!mountedRef.current) return;
      const recordedMode = Array.isArray(body?.modes) ? body.modes.find(row => row.mode === mode) : null;
      if (!recordedMode || typeof recordedMode.enabled !== 'boolean') throw new Error('The Posting Mode Receipt Could Not Be Confirmed');
      if (Array.isArray(body?.modes)) {
        setModes(body.modes);
        setModesError('');
        listed = true;
      }
      showNotification?.(`${modeTitle(mode)} Is Now ${recordedMode.enabled ? 'Enabled' : 'Disabled'}`);
      broadcastSync(SYNC_CHANNEL, { type: 'sync_update', timestamp: Date.now(), tabId: BROADCAST_TAB_ID });
    } catch (cause) {
      if (!mountedRef.current) return;
      const message = cause?.message || 'The Posting Mode Could Not Be Changed';
      setModeSaveError(message);
      showNotification?.(`Posting Mode Not Saved: ${message}`, 'error');
    } finally {
      flippingRef.current = null;
      if (mountedRef.current) setFlipping(null);
    }
    if (mountedRef.current && !listed) await loadModes();
  }, [authFetch, canWrite, loadModes, loaded, showNotification]);

  useEffect(() => {
    const refreshSettings = () => { if (!savingRef.current && !pendingRef.current) load(); };
    const refreshModes = () => { if (!flippingRef.current) loadModes(); };
    const stopBroadcast = listenBroadcast(SYNC_CHANNEL, (message) => {
      if (message?.type !== 'sync_update') return;
      // A BroadcastChannel message reaches every other channel instance in
      // the same tab too. This tab's own broadcast carries its tab id, and
      // this tab already holds the answer the route sent, so it is not a
      // reason to spend two more calls on the route's write limit.
      if (message.tabId && message.tabId === BROADCAST_TAB_ID) return;
      refreshSettings();
      refreshModes();
    });
    window.addEventListener('horses-settings-updated', refreshSettings);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopBroadcast();
      window.removeEventListener('horses-settings-updated', refreshSettings);
    };
  }, [load, loadModes]);

  const reloadAll = () => { load(); loadModes(); };
  const busy = loading || modesLoading || saving || flipping !== null;

  return <div className={styles.settingsView}>
    <div className={styles.panelHeading}><div><h2>Engine Settings</h2><p>The Two Switches The Live Engine Reads. Changes Save Automatically After Editing Stops.</p></div><button type="button" className={styles.actionBtn} onClick={reloadAll} disabled={busy}>Reload</button></div>
    {!canWrite ? <div className={styles.warnBanner}>Content Write Permission Is Required To Save These Settings.</div> : null}
    {readError ? <div className={styles.errorState} role="alert">Settings Not Read: {readError}</div> : null}
    {!loaded ? <div className={styles.warnBanner} role="status">{loading ? 'Reading The Saved Settings. Controls Stay Closed Until The Live Row Is Read.' : 'Controls Are Locked Because The Saved Settings Row Was Not Read. Defaults Are Not Live Values.'}</div> : null}
    {saveError ? <div className={styles.errorState} role="alert">Settings Not Saved: {saveError}</div> : saving ? <div style={{ color: T.accent, fontSize: 12 }} role="status">Saving Settings</div> : savedAt ? <div style={{ color: T.accent, fontSize: 12 }} role="status">Saved At {savedAt.toLocaleTimeString()}</div> : null}
    <div className={styles.settingsGrid}>
      <section className={`${styles.settingCard} ${styles.fullWidth}`}><h3>System Controls</h3><div className={styles.systemControls}><div className={styles.controlItem}><label htmlFor="setting-engine">Content Engine</label><label className={styles.toggleSwitch}><input id="setting-engine" type="checkbox" checked={loaded && !!settings.engine_enabled} disabled={!loaded || !canWrite} onChange={(event) => update('engine_enabled', event.target.checked)} /><span className={styles.slider} /></label><span style={{ color: !loaded ? T.dim : settings.engine_enabled ? T.accent : T.danger }}>{!loaded ? 'Unknown' : settings.engine_enabled ? 'Running' : 'Stopped'}</span></div></div><p className={styles.settingNote}>The Master Switch. While It Is Stopped, Every Horse Posting Route Skips Its Run And No Posting Mode Below Posts, Whatever That Mode's Own Switch Says.</p></section>
      <section className={`${styles.settingCard} ${styles.fullWidth}`}><h3>Posting Modes</h3><p className={styles.settingNote}>One Row Per Way A Horse Can Post. A New Mode Arrives Disabled And Stays Off Until Someone Flips It Here On Purpose; Every Flip Is Written To The Audit Log. The Master Content Engine Switch Above Gates Every Mode.</p>{modesError ? <div className={styles.errorState} role="alert">Posting Modes Not Read: {modesError}</div> : null}{modeSaveError ? <div className={styles.errorState} role="alert">Posting Mode Not Saved: {modeSaveError}</div> : null}{modes === null ? <div className={styles.warnBanner} role="status">{modesLoading ? 'Reading The Posting Modes. Their State Is Unknown Until The Table Is Read.' : 'The Posting Modes Were Not Read, So Their State Is Unknown.'}</div> : modes.length === 0 ? <div className={styles.warnBanner} role="status">The Table Holds No Posting Modes.</div> : <ul className={styles.modeList}>{modes.map((row) => <li key={row.mode} className={styles.modeRow}><div className={styles.modeText}><strong>{modeTitle(row.mode)}</strong><span className={styles.modeMeta}>{row.description || 'No Description Recorded.'}</span><span className={styles.modeMeta}>{approvalLine(row)}</span></div><div className={styles.controlItem}><label className={styles.toggleSwitch}><input type="checkbox" aria-label={`${modeTitle(row.mode)} Posting Mode`} checked={!!row.enabled} disabled={!loaded || !canWrite} onChange={(event) => flipMode(row.mode, event.target.checked)} /><span className={styles.slider} /></label><span style={{ color: flipping === row.mode ? T.dim : row.enabled ? T.accent : T.danger }}>{flipping === row.mode ? 'Saving' : row.enabled ? 'Enabled' : 'Disabled'}</span></div></li>)}</ul>}</section>
      <section className={styles.settingCard}><h3>Horse Fleet</h3><p style={{ color: T.dim, fontSize: 12 }}>The Horses Decide Their Own Play. HorseLogic Is A Deterministic Club Arena Engine, Not A Language Model, And It Takes No Settings From This Page.</p><p style={{ color: T.dim, fontSize: 12 }}>Seating, Caps And Per-Club Policy Live In Fleet Command.</p>{canOpenFleet && onNavigate ? <button type="button" className={styles.linkBtn} onClick={() => onNavigate('fleet')}>Open Fleet Command</button> : null}</section>
    </div>
  </div>;
}
