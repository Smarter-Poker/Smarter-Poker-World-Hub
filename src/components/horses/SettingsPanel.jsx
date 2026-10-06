import React, { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '../../lib/horsesAdminTokens';
import { broadcastSync, listenBroadcast } from '../../lib/broadcastSync';
import {
  selectPatchOperatorContext,
  selectSocialSettings,
  useStableAdminStore,
} from '../../stores/stableAdminStore';
import { hasPermission } from './operatorPermissions';
import styles from '../../../pages/horses/horses.module.css';

const SYNC_CHANNEL = 'horses-admin-sync';
const DEFAULTS = Object.freeze({
  posts_per_day: 20,
  min_delay_minutes: 30,
  max_delay_minutes: 120,
  ai_model: 'gpt-4o',
  temperature: 0.8,
  engine_enabled: true,
  auto_publish: true,
  peak_hours: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
});

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
  const timerRef = useRef(null);
  const pendingRef = useRef(null);
  const mountedRef = useRef(true);
  const savingRef = useRef(false);
  const inFlightRef = useRef(0);
  const canWrite = hasPermission(permissions, 'content.write');
  const canOpenFleet = !Array.isArray(permissions)
    || permissions.length === 0
    || permissions.includes('*')
    || permissions.includes('fleet.read');

  const load = useCallback(async () => {
    setLoading(true);
    setReadError('');
    // Operator route, service role: content_settings is not readable from a
    // browser (pages/api/horses/stable-admin.js, read_settings).
    let result;
    try {
      const body = await authFetch('/api/horses/stable-admin', {
        method: 'POST', body: JSON.stringify({ action: 'read_settings' }),
      });
      result = { data: body?.settings || null, error: null };
    } catch (cause) {
      result = { data: null, error: cause instanceof Error ? cause : new Error(String(cause)) };
    }
    if (!mountedRef.current) return;
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

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => { mountedRef.current = false; };
  }, [load]);

  const flush = useCallback(async () => {
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
      const next = { ...payload, ...(body.settings || {}) };
      // A second edit may have landed while this request was in flight. Do not
      // paint the older response over that newer draft; its own timer will
      // persist it using the complete object.
      if (!pendingRef.current) {
        setSettings(next);
        patchContext({ socialSettings: next });
      }
      setSavedAt(new Date());
      window.dispatchEvent(new CustomEvent('horses-settings-updated'));
      broadcastSync(SYNC_CHANNEL, { type: 'sync_update', timestamp: Date.now() });
    } catch (cause) {
      if (!mountedRef.current) return;
      const message = cause?.message || 'Settings Could Not Be Saved';
      setSaveError(message);
      showNotification?.(`Setting Not Saved: ${message}`, 'error');
    } finally {
      inFlightRef.current = Math.max(0, inFlightRef.current - 1);
      savingRef.current = inFlightRef.current > 0;
      if (mountedRef.current) setSaving(savingRef.current);
    }
  }, [authFetch, patchContext, showNotification]);

  const update = useCallback((key, value) => {
    if (!loaded || !canWrite) {
      showNotification?.(canWrite
        ? 'Settings Were Never Read, So Nothing Can Be Saved. Reload And Try Again.'
        : 'Content Write Permission Is Required To Save Settings.', 'error');
      return;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    setSettings((current) => {
      const next = { ...current, [key]: value };
      pendingRef.current = next;
      patchContext({ socialSettings: next });
      return next;
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { timerRef.current = null; flush(); }, 700);
  }, [canWrite, flush, loaded, patchContext, showNotification]);

  useEffect(() => {
    const refresh = () => { if (!savingRef.current && !pendingRef.current) load(); };
    const stopBroadcast = listenBroadcast(SYNC_CHANNEL, (message) => {
      if (message?.type === 'sync_update') refresh();
    });
    window.addEventListener('horses-settings-updated', refresh);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopBroadcast();
      window.removeEventListener('horses-settings-updated', refresh);
    };
  }, [load]);

  return <div className={styles.settingsView}>
    <div className={styles.panelHeading}><div><h2>Engine Settings</h2><p>Changes Save Automatically After Editing Stops.</p></div><button type="button" className={styles.actionBtn} onClick={load} disabled={loading || saving}>Reload</button></div>
    {!canWrite ? <div className={styles.warnBanner}>Content Write Permission Is Required To Save These Settings.</div> : null}
    {readError ? <div className={styles.errorState} role="alert">Settings Not Read: {readError}</div> : null}
    {!loaded ? <div className={styles.warnBanner} role="status">{loading ? 'Reading The Saved Settings. Controls Stay Closed Until The Live Row Is Read.' : 'Controls Are Locked Because The Saved Settings Row Was Not Read. Defaults Are Not Live Values.'}</div> : null}
    {saveError ? <div className={styles.errorState} role="alert">Settings Not Saved: {saveError}</div> : savedAt ? <div style={{ color: T.accent, fontSize: 12 }} role="status">Saved At {savedAt.toLocaleTimeString()}</div> : saving ? <div style={{ color: T.accent, fontSize: 12 }} role="status">Saving Settings</div> : null}
    <div className={styles.settingsGrid}>
      <section className={styles.settingCard}><h3>Posting Schedule</h3>{[
        ['posts_per_day', 'Posts Per Day', 1, 100],
        ['min_delay_minutes', 'Min Delay (Minutes)', 5, 180],
        ['max_delay_minutes', 'Max Delay (Minutes)', 15, 300],
      ].map(([key, label, min, max]) => <div className={styles.settingItem} key={key}><label htmlFor={`setting-${key}`}>{label}</label><input id={`setting-${key}`} type="number" min={min} max={max} value={settings[key] ?? ''} disabled={!loaded || !canWrite} onChange={(event) => { const value = Number.parseInt(event.target.value, 10); if (Number.isFinite(value)) update(key, Math.min(Math.max(value, min), max)); }} /></div>)}{settings.min_delay_minutes > settings.max_delay_minutes ? <div className={styles.warnBanner}>Min Delay Is Greater Than Max Delay. The Scheduler Will Not Behave Sensibly.</div> : null}</section>
      <section className={styles.settingCard}><h3>AI Settings</h3><div className={styles.settingItem}><label htmlFor="setting-model">Model</label><select id="setting-model" value={settings.ai_model || 'gpt-4o'} disabled={!loaded || !canWrite} onChange={(event) => update('ai_model', event.target.value)}><option value="gpt-4o">GPT-4o (Best)</option><option value="gpt-4o-mini">GPT-4o Mini</option><option value="gpt-3.5-turbo">GPT-3.5 Turbo</option></select></div><div className={styles.settingItem}><label htmlFor="setting-temperature">Temperature: {Number(settings.temperature ?? 0.8).toFixed(2)}</label><input id="setting-temperature" type="range" min="0" max="100" step="5" value={Math.round(Number(settings.temperature ?? 0.8) * 100)} disabled={!loaded || !canWrite} onChange={(event) => update('temperature', Number(event.target.value) / 100)} /></div></section>
      <section className={styles.settingCard}><h3>Horse Fleet</h3><p style={{ color: T.dim, fontSize: 12 }}>The Horses Decide Their Own Play. HorseLogic Is A Deterministic Club Arena Engine, Not A Language Model, And It Takes No Settings From This Page.</p><p style={{ color: T.dim, fontSize: 12 }}>Seating, Caps And Per-Club Policy Live In Fleet Command.</p>{canOpenFleet && onNavigate ? <button type="button" className={styles.linkBtn} onClick={() => onNavigate('fleet')}>Open Fleet Command</button> : null}</section>
      <section className={`${styles.settingCard} ${styles.fullWidth}`}><h3>System Controls</h3><div className={styles.systemControls}><div className={styles.controlItem}><label htmlFor="setting-engine">Content Engine</label><label className={styles.toggleSwitch}><input id="setting-engine" type="checkbox" checked={loaded && !!settings.engine_enabled} disabled={!loaded || !canWrite} onChange={(event) => update('engine_enabled', event.target.checked)} /><span className={styles.slider} /></label><span style={{ color: !loaded ? T.dim : settings.engine_enabled ? T.accent : T.danger }}>{!loaded ? 'Unknown' : settings.engine_enabled ? 'Running' : 'Stopped'}</span></div><div className={styles.controlItem}><label htmlFor="setting-publish">Auto-Publish</label><label className={styles.toggleSwitch}><input id="setting-publish" type="checkbox" checked={loaded && !!settings.auto_publish} disabled={!loaded || !canWrite} onChange={(event) => update('auto_publish', event.target.checked)} /><span className={styles.slider} /></label><span style={{ color: !loaded ? T.dim : settings.auto_publish ? T.accent : T.warn }}>{!loaded ? 'Unknown' : settings.auto_publish ? 'Active' : 'Manual'}</span></div></div></section>
    </div>
  </div>;
}
