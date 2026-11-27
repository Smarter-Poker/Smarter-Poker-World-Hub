import { useId, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './BankrollHelp.module.css';
import { SD_HEADER_HELP_ICON } from '../smarterdesign/headerHelp';

const guides = {
  jarvis: ['Select 7, 30 or 90 days to compare recorded gaming sessions. Refresh Analysis reads the current ledger for that window.', 'Open How These Figures Are Calculated for the definitions and exclusions.'],
  settings: ['Manage your bankroll display preferences and preferred currency.'],
  goals: ['Track your bankroll targets and review progress against each goal.'],
  rules: ['Review the bankroll limits and reminders you have configured.'],
  poker_cash: ['Review your cash sessions, including each buy-in, cash-out and recorded result.'],
  poker_mtt: ['Review your tournament entries, buy-ins, fees and recorded cashes.'],
  casino_table: ['Review recorded casino table sessions and their results.'],
  slots: ['Review your recorded slot sessions, amounts played and payouts.'],
  sports: ['Review recorded wagers and results for your sports betting activity.'],
  expense: ['Review recorded expenses and their effect on your ledger.'],
  dashboard: ['Use Add + to log play. Use Adjust Bankroll for deposits and withdrawals from outside play.', 'Open a tool to work in its own view. Return with Back To Dashboard. Jarvis Insights reviews your recorded sessions at the bottom of the dashboard.'],
  trips: ['Use Add + to create a trip. Open a trip to review or link its sessions.'],
  series: ['Use Add + to start a series and group its events. Open the series to review its results.'],
  players: ['Use Add + to save a player note. Choose an existing player to review their notes.'],
  'scan-receipt': ['Select an image or take a photo. Review its contents before saving the receipt.'],
  receipts: ['Open a saved receipt to review it. Use Add + to enter the receipt capture flow.'],
  projection: ['Set the assumptions, then run the projection. The results depend on the values you enter.'],
  staking: ['Use Add + to record a staking deal. Review the agreement and its settlement in Staking Tracker.'],
  tax: ['Choose a year and jurisdiction to view the estimate and quarterly results. Figures use the rates built into this estimator.', 'Use Itemized Deductions to model expenses. Export Tax Report saves a text summary. Your tax documents and W-2G entries are managed in the same view.'],
  'staking-profile': ['Choose which figures to include before sharing your performance. Check the preview to see what a recipient will see.'],
  'tournament-calendar': ['Choose a date to view events. Use Add + to add an event to your calendar.'],
  reports: ['Performance Reports summarizes session volume, profit and win rate. Choose CSV for spreadsheets, JSON for structured records, or PDF for a printable report.'],
  export: ['Choose CSV for spreadsheet rows, JSON for structured ledger records, or PDF for a printable report. Downloads require a connection.'],
  'toke-home': ['Shift Tracker records your shifts, downs and tokes. Analytics shows earnings and hourly trends.', 'Use Dealer Vault for licenses, pay stubs and tax documents. Open Venue Intel to compare venues and see your shift calendar.'],
  'dealer-reference': ['Ask a question about a game, a dealing procedure or a tournament rule. Your latest answer stays here while you ask a follow-up.', 'Open Earlier Questions for the recent answers in this visit. For a disputed ruling, call the floor.'],
  'toke-shift': ['Clock in to begin a shift. Use the live shift controls to record downs and tokes, then clock out at the end of your shift.'],
  'toke-analytics': ['Review your earnings, recorded shifts and hourly rates. Change the available filters to compare periods.'],
  'toke-vault': ['Manage dealer licenses, pay stubs and tax documents here. Select a document to view its details.'],
  'toke-venues': ['Compare your recorded venues and review scheduled shifts in the calendar.'],
};

export default function BankrollHelp({ title, section, faqs = [], children, onTutorial }) {
  const dialog = useRef(null);
  const launchTutorial = useRef(false);
  const trigger = useRef(null);
  const id = useId();
  const close = () => dialog.current?.close();
  const steps = guides[section] || (children ? [] : [`Review your ${title.toLowerCase()} here. Use the top actions to add supported records or return to the dashboard.`]);
  return (
    <>
      <button ref={trigger} type="button" className="sd-header-help" data-focus-custom="" aria-label={`Help For ${title}`} aria-haspopup="dialog" aria-controls={id}
        onClick={() => { if (!dialog.current.open) dialog.current.showModal(); }}>
        <img src={SD_HEADER_HELP_ICON} alt="" width="36" height="37" draggable={false} />
      </button>
      <dialog id={id} ref={dialog} className={styles.dialog} aria-labelledby={id + '-heading'}
        onClose={() => { trigger.current?.focus({ preventScroll: true }); if (launchTutorial.current) { launchTutorial.current = false; onTutorial?.(); } }}>
        <div className={styles.heading}>
          <h2 id={id + '-heading'}>{title} Help</h2>
          <button type="button" className={styles.close} aria-label="Close Help" onClick={close}><X size={20} aria-hidden="true" /></button>
        </div>
        <div className={styles.body}>
          {steps.map(step => <p key={step}>{step}</p>)}
          {onTutorial && <button type="button" className="sd-button" onClick={() => { launchTutorial.current = true; close(); }}>Page Tutorial</button>}
          {children}
          {faqs.length > 0 && <section aria-label="Frequently Asked Questions"><h3>Frequently Asked Questions</h3>{faqs.map(faq =>
            <details key={faq.question}><summary>{faq.question}</summary><p>{faq.answer}</p></details>)}</section>}
        </div>
      </dialog>
    </>
  );
}
