/**
 * WHAT STAKES CAN I AFFORD
 * The dashboard card and the Run Projections section. The math lives in
 * src/lib/bankroll/stakeAffordability.mjs; this reads the player's own poker
 * sessions and Bankroll Rules and shows the answer.
 */

import { useEffect, useMemo, useState } from 'react';
import { Scale } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency, formatCurrencyWithSign } from '../../lib/bankroll/currencyUtils';
import {
  FLOOR_CASH_BUYINS,
  HORIZON_HOURS,
  MIN_STAKE_SESSIONS,
  howItWorks,
  loadAffordabilityRows,
  shortOdds,
  stakeAffordability,
} from '../../lib/bankroll/stakeAffordability.mjs';
import styles from './StakeAffordability.module.css';

function riskLine(level) {
  if (level.decidedBy === 'rule') return 'Over Your Max Buy-In Rule';
  if (level.decidedBy === 'floor') return `Under ${FLOOR_CASH_BUYINS} Buy-Ins · Over ${HORIZON_HOURS} Hours: ${shortOdds(level.rorHorizon)}`;
  if (!level.enoughData) return `${level.timedSessions} Of ${MIN_STAKE_SESSIONS} Timed Sessions Needed`;
  return `Risk Of Ever Going Broke: ${shortOdds(level.ror)} · Over ${HORIZON_HOURS} Hours: ${shortOdds(level.rorHorizon)}`;
}

/**
 * @param {{ userId: string, bankroll: number|null, displayEUR?: boolean,
 *   refreshKey?: any, variant?: 'card'|'section', rows?: Array, rules?: Array }} props
 *   bankroll is the Bankroll Balance in US dollars, null while unknown.
 *   rows/rules may be passed directly (tests and previews); otherwise read.
 */
export default function StakeAffordability({ userId, bankroll, displayEUR = false, refreshKey, variant = 'card', rows: givenRows, rules: givenRules }) {
  const [data, setData] = useState(givenRows ? { rows: givenRows, rules: givenRules || [] } : null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (givenRows) { setData({ rows: givenRows, rules: givenRules || [] }); return undefined; }
    if (!userId) return undefined;
    let cancelled = false;
    setError(null);
    loadAffordabilityRows(supabase, userId)
      .then((loaded) => { if (!cancelled) setData(loaded); })
      .catch((err) => {
        console.warn('[StakeAffordability]', err);
        if (!cancelled) setError('Could Not Read Your Sessions. Check Your Connection.');
      });
    return () => { cancelled = true; };
  }, [userId, refreshKey, givenRows, givenRules]);

  const answer = useMemo(
    () => (data ? stakeAffordability({ rows: data.rows, bankroll, rules: data.rules, displayEUR }) : null),
    [data, bankroll, displayEUR],
  );
  const money = (value) => formatCurrency(value, displayEUR);

  return (
    <section
      className={`${styles.card} ${variant === 'section' ? styles.flat : ''}`}
      aria-label="What Stakes Can I Afford"
      data-testid="stake-affordability"
    >
      <h3>
        <Scale aria-hidden size={18} />
        What Stakes Can I Afford
      </h3>
      {error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : !answer ? (
        <p className={styles.muted}>Reading Your Sessions…</p>
      ) : (
        <>
          <p className={styles.answer}>{answer.sentence}</p>
          {answer.tournaments && <p className={styles.secondary}>{answer.tournaments.sentence}</p>}

          {answer.levels.length > 0 && (
            <ol className={styles.levels} aria-label="Stakes You Have Played">
              {answer.levels.map((level) => (
                <li key={level.key}>
                  <div className={styles.row}>
                    <strong>{level.label}</strong>
                    <span className={`${styles.badge} ${level.supported ? styles.yes : styles.no}`}>
                      {level.supported ? 'Supported' : 'Not Yet'}
                    </span>
                  </div>
                  <div className={styles.facts}>
                    <span>{level.sessions} {level.sessions === 1 ? 'Session' : 'Sessions'}</span>
                    {level.hourly !== null && (
                      <span className={level.hourly >= 0 ? styles.gain : styles.loss}>
                        {formatCurrencyWithSign(level.hourly, displayEUR) + '/hr'}
                      </span>
                    )}
                    {level.sdHourly !== null && <span>{'SD ' + money(level.sdHourly) + '/hr'}</span>}
                    {level.buyInsHeld !== null && (
                      <span>{Math.floor(level.buyInsHeld * 10) / 10} Buy-Ins Of {money(level.buyIn)}</span>
                    )}
                  </div>
                  <div className={styles.facts}><span>{riskLine(level)}</span></div>
                </li>
              ))}
            </ol>
          )}

          {answer.notes.map((note) => <p key={note} className={styles.muted}>{note}</p>)}

          <details className={styles.how}>
            <summary>How This Is Worked Out</summary>
            <ul>
              {howItWorks({
                bankrollText: bankroll !== null && bankroll !== undefined && Number.isFinite(Number(bankroll)) ? money(bankroll) : null,
                rulePercent: answer.rulePercent,
              }).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
