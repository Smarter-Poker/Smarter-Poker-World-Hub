/**
 * /admin/trivia-pool — Live trivia question pool dashboard
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 51 (2026-05-05). Visualizes the gap to 1500/category target across
 * all 10 categories, separated into Track A (deterministic) and Track B
 * (Grok). Per-difficulty bucket gaps are shown so you can spot stalled
 * easy/medium/hard fills at a glance.
 *
 * Auth: same posture as /admin/signup-health (admin secret OR is_admin).
 * No write actions — pure read-only operator view. Reload to refresh.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { createClient } from '@supabase/supabase-js';

const TARGET_PER_CATEGORY = 1500;
const SIXTY_DAY_FLOOR = 1200;
const TRACK_A = ['gto_theory', 'gto_scenarios', 'cash_game_situations', 'mtt_situations', 'icm_chip_ev'];
const TRACK_B = ['poker_history', 'famous_hands', 'player_profiles', 'tournament_facts', 'rule_knowledge'];
const ALL = [...TRACK_A, ...TRACK_B];
const PRETTY = {
    gto_theory: 'GTO Theory',
    gto_scenarios: 'GTO Scenarios',
    cash_game_situations: 'Cash Games',
    mtt_situations: 'MTT Situations',
    icm_chip_ev: 'ICM & Chip EV',
    poker_history: 'Poker History',
    famous_hands: 'Famous Hands',
    player_profiles: 'Player Profiles',
    tournament_facts: 'Tournament Facts',
    rule_knowledge: 'Rules & Etiquette',
};

export async function getServerSideProps({ req }) {
    // Same auth pattern as /admin/signup-health: admin secret OR Bearer with is_admin
    const adminSecret = req.headers['x-admin-secret'];
    const envSecret = process.env.ADMIN_ROUTE_SECRET;
    const hasAdminSecret = envSecret && adminSecret === envSecret;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!hasAdminSecret) {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer ')) {
            return { redirect: { destination: '/auth/login?redirect=/admin/trivia-pool', permanent: false } };
        }
        if (!url || !anonKey || !srKey) return { props: { error: 'Server misconfigured (missing Supabase env)' } };
        const sb = createClient(url, anonKey);
        const { data: userData, error: uErr } = await sb.auth.getUser(auth.slice(7));
        if (uErr || !userData?.user) {
            return { redirect: { destination: '/auth/login?redirect=/admin/trivia-pool', permanent: false } };
        }
        const adminClient = createClient(url, srKey);
        const { data: profile } = await adminClient
            .from('profiles').select('is_admin').eq('id', userData.user.id).maybeSingle();
        if (!profile?.is_admin) return { props: { error: 'Forbidden — admin only' } };
    }

    if (!url || !srKey) return { props: { error: 'Server misconfigured' } };
    const adm = createClient(url, srKey, { auth: { persistSession: false } });

    // Pull per-category counts in parallel
    const fetches = ALL.flatMap(cat => ['easy', 'medium', 'hard'].map(diff =>
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).eq('category', cat).eq('difficulty', diff)
            .then(r => ({ cat, diff, count: r.count || 0 }))
    ));
    // Source mix
    const sourceFetches = ['deterministic', 'grok-3-mini', 'legacy_v12'].map(src =>
        adm.from('trivia_questions').select('id', { count: 'exact', head: true }).eq('source', src)
            .then(r => ({ src, count: r.count || 0 }))
    );
    const nullSourceFetch = adm.from('trivia_questions').select('id', { count: 'exact', head: true }).is('source', null)
        .then(r => ({ src: 'null', count: r.count || 0 }));

    const [counts, sources] = await Promise.all([
        Promise.all(fetches),
        Promise.all([...sourceFetches, nullSourceFetch]),
    ]);

    // Pivot per-cat counts
    const byCat = {};
    for (const cat of ALL) byCat[cat] = { easy: 0, medium: 0, hard: 0, total: 0 };
    for (const { cat, diff, count } of counts) {
        byCat[cat][diff] = count;
        byCat[cat].total += count;
    }

    return {
        props: {
            byCat,
            sources,
            generatedAt: new Date().toISOString(),
        },
    };
}

function bar(current, target, color) {
    const pct = Math.min(100, Math.round((current / target) * 100));
    return (
        <div style={{ position: 'relative', height: 22, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, transition: 'width 0.3s' }} />
            <div style={{ position: 'relative', textAlign: 'center', lineHeight: '22px', fontSize: 12, fontWeight: 600, color: '#fff', textShadow: '0 0 3px rgba(0,0,0,0.7)' }}>
                {current} / {target}
            </div>
        </div>
    );
}

function CatRow({ catId, counts, track }) {
    const targetEasy = Math.floor(TARGET_PER_CATEGORY * 0.20);
    const targetMedium = Math.floor(TARGET_PER_CATEGORY * 0.50);
    const targetHard = Math.floor(TARGET_PER_CATEGORY * 0.30);
    const trackColor = track === 'A' ? '#22c55e' : '#06b6d4';
    const totalPct = Math.round((counts.total / TARGET_PER_CATEGORY) * 100);
    const belowFloor = counts.total < SIXTY_DAY_FLOOR;
    return (
        <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <td style={{ padding: '12px 12px', fontWeight: 600, color: '#fff' }}>
                <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: trackColor, marginRight: 8, fontSize: 11, lineHeight: '18px', textAlign: 'center', color: '#000', fontWeight: 700 }}>
                    {track}
                </span>
                {PRETTY[catId]}
            </td>
            <td style={{ padding: '12px 8px', minWidth: 140 }}>{bar(counts.easy, targetEasy, '#fbbf24')}</td>
            <td style={{ padding: '12px 8px', minWidth: 140 }}>{bar(counts.medium, targetMedium, '#3b82f6')}</td>
            <td style={{ padding: '12px 8px', minWidth: 140 }}>{bar(counts.hard, targetHard, '#a855f7')}</td>
            <td style={{ padding: '12px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: belowFloor ? '#ef4444' : totalPct >= 100 ? '#22c55e' : '#fff' }}>
                {counts.total} / {TARGET_PER_CATEGORY}
                <div style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.5)' }}>
                    {totalPct}%{belowFloor ? ' · below 60-day floor' : ''}
                </div>
            </td>
        </tr>
    );
}

export default function TriviaPoolDashboard({ byCat, sources, generatedAt, error }) {
    if (error) {
        return <div style={{ padding: 40, color: '#ef4444', background: '#0a0a15', minHeight: '100vh', fontFamily: 'system-ui' }}>Error: {error}</div>;
    }
    const totalCount = ALL.reduce((s, c) => s + (byCat[c]?.total || 0), 0);
    const targetTotal = ALL.length * TARGET_PER_CATEGORY;
    const overallPct = Math.round((totalCount / targetTotal) * 100);

    const trackATotal = TRACK_A.reduce((s, c) => s + (byCat[c]?.total || 0), 0);
    const trackBTotal = TRACK_B.reduce((s, c) => s + (byCat[c]?.total || 0), 0);

    return (
        <div style={{ padding: 32, background: '#0a0a15', minHeight: '100vh', color: '#fff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Trivia Pool Dashboard</h1>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                        Generated {new Date(generatedAt).toLocaleString()} · <a href="/admin/trivia-pool" style={{ color: '#00D4FF' }}>Reload</a>
                    </div>
                </div>
                <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 24 }}>
                    Phase 49 target: 1,500 per category · 60-day floor: 1,200 · 20/50/30 easy/medium/hard mix
                </div>

                {/* Top summary cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
                    <Card title="Pool total" value={`${totalCount.toLocaleString()} / ${targetTotal.toLocaleString()}`} subtitle={`${overallPct}% complete`} color={overallPct >= 100 ? '#22c55e' : overallPct >= 50 ? '#fbbf24' : '#ef4444'} />
                    <Card title="Track A (deterministic)" value={`${trackATotal.toLocaleString()} / 7,500`} subtitle={`${Math.round((trackATotal / 7500) * 100)}% — solver-grounded`} color="#22c55e" />
                    <Card title="Track B (Grok-3-mini)" value={`${trackBTotal.toLocaleString()} / 7,500`} subtitle={`${Math.round((trackBTotal / 7500) * 100)}% — fact-verified`} color="#06b6d4" />
                </div>

                {/* Per-category table */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                <th style={{ padding: '12px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>CATEGORY</th>
                                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>EASY (300)</th>
                                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>MEDIUM (750)</th>
                                <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>HARD (450)</th>
                                <th style={{ padding: '12px 12px', textAlign: 'right', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5 }}>TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            {TRACK_A.map(cat => <CatRow key={cat} catId={cat} counts={byCat[cat]} track="A" />)}
                            <tr><td colSpan={5} style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.02)', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 }}>━━ TRACK B ━━</td></tr>
                            {TRACK_B.map(cat => <CatRow key={cat} catId={cat} counts={byCat[cat]} track="B" />)}
                        </tbody>
                    </table>
                </div>

                {/* Source mix */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: 0.5, margin: '0 0 12px 0' }}>SOURCE MIX</h3>
                    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                        {sources.map(({ src, count }) => (
                            <div key={src} style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{src === 'null' ? 'unset (legacy)' : src}</span>
                                <span style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{count.toLocaleString()}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Operational hints */}
                <div style={{ background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 12, padding: 16, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6 }}>How the refill works</div>
                    <div style={{ lineHeight: 1.6 }}>
                        Every 4 hours, the openclaw dispatcher fires <code style={{ background: 'rgba(0,0,0,0.4)', padding: '1px 5px', borderRadius: 3 }}>/cron/generate-trivia-questions</code> on
                        the workers VM. The handler picks the most-undertarget bucket, runs Track A (deterministic, free) for strategy
                        categories or Track B (Grok-3-mini, ~$0.002 per batch) for fact categories, and inserts directly into
                        <code style={{ background: 'rgba(0,0,0,0.4)', padding: '1px 5px', borderRadius: 3, margin: '0 4px' }}>trivia_questions</code>.
                        At ~30 questions per tick × 6 ticks/day, the pool fills in ~5–6 weeks at well under $20 total Grok spend.
                    </div>
                </div>
            </div>
        </div>
    );
}

function Card({ title, value, subtitle, color }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 20, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginBottom: 4 }}>{value}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{subtitle}</div>
        </div>
    );
}
