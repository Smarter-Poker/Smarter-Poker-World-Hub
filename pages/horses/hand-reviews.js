/**
 * HORSE HAND REVIEWS (Dan 2026-08-26)
 *
 * Admin dashboard for the 20bb flag system: every hand where a horse won or
 * lost 20bb+ is captured at settlement by the Club Arena engine
 * (server/src/services/HorseHandReview.ts) with leak tags attached, and
 * reviewed here. Data comes from two SECURITY DEFINER RPCs
 * (ca_horse_review_summary, ca_horse_hand_reviews), both gated server-side
 * on fn_is_horse_admin() - the client-side role check below is UX, not
 * security.
 */
import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getFreshAccessToken } from '../../src/lib/authUtils';
import { useRouter } from 'next/router';
import { T, toCsv, downloadCsv, stampedName } from '../../src/lib/horsesAdminTokens';
import { operatorGate } from '../../src/components/horses/operatorAdmin';
import styles from './horses.module.css';

/* COLOUR. Every value is a token from T, resolved by the custom properties
   horses.module.css declares on `.tokenScope` - which is on every root this
   file can return, so a new root needs the class or it renders uncoloured.

   Dan 2026-08-26: no purples, no greens - cyan is the accent AND the
   positive/win colour. This page used the zinc scale plus a green for wins,
   which matched nothing else on the platform. T.positive is deliberately an
   alias of T.accent in the stylesheet so a later edit cannot reintroduce
   green by reaching for a plausible "success" name. T.muted replaces the old
   body-copy grey, which measured 3.67:1 on the panel and failed WCAG AA. */

// Screen-reader-only, for table captions and any label that must exist in the
// accessibility tree without occupying layout.
const SR_ONLY = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0,0,0,0)',
  whiteSpace: 'nowrap',
  border: 0,
};

// This page is inline-styled, and inline styles cannot express a media query
// or :focus-visible. One small stylesheet covers the responsive padding and
// the "push to the right on desktop only" behaviour that was breaking the
// layout at 375px.
const PAGE_CSS = `
.hr-page { max-width: 1280px; margin: 0 auto; padding: 2rem; }
.hr-push { margin-left: auto; }
.hr-row-btn {
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.hr-root button:focus-visible,
.hr-root select:focus-visible,
.hr-root input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (max-width: 640px) {
  .hr-page { padding: 1rem 0.75rem 2.5rem; }
  .hr-push { margin-left: 0; }
}
`;

const VARIANTS = ['', 'nlh', 'plo4', 'plo5', 'plo6', 'plo8', 'short_deck', 'pineapple'];
const FORMATS = ['', 'cash', 'hu_cash', 'tournament'];
const PAGE_SIZE = 50;

// ── CSV export ─────────────────────────────────────────────────────────────
/**
 * Every table on this page can be taken out to a spreadsheet.
 *
 * Columns are declared as explicit [key, header] pairs rather than "whatever
 * the RPC returned", so a new column appearing upstream cannot silently
 * change the shape of a file someone has built a sheet around. The export is
 * always of the rows the caller passes, which is the set on screen: a button
 * that quietly exported something other than what is rendered would be worse
 * than no button.
 */
function ExportCsvButton({ rows, columns, filePrefix, label }) {
  const count = Array.isArray(rows) ? rows.length : 0;
  return (
    <button
      type="button"
      disabled={count === 0}
      onClick={() => downloadCsv(stampedName(filePrefix), toCsv(rows, columns))}
      style={{
        background: count === 0 ? 'transparent' : T.accentSoft,
        color: count === 0 ? T.muted : T.accent,
        border: `1px solid ${count === 0 ? T.line : T.accentLine}`,
        borderRadius: 4,
        padding: '0.35rem 0.75rem',
        minHeight: 44,
        fontSize: '0.78rem',
        fontWeight: 700,
        cursor: count === 0 ? 'not-allowed' : 'pointer',
      }}
    >
      {label || `Export CSV (${count})`}
    </button>
  );
}

/** Objects and arrays flatten to JSON inside a cell; toCsv quotes them. */
const AUDIT_COLUMNS = [
  ['day', 'Day'],
  ['findings', 'Findings'],
  ['stats', 'Stats'],
  ['agent_analysis', 'Claude Analysis'],
  ['agent_analyzed_at', 'Claude Analyzed At'],
];
const TELEMETRY_COLUMNS = [
  ['day', 'Day'],
  ['feature', 'Layer'],
  ['fires', 'Fires'],
];
// 2026-09-04 (Phase 1 of the horse real-time build plan): the Data Ledger.
// Every input the brain consumes, from server/src/engine/HorseDataLedger.ts,
// joined to yesterday's telemetry. "Proven" is the receipt: yes = fired,
// NO = registered consumer with a big denominator and zero fires (the daily
// audit raises data_unread for it), quiet = denominator too small to judge,
// mix = depends on table mix, n/a = not a receipt row, legacy = a table
// nobody reads.
const LEDGER_COLUMNS = [
  ['kind', 'Kind'],
  ['name', 'Datum'],
  ['cadence', 'Cadence'],
  ['source', 'Source'],
  ['consumer', 'Consumer'],
  ['fires', 'Fires'],
  ['ratio', 'Ratio'],
  ['min_ratio', 'Expected'],
  ['proven', 'Proven'],
  ['since', 'Since'],
  ['note', 'Note'],
];
const LEAGUE_COLUMNS = [
  ['run_date', 'Run'],
  ['matchup', 'Matchup'],
  ['bb100', 'BB Per 100'],
  ['stderr', 'Stderr'],
  ['verdict', 'Verdict'],
  ['illegal_actions', 'Illegal Actions'],
];
const TREND_COLUMNS = [
  ['day', 'Day'],
  ['tag', 'Tag'],
  ['n', 'Tagged Hands'],
  ['hands', 'Captured Hands'],
  ['rate_per_1000', 'Rate Per 1000 Hands'],
];
/* 2026-09-05: the three cards below surface work that had no reader on this
   page at all. 66% of horse play is tournaments and the panel could not show
   a single result; the frequency leaks are the ones no 20bb hand tag can see;
   and the solver agreement is the only ABSOLUTE score the platform produces -
   the league card above it measures one config against another and can never
   say whether either plays well. */
/* A rate stored 0..1, shown as a percent. Null and undefined are a real
   answer here - fn_horse_frequency_leaks returns null for a rate whose
   denominator was too small to mean anything, and a dash says that where a
   0% would be a lie. */
function pct(v) {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? '-' : `${(n * 100).toFixed(1)}%`;
}

const TOURNAMENT_COLUMNS = [
  ['tournament_type', 'Type'],
  ['variant', 'Variant'],
  ['entries', 'Entries'],
  ['invested', 'Invested'],
  ['won', 'Won'],
  ['roi_pct', 'ROI Percent'],
  ['itm_pct', 'In The Money Percent'],
  ['avg_finish_pct', 'Average Finish'],
  ['horses', 'Horses'],
];
const FREQUENCY_COLUMNS = [
  ['alias', 'Horse'],
  ['hands', 'Hands'],
  ['vpip', 'VPIP'],
  ['pfr_of_vpip', 'PFR Of VPIP'],
  ['three_bet', 'Three Bet'],
  ['fold_to_3bet', 'Fold To Three Bet'],
  ['wwsf', 'Won When Saw Flop'],
  ['af', 'Aggression Factor'],
  ['leaks', 'Leaks'],
];
const AGREEMENT_COLUMNS = [
  ['run_date', 'Run'],
  ['reference', 'Reference'],
  ['spots', 'Spots'],
  ['agreement', 'Agreement'],
  ['pure_misses', 'Pure Misses'],
];
const FLEET_COLUMNS = [
  ['alias', 'Horse'],
  ['horse_user_id', 'Horse User Id'],
  ['big_wins', 'Big Wins'],
  ['big_losses', 'Big Losses'],
  ['sum_net_bb', 'Net BB'],
  ['leak_counts', 'Leak Tags'],
];
const HAND_COLUMNS = [
  ['played_at', 'When'],
  ['horse_user_id', 'Horse User Id'],
  ['game_variant', 'Variant'],
  ['format', 'Format'],
  ['net_bb', 'Net BB'],
  ['big_blind', 'Big Blind'],
  ['pot_size', 'Pot Size'],
  ['hole_cards', 'Hole Cards'],
  ['board', 'Board'],
  ['leak_tags', 'Leak Tags'],
  ['hand_id', 'Hand Id'],
];

