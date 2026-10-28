/**
 * Smarter.Poker Daily Operations Digest - email rendering.
 *
 * Pure functions: digest JSON (public.fn_sp_daily_digest) in, subject / HTML /
 * plain text out. No I/O, so the whole layout is covered by
 * __tests__/daily-digest.test.mjs. The look matches the Pep Nation Lab digest
 * (dark card, teal accent, red only where a rule fired).
 */

const C = {
    page: '#05070a',
    card: '#0b0f14',
    row: '#121821',
    line: '#1e2632',
    text: '#e7edf3',
    muted: '#8a97a8',
    teal: '#4fc1b3',
    red: '#ef4444',
    amber: '#f59e0b',
    green: '#22c55e',
};

export function esc(v) {
    return String(v ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export function fmtInt(v) {
    const n = num(v);
    if (n === null) return '0';
    return Math.round(n).toLocaleString('en-US');
}

export function fmtNum(v, digits = 2) {
    const n = num(v);
    if (n === null) return '0';
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function fmtUsd(v) {
    const n = num(v) ?? 0;
    return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(part, whole) {
    const p = num(part);
    const w = num(whole);
    if (!w) return 'n/a';
    return `${Math.round((p / w) * 100)}%`;
}

export function get(obj, path) {
    return path.split('.').reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
}

/** Average of the series for `key` over the days before the digest day. */
export function priorAverage(digest, key) {
    const s = (digest?.series?.[key] || []).filter((p) => p.day !== digest.day && p.v !== null);
    if (!s.length) return null;
    return s.reduce((a, p) => a + Number(p.v || 0), 0) / s.length;
}

function delta(cur, prev) {
    const c = num(cur);
    const p = num(prev);
    if (c === null || p === null) return '';
    const d = c - p;
    if (Math.abs(d) < 1e-9) return 'same';
    const sign = d > 0 ? '+' : '-';
    const abs = Math.abs(d);
    return `${sign}${abs >= 100 ? Math.round(abs).toLocaleString('en-US') : fmtNum(abs, 2)}`;
}

/** Seven small bars, built from table cells so every inbox renders them. */
export function trendBars(points) {
    const vals = (points || []).map((p) => Math.max(0, Number(p.v) || 0));
    if (vals.length < 2) return '';
    const max = Math.max(...vals, 1);
    const cells = vals
        .map((v, i) => {
            const h = Math.max(2, Math.round((v / max) * 18));
            const color = i === vals.length - 1 ? C.teal : '#2a3442';
            return `<td style="padding:0 1px;vertical-align:bottom;"><div style="width:6px;height:${h}px;background:${color};border-radius:1px;font-size:0;line-height:0;">&nbsp;</div></td>`;
        })
        .join('');
    return `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;vertical-align:middle;margin-right:8px;"><tr>${cells}</tr></table>`;
}

const SECTION_DEFS = [
    {
        title: 'Growth',
        rows: [
            { label: 'New Signups (Real Players)', path: 'growth.signups', fmt: fmtInt, series: 'signups' },
            { label: '- Phone Verified', path: 'growth.signups_phone_verified', fmt: fmtInt },
            { label: '- Email Confirmed', path: 'growth.signups_email_confirmed', fmt: fmtInt },
            { label: 'Active Players', path: 'growth.active_humans', fmt: fmtInt, series: 'active_humans' },
            { label: 'Active Horses', path: 'growth.active_horses', fmt: fmtInt },
            { label: 'Referral Signups', path: 'growth.referral_signups', fmt: fmtInt },
            { label: 'Club Joins', path: 'growth.club_joins', fmt: fmtInt },
            { label: 'Clubs Created', path: 'growth.clubs_created', fmt: fmtInt },
            { label: 'Active VIPs', path: 'growth.vip_active_humans', fmt: fmtInt },
            { label: 'Total Real Players', path: 'growth.humans_total', fmt: fmtInt },
            { label: 'Test Accounts Created (Excluded)', path: 'growth.fixture_accounts_created', fmt: fmtInt, quiet: true },
        ],
    },
    {
        title: 'Money',
        rows: [
            { label: 'Cash Game Rake', path: 'money.cash_rake', fmt: fmtNum, series: 'cash_rake' },
            { label: 'Tournament And Spin Rake', path: 'money.tournament_rake', fmt: fmtNum, series: 'tournament_rake' },
            { label: '- Paid By Real Players', path: 'money.rake_paid_by_humans', fmt: fmtNum },
            { label: '- Paid By Horses', path: 'money.rake_paid_by_horses', fmt: fmtNum },
            { label: 'Rakeback Paid', path: 'money.rakeback_paid', fmt: fmtNum },
            { label: 'Commissions Paid', path: 'money.commissions_paid', fmt: fmtNum },
            { label: 'Bad Beat Jackpot Contributions', path: 'money.bbj_contributions', fmt: fmtNum },
            { label: 'Bad Beat Jackpot Pools', path: 'money.bbj_pool_total', fmt: fmtNum },
            { label: 'Chips Minted', path: 'money.minted', fmt: fmtNum },
            { label: 'Chips Burned', path: 'money.burned', fmt: fmtNum },
            { label: 'Unexplained Supply Drift', path: 'money.supply_unexplained', fmt: fmtNum, redIf: (v) => Number(v) !== 0 },
        ],
    },
    {
        title: 'Diamonds',
        rows: [
            { label: 'Diamonds Given Out', path: 'diamonds.given_out', fmt: fmtInt, series: 'diamonds_given' },
            { label: 'Diamonds Taken In', path: 'diamonds.taken_in', fmt: fmtInt, series: 'diamonds_taken' },
            { label: 'Net Issued', path: 'diamonds.net_issued', fmt: fmtInt },
            { label: 'Moved Into Club Arena', path: 'diamonds.into_club_arena', fmt: fmtInt },
            { label: 'Moved Out Of Club Arena', path: 'diamonds.out_of_club_arena', fmt: fmtInt },
            { label: 'Transfers', path: 'diamonds.transfers', fmt: fmtInt },
            { label: 'Held By Real Players', path: 'diamonds.circulation_players', fmt: fmtInt },
            { label: '- Liability In USD', path: 'diamonds.circulation_usd', fmt: fmtUsd },
            { label: 'All Wallets (Incl. Horses)', path: 'diamonds.circulation', fmt: fmtInt, quiet: true },
        ],
        breakdowns: [
            { label: 'Given Out By Source', path: 'diamonds.given_by_source' },
            { label: 'Taken In By Game Or Store', path: 'diamonds.taken_by_sink' },
        ],
    },
    {
        title: 'Sales And VIP',
        rows: [
            { label: 'Total Revenue', path: 'sales.revenue_usd', fmt: fmtUsd, series: 'revenue_usd' },
            { label: 'Diamond Packages', path: 'sales.diamond_packages.count', fmt: fmtInt, extra: 'sales.diamond_packages.usd' },
            { label: 'New VIP Subscriptions', path: 'sales.vip_new.count', fmt: fmtInt, extra: 'sales.vip_new.usd' },
            { label: 'Lifetime VIP', path: 'sales.vip_lifetime.count', fmt: fmtInt, extra: 'sales.vip_lifetime.usd' },
            { label: 'Merch Orders', path: 'sales.merch.count', fmt: fmtInt, extra: 'sales.merch.usd' },
            { label: 'VIP Cancellations', path: 'sales.vip_cancelled', fmt: fmtInt },
            { label: 'VIP Plan Switches', path: 'sales.vip_plan_switches', fmt: fmtInt },
            { label: 'Store Purchases (Diamonds)', path: 'sales.store_purchases.count', fmt: fmtInt },
            { label: 'Club Shop Purchases', path: 'sales.club_shop_purchases', fmt: fmtInt },
            { label: 'Merch Shipped / Delivered', path: 'sales.merch_shipped', fmt: fmtInt, extraRaw: 'sales.merch_delivered' },
            { label: 'Refunds', path: 'sales.refunds_usd', fmt: fmtUsd, redIf: (v) => Number(v) > 0 },
            { label: 'Disputes', path: 'sales.disputes', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
        ],
    },
    {
        title: 'Club Arena Play',
        rows: [
            { label: 'Hands Dealt', path: 'play.hands', fmt: fmtInt, series: 'hands' },
            { label: '- Cash / Tournament', path: 'play.hands_cash', fmt: fmtInt, extraRaw: 'play.hands_tournament' },
            { label: '- With A Real Player', path: 'play.hands_with_human', fmt: fmtInt },
            { label: 'Tables Dealing', path: 'play.tables_dealing', fmt: fmtInt },
            { label: 'Biggest Pot', path: 'play.biggest_pot', fmt: fmtNum },
            { label: 'Tournaments Cancelled', path: 'play.tournaments_cancelled', fmt: fmtInt },
            { label: 'Lightning Hands', path: 'play.lightning_hands', fmt: fmtInt },
            { label: 'Horse Fleet Seated (Avg / Max)', path: 'play.horse_fleet.avg_seated', fmt: fmtInt, extraRaw: 'play.horse_fleet.max_seated' },
            { label: 'Horse Net Result (BB, UTC Day)', path: 'play.horse_net_bb', fmt: fmtNum },
        ],
        breakdowns: [
            { label: 'Tournaments Started', path: 'play.tournaments_started' },
            { label: 'Tournaments Completed', path: 'play.tournaments_completed' },
        ],
    },
    {
        title: 'Agents And Cashouts',
        rows: [
            { label: 'Cashouts Requested', path: 'agents.cashouts_requested.count', fmt: fmtInt },
            { label: 'Cashouts Completed', path: 'agents.cashouts_completed', fmt: fmtInt },
            { label: 'Agent Credit Invoices', path: 'agents.agent_credit_invoices', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
            { label: 'Agent Funding', path: 'agents.agent_funding', fmt: fmtNum },
            { label: 'Commission Settlements', path: 'agents.commission_settlements.count', fmt: fmtInt },
        ],
        breakdowns: [{ label: 'Invoices Issued', path: 'agents.invoices_issued' }],
    },
    {
        title: 'Platform Health',
        rows: [
            { label: 'Engine Breaks Passed', path: 'health.breaks.passed', fmt: fmtInt, extraRaw: 'health.breaks.total', of: true },
            { label: 'Engine Deploys Shipped', path: 'health.deploys.shipped', fmt: fmtInt, extraRaw: 'health.deploys.attempted', of: true },
            { label: 'New Critical Alerts', path: 'health.alerts_new.critical', fmt: fmtInt, series: 'critical_alerts' },
            { label: 'New Warning Alerts', path: 'health.alerts_new.warning', fmt: fmtInt },
            { label: 'Alerts Verified Fixed', path: 'health.alerts_fixed', fmt: fmtInt },
            { label: 'Open Financial Alerts', path: 'health.financial_alerts_open', fmt: fmtInt },
            { label: 'Open Drift Incidents', path: 'health.drift_open', fmt: fmtInt },
            { label: '- Past Deadline', path: 'health.drift_past_deadline', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
            { label: 'Ledger Invariant Findings', path: 'health.ledger_findings', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
            { label: 'Diamond Incidents (Warning+)', path: 'health.diamond_incidents_new', fmt: fmtInt },
            { label: 'Client Errors', path: 'health.client_errors', fmt: fmtInt, series: 'client_errors' },
            { label: '- Database Timeouts', path: 'health.db_timeouts', fmt: fmtInt },
            { label: 'App Crashes', path: 'health.crashes', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
            { label: 'Signup Errors', path: 'health.signup_errors', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
            { label: 'Anti-Cheat Signals (Real Players)', path: 'health.collusion_signals', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
            { label: 'Anti-Cheat Signals (Horse Pairs Only)', path: 'health.collusion_signals_horse_only', fmt: fmtInt, quiet: true },
            { label: 'Push Sent / Failed', path: 'health.push.sent', fmt: fmtInt, extraRaw: 'health.push.failed' },
        ],
    },
    {
        title: 'Engagement',
        rows: [
            { label: 'Daily Challenges Claimed', path: 'engagement.challenges_claimed', fmt: fmtInt },
            { label: 'Trivia Sessions', path: 'engagement.trivia_sessions', fmt: fmtInt },
            { label: 'Training Answers', path: 'engagement.training_answers', fmt: fmtInt },
            { label: 'Social Posts / Comments', path: 'engagement.social_posts', fmt: fmtInt, extraRaw: 'engagement.social_comments' },
            { label: 'Likes', path: 'engagement.social_likes', fmt: fmtInt },
            { label: 'Reels Posted', path: 'engagement.reels', fmt: fmtInt },
            { label: 'Videos Added To The Library', path: 'engagement.videos_added', fmt: fmtInt },
        ],
    },
    {
        title: 'Security',
        rows: [
            { label: 'Signup Abuse Hits', path: 'security.signup_abuse_hits', fmt: fmtInt },
            { label: 'Player Accounts Deleted', path: 'security.accounts_deleted', fmt: fmtInt },
            { label: 'Login Probe Failures', path: 'security.login_probe_failures', fmt: fmtInt, redIf: (v) => Number(v) > 0 },
            { label: 'Admin Accounts', path: 'security.admin_ids.length', fmt: fmtInt },
        ],
    },
    {
        title: 'Cost And Capacity',
        rows: [
            { label: 'Database Size (GB)', path: 'capacity.db_size_gb', fmt: fmtNum },
            { label: 'Database Connections', path: 'capacity.connections', fmt: fmtInt },
            { label: 'Cache Hit Rate (%)', path: 'capacity.cache_hit_pct', fmt: fmtNum },
        ],
    },
];

// Dan, 2026-10-26: the digest must read in one screen. A value cell used to be
// white-space:nowrap as a whole, sub-line included, so one long value (an
// 886-character name list) or a long grey sub-line forced the 600px card to
// 6,300px and Gmail stretched every label away from its number. Short values
// stay on one line; long values and every sub-line wrap inside the card.
const NOWRAP_VALUE_MAX = 28;

function rowHtml(label, valueHtml, sub, red, quiet) {
    const vColor = red ? C.red : quiet ? C.muted : C.text;
    const plainLen = String(valueHtml ?? '').replace(/<[^>]*>/g, '').length;
    const valueWrap = plainLen <= NOWRAP_VALUE_MAX && /^[\s\d.,+/$%:−-]*$/.test(String(valueHtml ?? '').replace(/<[^>]*>/g, '')) ? 'white-space:nowrap;' : 'white-space:normal;word-break:break-word;';
    return `<tr><td style="padding:10px 14px;border-top:1px solid ${C.line};color:${quiet ? C.muted : C.text};font-size:14px;">${esc(label)}</td>`
        + `<td style="padding:10px 14px;border-top:1px solid ${C.line};text-align:right;">`
        + `<span style="color:${vColor};font-weight:700;font-size:14px;${valueWrap}">${valueHtml}</span>`
        + (sub ? `<div style="color:${C.muted};font-size:11px;margin-top:2px;white-space:normal;word-break:break-word;">${esc(sub)}</div>` : '')
        + `</td></tr>`;
}

function cardOpen(title) {
    return `<tr><td style="padding:22px 0 8px 0;color:${C.teal};font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${esc(title)}</td></tr>`
        + `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:${C.row};border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;">`;
}
const cardClose = '</table></td></tr>';

function breakdownText(obj) {
    if (!obj || typeof obj !== 'object') return '';
    const entries = Object.entries(obj).filter(([, v]) => Number(v) !== 0);
    if (!entries.length) return 'None';
    return entries
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .map(([k, v]) => `${k.replace(/_/g, ' ')} ${fmtInt(v)}`)
        .join(', ');
}

/** Rows that render for one section: label, formatted value, comparison line, red flag. */
export function sectionRows(def, digest) {
    const m = digest.metrics || {};
    const p = digest.prev || null;
    return def.rows.map((r) => {
        let raw = get(m, r.path);
        if (r.path.endsWith('.length')) raw = (get(m, r.path.replace(/\.length$/, '')) || []).length;
        let value = r.fmt(raw);
        if (r.extra) value += ` (${fmtUsd(get(m, r.extra))})`;
        if (r.extraRaw) value += r.of ? ` of ${fmtInt(get(m, r.extraRaw))}` : ` / ${fmtInt(get(m, r.extraRaw))}`;
        const parts = [];
        if (p) {
            const prevRaw = r.path.endsWith('.length') ? (get(p, r.path.replace(/\.length$/, '')) || []).length : get(p, r.path);
            const d = delta(raw, prevRaw);
            if (d) parts.push(`${d} vs prior day`);
        }
        if (r.series) {
            const avg = priorAverage(digest, r.series);
            if (avg !== null) parts.push(`7 day avg ${avg >= 100 ? fmtInt(avg) : fmtNum(avg, 1)}`);
        }
        return {
            label: r.label,
            value,
            sub: parts.join(' · '),
            red: r.redIf ? !!r.redIf(raw) : false,
            quiet: !!r.quiet,
            bars: r.series ? trendBars(digest.series?.[r.series]) : '',
        };
    });
}

/** Long grouped titles end at the last complete item, never mid-word. */
export function shortTitle(title, max = 260) {
    const t = String(title || '');
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    const at = Math.max(cut.lastIndexOf(';'), cut.lastIndexOf(','));
    return `${(at > 40 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(' '))).trim()} and more`;
}

const STATUS_LABEL = { fixed: 'Resolved Or Reviewed', in_progress: 'Under Investigation', not_picked_up: 'Not Yet Picked Up', tracked: 'Recorded Alert; Assignment Unconfirmed' };

export function attentionHtml(digest) {
    const items = digest.attention || [];
    if (!items.length) {
        return `<tr><td style="padding:14px 16px;border:1px solid ${C.line};border-radius:10px;background:${C.row};color:${C.green};font-size:14px;font-weight:600;">Nothing needs your attention.</td></tr>`;
    }
    const s = digest.attention_status || {};
    const head = `<div style="color:${C.red};font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:6px;">Needs Your Attention (${items.length})</div>`
        + `<div style="color:${C.muted};font-size:12px;margin-bottom:10px;">Alert records show ${fmtInt(s.fixed)} resolved or reviewed, ${fmtInt(s.in_progress)} under investigation, ${fmtInt(s.not_picked_up)} not yet picked up, and ${fmtInt(s.tracked)} recorded without confirmed assignment. Recording an alert does not confirm that a repair is underway.</div>`;
    const list = items
        .map((it) => {
            const color = it.severity === 'critical' ? C.red : C.amber;
            const status = STATUS_LABEL[it.status] || 'Not Yet Picked Up';
            const sColor = it.status === 'fixed' ? C.green : it.status === 'in_progress' || it.status === 'tracked' ? C.amber : C.muted;
            return `<tr><td style="padding:8px 0;border-top:1px solid ${C.line};font-size:14px;color:${C.text};">`
                + `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:${color};margin-right:8px;"></span>${esc(shortTitle(it.title))}`
                + `<div style="margin:3px 0 0 16px;font-size:11px;color:${sColor};">${esc(status)}${it.resolution ? ` - ${esc(String(it.resolution).slice(0, 160))}` : ''}</div>`
                + `</td></tr>`;
        })
        .join('');
    return `<tr><td style="padding:16px;border:1px solid ${C.red};border-radius:10px;background:#1a0d10;">${head}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">${list}</table></td></tr>`;
}

function listCard(title, rows) {
    if (!rows.length) return '';
    return cardOpen(title) + rows.map((r) => rowHtml(r[0], esc(r[1]), r[2], false, false)).join('') + cardClose;
}

export function buildSubject(digest) {
    const m = digest.metrics || {};
    const n = (digest.attention || []).length;
    const rake = (Number(get(m, 'money.cash_rake')) || 0) + (Number(get(m, 'money.tournament_rake')) || 0);
    const label = digest.day_label ? digest.day_label.replace(/^\w+,\s*/, '') : digest.day;
    return `${n ? `[${n} Need Attention] ` : ''}Smarter.Poker Daily Digest - ${fmtInt(get(m, 'growth.signups'))} Signups, ${fmtInt(rake)} Rake, ${fmtUsd(get(m, 'sales.revenue_usd'))} Sales (${label})`;
}

export function buildHtml(digest, opts = {}) {
    const name = opts.recipientName || 'Admin';
    const m = digest.metrics || {};
    let body = '';

    if (opts.aiSummary) {
        body += `<tr><td style="padding:14px 16px;background:${C.row};border:1px solid ${C.line};border-left:3px solid ${C.teal};border-radius:10px;color:${C.text};font-size:14px;line-height:1.55;">${esc(opts.aiSummary)}</td></tr><tr><td style="height:14px;"></td></tr>`;
    }
    body += attentionHtml(digest);

    // Month to date + projection
    const mtd = digest.mtd || {};
    body += listCard('Month To Date', [
        ['Revenue', fmtUsd(mtd.revenue_usd), `Projected month end ${fmtUsd(mtd.projected_revenue_usd)}`],
        ['Rake (Cash + Tournament)', fmtNum((Number(mtd.cash_rake) || 0) + (Number(mtd.tournament_rake) || 0)), `Projected month end ${fmtNum(mtd.projected_rake)}`],
        ['Real Player Signups', fmtInt(mtd.signups), `${fmtInt(mtd.days)} days recorded this month`],
        ['Horse Net Result (BB)', fmtNum(mtd.horse_net_bb), 'House exposure through the horse fleet'],
    ]);

    body += playerTotalsCard(digest, opts);
    body += playerPeriodCards(digest);
    for (const [title, rows] of spinsSpendRows(digest, opts)) {
        body += opts.email ? cardOpen(title) + rows.map(([label, value, sub]) =>
            `<tr><td colspan="2" class="digest-row"><b>${esc(label)}: ${esc(value)}</b>${sub ? `<div style="color:${C.muted};font-size:11px;">${esc(sub)}</div>` : ''}</td></tr>`).join('') + cardClose : listCard(title, rows);
    }
    if (!opts.email) body += horseRosterCard(digest);
    else body += listCard('Horse Roster', horseRosterRows(digest).slice(0, 6));

    if (digest.week) {
        const w = digest.week;
        body += listCard(`Week In Review (${w.from} To ${w.to})`, [
            ['Revenue', fmtUsd(w.revenue_usd), ''],
            ['Cash Rake', fmtNum(w.cash_rake), ''],
            ['Tournament And Spin Rake', fmtNum(w.tournament_rake), ''],
            ['Rakeback Paid', fmtNum(w.rakeback_paid), ''],
            ['Real Player Signups', fmtInt(w.signups), ''],
            ['Hands Dealt', fmtInt(w.hands), ''],
            ['Diamonds Given Out / Taken In', `${fmtInt(w.diamonds_given)} / ${fmtInt(w.diamonds_taken)}`, ''],
            ['Chips Minted / Burned', `${fmtNum(w.minted)} / ${fmtNum(w.burned)}`, ''],
        ]);
    }

    for (const def of SECTION_DEFS) {
        body += cardOpen(def.title);
        for (const r of sectionRows(def, digest)) {
            body += rowHtml(r.label, `${r.bars}${esc(r.value)}`, r.sub, r.red, r.quiet);
        }
        for (const b of def.breakdowns || []) {
            body += rowHtml(b.label, `<span style="font-weight:400;font-size:12px;color:${C.muted};">${esc(breakdownText(get(m, b.path)))}</span>`, '', false, false);
        }
        body += cardClose;
        if (def.title === 'Growth') body += funnelCard(m);
        if (def.title === 'Money') body += topListCard('Top Clubs By Rake', get(m, 'money.rake_by_club'), (x) => [x.club, fmtNum(x.rake)])
            + topListCard('Top Real Players By Rake (Whale Watch)', get(m, 'money.top_human_rakers'), (x) => [x.username, fmtNum(x.rake)]);
        if (def.title === 'Diamonds') body += topListCard('Diamond Movements Over 10,000', get(m, 'diamonds.big_movements'), (x) => [`${x.username || 'unknown'} (${String(x.type).replace(/_/g, ' ')}, ${x.at_ct})`, fmtInt(x.amount)]);
        if (def.title === 'Platform Health') {
            body += topListCard('Top Alerts', get(m, 'health.alerts_top'), (x) => [`${x.alertname} (${x.severity})`, fmtInt(x.n)])
                + topListCard('Top Client Errors', get(m, 'health.client_errors_top'), (x) => [x.k, fmtInt(x.n)]);
        }
        if (def.title === 'Cost And Capacity' && opts.costs) body += costsCard(opts.costs);
    }

    body += freshnessCard(digest);
    if (opts.email && opts.viewUrl) body += listCard('Full Player And Horse Details', [['View This Digest Online', 'Complete Report', 'The signed link above contains every player, game and horse roster entry.']]);

    const viewUrl = opts.viewUrl ? `<a href="${esc(opts.viewUrl)}" style="display:inline-block;margin:0 8px 8px 0;background:transparent;color:${C.teal};border:1px solid ${C.teal};text-decoration:none;font-weight:700;font-size:14px;padding:13px 22px;border-radius:8px;">View This Digest Online</a>` : '';
    const buttons = `<tr><td style="padding:26px 0 10px 0;">`
        + `<a href="${esc(opts.dashboardUrl || 'https://smarter.poker/admin')}" style="display:inline-block;margin:0 8px 8px 0;background:${C.teal};color:#05221f;text-decoration:none;font-weight:700;font-size:14px;padding:14px 24px;border-radius:8px;">Open The Admin Dashboard</a>${viewUrl}</td></tr>`;

    const footer = `<tr><td style="padding:18px 0 0 0;border-top:1px solid ${C.line};color:${C.muted};font-size:11px;line-height:1.6;">`
        + `Data window: ${esc(get(digest, 'metrics.window.start'))} to ${esc(get(digest, 'metrics.window.end'))} (Central day ${esc(digest.day)}). `
        + `Real players exclude horses, test and certification accounts. Generated ${esc(digest.generated_at)}${opts.runId ? `, run ${esc(opts.runId)}` : ''}.`
        + `<br>&copy; ${new Date().getUTCFullYear()} Smarter.Poker</td></tr>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${esc(buildSubject(digest))}</title></head>`
        + `<body style="margin:0;padding:0;background:${C.page};overflow-wrap:anywhere;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:28px 12px;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;max-width:600px;background:${C.card};border-radius:12px;"><tr><td style="padding:30px 26px;">`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;">`
        + `<tr><td style="color:${C.teal};font-size:18px;font-weight:800;letter-spacing:3px;">SMARTER.POKER</td></tr>`
        + `<tr><td style="padding:18px 0 6px 0;color:#ffffff;font-size:22px;font-weight:800;">Daily Operations Digest</td></tr>`
        + `<tr><td style="padding:0 0 18px 0;color:${C.text};font-size:14px;">Hi ${esc(name)}, here is the platform snapshot for ${esc(digest.day_label || digest.day)} (Central).</td></tr>`
        + (viewUrl ? `<tr><td style="padding:0 0 10px 0;">${viewUrl}</td></tr>` : '')
        + body + buttons + footer
        + `</table></td></tr></table></td></tr></table></body></html>`;
    // Keep the email below inbox clipping limits without dropping summary data.
    // These properties inherit from the body; online rendering stays unchanged.
    return opts.email ? html.replaceAll('font-size:14px;', '')
        .replaceAll(`color:${C.text};`, '').replaceAll('white-space:normal;', '').replaceAll('word-break:break-word;', '')
        .replaceAll(`<td style="padding:10px 14px;border-top:1px solid ${C.line};`, '<td class="digest-row" style="')
        .replace('</head>', `<style>.digest-row{padding:10px 14px;border-top:1px solid ${C.line}}</style></head>`)
        .replaceAll(' style=""', '')
        .replace('<body style="', `<body style="font-size:14px;color:${C.text};`) : html;
}

function funnelCard(m) {
    const f = get(m, 'growth.funnel_30d');
    const r = get(m, 'growth.retention') || {};
    if (!f) return '';
    const ret = (k, label) => {
        const x = r[k] || {};
        return [label, `${fmtInt(x.returned)} of ${fmtInt(x.cohort)}`, x.cohort ? fmtPct(x.returned, x.cohort) : 'No players in that cohort'];
    };
    return listCard('Player Funnel (Last 30 Days) And Retention', [
        ['Signed Up', fmtInt(f.signed_up), ''],
        ['Confirmed Email', fmtInt(f.email_confirmed), fmtPct(f.email_confirmed, f.signed_up)],
        ['Verified Phone', fmtInt(f.phone_verified), fmtPct(f.phone_verified, f.signed_up)],
        ['Joined A Club', fmtInt(f.joined_club), fmtPct(f.joined_club, f.signed_up)],
        ['Played A Hand', fmtInt(f.played_hand), fmtPct(f.played_hand, f.signed_up)],
        ret('d1', 'Day 1 Retention'),
        ret('d7', 'Day 7 Retention'),
        ret('d30', 'Day 30 Retention'),
    ]);
}

/**
 * The horse roster (Dan 2026-10-23): the 35 to 50 horses that are the only ones
 * at cash, sized to the live cash floor, and the PLO list inside it. Comes from
 * fn_ca_horse_roster_digest via fn_sp_daily_digest's 'horse_roster' key.
 */
export function horseRosterRows(digest) {
    const r = digest && digest.horse_roster;
    if (!r || !Array.isArray(r.members)) return [];
    const names = (a) => (Array.isArray(a) && a.length ? a.join(', ') : 'None');
    const rows = [
        ['Horses At Cash', fmtInt(r.size), `Sized to ${fmtInt(r.demand)} live cash games (held between 35 and 50), ${fmtInt(r.refreshes_today)} refreshes that day`],
        ['PLO List', fmtInt(r.plo_count), 'At least 5,000 PLO hands and 1.0 BB/100 over 30 days'],
        ['Added To The Roster', names(r.added), ''],
        ['Dropped From The Roster', names(r.dropped), ''],
        ['Added To The PLO List', names(r.plo_added), ''],
        ['Dropped From The PLO List', names(r.plo_dropped), ''],
    ];
    for (const m of r.members) {
        const plo = m.plo ? `, PLO ${fmtNum(m.plo_bb100)} BB/100` : '';
        rows.push([`${fmtInt(m.rank)}. ${m.name || 'Unknown'}`, `${fmtNum(m.bb100)} BB/100`, `${fmtInt(m.hands)} cash hands in 30 days${plo}`]);
    }
    return rows;
}

function horseRosterCard(digest) {
    return listCard('Horse Roster', horseRosterRows(digest));
}

/** +1,234.5 / -60 / 0: a player's result with its sign. */
export function fmtSigned(v) {
    const n = num(v) ?? 0;
    if (Math.abs(n) < 0.005) return '0';
    return `${n > 0 ? '+' : '-'}${fmtNum(Math.abs(n))}`;
}

/** 822 minutes -> 13h 42m; 45 -> 45m. */
export function fmtMinutes(v) {
    const m = Math.max(0, Math.round(num(v) ?? 0));
    if (m < 60) return `${m}m`;
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function gameLabel(g) {
    if (g.kind === 'tournament') {
        const times = Number(g.entries) > 1 ? ` x${fmtInt(g.entries)}` : '';
        return `${g.label || 'Tournament'}${g.type ? ` (${g.type})` : ''}${times}`;
    }
    if (g.kind === 'diamond_arena') return `Diamond Arena ${g.label || ''} (Diamonds)`.trim();
    return `${g.label || 'Other'} Cash`;
}

/**
 * Real Player Totals (Dan 2026-10-25): what every real player did that Central
 * day. Comes from fn_sp_digest_player_totals (Club Arena migration
 * 20261026033215) as digest.player_totals. Returns the summary rows and one
 * block per player: their day, their balances, then every game they played.
 */
export function playerTotalsRows(digest) {
    const p = digest && digest.player_totals;
    if (!p) return null;
    if (p.error) return { error: String(p.error), summary: [], players: [] };
    const t = p.totals || {};
    const players = Array.isArray(p.players) ? p.players : [];
    const summary = [
        ['Real Players Who Played', fmtInt(t.players), `${fmtInt(t.hands)} hands, ${fmtMinutes(t.minutes)} played in all`],
        ['Players Net Won / Lost (Chips)', fmtSigned(t.net), `Cash games ${fmtSigned(t.cash_net)}, tournaments ${fmtSigned(t.tournament_net)}; already after rake and BBJ`],
        ['Winning Players / Losing Players', t.won === undefined ? 'Unavailable' : `${fmtSigned(t.won)} / ${fmtSigned(-Number(t.lost))}`, 'Positive and negative player results shown separately'],
        ['Rake Paid - Cash Games', fmtNum(t.cash_rake), ''],
        ['Rake Paid - Tournaments', fmtNum(t.tournament_rake), ''],
        ['BBJ Rake Paid', t.bbj_rake === undefined ? 'Unavailable' : fmtNum(t.bbj_rake), 'Player contributions to the bad beat jackpot'],
        ['Rake Paid - Total', t.bbj_rake === undefined ? 'Unavailable' : fmtNum((Number(t.cash_rake) || 0) + (Number(t.tournament_rake) || 0) + Number(t.bbj_rake)), 'Cash games, tournaments and BBJ'],
        ['Chip Wallets At End Of Day', fmtNum(t.wallet_end), 'All of these players together'],
    ];
    if (p.result_basis) summary.push(['Result Calculation', 'Central Day', String(p.result_basis)]);
    if (Number(t.diamond_arena_net) || Number(t.diamond_arena_rake)) {
        summary.push(['Diamond Arena Won / Lost (Diamonds)', fmtSigned(t.diamond_arena_net), `Rake ${fmtNum(t.diamond_arena_rake)} diamonds, not in the chip totals`]);
    }
    return {
        error: null,
        summary,
        players: players.map((x) => ({
            name: x.username || 'Unknown',
            net: num(x.net) ?? 0,
            head: `${fmtMinutes(x.minutes)} played, ${fmtInt(x.hands)} hands`,
            rows: [
                ['Won / Lost', fmtSigned(x.net), `Cash games ${fmtSigned(x.cash_net)}, tournaments ${fmtSigned(x.tournament_net)}`],
                ['Rake Paid', x.bbj_rake === undefined ? 'Unavailable' : fmtNum((Number(x.cash_rake) || 0) + (Number(x.tournament_rake) || 0) + Number(x.bbj_rake)), `Cash games ${fmtNum(x.cash_rake)}, tournaments ${fmtNum(x.tournament_rake)}, BBJ ${x.bbj_rake === undefined ? 'unavailable' : fmtNum(x.bbj_rake)}`],
                ['Balances At End Of Day', `${fmtNum(x.wallet_end)} chips`, `${fmtInt(x.diamonds_end)} diamonds`],
                ...(Array.isArray(x.games) ? x.games : []).map((g) => [
                    gameLabel(g),
                    fmtSigned(g.net),
                    `${fmtInt(g.hands)} hands, ${fmtMinutes(g.minutes)}, rake ${fmtNum(g.rake)}`,
                ]),
            ],
            gamesFrom: 3,
        })),
    };
}

function playerPeriodCards(digest) {
    const period = digest.player_totals?.period;
    if (!period) return '';
    if (period.error) return listCard('Player Period Totals', [['Could Not Be Built', 'Unavailable', period.error]]);
    return [['week', 'Real Players - Last 7 Days'], ['month', 'Real Players - Month To Date']].map(([key, title]) => {
        const p = period[key];
        if (!p) return '';
        if (p.missing_days) return listCard(title, [['History Incomplete', 'Unavailable', `${fmtInt(p.missing_days)} missing days; partial totals are not shown.`]]);
        return listCard(title, [
            ['Period', `${p.from} To ${p.to}`, 'Central calendar days'],
            ['Real Players Who Played', fmtInt(p.players), `${fmtInt(p.hands)} hands, ${fmtMinutes(p.minutes)}`],
            ['Net Won / Lost (Chips)', fmtSigned(p.net), `Cash ${fmtSigned(p.cash_net)}, tournaments ${fmtSigned(p.tournament_net)}`],
            ['Rake Paid - Cash Games', fmtNum(p.cash_rake), ''],
            ['Rake Paid - Tournaments', fmtNum(p.tournament_rake), ''],
            ['BBJ Rake Paid', p.bbj_rake === undefined ? 'Unavailable' : fmtNum(p.bbj_rake), ''],
            ['Rake Paid - Total', p.bbj_rake === undefined ? 'Unavailable' : fmtNum(Number(p.cash_rake) + Number(p.tournament_rake) + Number(p.bbj_rake)), 'Includes BBJ'],
        ]);
    }).join('');
}

function signedColor(v) {
    const n = Number(String(v).replace(/,/g, ''));
    if (!Number.isFinite(n) || n === 0) return C.text;
    return n > 0 ? C.green : C.text;
}

function playerTotalsCard(digest, opts = {}) {
    const r = playerTotalsRows(digest);
    if (!r) return '';
    let html = cardOpen('Real Player Totals');
    if (r.error) {
        html += rowHtml('Player totals could not be built', '', r.error.slice(0, 200), true, false);
        return html + cardClose;
    }
    for (const [label, value, sub] of r.summary) html += rowHtml(label, `<span style="color:${label.includes('Won / Lost') ? signedColor(value) : C.text};">${esc(value)}</span>`, sub, false, false);
    if (!r.players.length) html += rowHtml('No real player played a hand or a tournament', '', '', false, true);
    if (opts.email) {
        for (const pl of r.players) html += rowHtml(pl.name, esc(fmtSigned(pl.net)), `${pl.head}; rake ${pl.rows[1][1]}; ${pl.rows[2][1]}`, false, false);
    }
    html += cardClose;
    for (const pl of opts.email ? [] : r.players) {
        html += `<tr><td style="padding:14px 0 6px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;background:${C.row};border:1px solid ${C.line};border-radius:10px;border-collapse:separate;overflow:hidden;">`;
        html += `<tr><td style="padding:10px 14px;color:#ffffff;font-size:15px;font-weight:800;">${esc(pl.name)}<div style="color:${C.muted};font-size:11px;font-weight:400;margin-top:2px;">${esc(pl.head)}</div></td>`
            + `<td style="padding:10px 14px;text-align:right;white-space:nowrap;font-size:15px;font-weight:800;color:${signedColor(pl.net)};">${esc(fmtSigned(pl.net))}</td></tr>`;
        pl.rows.forEach(([label, value, sub], i) => {
            const isGame = i >= pl.gamesFrom;
            const shown = isGame || i === 0 ? `<span style="color:${signedColor(value)};">${esc(value)}</span>` : esc(value);
            html += rowHtml(isGame ? `- ${label}` : label, shown, sub, false, false);
        });
        html += '</table></td></tr>';
    }
    return html;
}

function playerTotalsText(digest) {
    const r = playerTotalsRows(digest);
    if (!r) return [];
    const lines = ['', 'REAL PLAYER TOTALS'];
    if (r.error) return [...lines, `Player totals could not be built: ${r.error.slice(0, 200)}`];
    for (const [label, value, sub] of r.summary) lines.push(`${label}: ${value}${sub ? `  (${sub})` : ''}`);
    for (const pl of r.players) {
        lines.push('');
        lines.push(`${pl.name}: ${fmtSigned(pl.net)}  (${pl.head})`);
        pl.rows.forEach(([label, value, sub], i) => lines.push(`  ${i >= pl.gamesFrom ? '- ' : ''}${label}: ${value}${sub ? `  (${sub})` : ''}`));
    }
    return lines;
}

function topListCard(title, arr, map) {
    if (!Array.isArray(arr) || !arr.length) return '';
    return listCard(title, arr.map((x) => [...map(x), '']));
}

function costsCard(costs) {
    const rows = [];
    for (const c of costs.items || []) rows.push([c.label, c.value === null ? 'Unavailable' : fmtUsd(c.value), c.note || '']);
    return listCard('Provider Spend (Yesterday)', rows);
}

function freshnessCard(digest) {
    const f = get(digest, 'metrics.freshness') || {};
    const rows = Object.entries(f).map(([k, v]) => {
        const ts = v ? new Date(v) : null;
        const label = ts ? ts.toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Never';
        return [k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), label, ''];
    });
    return listCard('Data Freshness (Newest Row When The Snapshot Ran)', rows);
}

export function buildText(digest, opts = {}) {
    const lines = [];
    lines.push('SMARTER.POKER - DAILY OPERATIONS DIGEST');
    lines.push(`${digest.day_label || digest.day} (Central)`);
    if (opts.viewUrl) lines.push(`View online: ${opts.viewUrl}`);
    lines.push('');
    if (opts.aiSummary) {
        lines.push(opts.aiSummary);
        lines.push('');
    }
    const items = digest.attention || [];
    lines.push(items.length ? `NEEDS YOUR ATTENTION (${items.length})` : 'Nothing needs your attention.');
    for (const it of items) lines.push(`- ${shortTitle(it.title)} [${STATUS_LABEL[it.status] || 'Not Yet Picked Up'}]${it.resolution ? ` - ${String(it.resolution).slice(0, 160)}` : ''}`);
    lines.push('', 'MONTH TO DATE');
    for (const [k, v] of Object.entries(digest.mtd || {})) lines.push(`${k.replace(/_/g, ' ')}: ${fmtNum(v)}`);
    if (digest.week) {
        lines.push('', `WEEK IN REVIEW (${digest.week.from} To ${digest.week.to})`);
        for (const [k, v] of Object.entries(digest.week).filter(([k]) => !['from', 'to'].includes(k))) lines.push(`${k.replace(/_/g, ' ')}: ${fmtNum(v)}`);
    }
    lines.push(...playerTotalsText(digest));
    for (const [title, rows] of spinsSpendRows(digest)) {
        lines.push('', title.toUpperCase());
        for (const [label, value, sub] of rows) lines.push(`${label}: ${value}${sub ? ` (${sub})` : ''}`);
    }
    for (const key of ['week', 'month']) {
        const p = digest.player_totals?.period?.[key];
        if (!p) continue;
        lines.push('', key === 'week' ? 'REAL PLAYERS - LAST 7 DAYS' : 'REAL PLAYERS - MONTH TO DATE');
        if (p.missing_days) lines.push(`Unavailable: ${fmtInt(p.missing_days)} missing days; partial totals are not shown.`);
        else lines.push(`${p.from} To ${p.to}: ${fmtInt(p.players)} players, net ${fmtSigned(p.net)}, cash rake ${fmtNum(p.cash_rake)}, tournament rake ${fmtNum(p.tournament_rake)}, BBJ ${p.bbj_rake === undefined ? 'unavailable' : fmtNum(p.bbj_rake)}`);
    }
    const roster = horseRosterRows(digest);
    if (roster.length) {
        lines.push('');
        lines.push('HORSE ROSTER');
        for (const [label, value, sub] of roster) lines.push(`${label}: ${value}${sub ? `  (${sub})` : ''}`);
    }
    for (const def of SECTION_DEFS) {
        lines.push('');
        lines.push(def.title.toUpperCase());
        for (const r of sectionRows(def, digest)) lines.push(`${r.label}: ${r.value}${r.sub ? `  (${r.sub})` : ''}`);
        for (const b of def.breakdowns || []) lines.push(`${b.label}: ${breakdownText(get(digest.metrics, b.path))}`);
    }
    lines.push('');
    lines.push(`Admin dashboard: ${opts.dashboardUrl || 'https://smarter.poker/admin'}`);
    return lines.join('\n');
}

/** Every number a reader could see in the email, normalised, for the AI guard. */
export function allowedNumbers(digest, extra = []) {
    const set = new Set();
    const add = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return;
        for (const x of [n, Math.round(n), Math.round(n * 10) / 10, Math.round(n * 100) / 100, Math.abs(n), Math.round(Math.abs(n))]) set.add(String(x));
    };
    const walk = (o) => {
        if (o === null || o === undefined) return;
        if (typeof o === 'number' || (typeof o === 'string' && /^-?\d+(\.\d+)?$/.test(o))) return add(o);
        if (Array.isArray(o)) return o.forEach(walk);
        if (typeof o === 'object') Object.values(o).forEach(walk);
    };
    walk(digest);
    for (const def of SECTION_DEFS) for (const r of def.rows) {
        if (r.series) {
            const avg = priorAverage(digest, r.series);
            if (avg !== null) add(avg);
        }
    }
    extra.forEach(add);
    // counts the email states (attention items, status buckets) and the 7 of "7 day"
    add((digest.attention || []).length);
    add(7); add(24); add(30); add(35); add(50); add(5000); add(1);
    return set;
}

export { SECTION_DEFS, C as COLORS };

export function spinsSpendRows(digest, opts = {}) {
    const r = digest.spins_spend;
    if (!r) return [];
    if (r.error) return [['Diamond Spins And Spend', [['Report Unavailable', 'Unavailable', String(r.error)]]]];
    const diamondRows = [], chipRows = [], valuationRows = [];
    for (const [key, name] of [['humans', 'Humans'], ['horses', 'Horses'], ['unknown', 'Unknown'], ['total', 'Total']]) {
        const x = r.spins?.[key] || {};
        if (key === 'unknown' && !x.spins) continue;
        diamondRows.push(
            [`${name} - Diamonds Collected`, `${fmtNum(x.diamonds_collected ?? 0)} Diamonds`, ''],
            [`${name} - Diamond Prizes Paid`, `${fmtNum(x.diamonds_paid ?? 0)} Diamonds`, ''],
            [`${name} - Collected Less Diamond Prizes`, `${fmtNum(Number(x.diamonds_collected ?? 0) - Number(x.diamonds_paid ?? 0))} Diamonds`, 'Before platform burn, inventory costs and separate Chip payouts'],
        );
        chipRows.push(
            [`${name} - Direct Spin Payouts`, `${fmtNum(x.direct_chips_paid ?? 0)} Chips`, ''],
            [`${name} - Bonus Game Payouts`, `${fmtNum(x.bonus_chips_paid ?? 0)} Chips`, ''],
            [`${name} - Total Chips Paid`, `${fmtNum(x.chips_paid ?? 0)} Chips`, `${fmtInt(x.spins ?? 0)} spins`],
        );
        valuationRows.push([`${name} - Converted Margin`, `${fmtSigned(x.profit_chip_equivalent ?? 0)} Chips Equivalent`,
            Number(x.pending_awards) ? `Provisional: ${fmtInt(x.pending_awards)} unsettled awards` : 'Calculated valuation only; not a Chip payment or Diamond settlement']);
    }
    valuationRows.push(['Calculation', 'Spin Day', r.basis || '']);
    const spend = Array.isArray(r.spend) ? r.spend : [];
    const paid = spend.filter(x => x.to_type === 'player_wallet');
    const leaderboard = paid.filter(x => x.category === 'leaderboard_payout');
    const promo = paid.filter(x => x.category !== 'leaderboard_payout');
    let internal = spend.filter(x => x.to_type !== 'player_wallet');
    if (opts.email) {
        const grouped = new Map();
        for (const x of internal) {
            const key = `${x.category}:${x.from_type}:${x.to_type}`;
            const prior = grouped.get(key);
            if (prior) { prior.amount += Number(x.amount); prior.transactions += Number(x.transactions); }
            else grouped.set(key, { ...x, recipient: x.to_type === 'union_wallet' ? x.recipient : x.to_type.replace(/_/g, ' '), amount: Number(x.amount), transactions: Number(x.transactions) });
        }
        internal = [...grouped.values()];
    }
    const detail = x => [`${x.recipient} (${x.recipient_kind})`, `${fmtNum(x.amount)} Chips`, `${x.category}; ${x.from_type} to ${x.to_type}; ${fmtInt(x.transactions)} transactions`];
    const payouts = (items) => [['Total Paid', `${fmtNum(items.reduce((sum, x) => sum + Number(x.amount), 0))} Chips`, 'Actual player-wallet payments for this Central day'], ...items.map(detail)];
    return [['Diamond Spins - Diamonds', diamondRows],
        ['Diamond Spins - Chips', chipRows],
        ['Diamond Spins - Converted Valuation', valuationRows],
        ['Promo Player Payouts - Chips', payouts(promo)],
        ['Leaderboard Player Payouts - Chips', payouts(leaderboard)],
        ['Internal Funding Movements - Chips', internal.length ? internal.map(detail) : [['Internal Movements', '0 Chips', '']]]];
}
