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

const BG = '#09090b';
const PANEL = '#18181b';
const BORDER = '#27272a';
const TEXT = '#e4e4e7';
const MUTED = '#a1a1aa';
const GREEN = '#10b981';
const RED = '#ef4444';
const AMBER = '#f59e0b';

const VARIANTS = ['', 'nlh', 'plo4', 'plo5', 'plo6', 'plo8', 'short_deck', 'pineapple'];
const FORMATS = ['', 'cash', 'hu_cash', 'tournament'];
const PAGE_SIZE = 50;

const SUIT_GLYPH = { hearts: 'h', diamonds: 'd', clubs: 'c', spades: 's' };
const SUIT_COLOR = { hearts: RED, diamonds: '#3b82f6', clubs: GREEN, spades: TEXT };

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
        background: '#0f0f11',
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
  const isLeak = tag !== 'big_win';
  return (
    <span
      style={{
        display: 'inline-block',
        background: isLeak ? '#7f1d1d' : '#064e3b',
        color: '#fecaca',
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
    <div style={{ background: '#0f0f11', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '0.75rem 1rem', margin: '0.5rem 0' }}>
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
        hand {row.hand_id} - pot {row.pot_size ?? '?'} - bb {row.big_blind}
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
        router.push('/login');
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
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
    if (isAdmin) loadRows();
  }, [isAdmin, loadRows]);

  if (loading) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: MUTED }}>
        Authenticating...
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

  const inputStyle = {
    background: '#0f0f11',
    color: TEXT,
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    padding: '0.4rem 0.6rem',
    fontSize: '0.85rem',
  };

  return (
    <div style={{ background: BG, minHeight: '100vh', color: TEXT, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <Head>
        <title>Horse Hand Reviews</title>
      </Head>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '2rem' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', borderBottom: `1px solid ${BORDER}`, paddingBottom: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#f4f4f5' }}>Horse Hand Reviews</h1>
            <p style={{ margin: '0.5rem 0 0 0', color: MUTED, fontSize: '0.875rem' }}>
              Every hand where a horse won or lost 20bb+, flagged at settlement with leak tags. Raw hands kept 30 days; rollups permanent.
            </p>
          </div>
          <button
            onClick={() => router.push('/horses')}
            style={{ background: BORDER, color: TEXT, border: 'none', padding: '0.5rem 1rem', borderRadius: 4, cursor: 'pointer' }}
          >
            Back To Stable
          </button>
        </header>

        {/* ── Fleet summary ── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Fleet Summary</h2>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={inputStyle}>
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>
          {summaryError && <div style={{ color: RED, fontSize: '0.85rem' }}>{summaryError}</div>}
          <div style={{ marginBottom: '0.75rem' }}>
            <span style={{ color: MUTED, fontSize: '0.85rem', marginRight: 8 }}>Fleet Leak Tags:</span>
            {Object.keys(fleetLeaks).length === 0 && <span style={{ color: MUTED, fontSize: '0.85rem' }}>none recorded yet</span>}
            {Object.entries(fleetLeaks)
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => (
                <button key={k} onClick={() => setFilter('tag', filters.tag === k ? '' : k)} style={{ background: filters.tag === k ? '#7f1d1d' : '#0f0f11', color: TEXT, border: `1px solid ${filters.tag === k ? RED : BORDER}`, borderRadius: 4, padding: '2px 8px', marginRight: 6, marginBottom: 4, cursor: 'pointer', fontSize: '0.78rem' }}>
                  {k}: {v}
                </button>
              ))}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: MUTED, textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem' }}>Horse</th>
                  <th style={{ padding: '0.4rem' }}>Big Wins</th>
                  <th style={{ padding: '0.4rem' }}>Big Losses</th>
                  <th style={{ padding: '0.4rem' }}>Net BB (20bb+ Pots)</th>
                  <th style={{ padding: '0.4rem' }}>Leak Tags</th>
                </tr>
              </thead>
              <tbody>
                {horses.slice(0, 40).map((hRow) => (
                  <tr
                    key={hRow.horse_user_id}
                    onClick={() => setFilter('horse', filters.horse === hRow.horse_user_id ? '' : hRow.horse_user_id)}
                    style={{ borderTop: `1px solid ${BORDER}`, cursor: 'pointer', background: filters.horse === hRow.horse_user_id ? '#1e293b' : 'transparent' }}
                  >
                    <td style={{ padding: '0.4rem', fontWeight: 600 }}>{hRow.alias || hRow.horse_user_id.slice(0, 8)}</td>
                    <td style={{ padding: '0.4rem', color: GREEN }}>{hRow.big_wins}</td>
                    <td style={{ padding: '0.4rem', color: RED }}>{hRow.big_losses}</td>
                    <td style={{ padding: '0.4rem', color: Number(hRow.sum_net_bb) >= 0 ? GREEN : RED }}>{hRow.sum_net_bb}</td>
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
                      No flagged hands in this window yet. Rows appear as horses win or lose 20bb+ pots.
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
            <select value={filters.variant} onChange={(e) => setFilter('variant', e.target.value)} style={inputStyle}>
              {VARIANTS.map((v) => (
                <option key={v} value={v}>
                  {v || 'All Variants'}
                </option>
              ))}
            </select>
            <select value={filters.format} onChange={(e) => setFilter('format', e.target.value)} style={inputStyle}>
              {FORMATS.map((v) => (
                <option key={v} value={v}>
                  {v || 'All Formats'}
                </option>
              ))}
            </select>
            <select value={filters.win} onChange={(e) => setFilter('win', e.target.value)} style={inputStyle}>
              <option value="">Wins And Losses</option>
              <option value="win">Wins Only</option>
              <option value="loss">Losses Only</option>
            </select>
            {(filters.horse || filters.tag) && (
              <button onClick={() => setFilters({ horse: '', variant: filters.variant, format: filters.format, tag: '', win: filters.win })} style={{ ...inputStyle, cursor: 'pointer', color: AMBER }}>
                Clear Horse/Tag Filter
              </button>
            )}
            <span style={{ color: MUTED, fontSize: '0.8rem', marginLeft: 'auto' }}>{busy ? 'Loading...' : `${rows.length} rows`}</span>
          </div>
          {rowsError && <div style={{ color: RED, fontSize: '0.85rem', marginBottom: 8 }}>{rowsError}</div>}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ color: MUTED, textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem' }}>When</th>
                  <th style={{ padding: '0.4rem' }}>Variant</th>
                  <th style={{ padding: '0.4rem' }}>Format</th>
                  <th style={{ padding: '0.4rem' }}>Net BB</th>
                  <th style={{ padding: '0.4rem' }}>Hole Cards</th>
                  <th style={{ padding: '0.4rem' }}>Board</th>
                  <th style={{ padding: '0.4rem' }}>Leak Tags</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr
                      onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                      style={{ borderTop: `1px solid ${BORDER}`, cursor: 'pointer' }}
                    >
                      <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>{new Date(r.played_at).toLocaleString()}</td>
                      <td style={{ padding: '0.4rem' }}>{r.game_variant}</td>
                      <td style={{ padding: '0.4rem' }}>{r.format}</td>
                      <td style={{ padding: '0.4rem', fontWeight: 700, color: r.net_bb >= 0 ? GREEN : RED }}>
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
                      <tr>
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
                      No hands match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button disabled={page === 0} onClick={() => setPage(page - 1)} style={{ ...inputStyle, cursor: page === 0 ? 'default' : 'pointer', opacity: page === 0 ? 0.5 : 1 }}>
              Newer
            </button>
            <button disabled={rows.length < PAGE_SIZE} onClick={() => setPage(page + 1)} style={{ ...inputStyle, cursor: rows.length < PAGE_SIZE ? 'default' : 'pointer', opacity: rows.length < PAGE_SIZE ? 0.5 : 1 }}>
              Older
            </button>
            <span style={{ color: MUTED, fontSize: '0.8rem', alignSelf: 'center' }}>Page {page + 1}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
