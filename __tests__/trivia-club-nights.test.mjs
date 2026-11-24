import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';
import { TOURNAMENT_TABS } from '../src/components/trivia/tournaments/tournamentModel.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const MIGRATION_FILE = 'supabase/migrations/20261124173600_trivia_club_private_tournaments.sql';
const API_FILE = 'pages/api/trivia/club-nights.js';
const PANEL_FILE = 'src/components/trivia/ClubTriviaNightsPanel.jsx';
const TOURNAMENTS_PAGE = 'pages/hub/trivia/tournaments.js';

test('club trivia nights migration defines tables, zero live-table FKs, RLS, strict RPC ACLs, and forward rollback', () => {
    assert.ok(existsSync(join(ROOT, MIGRATION_FILE)), 'migration file must exist');
    const sql = read(MIGRATION_FILE);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_club_tournaments/);
    assert.match(sql, /CHECK \(entry_fee IN \(0, 10, 25, 50\)\)/);
    assert.match(sql, /CHECK \(max_players BETWEEN 4 AND 256\)/);
    assert.match(sql, /CHECK \(question_count IN \(10, 20\)\)/);
    assert.match(sql, /CHECK \(status IN \('registration', 'live', 'settled', 'cancelled'\)\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_club_tournaments ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.trivia_club_tournaments FROM PUBLIC, anon, authenticated, service_role;/);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_club_tournament_entries/);
    assert.match(sql, /REFERENCES public\.trivia_club_tournaments\(id\) ON DELETE CASCADE/);
    assert.match(sql, /UNIQUE \(club_tournament_id, user_id\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_club_tournament_entries ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.trivia_club_tournament_entries FROM PUBLIC, anon, authenticated, service_role;/);

    // Zero DDL locks on existing live tables: never add FKs referencing clubs, club_members, profiles, or auth.users
    assert.doesNotMatch(sql, /REFERENCES\s+public\.clubs\b/i, 'must not take FK lock on public.clubs');
    assert.doesNotMatch(sql, /REFERENCES\s+public\.club_members\b/i, 'must not take FK lock on public.club_members');
    assert.doesNotMatch(sql, /REFERENCES\s+public\.profiles\b/i, 'must not take FK lock on public.profiles');
    assert.doesNotMatch(sql, /REFERENCES\s+auth\.users\b/i, 'must not take FK lock on auth.users');

    for (const fn of [
        'trivia_club_tournament_create_v1',
        'trivia_club_tournament_list_v1',
        'trivia_club_tournament_join_v1',
        'trivia_club_tournament_cancel_v1',
    ]) {
        assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), `${fn} created`);
        assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`), `${fn} browser EXECUTE revoked`);
        assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`), `${fn} granted to service_role`);
    }

    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
});

test('club trivia nights RPCs enforce ironclad zero-diamond financial safety in v1', () => {
    const sql = read(MIGRATION_FILE);
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_create_v1');
    const listStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_list_v1');
    const joinStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_join_v1');
    const cancelStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_cancel_v1');
    assert.ok(createStart > 0 && listStart > createStart && joinStart > listStart && cancelStart > joinStart);

    const createBody = sql.slice(createStart, listStart);
    const joinBody = sql.slice(joinStart, cancelStart);

    assert.match(createBody, /IF v_entry_fee <> 0 THEN[\s\S]{0,260}paid_club_escrow_not_enabled/);
    assert.match(joinBody, /IF v_tournament\.entry_fee <> 0 THEN[\s\S]{0,180}paid_club_escrow_not_enabled/);
    // Never touch diamond balances directly outside a balanced Phase 2 ledger journal
    assert.doesNotMatch(sql, /UPDATE\s+public\.profiles\b/i);
    assert.doesNotMatch(sql, /deduct_diamonds|credit_diamonds|add_diamonds_to_balance/i);
});

