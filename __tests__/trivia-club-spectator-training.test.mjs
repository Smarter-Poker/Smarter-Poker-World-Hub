import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';
import {
    TRAINING_SPOT_MAP,
    TRIVIA_STUDY_CATEGORIES,
    getTrainingSpotForCategory,
} from '../src/lib/trivia/trainingSpotMap.mjs';

const ROOT = process.cwd();
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const MIGRATION_FILE = 'supabase/migrations/20261124201200_trivia_club_nights_gameplay_lifecycle.sql';
const API_FILE = 'pages/api/trivia/club-nights.js';
const PANEL_FILE = 'src/components/trivia/ClubTriviaNightsPanel.jsx';
const SPECTATOR_FILE = 'src/components/trivia/NightlySpectatorBanner.jsx';
const TOURNAMENTS_PAGE = 'pages/hub/trivia/tournaments.js';

test('club nights gameplay lifecycle migration defines locked tables, Phase 3 eligibility, answer secrecy, and strict RPC ACLs', () => {
    assert.ok(existsSync(join(ROOT, MIGRATION_FILE)), 'gameplay lifecycle migration must exist');
    const sql = read(MIGRATION_FILE);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_club_tournament_questions/);
    assert.match(sql, /PRIMARY KEY \(club_tournament_id, position\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_club_tournament_questions ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.trivia_club_tournament_questions FROM PUBLIC, anon, authenticated, service_role;/);

    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.trivia_club_tournament_submissions/);
    assert.match(sql, /UNIQUE \(club_tournament_id, user_id\)/);
    assert.match(sql, /ALTER TABLE public\.trivia_club_tournament_submissions ENABLE ROW LEVEL SECURITY;/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.trivia_club_tournament_submissions FROM PUBLIC, anon, authenticated, service_role;/);

    // Zero DDL locks on live production tables
    assert.doesNotMatch(sql, /REFERENCES\s+public\.clubs\b/i);
    assert.doesNotMatch(sql, /REFERENCES\s+public\.club_members\b/i);
    assert.doesNotMatch(sql, /REFERENCES\s+public\.profiles\b/i);
    assert.doesNotMatch(sql, /REFERENCES\s+public\.trivia_questions\b/i);
    assert.doesNotMatch(sql, /REFERENCES\s+auth\.users\b/i);

    // Freeroll-only: zero diamond balance mutation
    assert.doesNotMatch(sql, /UPDATE\s+public\.profiles\b/i);
    assert.doesNotMatch(sql, /deduct_diamonds|credit_diamonds|add_diamonds_to_balance/i);

    for (const fn of [
        'trivia_club_tournament_start_v1',
        'trivia_club_tournament_questions_v1',
        'trivia_club_tournament_submit_v1',
        'trivia_club_tournament_complete_v1',
        'trivia_club_tournament_results_v1',
        'trivia_club_tournament_list_v1',
    ]) {
        assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`), `${fn} defined`);
        assert.match(sql, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`), `${fn} browser EXECUTE revoked`);
        assert.match(sql, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role;`), `${fn} granted to service_role`);
    }

    // Phase 3 verified question pool & >= 2 entrants requirement
    const startIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_start_v1');
    const qIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_questions_v1');
    const submitIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_submit_v1');
    const completeIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_complete_v1');
    const resultsIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_results_v1');
    const listIdx = sql.indexOf('CREATE OR REPLACE FUNCTION public.trivia_club_tournament_list_v1');

    assert.ok(startIdx > 0 && qIdx > startIdx && submitIdx > qIdx && completeIdx > submitIdx && resultsIdx > completeIdx && listIdx > resultsIdx);

    const startBody = sql.slice(startIdx, qIdx);
    const questionsBody = sql.slice(qIdx, submitIdx);
    const submitBody = sql.slice(submitIdx, completeIdx);
    const resultsBody = sql.slice(resultsIdx, listIdx);

    assert.match(startBody, /v_entrant_count < 2[\s\S]{0,160}minimum_entrants_required/);
    assert.match(startBody, /public\.trivia_eligible_question_pool_v1/);
    assert.match(startBody, /v_tournament\.entry_fee <> 0[\s\S]{0,140}paid_club_escrow_not_enabled/);

    // Answer keys strictly excluded from questions_v1 JSON output
    assert.doesNotMatch(questionsBody, /'correctIndex'|'correct_index'|'explanation'/);
    assert.match(questionsBody, /v_tournament\.status <> 'live'[\s\S]{0,140}tournament_not_live/);

    // Submit grades server-side, is idempotent, and auto-completes when all entrants finish
    assert.match(submitBody, /'duplicate', true/);
    assert.match(submitBody, /v_submission_count >= v_entrant_count/);
    assert.match(submitBody, /SET status = 'settled'/);

    // Results only attaches review when status = 'settled'
    assert.match(resultsBody, /IF v_tournament\.status = 'settled' THEN[\s\S]{0,600}'correctIndex', q\.correct_index/);
    assert.match(sql, /\/\* FORWARD ROLLBACK/);
    assert.match(sql, /NOTIFY pgrst, 'reload schema';/);
});

test('pages/api/trivia/club-nights.js wires full GET views and POST gameplay lifecycle actions', () => {
    const api = read(API_FILE);
    assert.match(api, /VALID_GET_VIEWS = new Set\(\['questions', 'results'\]\)/);
    assert.match(api, /trivia_club_tournament_questions_v1/);
    assert.match(api, /trivia_club_tournament_results_v1/);
    assert.match(api, /trivia_club_tournament_start_v1/);
    assert.match(api, /trivia_club_tournament_submit_v1/);
    assert.match(api, /trivia_club_tournament_complete_v1/);
    assert.match(api, /sanitizeAnswerFreeQuestions/);
    assert.match(api, /data\.status !== 'settled'[\s\S]{0,120}champion: null, review: null/);
    assert.doesNotMatch(api, /\.in\(/);
});

test('ClubTriviaNightsPanel wires host start/finalize, play-now runner, and standings/review flows cleanly', () => {
    const panel = read(PANEL_FILE);
    assert.doesNotThrow(() => {
        parse(panel, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
    }, 'ClubTriviaNightsPanel must parse as valid JSX');

    assert.doesNotMatch(panel, /from ['"]lucide-react['"]|from ['"]react-icons|\/MetalFrame['"]|\/HexButton['"]/);
    assert.doesNotMatch(panel, /[\u2014\u2013]/, 'no em-dashes or en-dashes');
    assert.match(panel, /Start Club Night/);
    assert.match(panel, /Finalize Results/);
    assert.match(panel, /Play Now/);
    assert.match(panel, /Submit Club Night Answers/);
    assert.match(panel, /view=questions/);
    assert.match(panel, /view=results/);
    assert.match(panel, /action: 'start'/);
    assert.match(panel, /action: 'submit'/);
    assert.match(panel, /action: 'complete'/);
    assert.match(panel, /Club Champion:/);
    assert.match(panel, /Settled Question Review/);
});

test('NightlySpectatorBanner renders live semifinal/final matchup cards and Champion announcement wired from tournaments.js', () => {
    const spectator = read(SPECTATOR_FILE);
    assert.doesNotThrow(() => {
        parse(spectator, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
    }, 'NightlySpectatorBanner must parse as valid JSX');

    assert.doesNotMatch(spectator, /lucide-react|react-icons|:hover|onMouseEnter|onMouseOver|whileHover/);
    assert.doesNotMatch(spectator, /[\u2014\u2013]/, 'no em-dashes or en-dashes');
    assert.match(spectator, /featuredMatchups\s*=/);
    assert.match(spectator, /champion\s*=/);
    assert.match(spectator, /participantLabel/);
    assert.match(spectator, /Championship Final/);
    assert.match(spectator, /Semifinal /);
    assert.match(spectator, /Tournament Champion Announcement/);
    assert.match(spectator, /Featured Spectator Matchups/);
    assert.match(spectator, /Round Deadline:/);

    const tournamentsPage = read(TOURNAMENTS_PAGE);
    assert.doesNotThrow(() => {
        parse(tournamentsPage, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
    }, 'pages/hub/trivia/tournaments.js must parse as valid JSX');
    assert.match(tournamentsPage, /loadSpectatorMatchups/);
    assert.match(tournamentsPage, /featuredMatchups=/);
    assert.match(tournamentsPage, /champion=\{summary\?\.result\?\.champion \|\| null\}/);
    assert.match(tournamentsPage, /nowMs=\{nowMs\}/);
});

test('trainingSpotMap maps all 10 Trivia categories to distinct, scenario-specific verified training pages', () => {
    assert.equal(TRIVIA_STUDY_CATEGORIES.length, 10);

    // Every category must point to a distinct dedicated training page (no generic catch-all reuse)
    const hrefs = TRIVIA_STUDY_CATEGORIES.map((cat) => TRAINING_SPOT_MAP[cat].href);
    assert.equal(new Set(hrefs).size, 10, 'all 10 Trivia categories must resolve to 10 distinct training destinations');

    // Audited upgrades: player_profiles -> /hub/training/player-profiles, cash_game_situations -> /hub/training/spr-trainer
    assert.equal(getTrainingSpotForCategory('player_profiles').href, '/hub/training/player-profiles');
    assert.equal(getTrainingSpotForCategory('cash_game_situations').href, '/hub/training/spr-trainer');
    assert.equal(getTrainingSpotForCategory('gto_scenarios').href, '/hub/training/spot-trainer');
    assert.equal(getTrainingSpotForCategory('gto_theory').href, '/hub/training/solutions');
    assert.equal(getTrainingSpotForCategory('icm_chip_ev').href, '/hub/training/icm-simulator');
    assert.equal(getTrainingSpotForCategory('mtt_situations').href, '/hub/training/tournament-prep');
    assert.equal(getTrainingSpotForCategory('rule_knowledge').href, '/hub/training/glossary');
    assert.equal(getTrainingSpotForCategory('poker_history').href, '/hub/training/famous-finals');
    assert.equal(getTrainingSpotForCategory('famous_hands').href, '/hub/training/hand-lab');
    assert.equal(getTrainingSpotForCategory('tournament_facts').href, '/hub/training/tournaments');

    for (const cat of TRIVIA_STUDY_CATEGORIES) {
        const href = TRAINING_SPOT_MAP[cat].href;
        const slug = href.replace(/^\/hub\/training\//, '');
        const pagePath = join(ROOT, 'pages', 'hub', 'training', `${slug}.js`);
        assert.ok(existsSync(pagePath), `${cat} destination ${href} must exist at ${pagePath}`);
    }
});
