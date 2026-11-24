import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTriviaOperationsSnapshot } from '../src/lib/trivia/operationsSnapshot.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_PATH = path.join(
    REPO,
    'supabase/migrations/20261124202000_trivia_ops_funnel_solo_filter_fix.sql',
);

test('operationsSnapshot pvp_24h_mix counts matches (human_human / human_horse), not player-tickets', () => {
    // 1 H2H match produces 2 matched_human player-tickets; 1 H-vs-Horse match
    // produces 1 matched_horse ticket. Match totals must be 1 + 1 = 2 (50% / 50%),
    // never 2 + 1 = 3 (66.7% / 33.3%).
    const snapshot = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-24T20:20:00.000Z',
        pvpMetrics: {
            matches: {
                created: 2,
                completed: 2,
                human_human: 1,
                human_horse: 1,
            },
            tickets: {
                joined: 3,
                matched_human: 2,
                matched_horse: 1,
            },
        },
    });

    assert.deepEqual(snapshot.treasury_economics.pvp_24h_mix, {
        human_matches: 1,
        horse_matches: 1,
        total_matches: 2,
        human_share_pct: 50,
        horse_share_pct: 50,
    });
});

test('operationsSnapshot pvp_24h_mix handles zero-match windows and legacy ticket-only fallback cleanly', () => {
    const zeroMatches = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-24T20:20:00.000Z',
        pvpMetrics: {
            matches: { human_human: 0, human_horse: 0 },
            tickets: { matched_human: 0, matched_horse: 0 },
        },
    });
    assert.deepEqual(zeroMatches.treasury_economics.pvp_24h_mix, {
        human_matches: 0,
        horse_matches: 0,
        total_matches: 0,
        human_share_pct: null,
        horse_share_pct: null,
    });

    // When matches object is absent in legacy fixtures, fallback stays non-crashing.
    const legacyTicketOnly = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-24T20:20:00.000Z',
        pvpMetrics: {
            tickets: { matched_human: 3, matched_horse: 1 },
        },
    });
    assert.deepEqual(legacyTicketOnly.treasury_economics.pvp_24h_mix, {
        human_matches: 3,
        horse_matches: 1,
        total_matches: 4,
        human_share_pct: 75,
        horse_share_pct: 25,
    });

    // Never mix match-unit human_human with ticket-unit matched_horse.
    const partialMatches = buildTriviaOperationsSnapshot({
        generatedAt: '2026-11-24T20:20:00.000Z',
        pvpMetrics: {
            matches: { human_human: 2 },
            tickets: { matched_human: 4, matched_horse: 99 },
        },
    });
    assert.deepEqual(partialMatches.treasury_economics.pvp_24h_mix, {
        human_matches: 2,
        horse_matches: 0,
        total_matches: 2,
        human_share_pct: 100,
        horse_share_pct: 0,
    });
});

test('migration 20261124202000 guards predecessor MD5, filters competitive/horse sessions out of solo funnel, and includes rollback', () => {
    assert.ok(fs.existsSync(MIGRATION_PATH), 'migration 20261124202000 must exist');
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

    // Predecessor MD5 guard
    assert.match(sql, /1021cf5a469f58030c7cd94eb10bc089/);
    assert.match(sql, /pg_get_functiondef\(\s*'public\.trivia_player_funnel_metrics_v1\(integer\)'::regprocedure/s);

    // Solo funnel excludes PvP, tournament/tournaments, horse actor_type, horse profiles, and linked competitive sessions
    const activeBody = sql.split('/* FORWARD ROLLBACK')[0];
    assert.match(activeBody, /CREATE OR REPLACE FUNCTION public\.trivia_player_funnel_metrics_v1\(/);
    assert.match(activeBody, /NOT IN \('pvp', 'tournament', 'tournaments'\)/);
    assert.match(activeBody, /COALESCE\(s\.actor_type, 'human'\) <> 'horse'/);
    assert.match(activeBody, /p\.is_horse IS DISTINCT FROM true/);
    assert.match(activeBody, /FROM public\.trivia_pvp_session_links/);
    assert.match(activeBody, /FROM public\.trivia_tournament_seats/);

    // Security attributes and ACL preserved
    assert.match(activeBody, /SECURITY DEFINER/);
    assert.match(activeBody, /SET search_path TO ''/);
    assert.match(activeBody, /REVOKE ALL ON FUNCTION public\.trivia_player_funnel_metrics_v1\(integer\)\s+FROM PUBLIC, anon, authenticated;/s);
    assert.match(activeBody, /GRANT EXECUTE ON FUNCTION public\.trivia_player_funnel_metrics_v1\(integer\)\s+TO postgres, service_role;/s);

    // Forward rollback block present
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
});