test('club trivia nights RPCs enforce production club schema membership and owner/admin authorization', () => {
    const sql = read(MIGRATION_FILE);
    const createStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_create_v1');
    const listStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_list_v1');
    const joinStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_join_v1');
    const cancelStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_cancel_v1');

    const createBody = sql.slice(createStart, listStart);
    const listBody = sql.slice(listStart, joinStart);
    const joinBody = sql.slice(joinStart, cancelStart);
    const cancelBody = sql.slice(cancelStart);

    // Create checks active club, owner_id or active owner/co_owner/admin role, and future start
    assert.match(createBody, /v_club\.lifecycle_status IS DISTINCT FROM 'active'/);
    assert.match(createBody, /v_club\.owner_id = p_host_user_id/);
    assert.match(createBody, /cm\.membership_lifecycle_status = 'active'/);
    assert.match(createBody, /cm\.role IN \('owner', 'co_owner', 'admin'\)/);
    assert.match(createBody, /club_host_forbidden/);
    assert.match(createBody, /scheduled_start_must_be_future/);

    // List returns viewer clubs with canHost and entrantCount/viewerRegistered
    assert.match(listBody, /'canHost', ec\.can_host/);
    assert.match(listBody, /'entrantCount', rt\.entrant_count/);
    assert.match(listBody, /'viewerRegistered', rt\.viewer_registered/);

    // Join locks tournament FOR UPDATE, checks membership, max_players, and registration state
    assert.match(joinBody, /FOR UPDATE/);
    assert.match(joinBody, /club_membership_required/);
    assert.match(joinBody, /tournament_not_in_registration/);
    assert.match(joinBody, /v_entrant_count >= v_tournament\.max_players[\s\S]{0,120}tournament_full/);

    // Cancel locks FOR UPDATE, verifies host/owner/admin, blocks started tournaments
    assert.match(cancelBody, /FOR UPDATE/);
    assert.match(cancelBody, /club_host_forbidden/);
    assert.match(cancelBody, /cannot_cancel_started_tournament/);
});

test('pages/api/trivia/club-nights.js enforces auth, rate limits, strict validation, and atomic RPC routing', () => {
    assert.ok(existsSync(join(ROOT, API_FILE)), 'club-nights API route must exist');
    const api = read(API_FILE);

    assert.match(api, /supabaseServerClient/);
    assert.match(api, /getServerUserWithFallback/);
    assert.match(api, /applyRateLimit/);
    assert.match(api, /LIMITS\.read/);
    assert.match(api, /LIMITS\.write/);
    assert.match(api, /Cache-Control', 'private, no-store, max-age=0'/);
    assert.match(api, /res\.status\(401\)\.json\(\{\s*success:\s*false,\s*error:\s*'authentication_required'\s*\}\)/);
    assert.match(api, /VALID_ACTIONS = new Set\(\['create', 'join', 'leave', 'cancel'\]\)/);
    assert.match(api, /paid_club_escrow_not_enabled/);
    assert.match(api, /trivia_club_tournament_list_v1/);
    assert.match(api, /trivia_club_tournament_create_v1/);
    assert.match(api, /trivia_club_tournament_join_v1/);
    assert.match(api, /trivia_club_tournament_cancel_v1/);
    // Zero unbatched .in() calls
    assert.doesNotMatch(api, /\.in\(/);
});

test('ClubTriviaNightsPanel parses cleanly, obeys console styling rules, and is wired into tournaments.js', () => {
    assert.ok(existsSync(join(ROOT, PANEL_FILE)), 'ClubTriviaNightsPanel must exist');
    const panel = read(PANEL_FILE);

    assert.doesNotThrow(() => {
        parse(panel, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
    }, 'ClubTriviaNightsPanel must parse as valid JSX');

    assert.doesNotMatch(panel, /from ['"]lucide-react['"]|\/MetalFrame['"]|\/HexButton['"]|from ['"]react-icons/);
    assert.doesNotMatch(panel, /[\u2014\u2013]/, 'no em-dashes or en-dashes in UI component');
    assert.match(panel, /TriviaGlassAction/);
    assert.match(panel, /authedFetch/);
    assert.match(panel, /\/api\/trivia\/club-nights/);
    assert.match(panel, /Host Club Trivia Night/);
    assert.match(panel, /canHost === true/);
    assert.match(panel, /\/hub\/club-arena/);
    assert.match(panel, /Copy Invite Code/);

    assert.ok(
        TOURNAMENT_TABS.some((tab) => tab.id === 'club-nights' && tab.label === 'Club Nights'),
        'TOURNAMENT_TABS must include club-nights tab',
    );

    const tournamentsPage = read(TOURNAMENTS_PAGE);
    assert.match(tournamentsPage, /import ClubTriviaNightsPanel from '\.\.\/\.\.\/\.\.\/src\/components\/trivia\/ClubTriviaNightsPanel';/);
    assert.match(tournamentsPage, /activeTab === 'club-nights'/);
    assert.match(tournamentsPage, /<ClubTriviaNightsPanel\b/);
    // Preserve Wave 1 + Phase 7 tournament wiring
    assert.match(tournamentsPage, /MonthlyChampionshipPanel/);
    assert.match(tournamentsPage, /FriendChallengePanel/);
    assert.match(tournamentsPage, /NightlyReminderButton/);
    assert.match(tournamentsPage, /NightlySpectatorBanner/);
    assert.match(tournamentsPage, /triviaTournamentPageReleaseResult/);
});
