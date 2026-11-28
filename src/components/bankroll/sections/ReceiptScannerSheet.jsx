/* The Scan Receipt sheet: scan, Receipt Saved choices, and Select Entry.

   Moved verbatim out of pages/hub/bankroll-manager.js in the 2026-11-28 page
   split. The page still owns every piece of state and every handler and
   passes in exactly the ones this view reads, so its behaviour, text,
   accessible names and test ids are unchanged. */

import { FunnelEvents, capture } from '../../../lib/analytics';
import { formatCurrencyWithSign } from '../../../lib/bankroll/currencyUtils';
import { parseLedgerDay } from '../../../lib/bankroll/localDates.mjs';
import { duplicateOf } from '../../../lib/bankroll/receiptHash.mjs';
import { findOpenSessionFor, rankEntriesForReceipt, receiptActions } from '../../../lib/bankroll/receiptInbox.mjs';
import toast from '../../../stores/toastStore';
import { styles } from './bankrollPageStyles';
import { lazySection } from './lazySection';

const ReceiptScanner = lazySection(() => import('../ReceiptScanner'));

/** Colour of the tag on each Receipt Saved choice, by receiptActions() tone. */
const RECEIPT_TONE_COLORS = {
  VAULT: '#94e7ff',
  TRIP: '#4ade80',
  CLOSE: '#34d399',
  EXPENSE: '#f87171',
  ATTACH: '#60a5fa',
  LATER: '#a5b7cc',
};

