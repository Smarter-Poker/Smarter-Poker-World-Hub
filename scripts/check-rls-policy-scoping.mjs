#!/usr/bin/env node
/**
 * RLS POLICY SCOPING CHECK — zero tolerance for new migrations
 * ═══════════════════════════════════════════════════════════════════════════
 * Flags the anti-pattern:
 *
 *     CREATE POLICY "service role manages x" ON t
 *       FOR ALL USING (auth.role() = 'service_role');
 *
 * with no `TO service_role` clause.
 *
 * ── WHY IT IS WRONG ────────────────────────────────────────────────────────
 * Omitting `TO` defaults the policy to PUBLIC, attaching it to EVERY role.
 * Postgres then evaluates that expression for every row of every matching
 * statement issued by anon and authenticated — where it can only ever be
 * false. It is pure overhead that can never grant anything.
 *
 * That the predicate is constant-false for those roles is not an assumption;
 * it was measured on production before the cleanup:
 *
 *     db role anon          ->  auth.role() = NULL
 *     db role authenticated ->  auth.role() = NULL
 *
 * never 'service_role'. auth.role() reads the JWT role claim and PostgREST
 * derives the database role from that same claim, so the two cannot diverge: a
 * caller whose claim is service_role runs AS service_role, which has BYPASSRLS
 * and never consults policies at all. The expression is true only for a role
 * that ignores it, and false for every role that evaluates it.
 *
 * ── WHAT IT COST ───────────────────────────────────────────────────────────
 * Written `FOR ALL`, one such policy collides with all four commands for both
 * roles, producing 8 multiple_permissive_policies advisor warnings per table.
 * 44 of 64 warnings (69%, across 10 tables) came from just 13 of these.
 * Re-scoping them (20260813020000) plus 38 single-command siblings
 * (20260813030000), and dropping 12 exact-duplicate policies
 * (20260813010000), took the count from 76 to 25.
 *
 * ── WHAT IS DELIBERATELY NOT FLAGGED ───────────────────────────────────────
 * MIXED policies, where the service_role test is one branch of an OR that also
 * grants real users access:
 *
 *     USING (auth.uid() = user_id OR auth.role() = 'service_role')
 *
 * Those are correct and MUST stay TO public — re-scoping them would revoke
 * genuine user access. 15 such policies exist in production
 * (social_posts."Users can create their own posts",
 *  trivia_pvp_queue."Users can delete own queue entry",
 *  venue_live_tables.*_service, and others). The detector requires the body to
 * reduce to the service_role test ALONE before flagging it.
 *
 * ── WHY A DATE CUTOFF RATHER THAN A FROZEN COUNT ───────────────────────────
 * Migration history is immutable: the historical occurrences are already
 * applied and cannot be rewritten, and the live database was corrected with
 * ALTER POLICY instead. An earlier version of this script froze a count of
 * those, but that count came from a clone that was behind origin/main — a
 * baseline you cannot verify is worse than no baseline, because it fails the
 * build for reasons unrelated to the change being made.
 *
 * So: migrations dated before the cutoff are skipped entirely, and everything
 * from the cutoff onward must be clean. No counting of history required.
 *
 * If you are adding a service-role-only policy, write it as:
 *
 *     CREATE POLICY "x_service" ON t AS PERMISSIVE FOR ALL
 *       TO service_role USING (true);
 *
 * TO service_role already restricts it; re-testing auth.role() in the body is
 * redundant.
 *
 * USAGE: node scripts/check-rls-policy-scoping.mjs
 * ═══════════════════════════════════════════════════════════════════════════
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Migrations named with a date BEFORE this are immutable history and are not
 * inspected. Everything from this date onward must be clean. Do not move this
 * forward to silence a new finding — scope the policy TO service_role instead.
 */
const CUTOFF = '20260813';

const MIGRATIONS_DIR = 'supabase/migrations';

/** The service-role predicate, in both spellings used in this repo. */
const SVC_TEST = /(auth\.role\s*\(\s*\)|current_setting\s*\([^)]*\))\s*=\s*'service_role'/i;

/**
 * Anything indicating the policy ALSO grants real users access. If any of
 * these survive after the service_role test is stripped, the policy is MIXED
 * and must be left attached to public.
 */
const REAL_USER_REF = /auth\.uid|user_id|owner_id|is_public|club_id|exists\s*\(/i;

const findings = [];

function scan(file) {
    const src = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const re = /create\s+policy\s+[\s\S]*?;/gi;
    let m;

    while ((m = re.exec(src)) !== null) {
        const stmt = m[0];

        // Only the BODY counts. A policy merely NAMED "service_role_select"
        // whose body is `USING (true)` is a different (worse) problem and not
        // what this check is about.
        const bodyMatch = stmt.match(/\b(using|with\s+check)\b[\s\S]*/i);
        const body = bodyMatch ? bodyMatch[0] : '';
        if (!SVC_TEST.test(body)) continue;

        // Already correctly scoped.
        if (/\bto\s+service_role\b/i.test(stmt)) continue;

        // Strip the service_role test; a surviving real-user reference means
        // the policy is MIXED and legitimate.
        const remainder = body.replace(new RegExp(SVC_TEST.source, 'gi'), '');
        if (REAL_USER_REF.test(remainder)) continue;

        const name = (stmt.match(/create\s+policy\s+("[^"]+"|\S+)/i) || [, '?'])[1];
        const line = src.slice(0, m.index).split('\n').length;
        findings.push(`${MIGRATIONS_DIR}/${file}:${line}  ${name}`);
    }
}

if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('[rls-scoping] no migrations directory; skipping.');
    process.exit(0);
}

const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(n => n.endsWith('.sql'))
    .filter(n => n.slice(0, 8) >= CUTOFF)   // dated filenames: YYYYMMDD...
    .sort();

for (const f of files) scan(f);

if (findings.length > 0) {
    console.error('');
    console.error(`RLS POLICY SCOPING: ${findings.length} new occurrence(s). Baseline is 0 from ${CUTOFF}.`);
    console.error('');
    console.error("A policy whose entire body is `auth.role() = 'service_role'` but which");
    console.error('has no TO clause defaults to PUBLIC. It is then evaluated for every row');
    console.error('of every statement by anon and authenticated, where it is always false —');
    console.error('it can never grant anything, only cost time, and it collides with the');
    console.error("table's other policies in the performance advisor.");
    console.error('');
    console.error('Write it as:');
    console.error('    CREATE POLICY "x_service" ON t AS PERMISSIVE FOR ALL');
    console.error('      TO service_role USING (true);');
    console.error('');
    console.error('If the policy ALSO grants real users access, e.g.');
    console.error("    USING (auth.uid() = user_id OR auth.role() = 'service_role')");
    console.error('then it is MIXED, it belongs TO public, and this check ignores it.');
    console.error('');
    for (const f of findings) console.error(`  ${f}`);
    console.error('');
    process.exit(1);
}

console.log(`[rls-scoping] OK — ${files.length} migration(s) since ${CUTOFF}, 0 occurrences.`);
process.exit(0);
