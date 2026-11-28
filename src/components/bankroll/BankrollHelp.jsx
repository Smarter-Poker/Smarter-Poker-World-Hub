import { useId, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './BankrollHelp.module.css';
import { SD_HEADER_HELP_ICON } from '../smarterdesign/headerHelp';

const guides = {
  jarvis: ['Select 7, 30 or 90 days to compare recorded gaming sessions. Refresh Analysis reads the current ledger for that window.', 'Amounts follow Display EUR in Settings. Open How These Figures Are Calculated for the definitions and exclusions.'],
  settings: ['Display EUR shows balances, results, totals and averages in euros at the reference rate shown under it. Tax Reports, exports and the entry forms stay in US dollars and say so.', 'Venue Alerts reminds you to log a session when you arrive at a saved venue. Manage Venues edits the venues you have saved.'],
  goals: ['Track your bankroll targets and review progress against each goal.'],
  rules: ['Review the bankroll limits and reminders you have configured.'],
  badges: ['Badges are earned from your recorded gaming sessions: how many you log, wins and winning streaks, winning months, timed hours, completed trips and W-2G forms kept in Tax Reports. Deposits, withdrawals, expenses and corrected entries never count.'],
  poker_cash: ['Review your cash sessions, including each buy-in, cash-out and recorded result.'],
  poker_mtt: ['Review your tournament entries, buy-ins, fees and recorded cashes.'],
  casino_table: ['Review recorded casino table sessions and their results.'],
  slots: ['Review your recorded slot sessions, amounts played and payouts.'],
  sports: ['Review recorded wagers and results for your sports betting activity.'],
  expense: ['Review recorded expenses and their effect on your ledger.'],
  dashboard: ['Use Add + to log a session or an expense. Use Adjust Bankroll for deposits and withdrawals from outside play.', 'Every tool in the section grid, including Leak Analysis and Hand Review, opens in its own view with its own address. Return with Back To Dashboard. Jarvis Insights reviews your recorded sessions at the bottom of the dashboard.'],
  trips: ['Use Add + to create a trip. Open a trip to review or link its sessions.', 'A trip counts both its first and last day, so a trip from Friday to Sunday is three days long.'],
  series: ['Use Add + to start a series and group its events. Open the series to review its results.'],
  leaks: ['Leak Analysis reads every recorded session for stakes, times of day, non-poker play and trip costs that are costing you money. The Location filter on the dashboard narrows it to one venue.', 'Each finding shows what it cost and what to change. It updates when you log, edit or delete an entry.'],
  'hand-review': ['Link a hand you analysed in Training to the bankroll session it was played in. Search your recent hands, choose one, then choose its session.'],
  players: ['Use Add + to save a player note. Choose an existing player to review their notes.'],
  'scan-receipt': ['Select an image or take a photo, then check what was read before you file it.', 'A W-2G is offered for the W-2G Vault in Tax Reports. A buy-in is logged as a session on your active trip, and a trip is started for it if none is active. An expense goes to your Expenses list.', 'Every scan is saved as soon as it is read. Anything you have not filed stays under Receipts Waiting on the dashboard until you assign it.'],
  receipts: ['Open a saved receipt to review it. Use Add + to scan another.', 'A receipt you have not filed yet stays under Receipts Waiting on the dashboard until you assign it.'],
  projection: ['Set the assumptions, then run the projection. The results depend on the values you enter.'],
  staking: ['Use Add + to record a staking deal. Only poker cash games and tournaments can be linked to a deal.', 'Makeup is replayed in the order the sessions were played, not the order they were linked, so linking an older session recalculates the shares after it.'],
  tax: ['Choose a year and jurisdiction to view the estimate and quarterly results. Figures use the rates built into this estimator and are always in US dollars, whatever Display EUR is set to.', 'Use Itemized Deductions to model expenses. Export Tax Report saves a text summary. Your tax documents and the W-2G Vault are managed in the same view.'],
  'staking-profile': ['Choose which figures to include before sharing your performance. The figures cover poker cash games and tournaments only. Check the preview to see what a recipient will see.'],
  'tournament-calendar': ['Choose a date to view events. Use Add + to add an event to your calendar.'],
  reports: ['Performance Reports summarizes session volume, profit and win rate for the Location and Time filters set on the dashboard, and follows Display EUR.', 'Choose CSV for spreadsheets, JSON for structured records, or PDF for a printable report. Exports are in US dollars.'],
  export: ['Choose CSV for spreadsheet rows, JSON for structured ledger records, or PDF for a printable report. Exports are in US dollars. Downloads require a connection.'],
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
