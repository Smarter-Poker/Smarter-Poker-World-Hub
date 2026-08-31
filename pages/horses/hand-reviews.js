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
import { getAuthUser } from '../../src/lib/authUtils';
import { useRouter } from 'next/router';

/* smarter.poker palette. Mirrors pages/horses/horses.module.css and the Club
   Arena design tokens (~/Documents/club-arena/src/styles/design-tokens.css).
   Dan 2026-08-26: no purples, no greens - cyan is the accent AND the
   positive/win colour. This page used the zinc scale plus #10b981 for wins,
   which matched nothing else on the platform. POSITIVE is deliberately an
   alias of ACCENT so a later edit cannot reintroduce green by reaching for a
   plausible "success" name. */
const BG = '#0a0e17';
const PANEL = '#111827';
const SURFACE = '#1a2234';
const INSET = '#0d1520';
const BORDER = 'rgba(255,255,255,0.08)';
const TEXT = '#f3f4f6';
// #6b7280 measured 3.67:1 on the #111827 panel and failed WCAG AA for body
// text, which is what it is used for throughout this file. #8b93a1 is 5.15:1
// and matches the shared token in horses.module.css.
const MUTED = '#8b93a1';
const ACCENT = '#00d4ff';
const ACCENT_SOFT = 'rgba(0,212,255,0.12)';
const ACCENT_LINE = 'rgba(0,212,255,0.30)';
const POSITIVE = ACCENT;
const RED = '#ef4444';
const RED_SOFT = 'rgba(239,68,68,0.12)';
const AMBER = '#ffd700';

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
  outline: 2px solid #00d4ff;
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

