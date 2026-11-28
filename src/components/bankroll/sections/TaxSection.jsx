/* The Tax Reports view (?view=tax): W-2G forms waiting to be filed, the state tax report, the tax reports panel and the tax packet.

   Moved verbatim out of pages/hub/bankroll-manager.js in the 2026-11-28 page
   split. The page still owns every piece of state and every handler and
   passes in exactly the ones this view reads, so its behaviour, text,
   accessible names and test ids are unchanged. */

import { HubErrorBoundary } from '../../ui/HubErrorBoundary';
import BankrollProGate from '../BankrollProGate';
import { styles } from './bankrollPageStyles';
import { lazySection } from './lazySection';

const AdvancedTaxReport = lazySection(() => import('../AdvancedTaxReport'));
const TaxPacketDownload = lazySection(() => import('../TaxPacketDownload'));
const TaxReportPanel = lazySection(() => import('../TaxReportPanel'));

export default function TaxSection({
  analysisEntries, pendingReceipts, preferences, resumeReceipt, userId
}) {
  return (
    <div style={styles.proToolsContainer}>
      {/* A scanned W-2G waits here rather than only in a list the
          Tax Reports reader never looks at. */}
      {pendingReceipts.filter(r => r.destination === 'tax').length > 0 && (
        <div style={{ ...styles.receiptsWaiting, margin: 16 }} data-testid="tax-receipts-waiting">
          <div style={styles.receiptsWaitingHead}>
            <span>W-2G Forms Waiting To Be Filed</span>
            <span style={styles.receiptsWaitingCount}>{pendingReceipts.filter(r => r.destination === 'tax').length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingReceipts.filter(r => r.destination === 'tax').map((receipt) => (
              <button key={receipt.id} type="button" onClick={() => resumeReceipt(receipt)} style={styles.receiptsWaitingRow}>
                <img src={receipt.image_url} alt="" loading="lazy" style={styles.receiptsWaitingThumb} />
                <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {receipt.summary || 'W-2G'}
                  </div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 2 }}>Add It To The Vault</div>
                </div>
                <span style={{ color: '#94e7ff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>FILE</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <BankrollProGate userId={userId}>
        <div style={{ padding: 16 }}>
          {preferences.currencyEUR && <p data-testid="tax-stays-usd" style={{ ...styles.settingHint, margin: '0 0 12px' }}>Tax Reports Stay In US Dollars.</p>}
          <HubErrorBoundary name="State Tax Report">
            <AdvancedTaxReport entries={analysisEntries} userId={userId} />
          </HubErrorBoundary>
          <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 24 }}>
            <HubErrorBoundary name="Tax Reports">
              <TaxReportPanel userId={userId} />
            </HubErrorBoundary>
            <HubErrorBoundary name="Tax Packet">
              <div style={{ marginTop: 16 }}><TaxPacketDownload /></div>
            </HubErrorBoundary>
          </div>
        </div>
      </BankrollProGate>
    </div>
  );
}