/**
 * The league card's verdict, in one place so the table and the CSV can never
 * disagree.
 *
 * An INERT matchup is not an unresolved one. bb/100 of exactly 0 with a
 * stderr of exactly 0 over a full sample does not mean "too close to call" -
 * it means the two arms played IDENTICALLY, so the flag under test never
 * changed a decision. That is how v18_squeeze_response read for six days
 * while the layer it measures had never once fired, and it rendered as an
 * unremarkable "Not Resolved".
 *
 * A zero stderr with a non-zero edge is also not certainty, it is a
 * degenerate sample. Requiring a positive stderr keeps "Significant" meaning
 * what the house rule says it means: the edge beats twice its own noise.
 */
function leagueState(m) {
  const bb = Number(m.bb100);
  const se = Number(m.stderr);
  const inert = bb === 0 && se === 0;
  const sig = !inert && se > 0 && Math.abs(bb) > 2 * se;
  return { bb, se, inert, sig, pos: bb > 0 };
}

function leagueVerdict(m) {
  const { inert, sig, pos } = leagueState(m);
  if (inert) return 'Inert - Both Arms Identical';
  if (!sig) return 'Not Resolved';
  return pos ? 'Significant Positive' : 'Significant Negative';
}

const SUIT_GLYPH = { hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' };
// Club Arena's canonical deck is two-colour (src/styles/club-engine.css:52-55).
// The suit letter renders beside the rank, so hearts and diamonds stay
// distinguishable without a third and fourth hue.
const SUIT_COLOR = { hearts: T.danger, diamonds: T.danger, clubs: T.text, spades: T.text };

function CardChip({ card }) {
  if (!card) return null;
  let rank, suit;
  if (typeof card === 'string') {
    suit = Object.keys(SUIT_GLYPH).find((s) => card.endsWith(s));
    rank = suit ? card.slice(0, card.length - suit.length) : card;
  } else {
    rank = card.rank;
    suit = card.suit;
  }
  if (rank === 'T') rank = '10';
  return (
    <span
      style={{
        display: 'inline-block',
        background: T.inset,
        border: `1px solid ${T.line}`,
        borderRadius: 4,
        padding: '2px 6px',
        marginRight: 4,
        fontWeight: 700,
        color: SUIT_COLOR[suit] || T.text,
        fontSize: '0.85rem',
      }}
    >
      {rank}
      {SUIT_GLYPH[suit] || ''}
    </span>
  );
}

function TagChip({ tag }) {
  // Tags only exist on losses (wins are stored untagged), so every chip is a
  // leak chip.
  return (
    <span
      style={{
        display: 'inline-block',
        background: T.dangerWash,
        color: T.danger,
        border: `1px solid ${T.dangerLine}`,
        borderRadius: 4,
        padding: '2px 8px',
        marginRight: 4,
        marginBottom: 2,
        fontSize: '0.75rem',
      }}
    >
      {tag}
    </span>
  );
}

function HandDetail({ row }) {
  const actions = Array.isArray(row.actions) ? row.actions : [];
  const stages = ['preflop', 'flop', 'turn', 'river'];
  return (
    <div style={{ background: T.inset, border: `1px solid ${T.line}`, borderRadius: 6, padding: '0.75rem 1rem', margin: '0.5rem 0' }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: T.muted, marginRight: 8 }}>Hole Cards:</span>
        {(row.hole_cards || []).map((c, i) => (
          <CardChip key={i} card={c} />
        ))}
        <span style={{ color: T.muted, margin: '0 8px 0 16px' }}>Board:</span>
        {(row.board || []).map((c, i) => (
          <CardChip key={i} card={c} />
        ))}
      </div>
      {stages.map((st) => {
        const acts = actions.filter((a) => a.stage === st);
        if (acts.length === 0) return null;
        return (
          <div key={st} style={{ fontSize: '0.8rem', color: T.muted, marginBottom: 2 }}>
            <span style={{ color: T.text, fontWeight: 600, textTransform: 'capitalize', marginRight: 6 }}>{st}:</span>
            {acts
              .map(
                (a) =>
                  `${a.userId === row.horse_user_id ? 'HERO' : `seat ${a.seat}`} ${a.action}${a.amount ? ` ${a.amount}` : ''}`
              )
              .join(' / ')}
          </div>
        );
      })}
      <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 6 }}>
        Hand {row.hand_id} - Pot {row.pot_size ?? '?'} - BB {row.big_blind}
      </div>
    </div>
  );
}