export default function ReceiptScannerSheet({
  attachScannerReceiptToEntry, closeScanner, entries,
  handleReceiptAction, loadPendingReceipts, preferences, receiptBusy,
  receiptSaving, recentHashes, refreshHeldScans, releaseResumedScan,
  resumingHeld, retryReceiptListing, saveReceiptRow, scannerDuplicate,
  scannerImageHashRef, scannerImageUrl, scannerReadOutcomeRef,
  scannerReceiptId, scannerRoute, scannerScrim, scannerStep,
  setReceiptSaving, setScannerDuplicate, setScannerExtractedData,
  setScannerHasUnsaved, setScannerImageUrl, setScannerReceiptId,
  setScannerRoute, setScannerStep, trips, userId
}) {
  return (
    <div className="bankroll-modal-overlay" style={styles.scannerModal} {...scannerScrim}>
      <div className="bankroll-modal" role="dialog" aria-modal="true" style={styles.scannerModalContent} onClick={(e) => e.stopPropagation()}>
        <div className="bankroll-sheet-handle" aria-hidden="true" />
        <div className="bankroll-modal-header" style={styles.scannerModalHeader}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' }}>
            {scannerStep === 'scan' && 'Scan Receipt'}
            {scannerStep === 'post-capture' && 'Receipt Saved'}
            {scannerStep === 'pick-entry' && 'Select Entry'}
          </h2>
          <button
            type="button"
            aria-label="Close"
            className="bankroll-modal-close sp-icon-btn"
            onClick={closeScanner}
            style={styles.scannerCloseBtn}
          >
            ✕
          </button>
        </div>
        <div className="bankroll-modal-body" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>

        {/* Step 1: Scan - camera captures first */}
        {scannerStep === 'scan' && (
          <div>
            <ReceiptScanner
              userId={userId}
              onPendingChange={setScannerHasUnsaved}
              resumeScan={resumingHeld}
              onHeld={({ held, dropped }) => {
                setScannerHasUnsaved(false);
                refreshHeldScans();
                // The player is told the true thing in both directions.
                // A hold that quietly forgets is the same bug as a scan
                // that quietly vanishes, so a dropped one is said out
                // loud rather than counted.
                if (dropped && dropped.length) {
                  toast.error(`No Room To Hold ${dropped.length} Older Scan${dropped.length === 1 ? '' : 's'}. File What Is Waiting.`);
                }
                toast.success(`Saved On This Device. ${held} Waiting For A Signal.`);
              }}
              onScanComplete={async ({ imageUrl, extractedData, route, documentType, imageHash, readOutcome, ocrConfidence }) => {
                setScannerHasUnsaved(false);
                // It has an image URL and a row is about to exist, so the
                // device copy has done its job. Released only here.
                if (resumingHeld) await releaseResumedScan();
                setScannerImageUrl(imageUrl);
                setScannerExtractedData(extractedData);
                setScannerRoute(route ? { ...route, documentType } : null);
                setScannerReceiptId(null);
                scannerImageHashRef.current = imageHash || null;
                capture(FunnelEvents.BANKROLL_RECEIPT_SCANNED, {
                  document_type: documentType || 'unknown',
                  destination: (route && route.destination) || 'manual',
                  auto_file: Boolean(route && route.autoFile),
                });
                // Shown, never acted on: the player decides whether this
                // is the same piece of paper.
                setScannerDuplicate(duplicateOf(imageHash, recentHashes));
                setReceiptSaving(true);
                setScannerStep('post-capture');
                // Rule 4: the row exists BEFORE a choice can be made. The
                // choices stay disabled until it does, and a failed
                // insert shows Retry Listing instead of a silent gap.
                scannerReadOutcomeRef.current = { outcome: readOutcome || null, ocrConfidence: ocrConfidence ?? null };
                const id = await saveReceiptRow({ imageUrl, extractedData, route, documentType, imageHash, readOutcome, ocrConfidence });
                setScannerReceiptId(id);
                setReceiptSaving(false);
                if (id) loadPendingReceipts();
              }}
            />
          </div>
        )}

        {/* Step 2: Post-capture - choose what to do */}
        {scannerStep === 'post-capture' && scannerImageUrl && (
          <div style={{ padding: 20 }}>
            {/* Receipt thumbnail */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img
                src={scannerImageUrl}
                alt="Receipt"
                style={{ maxWidth: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 8, border: '2px solid rgba(255,255,255,0.1)' }}
                loading="lazy" />
            </div>

            {/* What it was read as, so the choice below is already made
                for the common case instead of being asked cold. */}
            {scannerRoute && (
              <div style={{
                marginBottom: 16, padding: 12, borderRadius: 10,
                background: 'rgba(35,116,225,0.08)', border: '1px solid #2374e1',
              }}>
                <div style={{ color: '#edf6ff', fontSize: 15, fontWeight: 600 }}>{scannerRoute.summary}</div>
                <div style={{ color: '#92cfff', fontSize: 14, marginTop: 2 }}>{scannerRoute.label}</div>
              </div>
            )}

            {scannerDuplicate && (
              <div style={styles.receiptDuplicate} role="alert">
                <div style={{ color: '#94e7ff', fontSize: 14, fontWeight: 700 }}>You May Have Scanned This Before</div>
                <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 3 }}>
                  {scannerDuplicate.summary || 'A Receipt'}
                  {scannerDuplicate.created_at ? ` on ${new Date(scannerDuplicate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                  {scannerDuplicate.status === 'assigned' ? ', Already Filed' : ', Still Waiting'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 3 }}>
                  Nothing Was Changed. Carry On If This Is A Different Receipt.
                </div>
              </div>
            )}

            {!receiptSaving && !scannerReceiptId && (
              <div style={styles.receiptNotListed} role="alert">
                <div style={{ color: '#fca5a5', fontSize: 14, fontWeight: 600 }}>This Receipt Is Not Listed Yet</div>
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 2 }}>The Image Uploaded, But It Could Not Be Saved To Receipts Waiting.</div>
                <button type="button" onClick={retryReceiptListing} style={styles.receiptRetryBtn}>Retry Listing</button>
              </div>
            )}

            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginTop: 0, marginBottom: 20, textAlign: 'center' }}>
              {receiptSaving ? 'Saving This Receipt...' : 'What Would You Like To Do With This Receipt?'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {receiptActions(scannerRoute, {
                activeTrip: trips.find(t => t.status === 'active' && t.trip_type !== 'series') || null,
                openSession: findOpenSessionFor(scannerRoute, entries),
              }).map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={receiptBusy || receiptSaving}
                  onClick={() => handleReceiptAction(action.id)}
                  style={{
                    ...styles.scannerChoiceBtn,
                    ...(action.primary ? styles.scannerChoiceBtnPrimary : {}),
                    opacity: receiptBusy || receiptSaving ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: RECEIPT_TONE_COLORS[action.tone] || '#93c5fd', minWidth: 58 }}>{action.tone}</span>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontWeight: 600, color: '#fff', fontSize: 15 }}>{action.title}</div>
                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginTop: 2 }}>{action.detail}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Pick existing entry to attach receipt */}
        {scannerStep === 'pick-entry' && (
          <div style={{ padding: '0 16px 16px' }}>
            <button
              type="button"
              onClick={() => setScannerStep('post-capture')}
              style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 14, cursor: 'pointer', padding: '12px 4px', fontWeight: 500, minHeight: 44, touchAction: 'manipulation' }}
            >
              Back
            </button>
            {entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
                No Entries Yet. Create A New Expense Instead.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                {rankEntriesForReceipt(entries, scannerRoute).slice(0, 20).map((entry) => {
                  const isPositive = entry.net_result >= 0;
                  const dateStr = entry.entry_date
                    ? parseLedgerDay(entry.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '';
                  const LABELS = { cash: 'Cash Game', tournament: 'Tournament', expense: 'Expense', deposit: 'Deposit', withdrawal: 'Withdrawal', sports_bet: 'Sports Bet' };
                  return (
                    <button
                      key={entry.id}
                      onClick={() => attachScannerReceiptToEntry(entry)}
                      style={styles.scannerEntryBtn}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: isPositive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                          {isPositive ? '✓' : '−'}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {LABELS[entry.category] || entry.category}
                          </div>
                          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>
                            {dateStr}{entry.location_name ? ` · ${entry.location_name}` : ''}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 600, color: isPositive ? '#22c55e' : '#ef4444', flexShrink: 0, marginLeft: 8 }}>
                        {formatCurrencyWithSign(entry.net_result, preferences.currencyEUR)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
