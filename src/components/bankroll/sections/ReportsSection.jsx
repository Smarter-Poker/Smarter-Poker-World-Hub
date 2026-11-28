/* The Performance Reports view (?view=reports).

   Moved verbatim out of pages/hub/bankroll-manager.js in the 2026-11-28 page
   split. The page still owns every piece of state and every handler and
   passes in exactly the ones this view reads, so its behaviour, text,
   accessible names and test ids are unchanged. */

import layout from '../../../../styles/BankrollManager.module.css';
import { formatCurrencyWithSign } from '../../../lib/bankroll/currencyUtils';
import { styles } from './bankrollPageStyles';
import { lazySection } from './lazySection';

const BankrollExportFormats = lazySection(() => import('../BankrollExportFormats'));

export default function ReportsSection({
  failedScope, loadData, locationFilter, preferences, report,
  reportReady, reportScope, selectedLocationName, timeFilter, userId
}) {
  return (
    <div className={`sd-panel ${layout.panel}`}>
      <h2 className="sd-section-title">Performance Reports</h2>
      {/* The page keeps the dashboard's Location and Time filters
          across views now (it is no longer remounted per view),
          so these totals say which slice they cover. */}
      <p data-testid="reports-scope" style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
        {locationFilter ? `At ${selectedLocationName}` : 'All Locations'} · {timeFilter}
      </p>

      {failedScope === reportScope && (
        <p role="alert">Could Not Refresh Reports. <button type="button" className="sd-button" onClick={loadData}>Retry</button></p>
      )}
      {!reportReady && failedScope !== reportScope && <p role="status">{userId ? 'Loading Reports…' : 'Sign In To View Reports'}</p>}
      {reportReady && <dl className={layout.reportMetrics}>
        <div className={layout.reportMetric}><dt>Total Sessions</dt><dd><strong>{report.count}</strong></dd></div>
        <div className={layout.reportMetric}><dt>Win Rate</dt><dd><strong>{report.winRate}%</strong></dd></div>
        <div className={layout.reportMetric}><dt>Net P/L</dt><dd><strong>{formatCurrencyWithSign(report.net, preferences.currencyEUR, { cents: true })}</strong></dd></div>
        <div className={layout.reportMetric}><dt>Avg Session</dt><dd><strong>{formatCurrencyWithSign(report.average, preferences.currencyEUR, { cents: true })}</strong></dd></div>
      </dl>}
      {preferences.currencyEUR && <p data-testid="exports-stay-usd" style={styles.settingHint}>Exports Stay In US Dollars.</p>}
      <BankrollExportFormats />
    </div>
  );
}