export default function HorseHandReviews() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);

  const [audits, setAudits] = useState([]);
  const [auditsError, setAuditsError] = useState(null);
  const [roleError, setRoleError] = useState(null);
  const [auditOpen, setAuditOpen] = useState(null);

  const [telemetry, setTelemetry] = useState([]);
  const [telemetryError, setTelemetryError] = useState(null);
  const [telemetryOpen, setTelemetryOpen] = useState(false);
  // 2026-08-28: the two feeds this panel was missing - the nightly league
  // card (the A/B measurements every strategy decision hangs on) and the
  // leak-tag RATE trend (raw counts mislead when fleet volume moves; the
  // 2026-08-27 false-spike incident was exactly that).
  const [league, setLeague] = useState([]);
  const [leagueError, setLeagueError] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [ledgerError, setLedgerError] = useState(null);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerKind, setLedgerKind] = useState('receipt');
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [tagTrends, setTagTrends] = useState([]);
  const [tagTrendsError, setTagTrendsError] = useState(null);
  const [tourney, setTourney] = useState([]);
  const [tourneyError, setTourneyError] = useState(null);
  const [tourneyOpen, setTourneyOpen] = useState(false);
  const [freq, setFreq] = useState([]);
  const [freqError, setFreqError] = useState(null);
  const [freqOpen, setFreqOpen] = useState(false);
  const [agree, setAgree] = useState([]);
  const [agreeError, setAgreeError] = useState(null);
  const [agreeOpen, setAgreeOpen] = useState(false);
  const [trendsOpen, setTrendsOpen] = useState(false);

  // The fleet table used to render horses.slice(0, 40) with nothing to say a
  // cap existed, so a fleet of 300 looked like a fleet of 40. The whole list
  // is already in memory - the cap is only there to keep the first paint
  // short - so Show All is a toggle, not another read.
  const [showAllHorses, setShowAllHorses] = useState(false);

  const [filters, setFilters] = useState({ horse: '', variant: '', format: '', tag: '', win: '' });
  const [rows, setRows] = useState([]);
  const [rowsError, setRowsError] = useState(null);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Auth via the sanctioned local-storage reader (authUtils) - the
    // argument-less client session call is banned repo-wide by pre-commit
    // CHECK C. This check is UX only; the RPCs are SECURITY DEFINER and
    // verify the caller's role server-side via fn_is_horse_admin().
    //
    // THE ROUTE DECIDES WHO IS AN OPERATOR, NOT THIS FILE. This page used to
    // read profiles.role and admit three legacy strings, which is exactly the
    // list Phase 2 made incomplete: requireOperator admits an active
    // ca_operator_grants row too, so a granted operator was a real operator
    // this page sent home. operatorGate asks GET operator-admin?section=policy
    // with the bearer: 200 is an operator, 401/403 is a refusal, and anything
    // else is "could not verify" - neither, and it gets the retry screen.
    const verify = async () => {
      const user = getAuthUser();
      if (!user?.id) {
        router.push('/auth/login?redirect=/horses/hand-reviews');
        return;
      }
      const token = await getFreshAccessToken();
      if (!token) {
        router.push('/auth/login?redirect=/horses/hand-reviews');
        return;
      }
      const gate = await operatorGate(token);
      if (gate.ok) {
        setIsAdmin(true);
      } else if (gate.denied) {
        router.push('/');
        return;
      } else {
        setRoleError(gate.error || 'The Operator Check Failed.');
        setLoading(false);
        return;
      }
      setLoading(false);
    };
    verify();
  }, [router]);

  const loadSummary = useCallback(async () => {
    setSummaryError(null);
    const { data, error } = await supabase.rpc('ca_horse_review_summary', { p_days: days });
    if (error) setSummaryError(error.message);
    else setSummary(data);
  }, [days]);

  const loadAudits = useCallback(async () => {
    setAuditsError(null);
    const { data, error } = await supabase.rpc('ca_horse_daily_audit', { p_days: 14 });
    if (error) setAuditsError(error.message);
    else setAudits(data || []);
    // The error was discarded here. A failing or ungranted RPC rendered as
    // "No Data Yet" -- in the one panel whose own caption says a deployed
    // layer sitting at zero IS a wiring regression. So a broken read looked
    // exactly like the finding it is meant to help you rule out.
    const { data: tData, error: tErr } = await supabase.rpc('ca_brain_telemetry', { p_days: 3 });
    if (tErr) {
      setTelemetryError(tErr.message);
      setTelemetry([]);
    } else {
      setTelemetryError(null);
      setTelemetry(tData || []);
    }
    // 2026-09-04: the Data Ledger read. Same discipline: a failed read must
    // LOOK failed, because an empty ledger is itself a critical audit finding
    // (data_ledger_missing) and must not be confused with a query that did
    // not run.
    const { data: ldData, error: ldErr } = await supabase.rpc('ca_horse_data_ledger');
    if (ldErr) {
      setLedgerError(ldErr.message);
      setLedger([]);
    } else {
      setLedgerError(null);
      setLedger(ldData || []);
    }
    // Same error discipline as telemetry: a failed read must LOOK failed.
    const { data: lgData, error: lgErr } = await supabase.rpc('ca_horse_league_card', {
      p_runs: 3,
    });
    if (lgErr) {
      setLeagueError(lgErr.message);
      setLeague([]);
    } else {
      setLeagueError(null);
      setLeague(lgData || []);
    }
    const { data: ttData, error: ttErr } = await supabase.rpc('ca_horse_tag_trends', {
      p_days: 7,
    });
    if (ttErr) {
      setTagTrendsError(ttErr.message);
      setTagTrends([]);
    } else {
      setTagTrendsError(null);
      setTagTrends(ttData || []);
    }
    // Same error discipline as every read above: a failed RPC must LOOK
    // failed, not render as "No Data Yet" - on this page an empty card is
    // itself a finding, so the two states can never be allowed to look alike.
    const { data: tcData, error: tcErr } = await supabase.rpc('ca_horse_tournament_card', {
      p_days: 7,
    });
    if (tcErr) {
      setTourneyError(tcErr.message);
      setTourney([]);
    } else {
      setTourneyError(null);
      setTourney(tcData || []);
    }
    const { data: fqData, error: fqErr } = await supabase.rpc('ca_horse_frequency_card', {
      p_days: 7,
    });
    if (fqErr) {
      setFreqError(fqErr.message);
      setFreq([]);
    } else {
      setFreqError(null);
      setFreq(fqData || []);
    }
    const { data: agData, error: agErr } = await supabase.rpc('ca_horse_solver_agreement', {
      p_runs: 14,
    });
    if (agErr) {
      setAgreeError(agErr.message);
      setAgree([]);
    } else {
      setAgreeError(null);
      setAgree(agData || []);
    }
  }, []);

  const loadRows = useCallback(async () => {
    setBusy(true);
    setRowsError(null);
    const params = {
      p_horse: filters.horse || null,
      p_variant: filters.variant || null,
      p_format: filters.format || null,
      p_tag: filters.tag || null,
      p_win: filters.win === '' ? null : filters.win === 'win',
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    };
    const { data, error } = await supabase.rpc('ca_horse_hand_reviews', params);
    if (error) setRowsError(error.message);
    else setRows(data || []);
    setBusy(false);
  }, [filters, page]);

  useEffect(() => {
    if (isAdmin) loadSummary();
  }, [isAdmin, loadSummary]);
  useEffect(() => {
    if (isAdmin) loadAudits();
  }, [isAdmin, loadAudits]);
  useEffect(() => {
    if (isAdmin) loadRows();
  }, [isAdmin, loadRows]);

  if (loading) {
    return (
      <div className={styles.tokenScope} style={{ background: T.page, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: T.muted }}>
        Authenticating...
      </div>
    );
  }
  // Renders instead of a blank page. `return null` for a failed role lookup
  // meant an admin hitting a transient error saw an empty white screen with no
  // explanation and nothing to click.
  if (roleError) {
    return (
      <div className={styles.tokenScope} style={{ background: T.page, minHeight: '100vh', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24, textAlign: 'center', color: T.text }}>
        <div role="alert" style={{ color: T.danger, fontWeight: 700, fontSize: 18 }}>Could Not Verify Your Role</div>
        <div style={{ color: T.muted, fontSize: 14, maxWidth: 480 }}>
          {roleError} This Is A Failed Check, Not A Refusal - Your Access Has Not Changed.
        </div>
        <button onClick={() => router.reload()} style={{ background: T.accent, color: T.page, border: 'none',
          padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, minHeight: 44 }}>Retry</button>
      </div>
    );
  }
  if (!isAdmin) return null;

  const horses = summary?.horses || [];
  const fleetLeaks = summary?.fleet_leaks || {};
  const FLEET_PREVIEW = 40;
  const fleetTruncated = horses.length > FLEET_PREVIEW;
  const visibleHorses = showAllHorses ? horses : horses.slice(0, FLEET_PREVIEW);
  const setFilter = (k, v) => {
    setPage(0);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  // minHeight 44 keeps every one of these at the minimum comfortable touch
  // target. It is applied to the four filter selects, the Clear Filter button
  // and the Newer/Older pagination buttons, all of which shared ~31px.
  const inputStyle = {
    background: T.inset,
    color: T.text,
    border: `1px solid ${T.line}`,
    borderRadius: 4,
    padding: '0.4rem 0.6rem',
    fontSize: '0.85rem',
    minHeight: 44,
  };

  return (
    <div className={`hr-root ${styles.tokenScope}`} style={{ background: T.page, minHeight: '100vh', color: T.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Head>
        <title>Horse Hand Reviews | Smarter.Poker</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <style>{PAGE_CSS}</style>
      <div className="hr-page">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', borderBottom: `1px solid ${T.line}`, paddingBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: T.text }}>Horse Hand Reviews</h1>
            <p style={{ margin: '0.5rem 0 0 0', color: T.muted, fontSize: '0.875rem' }}>
              Every Hand Where A Horse Won Or Lost 20bb+, Flagged At Settlement With Leak Tags. Raw Hands Kept 30 Days; Rollups Permanent.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => {
                loadAudits();
                loadSummary();
                loadRows();
              }}
              style={{ background: T.surface, color: T.text, border: `1px solid ${T.line}`, padding: '0.5rem 1rem', minHeight: 44, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => router.push('/horses')}
              style={{ background: T.line, color: T.text, border: 'none', padding: '0.5rem 1rem', minHeight: 44, borderRadius: 4, cursor: 'pointer' }}
            >
              Back To Stable
            </button>
          </div>
        </header>

        {/* ── Daily Audit ── */}
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Daily Audit</h2>
            <span style={{ color: T.muted, fontSize: '0.8rem' }}>
              Machine Findings Nightly (06:00 UTC) Plus The Daily Claude Analysis
            </span>
            <ExportCsvButton rows={audits} columns={AUDIT_COLUMNS} filePrefix="horse-daily-audit" />
          </div>
          {auditsError && <div style={{ color: T.danger, fontSize: '0.85rem' }}>{auditsError}</div>}
          {audits.length === 0 && !auditsError && (
            <div style={{ color: T.muted, fontSize: '0.85rem' }}>No Audit Rows Yet. The First Row Appears After The Next 06:00 UTC Engine Run.</div>
          )}
          {/* ── Brain Layer Fires: proof the deployed logic executes ── */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            {/* A real <button>, for the same reason the audit rows are one:
                a div with onClick answers to neither Enter nor Space and
                reports no state to a screen reader. Three of these were left
                as divs when the audit expander was fixed. */}
            <button
              type="button"
              className="hr-row-btn"
              aria-expanded={telemetryOpen}
              aria-controls="telemetry-panel"
              onClick={() => setTelemetryOpen(!telemetryOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', padding: 0 }}
            >
              <span style={{ fontWeight: 700 }}>Brain Layer Fires</span>
              <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                Live-Table Execution Counts Per Layer. A Deployed Layer At Zero Is A Wiring Regression.
              </span>
              <span style={{ marginLeft: 'auto', color: T.positive, fontSize: '0.8rem' }}>
                {telemetryError ? 'Read Failed' : telemetry.length > 0 ? `${telemetry.length} Rows` : 'No Data Yet'}
              </span>
            </button>
            {telemetryOpen && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <ExportCsvButton rows={telemetry} columns={TELEMETRY_COLUMNS} filePrefix="horse-brain-telemetry" />
              </div>
            )}
            {telemetryOpen && (
              <div id="telemetry-panel" style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: T.muted, textAlign: 'left' }}>
                      <th style={{ padding: '0.3rem' }}>Day</th>
                      <th style={{ padding: '0.3rem' }}>Layer</th>
                      <th style={{ padding: '0.3rem' }}>Fires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry.map((t) => (
                      <tr key={`${t.day}-${t.feature}`} style={{ borderTop: `1px solid ${T.line}` }}>
                        <td style={{ padding: '0.3rem', whiteSpace: 'nowrap' }}>{t.day}</td>
                        <td style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{t.feature}</td>
                        <td style={{ padding: '0.3rem', color: Number(t.fires) > 0 ? T.positive : T.danger, fontWeight: 600 }}>
                          {Number(t.fires).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {telemetry.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: '0.4rem', color: T.muted }}>
                          {telemetryError
                            ? `The Telemetry Read FAILED (${telemetryError}). This Is Not Evidence The Engine Is Dark, The Query Did Not Run. Fix The Read Before Drawing Any Conclusion From This Panel.`
                            : 'Counters Appear After The Telemetry Engine Deploy. A Telemetry Dark Finding Above Means This Is Expected.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 2026-09-04 (Phase 1): What The Horses Consumed - the Data Ledger.
              Source, cadence, consumer and receipt for every input the brain
              can touch, judged against yesterday's fires. */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              type="button"
              className="hr-row-btn"
              aria-expanded={ledgerOpen}
              aria-controls="ledger-panel"
              onClick={() => setLedgerOpen(!ledgerOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', padding: 0 }}
            >
              <span style={{ fontWeight: 700 }}>What The Horses Consumed</span>
              <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                The Data Ledger: Every Input The Brain Reads, Its Source, Cadence, Consumer, And The Receipt From Yesterday.
              </span>
              <span style={{ marginLeft: 'auto', color: ledgerError ? T.danger : ledger.some((r) => r.proven === 'NO') ? T.danger : T.positive, fontSize: '0.8rem' }}>
                {ledgerError
                  ? 'Read Failed'
                  : ledger.length > 0
                    ? `${ledger.length} Inputs, ${ledger.filter((r) => r.proven === 'yes').length} Proven, ${ledger.filter((r) => r.proven === 'NO').length} Unread`
                    : 'No Ledger Yet'}
              </span>
            </button>
            {ledgerOpen && (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                {['receipt', 'table', 'profile', 'mind', 'param', 'state', 'flag', 'all'].map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setLedgerKind(k)}
                    aria-pressed={ledgerKind === k}
                    style={{ cursor: 'pointer', padding: '0.2rem 0.6rem', minHeight: 32, borderRadius: 6, border: `1px solid ${T.line}`, background: ledgerKind === k ? T.line : 'none', color: 'inherit', font: 'inherit', fontSize: '0.8rem' }}
                  >
                    {k === 'all' ? 'All' : k.charAt(0).toUpperCase() + k.slice(1)} ({k === 'all' ? ledger.length : ledger.filter((r) => r.kind === k).length})
                  </button>
                ))}
                <div style={{ marginLeft: 'auto' }}>
                  <ExportCsvButton rows={ledger} columns={LEDGER_COLUMNS} filePrefix="horse-data-ledger" />
                </div>
              </div>
            )}
            {ledgerOpen && (
              <div id="ledger-panel" style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ color: T.muted, textAlign: 'left' }}>
                      <th style={{ padding: '0.3rem' }}>Datum</th>
                      <th style={{ padding: '0.3rem' }}>Cadence</th>
                      <th style={{ padding: '0.3rem' }}>Consumer</th>
                      <th style={{ padding: '0.3rem' }}>Fires</th>
                      <th style={{ padding: '0.3rem' }}>Ratio / Expected</th>
                      <th style={{ padding: '0.3rem' }}>Proven</th>
                      <th style={{ padding: '0.3rem' }}>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger
                      .filter((r) => ledgerKind === 'all' || r.kind === ledgerKind)
                      .map((r) => (
                        <tr key={r.key} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: '0.3rem', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{r.name}</td>
                          <td style={{ padding: '0.3rem', whiteSpace: 'nowrap' }}>{r.cadence}</td>
                          <td style={{ padding: '0.3rem' }}>{r.consumer}</td>
                          <td style={{ padding: '0.3rem', textAlign: 'right', color: r.fires == null ? T.muted : Number(r.fires) > 0 ? T.positive : T.danger }}>
                            {r.fires == null ? '' : Number(r.fires).toLocaleString()}
                          </td>
                          <td style={{ padding: '0.3rem', whiteSpace: 'nowrap' }}>
                            {r.ratio == null ? '' : `${(Number(r.ratio) * 100).toFixed(3)}%`}
                            {r.min_ratio == null ? '' : ` / ${(Number(r.min_ratio) * 100).toFixed(3)}%`}
                          </td>
                          <td style={{ padding: '0.3rem', fontWeight: 700, color: r.proven === 'yes' ? T.positive : r.proven === 'NO' ? T.danger : T.muted }}>
                            {r.proven}
                          </td>
                          <td style={{ padding: '0.3rem', color: T.muted }}>{r.note}</td>
                        </tr>
                      ))}
                    {ledger.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '0.4rem', color: T.muted }}>
                          {ledgerError
                            ? `The Ledger Read FAILED (${ledgerError}). This Is Not Evidence The Ledger Is Empty, The Query Did Not Run.`
                            : 'No Ledger Rows. The Engine Writes Its Contract At Boot; An Empty Ledger Is The Critical Audit Finding Named Data Ledger Missing.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ═══ 2026-09-05: THE THREE CARDS THIS PAGE COULD NOT SHOW ═══
              Each one reads an RPC that existed with no reader. A number
              nobody can see is a number nobody acts on, which is the same
              failure as a tag nobody reads - the thing this whole programme
              was started to fix. */}

          {/* TOURNAMENT SCOREBOARD. 66% of horse seat-hands are tournaments
              and this page could not show one result: the self-tuner is
              cash-only by design and horse_daily_nets records tournament
              chips as 0.0 bb/100, because chips are not bb-comparable. ROI
              against the fee is the number that IS comparable. */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              type="button"
              className="hr-row-btn"
              aria-expanded={tourneyOpen}
              aria-controls="tourney-panel"
              onClick={() => setTourneyOpen(!tourneyOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', padding: 0 }}
            >
              <span style={{ fontWeight: 700 }}>Tournament Scoreboard</span>
              <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                Seven Days Of Entries, Buy Ins And Prizes. The Fleet Plays Itself, So Pooled ROI
                Is Minus The Fee Plus Any Overlay. Compare Against Minus The Fee, Never Zero.
              </span>
              <span style={{ marginLeft: 'auto', color: T.positive, fontSize: '0.8rem' }}>
                {tourneyError ? 'Read Failed' : tourney.length > 0 ? `${tourney.length} Rows` : 'No Data Yet'}
              </span>
            </button>
            {tourneyOpen && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <ExportCsvButton rows={tourney} columns={TOURNAMENT_COLUMNS} filePrefix="horse-tournament-card" />
              </div>
            )}
            {tourneyOpen && (
              <div id="tourney-panel" style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: T.muted, textAlign: 'left' }}>
                      <th style={{ padding: '0.3rem' }}>Type</th>
                      <th style={{ padding: '0.3rem' }}>Variant</th>
                      <th style={{ padding: '0.3rem' }}>Entries</th>
                      <th style={{ padding: '0.3rem' }}>ROI</th>
                      <th style={{ padding: '0.3rem' }}>In The Money</th>
                      <th style={{ padding: '0.3rem' }}>Average Finish</th>
                      <th style={{ padding: '0.3rem' }}>Horses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tourney.map((r) => {
                      const roi = Number(r.roi_pct);
                      // A losing ROI is not automatically a fault: the fleet
                      // plays itself, so the pooled figure is the fee. Only a
                      // deep loss is coloured as one.
                      const bad = Number.isFinite(roi) && roi < -15;
                      return (
                        <tr key={`${r.tournament_type}-${r.variant}`} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: '0.3rem', fontWeight: 600 }}>{r.tournament_type}</td>
                          <td style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{r.variant}</td>
                          <td style={{ padding: '0.3rem' }}>{r.entries}</td>
                          <td style={{ padding: '0.3rem', fontWeight: 600, color: bad ? T.danger : roi >= 0 ? T.positive : T.text }}>
                            {r.roi_pct === null || r.roi_pct === undefined ? '-' : `${r.roi_pct}%`}
                          </td>
                          <td style={{ padding: '0.3rem', color: T.muted }}>
                            {r.itm_pct === null || r.itm_pct === undefined ? '-' : `${r.itm_pct}%`}
                          </td>
                          <td style={{ padding: '0.3rem', color: T.muted }}>{r.avg_finish_pct ?? '-'}</td>
                          <td style={{ padding: '0.3rem', color: T.muted }}>{r.horses}</td>
                        </tr>
                      );
                    })}
                    {tourney.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '0.4rem', color: T.muted }}>
                          {tourneyError
                            ? `The Tournament Read FAILED (${tourneyError}). Fix The Read Before Drawing Conclusions.`
                            : 'No Completed Tournaments In The Window Yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* FREQUENCY LEAKS. Every hand tag needs a 20bb pot and most need a
              showdown, so over folding, never three betting, limping and
              passive postflop play could never reach one - they do not cost
              20bb in a single pot. These come from horse_daily_play on the
              same bands the self tuner moves the dials against. */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              type="button"
              className="hr-row-btn"
              aria-expanded={freqOpen}
              aria-controls="freq-panel"
              onClick={() => setFreqOpen(!freqOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', padding: 0 }}
            >
              <span style={{ fontWeight: 700 }}>Frequency Leaks</span>
              <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                The Leaks No Twenty BB Hand Tag Can See. A Leak Shared By A Third Of The Fleet Is A
                Bar In The Brain, Not A Personality.
              </span>
              <span style={{ marginLeft: 'auto', color: T.positive, fontSize: '0.8rem' }}>
                {freqError ? 'Read Failed' : freq.length > 0 ? `${freq.length} Horses` : 'No Data Yet'}
              </span>
            </button>
            {freqOpen && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <ExportCsvButton
                  rows={freq.map((r) => ({ ...r, leaks: (r.leaks || []).join(' ') }))}
                  columns={FREQUENCY_COLUMNS}
                  filePrefix="horse-frequency-leaks"
                />
              </div>
            )}
            {freqOpen && (
              <div id="freq-panel" style={{ overflowX: 'auto', marginTop: 6 }}>
                {/* THE FLEET WIDE READ COMES FIRST. One horse outside a band
                    is a personality the tuner will move tonight. A third of
                    the fleet outside the same band is a threshold in
                    HorsePreflop, and tuning dials against it is the fleet
                    trying and losing. */}
                {(() => {
                  const tally = {};
                  for (const r of freq) for (const l of r.leaks || []) tally[l] = (tally[l] || 0) + 1;
                  const worst = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
                  if (!worst || freq.length === 0) return null;
                  const share = worst[1] / freq.length;
                  if (share < 0.33) return null;
                  return (
                    <div
                      role="alert"
                      style={{
                        background: T.inset,
                        border: `1px solid ${T.danger}`,
                        borderRadius: 6,
                        padding: '0.5rem 0.75rem',
                        marginBottom: 8,
                        fontSize: '0.8rem',
                        color: T.danger,
                      }}
                    >
                      {`Fleet Wide: ${worst[0]} On ${worst[1]} Of ${freq.length} Studied Horses. `}
                      <span style={{ color: T.muted }}>
                        A Third Of The Fleet Sharing One Frequency Is A Threshold In The Brain, Not A
                        Set Of Dials. Find The Bar Before Tuning Anything.
                      </span>
                    </div>
                  );
                })()}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: T.muted, textAlign: 'left' }}>
                      <th style={{ padding: '0.3rem' }}>Horse</th>
                      <th style={{ padding: '0.3rem' }}>Hands</th>
                      <th style={{ padding: '0.3rem' }}>VPIP</th>
                      <th style={{ padding: '0.3rem' }}>PFR Of VPIP</th>
                      <th style={{ padding: '0.3rem' }}>Fold To Three Bet</th>
                      <th style={{ padding: '0.3rem' }}>Aggression</th>
                      <th style={{ padding: '0.3rem' }}>Leaks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {freq.slice(0, 60).map((r) => (
                      <tr key={r.horse_user_id} style={{ borderTop: `1px solid ${T.line}` }}>
                        <td style={{ padding: '0.3rem' }}>{r.alias || r.horse_user_id}</td>
                        <td style={{ padding: '0.3rem', color: T.muted }}>{r.hands}</td>
                        <td style={{ padding: '0.3rem' }}>{pct(r.vpip)}</td>
                        <td style={{ padding: '0.3rem' }}>{pct(r.pfr_of_vpip)}</td>
                        <td style={{ padding: '0.3rem' }}>{pct(r.fold_to_3bet)}</td>
                        <td style={{ padding: '0.3rem' }}>{r.af ?? '-'}</td>
                        <td style={{ padding: '0.3rem', color: T.danger, fontFamily: 'monospace' }}>
                          {(r.leaks || []).join(' ')}
                        </td>
                      </tr>
                    ))}
                    {freq.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '0.4rem', color: T.muted }}>
                          {freqError
                            ? `The Frequency Read FAILED (${freqError}). Fix The Read Before Drawing Conclusions.`
                            : 'No Horse Has A Thousand Cash Hands In The Window Yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* SOLVER AGREEMENT. The league card above measures one config
              against another and can never say whether either plays well.
              This is the absolute score: the mean solver frequency of the
              action the horse chose, over hold em push fold spots. */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              type="button"
              className="hr-row-btn"
              aria-expanded={agreeOpen}
              aria-controls="agree-panel"
              onClick={() => setAgreeOpen(!agreeOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', padding: 0 }}
            >
              <span style={{ fontWeight: 700 }}>Solver Agreement</span>
              <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                The Absolute Score The League Cannot Produce. Hold Em Push Fold Only. A Pure Miss Is
                A Spot The Solver Plays One Way Ninety Percent Of The Time And The Horse Did Not.
              </span>
              <span style={{ marginLeft: 'auto', color: T.positive, fontSize: '0.8rem' }}>
                {agreeError ? 'Read Failed' : agree.length > 0 ? `${agree.length} Runs` : 'No Data Yet'}
              </span>
            </button>
            {agreeOpen && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                <ExportCsvButton rows={agree} columns={AGREEMENT_COLUMNS} filePrefix="horse-solver-agreement" />
              </div>
            )}
            {agreeOpen && (
              <div id="agree-panel" style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: T.muted, textAlign: 'left' }}>
                      <th style={{ padding: '0.3rem' }}>Run</th>
                      <th style={{ padding: '0.3rem' }}>Reference</th>
                      <th style={{ padding: '0.3rem' }}>Spots</th>
                      <th style={{ padding: '0.3rem' }}>Agreement</th>
                      <th style={{ padding: '0.3rem' }}>Change</th>
                      <th style={{ padding: '0.3rem' }}>Pure Misses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agree.map((r, i) => {
                      // The rows arrive newest first, so the previous run is
                      // the NEXT element. A fall is the regression the league
                      // structurally cannot see.
                      const prev = agree[i + 1];
                      const delta =
                        prev && Number.isFinite(Number(prev.agreement))
                          ? Number(r.agreement) - Number(prev.agreement)
                          : null;
                      const dropped = delta !== null && delta < -0.03;
                      return (
                        <tr key={`${r.run_date}-${r.reference}`} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: '0.3rem', whiteSpace: 'nowrap' }}>{r.run_date}</td>
                          <td style={{ padding: '0.3rem', fontFamily: 'monospace', color: T.muted }}>{r.reference}</td>
                          <td style={{ padding: '0.3rem', color: Number(r.spots) < 50 ? T.warn : T.muted }}>{r.spots}</td>
                          <td style={{ padding: '0.3rem', fontWeight: 600 }}>{r.agreement}</td>
                          <td style={{ padding: '0.3rem', color: dropped ? T.danger : delta === null ? T.muted : T.positive }}>
                            {delta === null ? '-' : `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`}
                          </td>
                          <td style={{ padding: '0.3rem', color: T.muted }}>{r.pure_misses}</td>
                        </tr>
                      );
                    })}
                    {agree.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0.4rem', color: T.muted }}>
                          {agreeError
                            ? `The Agreement Read FAILED (${agreeError}). Fix The Read Before Drawing Conclusions.`
                            : 'No Probe Has Run Yet. It Runs With The Nightly League.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 2026-08-28: League Card - the nightly A/B card, the referee for
              every strategy change. Significant = |bb100| > 2*stderr. */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            {/* A real <button>, for the same reason the audit rows are one:
                a div with onClick answers to neither Enter nor Space and
                reports no state to a screen reader. Three of these were left
                as divs when the audit expander was fixed. */}
            <button
              type="button"
              className="hr-row-btn"
              aria-expanded={leagueOpen}
              aria-controls="league-panel"
              onClick={() => setLeagueOpen(!leagueOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', padding: 0 }}
            >
              <span style={{ fontWeight: 700 }}>League Card</span>
              <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                Nightly Duplicate-Deal A/B Per Strategy Layer. Significant Means The Edge Beats Twice Its Own Noise.
              </span>
              <span style={{ marginLeft: 'auto', color: T.positive, fontSize: '0.8rem' }}>
                {leagueError ? 'Read Failed' : league.length > 0 ? `${league.length} Rows` : 'No Data Yet'}
              </span>
            </button>
            {leagueOpen && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                {/* `verdict` is derived at render time, so the export builds
                    it once here rather than shipping a file whose Verdict
                    column is blank in every row. */}
                <ExportCsvButton
                  rows={league.map((m) => ({ ...m, verdict: leagueVerdict(m) }))}
                  columns={LEAGUE_COLUMNS}
                  filePrefix="horse-league-card"
                />
              </div>
            )}
            {leagueOpen && (
              <div id="league-panel" style={{ overflowX: 'auto', marginTop: 6 }}>
                {/* HOW OLD IS THIS CARD (2026-09-01). The league lost three
                    days in four at the end of August - a claim row written,
                    zero result rows - and this table rendered the surviving
                    run with nothing to say it was stale. Every layer verdict
                    read here during those days came from one measurement. The
                    daily audit raises league_card_stale, but this is where the
                    numbers are actually read, so it has to say so here too. */}
                {(() => {
                  const newest = league.reduce(
                    (acc, m) => (!acc || String(m.run_date) > acc ? String(m.run_date) : acc),
                    null
                  );
                  if (!newest) return null;
                  const days = Math.round(
                    (Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(newest)) / 86400000
                  );
                  if (days < 1) return null;
                  return (
                    <div
                      role="alert"
                      style={{
                        background: T.inset,
                        border: `1px solid ${days >= 2 ? T.danger : T.warn}`,
                        borderRadius: 6,
                        padding: '0.5rem 0.75rem',
                        marginBottom: 8,
                        fontSize: '0.8rem',
                        color: days >= 2 ? T.danger : T.warn,
                      }}
                    >
                      {`Stale Card: The Newest Run Is ${newest}, ${days} Day${days === 1 ? '' : 's'} Old. `}
                      <span style={{ color: T.muted }}>
                        These Verdicts Are Not Current. A Three Run Gate Cannot Be Satisfied By One
                        Surviving Run, So Do Not Ship A Default Flip On This Card Until The Runner
                        Is Healthy.
                      </span>
                    </div>
                  );
                })()}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: T.muted, textAlign: 'left' }}>
                      <th style={{ padding: '0.3rem' }}>Run</th>
                      <th style={{ padding: '0.3rem' }}>Matchup</th>
                      <th style={{ padding: '0.3rem' }}>BB/100</th>
                      <th style={{ padding: '0.3rem' }}>Stderr</th>
                      <th style={{ padding: '0.3rem' }}>Verdict</th>
                      <th style={{ padding: '0.3rem' }}>Illegal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {league.map((m) => {
                      // leagueState / leagueVerdict live at module scope so
                      // the CSV export renders the same verdict this table
                      // does. See the comment on leagueState.
                      const { inert, sig, pos } = leagueState(m);
                      return (
                        <tr key={`${m.run_date}-${m.matchup}`} style={{ borderTop: `1px solid ${T.line}` }}>
                          <td style={{ padding: '0.3rem', whiteSpace: 'nowrap' }}>{m.run_date}</td>
                          <td style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{m.matchup}</td>
                          <td style={{ padding: '0.3rem', fontWeight: 600, color: inert ? T.warn : sig ? (pos ? T.positive : T.danger) : T.text }}>
                            {m.bb100}
                          </td>
                          <td style={{ padding: '0.3rem', color: T.muted }}>{m.stderr}</td>
                          <td style={{ padding: '0.3rem', color: inert ? T.warn : sig ? (pos ? T.positive : T.danger) : T.muted }}>
                            {leagueVerdict(m)}
                          </td>
                          <td style={{ padding: '0.3rem', color: Number(m.illegal_actions) > 0 ? T.danger : T.muted }}>
                            {m.illegal_actions}
                          </td>
                        </tr>
                      );
                    })}
                    {league.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0.4rem', color: T.muted }}>
                          {leagueError
                            ? `The League Read FAILED (${leagueError}). Fix The Read Before Drawing Conclusions.`
                            : 'No League Runs Recorded Yet.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 2026-08-28: Leak-Tag Rates - per 1,000 captured hands, so fleet
              growth cannot masquerade as a regression. */}
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            {/* A real <button>, for the same reason the audit rows are one:
                a div with onClick answers to neither Enter nor Space and
                reports no state to a screen reader. Three of these were left
                as divs when the audit expander was fixed. */}
            <button
              type="button"
              className="hr-row-btn"
              aria-expanded={trendsOpen}
              aria-controls="trends-panel"
              onClick={() => setTrendsOpen(!trendsOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center', width: '100%', minHeight: 44, background: 'none', border: 'none', color: 'inherit', textAlign: 'left', font: 'inherit', padding: 0 }}
            >
              <span style={{ fontWeight: 700 }}>Leak-Tag Rates</span>
              <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                Tags Per 1,000 Captured Hands, Last 7 Days. Rates, Not Raw Counts.
              </span>
              <span style={{ marginLeft: 'auto', color: T.positive, fontSize: '0.8rem' }}>
                {tagTrendsError ? 'Read Failed' : tagTrends.length > 0 ? 'Loaded' : 'No Data Yet'}
              </span>
            </button>
            {trendsOpen && (() => {
              const daysList = [...new Set(tagTrends.map((t) => t.day))].sort();
              const byTag = {};
              for (const t of tagTrends) {
                if (!byTag[t.tag]) byTag[t.tag] = {};
                byTag[t.tag][t.day] = Number(t.hands) > 0 ? (Number(t.n) * 1000) / Number(t.hands) : 0;
              }
              const rows = Object.entries(byTag)
                .map(([tag, byDay]) => ({ tag, byDay, latest: byDay[daysList[daysList.length - 1]] || 0 }))
                .sort((a, b) => b.latest - a.latest);
              return (
                <div id="trends-panel" style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                    {/* The table is a pivot (tag x day); the CSV stays long,
                        one row per tag per day, which is what a spreadsheet
                        can actually pivot for itself. The rate is computed
                        here exactly as the cell computes it. */}
                    <ExportCsvButton
                      rows={tagTrends.map((t) => ({
                        ...t,
                        rate_per_1000: Number(t.hands) > 0 ? (Number(t.n) * 1000) / Number(t.hands) : 0,
                      }))}
                      columns={TREND_COLUMNS}
                      filePrefix="horse-leak-tag-rates"
                    />
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                      <thead>
                        <tr style={{ color: T.muted, textAlign: 'left' }}>
                          <th style={{ padding: '0.3rem' }}>Tag</th>
                          {daysList.map((d) => (
                            <th key={d} style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{String(d).slice(5)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.tag} style={{ borderTop: `1px solid ${T.line}` }}>
                            <td style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{r.tag}</td>
                            {daysList.map((d) => (
                              <td key={d} style={{ padding: '0.3rem', fontFamily: 'monospace', color: r.byDay[d] == null ? T.muted : T.text }}>
                                {r.byDay[d] == null ? '-' : r.byDay[d].toFixed(1)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {rows.length === 0 && (
                          <tr>
                            <td colSpan={1 + daysList.length} style={{ padding: '0.4rem', color: T.muted }}>
                              {tagTrendsError
                                ? `The Trends Read FAILED (${tagTrendsError}). Fix The Read Before Drawing Conclusions.`
                                : 'No Tagged Hands In The Window.'}
                            </td>
                          </tr>
                        )}
                        </tbody>
                      </table>
                  </div>
                </div>
              );
            })()}
          </div>

          {audits.map((a) => {
            const rawFindings = Array.isArray(a.findings) ? a.findings : [];
            const crit = rawFindings.filter((f) => f.severity === 'critical').length;
            const warn = rawFindings.filter((f) => f.severity === 'warn').length;
            const info = rawFindings.length - crit - warn;
            /* ORDER AND GROUPING (2026-09-01).
               2026-08-31 produced 30 findings. They rendered in whatever
               order the audit built them, so a critical could sit below an
               info, and 18 of the 30 were just two codes repeating per event
               (10 tournament_overlay, 8 freeroll_started_empty). The reader
               had to scroll a wall of duplicates to find the three that were
               different. Sort by severity, then fold repeats of one code into
               a single card that keeps every title. */
            const rank = { critical: 0, warn: 1, info: 2 };
            const groups = [];
            const byCode = new Map();
            for (const f of rawFindings) {
              const key = `${f.severity}|${f.code}`;
              const seen = byCode.get(key);
              if (seen) {
                seen.items.push(f);
              } else {
                const g = { severity: f.severity, code: f.code, category: f.category, items: [f] };
                byCode.set(key, g);
                groups.push(g);
              }
            }
            groups.sort(
              (x, y) =>
                (rank[x.severity] ?? 3) - (rank[y.severity] ?? 3) || y.items.length - x.items.length
            );
            const open = auditOpen === a.day;
            return (
              <div key={a.day} style={{ borderTop: `1px solid ${T.line}` }}>
                {/* A real <button> so the expander answers to Enter AND Space,
                    and reports its state. A div with onClick answered to
                    neither. */}
                <button
                  type="button"
                  className="hr-row-btn"
                  aria-expanded={open}
                  aria-controls={`audit-panel-${a.day}`}
                  onClick={() => setAuditOpen(open ? null : a.day)}
                  style={{ display: 'flex', gap: '0.5rem 1rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.5rem 0.25rem', width: '100%', minHeight: 44 }}
                >
                  <span aria-hidden="true" style={{ color: T.muted, width: '0.8rem' }}>{open ? '-' : '+'}</span>
                  <span style={{ fontWeight: 700, minWidth: 100 }}>{a.day}</span>
                  <span style={{ color: crit > 0 ? T.danger : T.positive, fontWeight: 600 }}>{crit} Critical</span>
                  <span style={{ color: warn > 0 ? T.warn : T.muted }}>{warn} Warn</span>
                  <span style={{ color: T.muted }}>{info} Info</span>
                  <span style={{ color: T.muted, fontSize: '0.8rem' }}>
                    {a.stats?.flagged_hands ?? 0} Flagged Hands / Net {a.stats?.net_bb_sum ?? 0} BB
                  </span>
                  <span className="hr-push" style={{ color: a.agent_analysis ? T.positive : T.muted, fontSize: '0.8rem' }}>
                    {a.agent_analysis ? 'Claude Analysis Ready' : 'Awaiting Claude Analysis'}
                  </span>
                </button>
                {open && (
                  <div id={`audit-panel-${a.day}`} style={{ padding: '0.25rem 0.25rem 0.75rem' }}>
                    {groups.length === 0 && <div style={{ color: T.muted, fontSize: '0.85rem' }}>No Findings. A Clean Day.</div>}
                    {groups.map((g, i) => {
                      const head = g.items[0];
                      const many = g.items.length > 1;
                      return (
                        <div key={`${g.severity}-${g.code}-${i}`} style={{ background: T.inset, border: `1px solid ${T.line}`, borderLeft: `3px solid ${g.severity === 'critical' ? T.danger : g.severity === 'warn' ? T.warn : T.line}`, borderRadius: 6, padding: '0.6rem 0.8rem', marginBottom: 6 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700 }}>{head.title}</span>
                            {many && (
                              <span style={{ color: g.severity === 'critical' ? T.danger : T.warn, fontSize: '0.75rem', fontWeight: 700 }}>
                                {`x${g.items.length}`}
                              </span>
                            )}
                            <span style={{ color: T.muted, fontSize: '0.75rem', textTransform: 'uppercase' }}>{g.category} / {g.code}</span>
                          </div>
                          <div style={{ color: T.muted, fontSize: '0.8rem', marginTop: 4 }}>{head.recommendation}</div>
                          {/* The repeats keep their own titles. Folding them
                              must never hide which events were affected. */}
                          {many && (
                            <ul style={{ margin: '6px 0 0', paddingLeft: '1.1rem', fontSize: '0.78rem', color: T.text }}>
                              {g.items.map((f, j) => (
                                <li key={j} style={{ marginBottom: 2 }}>
                                  {f.title}
                                  {f.evidence && (
                                    <span style={{ color: T.muted }}> {JSON.stringify(f.evidence)}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {!many && head.evidence && (
                            <pre style={{ margin: '6px 0 0', fontSize: '0.72rem', color: T.muted, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                              {JSON.stringify(head.evidence)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                    {a.agent_analysis && (
                      <div style={{ background: T.accentSoft, border: `1px solid ${T.accentLine}`, borderRadius: 6, padding: '0.75rem 1rem', marginTop: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6, color: T.positive }}>
                          Claude Daily Analysis
                          {a.agent_analyzed_at ? ` (${new Date(a.agent_analyzed_at).toLocaleString()})` : ''}
                        </div>
                        {typeof a.agent_analysis === 'object' && a.agent_analysis.summary && (
                          <div style={{ fontSize: '0.85rem', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{a.agent_analysis.summary}</div>
                        )}
                        {Array.isArray(a.agent_analysis?.flaws) &&
                          a.agent_analysis.flaws.map((fl, i) => (
                            <div key={i} style={{ fontSize: '0.8rem', marginBottom: 4 }}>
                              <span style={{ color: fl.severity === 'critical' ? T.danger : T.warn, fontWeight: 600, marginRight: 6 }}>[{fl.severity || 'note'}]</span>
                              <span style={{ fontWeight: 600 }}>{fl.title}: </span>
                              <span style={{ color: T.text }}>{fl.detail}</span>
                              {fl.action && <span style={{ color: T.positive }}> Action: {fl.action}</span>}
                            </div>
                          ))}
                        {Array.isArray(a.agent_analysis?.shipped) && a.agent_analysis.shipped.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: T.muted, marginTop: 8 }}>
                            {/* join(', ') ran seven pull-request entries into
                                one unreadable paragraph the first day this
                                panel had more than one thing to report. */}
                            <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>
                              {`Shipped (${a.agent_analysis.shipped.length})`}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                              {a.agent_analysis.shipped.map((sh, i) => (
                                <li key={i} style={{ marginBottom: 3 }}>{sh}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Fleet summary ── */}
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Fleet Summary</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle} aria-label="Fleet Summary Time Window">
                <option value={1}>Last 24h</option>
                <option value={7}>Last 7 Days</option>
                <option value={30}>Last 30 Days</option>
              </select>
              {/* Always the WHOLE fleet, never the 40 on screen: an export
                  that silently matched the preview would be a quieter version
                  of the bug this toggle exists to fix. */}
              <ExportCsvButton
                rows={horses}
                columns={FLEET_COLUMNS}
                filePrefix="horse-fleet-summary"
                label={`Export CSV (All ${horses.length})`}
              />
            </div>
          </div>
          {summaryError && <div style={{ color: T.danger, fontSize: '0.85rem' }}>{summaryError}</div>}
          <div style={{ marginBottom: '0.75rem' }}>
            <span style={{ color: T.muted, fontSize: '0.85rem', marginRight: 8 }}>Fleet Leak Tags:</span>
            {Object.keys(fleetLeaks).length === 0 && <span style={{ color: T.muted, fontSize: '0.85rem' }}>None Recorded Yet</span>}
            {Object.entries(fleetLeaks)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filters.tag === k}
                  onClick={() => setFilter('tag', filters.tag === k ? '' : k)}
                  style={{ background: filters.tag === k ? T.dangerWash : T.inset, color: T.text, border: `1px solid ${filters.tag === k ? T.danger : T.line}`, borderRadius: 4, padding: '2px 10px', minHeight: 44, marginRight: 6, marginBottom: 4, cursor: 'pointer', fontSize: '0.78rem' }}
                >
                  {k}: {v}
                </button>
              ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <caption style={SR_ONLY}>
                Per-Horse Totals For The Selected Window. The Horse Name In Each Row Is A Button That Filters The Flagged Hands Table Below.
              </caption>
              <thead>
                <tr style={{ color: T.muted, textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '0.4rem' }}>Horse</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Big Wins</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Big Losses</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Net BB (20bb+ Pots)</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Leak Tags</th>
                </tr>
              </thead>
              <tbody>
                {visibleHorses.map((hRow) => (
                  // The <tr> is inert: the activation lives on a real button in
                  // the first cell so it is reachable by keyboard.
                  <tr
                    key={hRow.horse_user_id}
                    style={{ borderTop: `1px solid ${T.line}`, background: filters.horse === hRow.horse_user_id ? T.accentSoft : 'transparent' }}
                  >
                    <td style={{ padding: '0.4rem', fontWeight: 600 }}>
                      <button
                        type="button"
                        className="hr-row-btn"
                        aria-pressed={filters.horse === hRow.horse_user_id}
                        onClick={() => setFilter('horse', filters.horse === hRow.horse_user_id ? '' : hRow.horse_user_id)}
                        style={{ fontWeight: 600, minHeight: 44, width: '100%' }}
                      >
                        {hRow.alias || (hRow.horse_user_id ? String(hRow.horse_user_id).slice(0, 8) : 'unknown')}
                      </button>
                    </td>
                    <td style={{ padding: '0.4rem', color: T.positive }}>{hRow.big_wins}</td>
                    <td style={{ padding: '0.4rem', color: T.danger }}>{hRow.big_losses}</td>
                    <td style={{ padding: '0.4rem', color: Number(hRow.sum_net_bb) >= 0 ? T.positive : T.danger }}>{hRow.sum_net_bb}</td>
                    <td style={{ padding: '0.4rem' }}>
                      {Object.entries(hRow.leak_counts || {})
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 4)
                        .map(([k, v]) => `${k} (${v})`)
                        .join(', ') || '-'}
                    </td>
                  </tr>
                ))}
                {horses.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: '0.6rem', color: T.muted }}>
                      No Flagged Hands In This Window Yet. Rows Appear As Horses Win Or Lose 20bb+ Pots.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {fleetTruncated && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.75rem' }}>
              <span aria-live="polite" style={{ color: T.muted, fontSize: '0.8rem' }}>
                {showAllHorses
                  ? `Showing All ${horses.length} Horses`
                  : `Showing Top ${FLEET_PREVIEW} Of ${horses.length} Horses`}
              </span>
              <button
                type="button"
                aria-expanded={showAllHorses}
                onClick={() => setShowAllHorses(!showAllHorses)}
                style={{ ...inputStyle, cursor: 'pointer', color: T.accent }}
              >
                {showAllHorses ? `Show Top ${FLEET_PREVIEW}` : `Show All ${horses.length}`}
              </button>
            </div>
          )}
        </div>

        {/* ── Flagged hands ── */}
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', marginRight: 8 }}>Flagged Hands</h2>
            <select value={filters.variant} onChange={(e) => setFilter('variant', e.target.value)} style={inputStyle} aria-label="Filter Flagged Hands By Game Variant">
              {VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v || 'All Variants'}
                </option>
              ))}
            </select>
            <select value={filters.format} onChange={(e) => setFilter('format', e.target.value)} style={inputStyle} aria-label="Filter Flagged Hands By Table Format">
              {FORMATS.map((v) => (
                <option key={v} value={v}>
                  {v || 'All Formats'}
                </option>
              ))}
            </select>
            <select value={filters.win} onChange={(e) => setFilter('win', e.target.value)} style={inputStyle} aria-label="Filter Flagged Hands By Result">
              <option value="">Wins And Losses</option>
              <option value="win">Wins Only</option>
              <option value="loss">Losses Only</option>
            </select>
            {(filters.horse || filters.tag) && (
              <button type="button" onClick={() => setFilters({ horse: '', variant: filters.variant, format: filters.format, tag: '', win: filters.win })} style={{ ...inputStyle, cursor: 'pointer', color: T.warn }}>
                Clear Horse/Tag Filter
              </button>
            )}
            <ExportCsvButton rows={rows} columns={HAND_COLUMNS} filePrefix="horse-flagged-hands" />
            <span className="hr-push" aria-live="polite" style={{ color: T.muted, fontSize: '0.8rem' }}>
              {busy ? 'Loading...' : `${rows.length} ${rows.length === 1 ? 'Row' : 'Rows'} On This Page`}
            </span>
          </div>
          {rowsError && <div style={{ color: T.danger, fontSize: '0.85rem', marginBottom: 8 }}>{rowsError}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <caption style={SR_ONLY}>
                Hands Where A Horse Won Or Lost Twenty Big Blinds Or More. The Timestamp In Each Row Is A Button That Expands The Full Hand Detail.
              </caption>
              <thead>
                <tr style={{ color: T.muted, textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '0.4rem' }}>When</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Variant</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Format</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Net BB</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Hole Cards</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Board</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Leak Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <React.Fragment key={r.id}>
                    {/* The <tr> is inert: the disclosure lives on a real button
                        in the first cell, so Enter and Space both work. */}
                    <tr style={{ borderTop: `1px solid ${T.line}` }}>
                      <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="hr-row-btn"
                          aria-expanded={expanded === r.id}
                          aria-controls={`hand-detail-${r.id}`}
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          style={{ minHeight: 44, whiteSpace: 'nowrap' }}
                        >
                          <span aria-hidden="true" style={{ color: T.muted, marginRight: 6 }}>{expanded === r.id ? '-' : '+'}</span>
                          {new Date(r.played_at).toLocaleString()}
                        </button>
                      </td>
                      <td style={{ padding: '0.4rem' }}>{r.game_variant}</td>
                      <td style={{ padding: '0.4rem' }}>{r.format}</td>
                      <td style={{ padding: '0.4rem', fontWeight: 700, color: r.net_bb >= 0 ? T.positive : T.danger }}>
                        {r.net_bb >= 0 ? '+' : ''}
                        {r.net_bb}
                      </td>
                      <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>
                        {(r.hole_cards || []).slice(0, 6).map((c, i) => (
                          <CardChip key={i} card={c} />
                        ))}
                      </td>
                      <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>
                        {(r.board || []).map((c, i) => (
                          <CardChip key={i} card={c} />
                        ))}
                      </td>
                      <td style={{ padding: '0.4rem' }}>
                        {(r.leak_tags || []).map((t) => (
                          <TagChip key={t} tag={t} />
                        ))}
                      </td>
                    </tr>
                    {expanded === r.id && (
                      <tr id={`hand-detail-${r.id}`}>
                        <td colSpan={7}>
                          <HandDetail row={r} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
                {rows.length === 0 && !busy && (
                  <tr>
                    <td colSpan={7} style={{ padding: '0.6rem', color: T.muted }}>
                      No Hands Match These Filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* HONEST PAGING. ca_horse_hand_reviews returns no total, so there
              is no "Showing X Of Y" to be had and inventing one would be a
              lie. A FULL page is the only evidence another page might exist,
              so More is offered on exactly that condition and labelled More
              rather than Older - it is a possibility, not a promise. The
              position reads "Page N", which is all this page actually knows. */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} style={{ ...inputStyle, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
              Previous
            </button>
            {rows.length === PAGE_SIZE && (
              <button type="button" onClick={() => setPage(page + 1)} style={{ ...inputStyle, cursor: 'pointer' }}>
                More
              </button>
            )}
            <span aria-live="polite" style={{ color: T.muted, fontSize: '0.8rem', alignSelf: 'center' }}>
              {rows.length === PAGE_SIZE
                ? `Page ${page + 1} (Full Page, There May Be More)`
                : `Page ${page + 1} (Last Page)`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
