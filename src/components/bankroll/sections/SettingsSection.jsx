/* The Bankroll Settings view (?view=settings).

   Moved verbatim out of pages/hub/bankroll-manager.js in the 2026-11-28 page
   split. The page still owns every piece of state and every handler and
   passes in exactly the ones this view reads, so its behaviour, text,
   accessible names and test ids are unchanged. */

import layout from '../../../../styles/BankrollManager.module.css';
import { eurRateNote } from '../../../lib/bankroll/currencyUtils';
import { styles } from './bankrollPageStyles';
import { lazySection } from './lazySection';

const BankrollDataTools = lazySection(() => import('../BankrollDataTools'));

export default function SettingsSection({
  goToSection, haptic, preferences, setShowVenueModal, updatePreference,
  userId
}) {
  return (
    <div className={`sd-panel ${layout.panel}`}>
      <h2 className="sd-section-title">Bankroll Settings</h2>
      <div style={{ padding: 16, background: 'rgba(255,255,255,0.1)', borderRadius: 10, border: '2px solid rgba(255,255,255,0.15)', marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: '#fff', margin: '0 0 16px' }}>Preferences</h3>
        <label style={styles.settingRow}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, color: '#fff' }}>Display EUR</span>
            <span style={styles.settingHint}>Show Bankroll Results, Balances, Totals And Averages In Euros.</span>
            <span data-testid="eur-rate-note" style={styles.settingHint}>{eurRateNote()}</span>
          </span>
          <input type="checkbox" checked={Boolean(preferences.currencyEUR)} onChange={(e) => updatePreference('currencyEUR', e.target.checked)} style={styles.settingCheck} />
        </label>
        <label style={{ ...styles.settingRow, borderBottom: 'none' }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, color: '#fff' }}>Venue Alerts</span>
            <span style={styles.settingHint}>Remind Me To Log A Session When I Arrive At A Saved Venue.</span>
          </span>
          <input type="checkbox" checked={preferences.notifications !== false} onChange={(e) => updatePreference('notifications', e.target.checked)} style={styles.settingCheck} />
        </label>
      </div>
      <BankrollDataTools userId={userId} />
      <button
        type="button"
        onClick={() => { haptic('light'); setShowVenueModal(true); }}
        style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}
      >
        Manage Venues
        <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
      </button>
      <button
        type="button"
        onClick={() => { haptic('light'); goToSection('reports'); }}
        style={{ width: '100%', padding: '14px 18px', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.1)', borderRadius: 10, color: '#fff', fontSize: 14, fontWeight: 500, cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        Export Data
        <span style={{ fontSize: 18, opacity: 0.5 }}>›</span>
      </button>
    </div>
  );
}
