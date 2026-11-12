/**
 * Snapshot payload -> render spec (schema of services/daily-content/render/scene.html).
 * Every figure on screen comes from the frozen payload; the provenance line
 * names the snapshot and the first 8 characters of its SHA-256.
 */
import { SLOTS, ordinal } from './boards.mjs';
import { HORSE_DISCLOSURE, CHIP_DISCLOSURE } from './scoring.mjs';

const num = (n) => Number(n || 0).toLocaleString('en-US');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const chip = (text, tone = 'white') => ({ text, tone });
const VARIANT_TAGS = { bounty: 'BOUNTY', progressive_bounty: 'PKO', mystery_bounty: 'MYSTERY BOUNTY' };
const GAME_NAMES = { NLH: "No-Limit Hold'em", PLO4: 'Pot-Limit Omaha', PLO5: 'Pot-Limit Omaha 5', PLO6: 'Pot-Limit Omaha 6', PLO8: 'Pot-Limit Omaha Hi-Lo' };
const topGtd = (items) => Math.max(0, ...items.map((i) => Number(i.guarantee || 0)));

function footer(snapshotKey, sha, { results = true, dryRun = true } = {}) {
  return {
    disclosure: results ? [HORSE_DISCLOSURE, CHIP_DISCLOSURE] : ['Free tournaments every day. Times are Central.', CHIP_DISCLOSURE],
    provenance: `${dryRun ? 'PRIVATE DRY RUN · ' : ''}SNAPSHOT ${String(snapshotKey).toUpperCase()} · ${sha.slice(0, 8)}`,
  };
}

function entry(r, value, sub) {
  return { rank_label: r.rank_label || String(r.rank), name: r.name, value, horse: !!r.horse, staff: !!r.staff, avatar: r.avatar_url || null, sub };
}

function closingFrom(cf) {
  if (!cf) return null;
  return {
    eyebrow: `TONIGHT · ${cf.time} CT`,
    title: String(cf.name || cf.event).toUpperCase(),
    subtitle: cf.guarantee ? `${num(cf.guarantee)} CHIP GUARANTEE` : '',
    detail: cf.game === 'NLH' ? "NO-LIMIT HOLD'EM" : cf.game || '',
    footnote: CHIP_DISCLOSURE,
  };
}

function splitTime(label) {
  const m = /^(\d{1,2}:\d{2}) (AM|PM)$/.exec(label || '');
  return m ? { time: m[1], time_sub: `${m[2]} CT` } : { time: label || '', time_sub: '' };
}

