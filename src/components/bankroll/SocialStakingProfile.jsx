import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Copy, Link as LinkIcon, SlidersHorizontal, X } from 'lucide-react';
import { safeCopyToClipboard } from '../../lib/clipboard';
import { supabase } from '../../lib/supabase';
import { sessionSummary, sortedSessions, netCents } from '../../lib/bankroll/analyticsView.mjs';
import { money, tone } from './analyticsDisplay';
import styles from './BankrollAnalytics.module.css';

const fields = [
  ['roi', 'ROI'],
  ['winRate', 'Win Rate'],
  ['count', 'Sessions'],
  ['mean', 'Average Session'],
  ['net', 'Net Result'],
  ['streak', 'Winning Streak'],
  ['graph', 'Result Trend'],
];
const defaults = {
  roi: true,
  winRate: true,
  count: true,
  mean: true,
  net: true,
  streak: false,
  graph: true,
};
const keyFor = (id) => 'bankroll.stats-card.fields.' + id;

function ResultGraph({ points }) {
  const all = [0, ...points],
    low = all.reduce((a, b) => Math.min(a, b), 0),
    high = all.reduce((a, b) => Math.max(a, b), 0);
  const y = (n) => (high === low ? 25 : 46 - ((n - low) * 42) / (high - low));
  const coordinates = all
    .map((n, i) => 2 + (i * 296) / Math.max(1, all.length - 1) + ',' + y(n))
    .join(' ');
  return (
    <svg
      viewBox="0 0 300 50"
      preserveAspectRatio="none"
      role="img"
      aria-label="Running Net Across Recorded Sessions"
    >
      <line x1="2" y1={y(0)} x2="298" y2={y(0)} stroke="#627e98" strokeDasharray="3 5" />
      <polyline
        points={coordinates}
        fill="none"
        stroke="#77d7ff"
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ProfileCard({ entries, user, displayEUR, onClose }) {
  const [shown, setShown] = useState(defaults);
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const copyPending = useRef(false);
  const profileId = user?.id;
  const alias =
    user?.username ||
    user?.user_metadata?.poker_alias ||
    user?.display_name ||
    user?.user_metadata?.full_name ||
    'Player';
  const avatar = user?.user_metadata?.avatar_url || user?.avatar_url;
  const summary = useMemo(() => sessionSummary(entries), [entries]);
  const points = useMemo(() => {
    let net = 0;
    return sortedSessions(entries).map((e) => (net += netCents(e)));
  }, [entries]);
  useEffect(() => {
    if (!profileId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(keyFor(profileId)) || 'null');
      if (saved) {
        setShown(
          Object.fromEntries(
            fields.map(([k]) => [k, typeof saved[k] === 'boolean' ? saved[k] : defaults[k]])
          )
        );
      }
    } catch {
      /* Keep this session's choices if storage is unavailable. */
    }
  }, [profileId]);
  function toggle(key) {
    const next = { ...shown, [key]: !shown[key] };
    setShown(next);
    setFeedback('');
    if (profileId)
      try {
        localStorage.setItem(keyFor(profileId), JSON.stringify(next));
      } catch {
        /* Current card still honors the selection. */
      }
  }
  const amounts = {
    roi: summary.roi === null ? 'N/A' : summary.roi.toFixed(1) + '%',
    winRate: summary.winRate === null ? 'N/A' : summary.winRate.toFixed(1) + '%',
    count: summary.count.toLocaleString(),
    mean: money(summary.mean, displayEUR, true),
    net: money(summary.count ? summary.net : null, displayEUR, true),
    streak: summary.streak + ' ' + (summary.streak === 1 ? 'Win' : 'Wins'),
  };
  async function copy(kind) {
    if (copyPending.current) return;
    copyPending.current = true;
    setBusy(true);
    setFeedback('');
    try {
      let text;
      if (kind === 'link') {
        if (!profileId) throw Error('Sign In To Copy Your Public Profile Link.');
        const { data, error } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', profileId)
          .maybeSingle();
        if (error || !data?.username) throw Error('Your Public Profile Link Is Unavailable.');
        text = new URL('/u/' + encodeURIComponent(data.username), window.location.origin).href;
      } else {
        const lines = fields
          .filter(([key]) => key !== 'graph' && shown[key])
          .map(([key, label]) => label + ': ' + amounts[key]);
        if (shown.graph && points.length)
          lines.push(
            'Result Trend: ' +
              money(0, displayEUR) +
              ' → ' +
              money(points[points.length - 1], displayEUR, true)
          );
        text = [alias + ' · Staking Profile', ...lines].join('\n');
      }
      if (!(await safeCopyToClipboard(text)))
        throw Error('Clipboard Access Was Unavailable. Select And Copy The Card Text.');
      setFeedback(kind === 'link' ? 'Public Profile Link Copied.' : 'Selected Stats Card Copied.');
    } catch (error) {
      setFeedback(error.message || 'Unable To Copy. Please Try Again.');
    } finally {
      copyPending.current = false;
      setBusy(false);
    }
  }
  const selected = fields.filter(([key]) => key !== 'graph' && shown[key]);
  return (
    <section className={'sd-panel ' + styles.profile} aria-label="Staking Profile Card">
      <header className={styles.profileHead}>
        <div className={styles.identity}>
          {avatar ? (
            <img alt="" src={avatar} />
          ) : (
            <span aria-hidden>{Array.from(alias)[0]?.toUpperCase()}</span>
          )}
          <div>
            <small>Staking Profile</small>
            <h2>{alias}</h2>
          </div>
        </div>
        {onClose && (
          <button
            className={styles.iconButton}
            type="button"
            aria-label="Close Staking Profile"
            onClick={onClose}
          >
            <X size={19} aria-hidden />
          </button>
        )}
      </header>
      {profileId ? (
        <>
          <dl className={styles.profileNumbers}>
            {selected.map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd
                  className={['roi', 'mean', 'net'].includes(key) ? tone(summary[key]) : styles.neutral}
                >
                  {amounts[key]}
                </dd>
              </div>
            ))}
          </dl>
          {shown.graph && points.length > 0 && (
            <div className={styles.profileChart}>
              <div>
                <small>Result Trend</small>
                <strong className={tone(summary.net)}>{money(summary.net, displayEUR, true)}</strong>
              </div>
              <ResultGraph points={points} />
            </div>
          )}
          {!selected.length && (!shown.graph || !points.length) && (
            <p className={styles.empty}>Select A Figure To Include In Your Stats Card.</p>
          )}
          <div className={styles.privacy}>
            <h3>
              <SlidersHorizontal size={17} aria-hidden />
              Stats Card Privacy
            </h3>
            <p>Choose The Figures Included When You Copy Your Card.</p>
            <div className={styles.choices}>
              {fields.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={shown[key]} onClick={() => toggle(key)}>
                  <span className={styles.check} aria-hidden>
                    {shown[key] && <Check size={13} />}
                  </span>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className="sd-button sd-primary"
              disabled={busy || (!selected.length && (!shown.graph || !points.length))}
              onClick={() => copy('stats')}
            >
              <Copy size={16} aria-hidden />
              Copy Stats Card
            </button>
            <button type="button" className="sd-button" disabled={busy} onClick={() => copy('link')}>
              <LinkIcon size={16} aria-hidden />
              Copy Public Profile Link
            </button>
          </div>
          <p className={styles.status} role="status">
            {feedback}
          </p>
        </>
      ) : (
        <p className={styles.empty}>Sign In To View And Share Your Staking Profile.</p>
      )}
    </section>
  );
}

export default function SocialStakingProfile({ entries = [], user, displayEUR = false, onClose }) {
  return (
    <ProfileCard
      key={user?.id || 'guest'}
      entries={entries}
      user={user}
      displayEUR={displayEUR}
      onClose={onClose}
    />
  );
}
