/**
 * Trivia engine v3 reference implementation (pure, no I/O).
 * ===========================================================================
 * The database is the authority: public.trivia_select_core_v1 builds rosters,
 * public.trivia_option_permutation_v1 permutes options and public.trivia_p3_grade
 * grades (supabase/migrations/*_trivia_p3_roster_session_engine.sql). This module
 * restates the same algorithms so node tests can prove, against golden seeds exported
 * from the database, that a roster, a permutation and a grade are pure functions of
 * (secret, scope label, pool, histories). Change the SQL and this file together:
 * __tests__/trivia-phase-3-engine.test.mjs replays 1,000 golden seeds.
 *
 * Nothing here is used to serve or grade a player; the secret never leaves the database
 * in production (tests use a fixed public test secret).
 */
import { createHash, createHmac } from 'node:crypto';

export const SELECTION_VERSION = 'trivia-select/1';
export const PERMUTATION_VERSION = 'trivia-perm/1';
export const DIFFICULTY_RANK = Object.freeze({ easy: 0, medium: 1, hard: 2 });

export function hmacHex(secret, label) {
    return createHmac('sha256', secret).update(Buffer.from(String(label), 'utf8')).digest('hex');
}

export function sha256Hex(text) {
    return createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest('hex');
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** order[displayIndex] = originalIndex (mirrors trivia_option_permutation_v1). */
export function optionPermutation(secret, sessionId, questionId, n) {
    const keys = [];
    for (let i = 0; i < n; i++) keys.push([i, hmacHex(secret, `${PERMUTATION_VERSION}:${sessionId}:${questionId}:${i}`)]);
    return keys.sort((x, y) => cmp(x[1], y[1])).map(([i]) => i);
}

/** Largest remainder over n x mix; ties by fraction desc then difficulty name asc. */
export function difficultyCounts(n, mix) {
    const SCALE = 1_000_000;
    const rows = Object.entries(mix).map(([diff, share]) => {
        const s = Math.round(Number(share) * SCALE);
        return { diff, base: Math.floor((n * s) / SCALE), frac: (n * s) % SCALE };
    });
    const remainder = n - rows.reduce((sum, r) => sum + r.base, 0);
    const ranked = [...rows].sort((a, b) => (b.frac - a.frac) || cmp(a.diff, b.diff));
    const out = {};
    ranked.forEach((r, i) => { out[r.diff] = r.base + (i < remainder ? 1 : 0); });
    return out;
}

/**
 * candidates: [{ id, category, difficulty, tier }] already filtered to the profile
 * (mode, categories, timer) exactly as the SQL candidate query does.
 * profile: { questionCount, categories, difficultyMix, orderPolicy }
 */
export function selectRoster({ secret, label, profile, candidates, count }) {
    const n = count ?? profile.questionCount;
    const base = `${SELECTION_VERSION}:${label}`;
    const cats = [...profile.categories]
        .map(c => [c, hmacHex(secret, `${base}:c:${c}`)])
        .sort((a, b) => cmp(a[1], b[1])).map(([c]) => c);
    const counts = difficultyCounts(n, profile.difficultyMix);
    const tokens = [];
    for (const [diff, cnt] of Object.entries(counts)) {
        for (let i = 1; i <= cnt; i++) tokens.push({ diff, k: hmacHex(secret, `${base}:t:${diff}:${i}`) });
    }
    tokens.sort((a, b) => cmp(a.k, b.k));
    const slots = tokens.map((t, slot) => ({ slot, category: cats[slot % cats.length], difficulty: t.diff }));

    const cand = candidates.map(c => ({ ...c, k: hmacHex(secret, `${base}:q:${c.id}`), picked: 0 }));
    const byRank = (a, b) => (a.tier - b.tier) || cmp(a.k, b.k);

    const cellDemand = new Map();
    for (const s of slots) {
        const key = `${s.category}|${s.difficulty}`;
        cellDemand.set(key, (cellDemand.get(key) || 0) + 1);
    }
    for (const [key, demand] of cellDemand) {
        const [category, difficulty] = key.split('|');
        cand.filter(c => c.category === category && c.difficulty === difficulty)
            .sort(byRank).slice(0, demand).forEach(c => { c.picked = 1; });
    }
    const catDemand = new Map();
    for (const s of slots) catDemand.set(s.category, (catDemand.get(s.category) || 0) + 1);
    const pickedByCat = new Map();
    for (const c of cand) if (c.picked) pickedByCat.set(c.category, (pickedByCat.get(c.category) || 0) + 1);
    for (const [category, demand] of catDemand) {
        const deficit = demand - (pickedByCat.get(category) || 0);
        if (deficit <= 0) continue;
        cand.filter(c => !c.picked && c.category === category).sort(byRank).slice(0, deficit)
            .forEach(c => { c.picked = 2; });
    }
    let picked = cand.filter(c => c.picked).length;
    if (picked < n) {
        cand.filter(c => !c.picked).sort(byRank).slice(0, n - picked).forEach(c => { c.picked = 3; });
        picked = cand.filter(c => c.picked).length;
    }
    const chosen = cand.filter(c => c.picked).map(c => ({ ...c, o: hmacHex(secret, `${base}:o:${c.id}`) }));
    chosen.sort((a, b) => {
        if (profile.orderPolicy === 'difficulty_ramp') {
            const d = (DIFFICULTY_RANK[a.difficulty] ?? 2) - (DIFFICULTY_RANK[b.difficulty] ?? 2);
            if (d) return d;
        }
        return cmp(a.o, b.o);
    });
    return chosen.map((c, i) => ({ position: i + 1, id: c.id, category: c.category, difficulty: c.difficulty, tier: c.tier }));
}

/** Grade answers { [questionId]: displayIndex } against keys { [questionId]: correctIndex }. */
export function gradeRun({ roster, permutations, answers, keys, pointsPerCorrect }) {
    let correct = 0;
    for (const q of roster) {
        const d = answers[q.id];
        if (Number.isInteger(d) && d >= 0 && permutations[q.id][d] === keys[q.id]) correct += 1;
    }
    return { correct, total: roster.length, score: correct * pointsPerCorrect };
}