const SUIT_GLYPH = { hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' };
// Club Arena's canonical deck is two-colour (src/styles/club-engine.css:52-55).
// The suit letter renders beside the rank, so hearts and diamonds stay
// distinguishable without a third and fourth hue.
const SUIT_COLOR = { hearts: RED, diamonds: RED, clubs: TEXT, spades: TEXT };

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
        background: INSET,
        border: `1px solid ${BORDER}`,
        borderRadius: 4,
        padding: '2px 6px',
        marginRight: 4,
        fontWeight: 700,
        color: SUIT_COLOR[suit] || TEXT,
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
        background: RED_SOFT,
        color: RED,
        border: '1px solid rgba(239,68,68,0.3)',
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
    <div style={{ background: INSET, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '0.75rem 1rem', margin: '0.5rem 0' }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: MUTED, marginRight: 8 }}>Hole Cards:</span>
        {(row.hole_cards || []).map((c, i) => (
          <CardChip key={i} card={c} />
        ))}
        <span style={{ color: MUTED, margin: '0 8px 0 16px' }}>Board:</span>
        {(row.board || []).map((c, i) => (
          <CardChip key={i} card={c} />
        ))}
      </div>
      {stages.map((st) => {
        const acts = actions.filter((a) => a.stage === st);
        if (acts.length === 0) return null;
        return (
          <div key={st} style={{ fontSize: '0.8rem', color: MUTED, marginBottom: 2 }}>
            <span style={{ color: TEXT, fontWeight: 600, textTransform: 'capitalize', marginRight: 6 }}>{st}:</span>
            {acts
              .map(
                (a) =>
                  `${a.userId === row.horse_user_id ? 'HERO' : `seat ${a.seat}`} ${a.action}${a.amount ? ` ${a.amount}` : ''}`
              )
              .join(' / ')}
          </div>
        );
      })}
      <div style={{ fontSize: '0.75rem', color: MUTED, marginTop: 6 }}>
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
  const [leagueOpen, setLeagueOpen] = useState(false);
  const [tagTrends, setTagTrends] = useState([]);
  const [tagTrendsError, setTagTrendsError] = useState(null);
  const [trendsOpen, setTrendsOpen] = useState(false);

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
    const verify = async () => {
      const user = getAuthUser();
      if (!user?.id) {
        router.push('/auth/login?redirect=/horses/hand-reviews');
        return;
      }
      const { data: profile, error: roleErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      // A FAILED QUERY IS NOT A DENIAL. `error` was discarded, so a transient
      // RLS or network failure made profile null and silently redirected a
      // real admin to the home page with no message.
      if (roleErr) {
        setRoleError(roleErr.message || 'Role lookup failed');
        setLoading(false);
        return;
      }
      if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) {
        setIsAdmin(true);
      } else {
        router.push('/');
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
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: MUTED }}>
        Authenticating...
      </div>
    );
  }
  // Renders instead of a blank page. `return null` for a failed role lookup
  // meant an admin hitting a transient error saw an empty white screen with no
  // explanation and nothing to click.
  if (roleError) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', gap: 16, padding: 24, textAlign: 'center', color: TEXT }}>
        <div role="alert" style={{ color: RED, fontWeight: 700, fontSize: 18 }}>Could Not Verify Your Role</div>
        <div style={{ color: MUTED, fontSize: 14, maxWidth: 480 }}>
          {roleError}. This Is A Failed Check, Not A Refusal - Your Access Has Not Changed.
        </div>
        <button onClick={() => router.reload()} style={{ background: ACCENT, color: BG, border: 'none',
          padding: '10px 20px', borderRadius: 6, cursor: 'pointer', fontWeight: 700, minHeight: 44 }}>Retry</button>
      </div>
    );
  }
  if (!isAdmin) return null;

  const horses = summary?.horses || [];
  const fleetLeaks = summary?.fleet_leaks || {};
  const setFilter = (k, v) => {
    setPage(0);
    setFilters((f) => ({ ...f, [k]: v }));
  };

  // minHeight 44 keeps every one of these at the minimum comfortable touch
  // target. It is applied to the four filter selects, the Clear Filter button
  // and the Newer/Older pagination buttons, all of which shared ~31px.
  const inputStyle = {
    background: INSET,
    color: TEXT,
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: '0.4rem 0.6rem',
    fontSize: '0.85rem',
    minHeight: 44,
  };

  return (
    <div className="hr-root" style={{ background: BG, minHeight: '100vh', color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Head>
        <title>Horse Hand Reviews | Smarter.Poker</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <style>{PAGE_CSS}</style>
      <div className="hr-page">
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1.5rem', borderBottom: `1px solid ${BORDER}`, paddingBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: TEXT }}>Horse Hand Reviews</h1>
            <p style={{ margin: '0.5rem 0 0 0', color: MUTED, fontSize: '0.875rem' }}>
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
              style={{ background: SURFACE, color: TEXT, border: `1px solid ${BORDER}`, padding: '0.5rem 1rem', minHeight: 44, borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => router.push('/horses')}
              style={{ background: BORDER, color: TEXT, border: 'none', padding: '0.5rem 1rem', minHeight: 44, borderRadius: 4, cursor: 'pointer' }}
            >
              Back To Stable
            </button>
          </div>
        </header>

        {/* ── Daily Audit ── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Daily Audit</h2>
            <span style={{ color: MUTED, fontSize: '0.8rem' }}>
              Machine Findings Nightly (06:00 UTC) Plus The Daily Claude Analysis
            </span>
          </div>
          {auditsError && <div style={{ color: RED, fontSize: '0.85rem' }}>{auditsError}</div>}
          {audits.length === 0 && !auditsError && (
            <div style={{ color: MUTED, fontSize: '0.85rem' }}>No Audit Rows Yet. The First Row Appears After The Next 06:00 UTC Engine Run.</div>
          )}
          {/* ── Brain Layer Fires: proof the deployed logic executes ── */}
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            <div
              onClick={() => setTelemetryOpen(!telemetryOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center' }}
            >
              <span style={{ fontWeight: 700 }}>Brain Layer Fires</span>
              <span style={{ color: MUTED, fontSize: '0.8rem' }}>
                Live-Table Execution Counts Per Layer. A Deployed Layer At Zero Is A Wiring Regression.
              </span>
              <span style={{ marginLeft: 'auto', color: POSITIVE, fontSize: '0.8rem' }}>
                {telemetryError ? 'Read Failed' : telemetry.length > 0 ? `${telemetry.length} rows` : 'No Data Yet'}
              </span>
            </div>
            {telemetryOpen && (
              <div style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: MUTED, textAlign: 'left' }}>
                      <th style={{ padding: '0.3rem' }}>Day</th>
                      <th style={{ padding: '0.3rem' }}>Layer</th>
                      <th style={{ padding: '0.3rem' }}>Fires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telemetry.map((t) => (
                      <tr key={`${t.day}-${t.feature}`} style={{ borderTop: `1px solid ${BORDER}` }}>
                        <td style={{ padding: '0.3rem', whiteSpace: 'nowrap' }}>{t.day}</td>
                        <td style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{t.feature}</td>
                        <td style={{ padding: '0.3rem', color: Number(t.fires) > 0 ? POSITIVE : RED, fontWeight: 600 }}>
                          {Number(t.fires).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {telemetry.length === 0 && (
                      <tr>
                        <td colSpan={3} style={{ padding: '0.4rem', color: MUTED }}>
                          {telemetryError
                            ? `The telemetry read FAILED (${telemetryError}). This is not evidence the engine is dark -- the query did not run. Fix the read before drawing any conclusion from this panel.`
                            : 'Counters appear after the telemetry engine deploy. A telemetry_dark finding above means this is expected.'}
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
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            <div
              onClick={() => setLeagueOpen(!leagueOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center' }}
            >
              <span style={{ fontWeight: 700 }}>League Card</span>
              <span style={{ color: MUTED, fontSize: '0.8rem' }}>
                Nightly Duplicate-Deal A/B Per Strategy Layer. Significant Means The Edge Beats Twice Its Own Noise.
              </span>
              <span style={{ marginLeft: 'auto', color: POSITIVE, fontSize: '0.8rem' }}>
                {leagueError ? 'Read Failed' : league.length > 0 ? `${league.length} rows` : 'No Data Yet'}
              </span>
            </div>
            {leagueOpen && (
              <div style={{ overflowX: 'auto', marginTop: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ color: MUTED, textAlign: 'left' }}>
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
                      const sig = Math.abs(Number(m.bb100)) > 2 * Number(m.stderr);
                      const pos = Number(m.bb100) > 0;
                      return (
                        <tr key={`${m.run_date}-${m.matchup}`} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '0.3rem', whiteSpace: 'nowrap' }}>{m.run_date}</td>
                          <td style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{m.matchup}</td>
                          <td style={{ padding: '0.3rem', fontWeight: 600, color: sig ? (pos ? POSITIVE : RED) : TEXT }}>
                            {m.bb100}
                          </td>
                          <td style={{ padding: '0.3rem', color: MUTED }}>{m.stderr}</td>
                          <td style={{ padding: '0.3rem', color: sig ? (pos ? POSITIVE : RED) : MUTED }}>
                            {sig ? (pos ? 'Significant Positive' : 'Significant Negative') : 'Not Resolved'}
                          </td>
                          <td style={{ padding: '0.3rem', color: Number(m.illegal_actions) > 0 ? RED : MUTED }}>
                            {m.illegal_actions}
                          </td>
                        </tr>
                      );
                    })}
                    {league.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ padding: '0.4rem', color: MUTED }}>
                          {leagueError
                            ? `The league read FAILED (${leagueError}). Fix the read before drawing conclusions.`
                            : 'No league runs recorded yet.'}
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
          <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '0.5rem', marginBottom: '0.5rem' }}>
            <div
              onClick={() => setTrendsOpen(!trendsOpen)}
              style={{ cursor: 'pointer', display: 'flex', gap: '1rem', alignItems: 'center' }}
            >
              <span style={{ fontWeight: 700 }}>Leak-Tag Rates</span>
              <span style={{ color: MUTED, fontSize: '0.8rem' }}>
                Tags Per 1,000 Captured Hands, Last 7 Days. Rates, Not Raw Counts.
              </span>
              <span style={{ marginLeft: 'auto', color: POSITIVE, fontSize: '0.8rem' }}>
                {tagTrendsError ? 'Read Failed' : tagTrends.length > 0 ? 'Loaded' : 'No Data Yet'}
              </span>
            </div>
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
                <div style={{ overflowX: 'auto', marginTop: 6 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ color: MUTED, textAlign: 'left' }}>
                        <th style={{ padding: '0.3rem' }}>Tag</th>
                        {daysList.map((d) => (
                          <th key={d} style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{String(d).slice(5)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.tag} style={{ borderTop: `1px solid ${BORDER}` }}>
                          <td style={{ padding: '0.3rem', fontFamily: 'monospace' }}>{r.tag}</td>
                          {daysList.map((d) => (
                            <td key={d} style={{ padding: '0.3rem', fontFamily: 'monospace', color: r.byDay[d] == null ? MUTED : TEXT }}>
                              {r.byDay[d] == null ? '-' : r.byDay[d].toFixed(1)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={1 + daysList.length} style={{ padding: '0.4rem', color: MUTED }}>
                            {tagTrendsError
                              ? `The trends read FAILED (${tagTrendsError}). Fix the read before drawing conclusions.`
                              : 'No tagged hands in the window.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          {audits.map((a) => {
            const findings = Array.isArray(a.findings) ? a.findings : [];
            const crit = findings.filter((f) => f.severity === 'critical').length;
            const warn = findings.filter((f) => f.severity === 'warn').length;
            const open = auditOpen === a.day;
            return (
              <div key={a.day} style={{ borderTop: `1px solid ${BORDER}` }}>
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
                  <span aria-hidden="true" style={{ color: MUTED, width: '0.8rem' }}>{open ? '-' : '+'}</span>
                  <span style={{ fontWeight: 700, minWidth: 100 }}>{a.day}</span>
                  <span style={{ color: crit > 0 ? RED : POSITIVE, fontWeight: 600 }}>{crit} Critical</span>
                  <span style={{ color: warn > 0 ? AMBER : MUTED }}>{warn} Warn</span>
                  <span style={{ color: MUTED, fontSize: '0.8rem' }}>
                    {a.stats?.flagged_hands ?? 0} Flagged Hands / Net {a.stats?.net_bb_sum ?? 0} BB
                  </span>
                  <span className="hr-push" style={{ color: a.agent_analysis ? POSITIVE : MUTED, fontSize: '0.8rem' }}>
                    {a.agent_analysis ? 'Claude Analysis Ready' : 'Awaiting Claude Analysis'}
                  </span>
                </button>
                {open && (
                  <div id={`audit-panel-${a.day}`} style={{ padding: '0.25rem 0.25rem 0.75rem' }}>
                    {findings.length === 0 && <div style={{ color: MUTED, fontSize: '0.85rem' }}>No Findings. A Clean Day.</div>}
                    {findings.map((f, i) => (
                      <div key={i} style={{ background: INSET, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${f.severity === 'critical' ? RED : f.severity === 'warn' ? AMBER : BORDER}`, borderRadius: 6, padding: '0.6rem 0.8rem', marginBottom: 6 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700 }}>{f.title}</span>
                          <span style={{ color: MUTED, fontSize: '0.75rem', textTransform: 'uppercase' }}>{f.category} / {f.code}</span>
                        </div>
                        <div style={{ color: MUTED, fontSize: '0.8rem', marginTop: 4 }}>{f.recommendation}</div>
                        {f.evidence && (
                          <pre style={{ margin: '6px 0 0', fontSize: '0.72rem', color: MUTED, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                            {JSON.stringify(f.evidence)}
                          </pre>
                        )}
                      </div>
                    ))}
                    {a.agent_analysis && (
                      <div style={{ background: ACCENT_SOFT, border: `1px solid ${ACCENT_LINE}`, borderRadius: 6, padding: '0.75rem 1rem', marginTop: 8 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6, color: POSITIVE }}>
                          Claude Daily Analysis
                          {a.agent_analyzed_at ? ` (${new Date(a.agent_analyzed_at).toLocaleString()})` : ''}
                        </div>
                        {typeof a.agent_analysis === 'object' && a.agent_analysis.summary && (
                          <div style={{ fontSize: '0.85rem', marginBottom: 6, whiteSpace: 'pre-wrap' }}>{a.agent_analysis.summary}</div>
                        )}
                        {Array.isArray(a.agent_analysis?.flaws) &&
                          a.agent_analysis.flaws.map((fl, i) => (
                            <div key={i} style={{ fontSize: '0.8rem', marginBottom: 4 }}>
                              <span style={{ color: fl.severity === 'critical' ? RED : AMBER, fontWeight: 600, marginRight: 6 }}>[{fl.severity || 'note'}]</span>
                              <span style={{ fontWeight: 600 }}>{fl.title}: </span>
                              <span style={{ color: TEXT }}>{fl.detail}</span>
                              {fl.action && <span style={{ color: POSITIVE }}> Action: {fl.action}</span>}
                            </div>
                          ))}
                        {Array.isArray(a.agent_analysis?.shipped) && a.agent_analysis.shipped.length > 0 && (
                          <div style={{ fontSize: '0.8rem', color: MUTED, marginTop: 4 }}>
                            Shipped: {a.agent_analysis.shipped.join(', ')}
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
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Fleet Summary</h2>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle} aria-label="Fleet summary time window">
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>
          {summaryError && <div style={{ color: RED, fontSize: '0.85rem' }}>{summaryError}</div>}
          <div style={{ marginBottom: '0.75rem' }}>
            <span style={{ color: MUTED, fontSize: '0.85rem', marginRight: 8 }}>Fleet Leak Tags:</span>
            {Object.keys(fleetLeaks).length === 0 && <span style={{ color: MUTED, fontSize: '0.85rem' }}>None Recorded Yet</span>}
            {Object.entries(fleetLeaks)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={filters.tag === k}
                  onClick={() => setFilter('tag', filters.tag === k ? '' : k)}
                  style={{ background: filters.tag === k ? RED_SOFT : INSET, color: TEXT, border: `1px solid ${filters.tag === k ? RED : BORDER}`, borderRadius: 4, padding: '2px 10px', minHeight: 44, marginRight: 6, marginBottom: 4, cursor: 'pointer', fontSize: '0.78rem' }}
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
                <tr style={{ color: MUTED, textAlign: 'left' }}>
                  <th scope="col" style={{ padding: '0.4rem' }}>Horse</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Big Wins</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Big Losses</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Net BB (20bb+ Pots)</th>
                  <th scope="col" style={{ padding: '0.4rem' }}>Leak Tags</th>
                </tr>
              </thead>
              <tbody>
                {horses.slice(0, 40).map((hRow) => (
                  // The <tr> is inert: the activation lives on a real button in
                  // the first cell so it is reachable by keyboard.
                  <tr
                    key={hRow.horse_user_id}
                    style={{ borderTop: `1px solid ${BORDER}`, background: filters.horse === hRow.horse_user_id ? ACCENT_SOFT : 'transparent' }}
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
                    <td style={{ padding: '0.4rem', color: POSITIVE }}>{hRow.big_wins}</td>
                    <td style={{ padding: '0.4rem', color: RED }}>{hRow.big_losses}</td>
                    <td style={{ padding: '0.4rem', color: Number(hRow.sum_net_bb) >= 0 ? POSITIVE : RED }}>{hRow.sum_net_bb}</td>
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
                    <td colSpan={5} style={{ padding: '0.6rem', color: MUTED }}>
                      No Flagged Hands In This Window Yet. Rows Appear As Horses Win Or Lose 20bb+ Pots.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Flagged hands ── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem', marginRight: 8 }}>Flagged Hands</h2>
            <select value={filters.variant} onChange={(e) => setFilter('variant', e.target.value)} style={inputStyle} aria-label="Filter flagged hands by game variant">
              {VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v || 'All Variants'}
                </option>
              ))}
            </select>
            <select value={filters.format} onChange={(e) => setFilter('format', e.target.value)} style={inputStyle} aria-label="Filter flagged hands by table format">
              {FORMATS.map((v) => (
                <option key={v} value={v}>
                  {v || 'All Formats'}
                </option>
              ))}
            </select>
            <select value={filters.win} onChange={(e) => setFilter('win', e.target.value)} style={inputStyle} aria-label="Filter flagged hands by result">
              <option value="">Wins And Losses</option>
              <option value="win">Wins Only</option>
              <option value="loss">Losses Only</option>
            </select>
            {(filters.horse || filters.tag) && (
              <button type="button" onClick={() => setFilters({ horse: '', variant: filters.variant, format: filters.format, tag: '', win: filters.win })} style={{ ...inputStyle, cursor: 'pointer', color: AMBER }}>
                Clear Horse/Tag Filter
              </button>
            )}
            <span className="hr-push" aria-live="polite" style={{ color: MUTED, fontSize: '0.8rem' }}>{busy ? 'Loading...' : `${rows.length} rows`}</span>
          </div>
          {rowsError && <div style={{ color: RED, fontSize: '0.85rem', marginBottom: 8 }}>{rowsError}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <caption style={SR_ONLY}>
                Hands Where A Horse Won Or Lost Twenty Big Blinds Or More. The Timestamp In Each Row Is A Button That Expands The Full Hand Detail.
              </caption>
              <thead>
                <tr style={{ color: MUTED, textAlign: 'left' }}>
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
                    <tr style={{ borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="hr-row-btn"
                          aria-expanded={expanded === r.id}
                          aria-controls={`hand-detail-${r.id}`}
                          onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                          style={{ minHeight: 44, whiteSpace: 'nowrap' }}
                        >
                          <span aria-hidden="true" style={{ color: MUTED, marginRight: 6 }}>{expanded === r.id ? '-' : '+'}</span>
                          {new Date(r.played_at).toLocaleString()}
                        </button>
                      </td>
                      <td style={{ padding: '0.4rem' }}>{r.game_variant}</td>
                      <td style={{ padding: '0.4rem' }}>{r.format}</td>
                      <td style={{ padding: '0.4rem', fontWeight: 700, color: r.net_bb >= 0 ? POSITIVE : RED }}>
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
                    <td colSpan={7} style={{ padding: '0.6rem', color: MUTED }}>
                      No Hands Match These Filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
            <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} style={{ ...inputStyle, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
              Newer
            </button>
            <button type="button" disabled={rows.length < PAGE_SIZE} onClick={() => setPage(page + 1)} style={{ ...inputStyle, cursor: rows.length < PAGE_SIZE ? 'default' : 'pointer', opacity: rows.length < PAGE_SIZE ? 0.5 : 1 }}>
              Older
            </button>
            <span style={{ color: MUTED, fontSize: '0.8rem', alignSelf: 'center' }}>Page {page + 1}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
