import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, LockKeyhole } from 'lucide-react';
import useVIPGate from '../../hooks/useVIPGate';
import { acquireScrollLock } from '../../lib/scrollLock';
import { getFreshAccessToken } from '../../lib/authUtils';
import VIPGateModal from '../ui/VIPGateModal';
import view from './JarvisLeakInsights.module.css';
import BankrollImageHeader from './BankrollImageHeader';
import { localDay } from '../../lib/bankroll/localDates.mjs';

const money = value => value == null ? 'Not Measured' : value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const date = iso => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T00:00:00Z'));

function Metric({ label, value, detail }) {
  return <div className={'sd-metric ' + view.metric}><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></div>;
}

function Results({ report }) {
  const { sample, window, metrics, formats, findings } = report;
  return <>
    <div className={view.source}>
      <strong>{date(window.start)} To {date(window.end)}</strong>
      <span>{sample.measured} Measured {sample.measured === 1 ? 'session' : 'sessions'} · USD</span>
    </div>
    {report.state === 'empty' ? <p role="status">No Gaming Sessions Were Logged For These Dates. Choose A Longer Period Or Log A Session In Bankroll.</p> : <>
      {report.state === 'incomplete' && <p className={view.notice}>{sample.missing} Of {sample.eligible} Entries Have No Usable Result. Totals Below Cover The {sample.measured} Measured Sessions.</p>}
      {report.state === 'small' && <p className={view.notice}>This Window Has Fewer Than {sample.minimumComparison} Sessions. The Figures Describe Those Sessions Only.</p>}
      <dl className={view.metrics}>
        <Metric label="Session Net" value={money(metrics.netPL)} detail="Cash-outs less buy-ins" />
        <Metric label="Winning Sessions" value={metrics.winRate == null ? 'Not Measured' : metrics.winRate + '%'} detail={metrics.wins + ' won · ' + metrics.losses + ' lost · ' + metrics.even + ' even'} />
        <Metric label="Net Per Hour" value={money(metrics.hourlyRate)} detail={metrics.timedSessions ? money(metrics.timedNet) + ' over ' + metrics.hours.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' logged hours' : 'No complete session times'} />
        <Metric label="Daily Drawdown" value={money(metrics.dailyDrawdown)} detail="Largest decline from a daily closing peak" />
      </dl>
      {formats.length > 0 && <section className={view.section}>
        <h3>Results By Format</h3>
        <ul className={view.formats}>{formats.map(item => <li key={item.name}>
          <span>{item.name}<small>{item.sessions} {item.sessions === 1 ? 'session' : 'sessions'}</small></span><strong>{money(item.net)}</strong>
        </li>)}</ul>
      </section>}
      {findings.length > 0 && <section className={view.section}><h3>What To Review</h3>
        <ul className={view.findings}>{findings.map(item => <li key={item.title}>
          <strong>{item.title}</strong><p>{item.evidence}</p><p>{item.action}</p>
        </li>)}</ul>
      </section>}
    </>}
    <details className={view.method}><summary>How These Figures Are Calculated</summary>
      <p>The Analysis Uses Your Cash Game, Tournament, Casino Table, Slot And Sports Entries Dated Within The Selected Calendar Days, Ending Today On Your Own Calendar. It Excludes Deposits, Withdrawals, Expenses And Superseded Entries.</p>
      <p>Winning Percentage Counts Profitable Sessions Divided By Sessions With A Recorded Result. Hourly Results Use Earnings And Time From The Same Timed Sessions. Drawdown Starts At Zero And Follows Each Day’s Closing Net.</p>
      <p>Period Comparisons Require At Least {sample.minimumComparison} Measured Sessions In Both This Window And The Preceding {window.days} Days, With Complete Results In Both.</p>
    </details>
  </>;
}

function OwnerInsights({ userId }) {
  const { allowed, loading: checkingAccess, showUpgradeModal, upgradeModalVisible, hideUpgradeModal, featureConfig } = useVIPGate('bankroll-manager');
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(90);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const dialogRef = useRef(null);
  const initialFocusRef = useRef(null);
  const launcherRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !allowed || !dialog) return;
    const launcher = launcherRef.current;
    const releaseScroll = acquireScrollLock('JarvisInsights');
    dialog.showModal();
    initialFocusRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
      releaseScroll();
      launcher?.focus({ preventScroll: true });
    };
  }, [open, allowed]);
  useEffect(() => {
    if (!allowed || !open) return;
    const controller = new AbortController();
    const active = () => !controller.signal.aborted;
    async function load() {
      try {
        const token = await getFreshAccessToken();
        if (!active()) return;
        if (!token) throw new Error('Sign in to review your ledger.');
        const response = await fetch('/api/jarvis/bankroll-analysis', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          cache: 'no-store', signal: controller.signal, body: JSON.stringify({ days, today: localDay() }),
        });
        const data = await response.json();
        if (!response.ok || !data.success || !data.insights) throw new Error(data.error || 'Your ledger analysis is unavailable.');
        if (active()) setResult({ days, revision, report: data.insights });
      } catch (error) {
        if (active()) setResult({ days, revision, error: error.message || 'Your ledger analysis is unavailable.' });
      }
    }
    load();
    return () => controller.abort();
  }, [userId, days, revision, open, allowed]);
  const current = result?.days === days && result.revision === revision ? result : null;
  const refresh = () => setRevision(n => n + 1);
  return <>
    <button type="button" ref={launcherRef} className={'sd-button ' + view.launcher} disabled={checkingAccess} aria-haspopup="dialog"
      onClick={() => { if (!allowed) { showUpgradeModal(); return; } refresh(); setOpen(true); }}>
      <img src="/images/smarterdesign/jarvis-insights.webp" alt="" width="192" height="96" />
      <span className={view.launchCopy}><strong>Jarvis Insights</strong><span>Review Session Results, Hourly Earnings And Drawdowns.</span></span>
      {allowed ? <ChevronRight aria-hidden="true" size={21} /> : <LockKeyhole aria-hidden="true" size={17} />}
    </button>
    <VIPGateModal visible={upgradeModalVisible} onClose={hideUpgradeModal} featureName="Jarvis Insights" featureConfig={featureConfig} />
    {open && allowed && createPortal(<dialog className={'smarterdesign ' + view.sheet}
      aria-labelledby="bankroll-insights-title" ref={dialogRef}
      onCancel={event => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        setOpen(false);
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false);
      }}>
        <BankrollImageHeader title="Jarvis Insights" art="jarvis" heading="h2" titleId="bankroll-insights-title" className={view.titlebar}>
          <button className="sd-button" ref={initialFocusRef} type="button" onClick={() => setOpen(false)} aria-label="Close Jarvis Insights">Close</button>
        </BankrollImageHeader>
        <div className={view.content}>
          <div className={'sd-tabs ' + view.windows} role="group" aria-label="Analysis Window">
            {[7, 30, 90].map(period => <button key={period} type="button" aria-pressed={days === period} onClick={() => setDays(period)}>{period} Days</button>)}
          </div>
          {current?.error ? <div role="alert" className={view.notice}><p>{current.error}</p><button type="button" className="sd-button" onClick={refresh}>Retry</button></div>
            : current?.report ? <Results report={current.report} /> : <p role="status">Reading Your Session Ledger…</p>}
          {current?.report && <button type="button" className="sd-button" onClick={refresh}>Refresh Analysis</button>}
        </div>
    </dialog>, document.body)}
  </>;
}

// Remount the entire private view when the verified account changes.
export default function JarvisLeakInsights({ userId }) {
  return userId ? <OwnerInsights key={userId} userId={userId} /> : null;
}