export function specFor(slot, built, snapshot, opts = {}) {
  const p = snapshot.payload;
  const key = snapshot.snapshot_key;
  const sha = snapshot.sha256;
  const duration_s = SLOTS[slot].duration;
  const dryRun = opts.dryRun !== false;

  if (slot === 'today' || slot === 'tonight') {
    return {
      template: 'list', results: false, duration_s,
      header: { eyebrow: slot === 'today' ? 'TODAY ON' : 'TONIGHT IN', title: slot === 'today' ? 'SMARTER.POKER' : 'THE ARENA',
        chips: [chip(p.date_label), chip('Times Central', 'blue'), chip(plural(p.items.length, 'Event', 'Events'), 'green')] },
      list: { items: p.items.map((i) => ({
        ...splitTime(i.time), title: i.name, subtitle: GAME_NAMES[i.game] || i.game,
        tags: [i.free_buy ? 'FREE BUY' : null, VARIANT_TAGS[i.variant] || null, i.guarantee && i.guarantee === topGtd(p.items) ? 'FEATURED' : null].filter(Boolean),
        value: i.guarantee || null, value_label: i.guarantee ? 'CHIP GTD' : '', highlight: !!i.guarantee && i.guarantee === topGtd(p.items),
      })) },
      footer: footer(key, sha, { results: false, dryRun }), closing: null,
    };
  }

  if (slot === 'top10') {
    if (built.fallback) {
      const t = p.totals; const hc = p.human_callout;
      return {
        template: 'stats', results: true, duration_s,
        header: { eyebrow: 'YESTERDAY IN', title: 'NUMBERS', chips: [chip(p.period.label), chip('Multi-Table Tournaments', 'blue')] },
        stats: { tiles: [
          { label: 'Tournaments', value: t.events },
          { label: 'Entries', value: t.entries },
          ...(t.biggest_field ? [{ label: 'Biggest Field', value: t.biggest_field.field, sub: t.biggest_field.event }] : []),
          ...(hc.qualifies ? [{ label: 'Best Human Finish', value: `${ordinal(hc.position)} of ${hc.field}`, sub: `${hc.name}, ${hc.event}`, highlight: true }] : []),
        ] },
        footer: footer(key, sha, { dryRun }), closing: closingFrom(p.closing_frame),
      };
    }
    const rows = p.rows; const hc = p.human_callout;
    const chips = [chip(p.period.label), chip('Arena Points', 'green'), chip(plural(p.totals.events, 'Tournament', 'Tournaments'), 'blue')];
    if (p.completeness.status === 'PROVISIONAL') chips.push(chip(`Provisional: ${p.completeness.incomplete_events.length} Settling`, 'gold'));
    return {
      template: 'board', results: true, duration_s,
      header: { eyebrow: "YESTERDAY'S", title: p.board === 'top5' ? 'TOP 5' : 'TOP 10', chips },
      board: {
        value_label: 'Arena Points',
        podium: rows.slice(0, 3).map((r) => entry(r, r.score, `${num(r.prize_chips)} prize chips`)),
        rows: rows.slice(3).map((r) => entry(r, r.score, r.tie_note ? `${r.tie_note} · ${num(r.prize_chips)} prize chips`
          : `${plural(r.wins, 'win', 'wins')} · ${plural(r.scoring_finishes, 'scoring finish', 'scoring finishes')} · ${num(r.prize_chips)} prize chips`)),
        callout: hc.qualifies ? { tag: 'BEST HUMAN FINISH', text: `${hc.name} · ${ordinal(hc.position)} of ${hc.field} · ${hc.event}`, name: hc.name, avatar: hc.avatar_url || null } : null,
      },
      footer: footer(key, sha, { dryRun }), closing: closingFrom(p.closing_frame),
    };
  }

  // 3:00 PM feature
  const f = p;
  if (f.kind === 'board' && f.feature === 'nightly_spotlight') {
    return {
      template: 'board', results: true, duration_s,
      header: { eyebrow: 'NIGHTLY', title: 'SPOTLIGHT', chips: [chip(f.event), chip(`${num(f.field)} Players`, 'blue')] },
      board: { value_label: 'Finish', podium: f.rows.map((r) => entry(r, `${ordinal(r.position)} of ${num(f.field)}`, f.event)), rows: [], callout: null },
      footer: footer(key, sha, { dryRun }), closing: null,
    };
  }
  if (f.kind === 'board') {
    return {
      template: 'board', results: true, duration_s,
      header: { eyebrow: f.feature === 'weekly_top10' ? 'WEEKLY' : f.feature === 'omaha_spotlight' ? 'OMAHA' : "HOLD'EM",
        title: f.feature === 'weekly_top10' ? 'TOP 10' : 'SPOTLIGHT',
        chips: [chip(f.period_label), chip('Arena Points', 'green'), chip(plural(f.qualifying_events, 'Tournament', 'Tournaments'), 'blue')] },
      board: {
        value_label: 'Arena Points',
        podium: f.rows.slice(0, 3).map((r) => entry(r, r.score, `${plural(r.wins, 'win', 'wins')} · ${plural(r.scoring_finishes, 'finish', 'finishes')}`)),
        rows: f.rows.slice(3).map((r) => entry(r, r.score, r.tie_note || `${plural(r.wins, 'win', 'wins')} · ${plural(r.scoring_finishes, 'scoring finish', 'scoring finishes')}`)),
        callout: null,
      },
      footer: footer(key, sha, { dryRun }), closing: null,
    };
  }
  if (f.kind === 'list') {
    return {
      template: 'list', results: true, duration_s,
      header: { eyebrow: f.feature === 'biggest_fields' ? "THIS WEEK'S" : 'FREE BUY', title: f.feature === 'biggest_fields' ? 'BIGGEST FIELDS' : 'WINNERS',
        chips: [chip(f.period_label), chip(plural(f.eligible_events, 'Event', 'Events'), 'blue')] },
      list: { items: f.items.map((i, n) => {
        const d = new Date(i.ended_at);
        return { time: d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Chicago' }),
          time_sub: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).toUpperCase(),
          title: i.event, subtitle: `Won by ${i.winner}`, horse: i.horse, staff: i.staff, tags: [],
          value: i.field, value_label: 'PLAYERS', highlight: n === 0 };
      }) },
      footer: footer(key, sha, { dryRun }), closing: null,
    };
  }
  return {
    template: 'stats', results: true, duration_s,
    header: { eyebrow: 'THE', title: 'WEEK IN NUMBERS', chips: [chip(f.period_label)] },
    stats: { tiles: f.stats.map((s) => ({ label: s.label, value: s.value, sub: s.detail || undefined, highlight: s.label === 'Best Human Finish' })) },
    footer: footer(key, sha, { dryRun }), closing: null,
  };
}
