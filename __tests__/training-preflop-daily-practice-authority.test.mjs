import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const read = (file) => readFileSync(join(ROOT, file), 'utf8');
const PAGE = read('pages/hub/memory-games.js');
const SERVICE = read('src/services/DailyChallengeService.js');

function loadService(supabase) {
  const babel = require('@babel/core');
  const transformModulesCommonJs = require('@babel/plugin-transform-modules-commonjs');
  const compiled = babel.transformSync(SERVICE, {
    babelrc: false,
    configFile: false,
    filename: 'src/services/DailyChallengeService.js',
    plugins: [transformModulesCommonJs],
    sourceType: 'module',
  }).code;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)((specifier) => {
    assert.equal(specifier, '../lib/supabase');
    return { supabase };
  }, module, module.exports);
  return module.exports.default;
}

test('the browser daily-assignment service is read-only and strips retired settlement claims', async () => {
  assert.doesNotMatch(SERVICE, /complete_daily_challenge|completeChallenge|getUserCompletions|getUserStreak|createDailyChallenge/);
  assert.doesNotMatch(SERVICE, /\.(?:insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(SERVICE, /memory_challenge_completions|user_daily_streaks/);

  const rpcCalls = [];
  const service = loadService({
    async rpc(name) {
      rpcCalls.push(name);
      return {
        data: {
          success: true,
          completed: true,
          challenge: {
            id: 'daily-1',
            title: 'Posted Range Assignment',
            level: 3,
            diamond_reward: 500,
            bonus_reward: 1000,
          },
        },
        error: null,
      };
    },
  });

  const result = await service.getTodaysChallenge();
  assert.deepEqual(rpcCalls, ['get_daily_challenge']);
  assert.equal(result.success, true);
  assert.equal(result.completed, false);
  assert.equal(result.practiceOnly, true);
  assert.equal(result.rewardEligible, false);
  assert.equal(result.authority, 'unsigned_local_practice');
  assert.equal(result.challenge.title, 'Posted Range Assignment');
  assert.equal(Object.hasOwn(result.challenge, 'diamond_reward'), false);
  assert.equal(Object.hasOwn(result.challenge, 'bonus_reward'), false);
});

test('the daily launch remains reachable but performs no completion, streak, ranking, or reward write', () => {
  const start = PAGE.indexOf('const startDailyPractice = useCallback');
  const end = PAGE.indexOf('// Handle VIP upgrade', start);
  assert.ok(start > 0 && end > start);
  const launch = PAGE.slice(start, end);

  assert.match(launch, /startGame\(dailyChallenge\.level \|\| 1\)/);
  assert.match(launch, /setMode\(challengeMode\)/);
  assert.doesNotMatch(launch, /completeChallenge|complete_daily_challenge|DiamondEngine|award|streak|leaderboard/i);
  assert.match(PAGE, /onPlay=\{startDailyPractice\}/);
  assert.match(PAGE, /onClick=\{startDailyPractice\}/);
});

test('both daily-practice surfaces state the unsigned local authority without promising rewards', () => {
  const cardStart = PAGE.indexOf('function DailyLocalPracticeCard');
  const cardEnd = PAGE.indexOf('export default function MemoryGamesPage', cardStart);
  const sectionStart = PAGE.indexOf('{/* Daily Challenge Section */}');
  const sectionEnd = PAGE.indexOf('{/* Level Grid - Only show for Range Memory */}', sectionStart);
  assert.ok(cardStart > 0 && cardEnd > cardStart);
  assert.ok(sectionStart > 0 && sectionEnd > sectionStart);

  const surfaces = `${PAGE.slice(cardStart, cardEnd)}\n${PAGE.slice(sectionStart, sectionEnd)}`;
  for (const truth of [
    'DAILY LOCAL PRACTICE',
    'Local Practice Only',
    'Does Not Record Completion',
    'Extend A Streak',
    'Award Diamonds',
    'NO ACCOUNT REWARD',
    'START LOCAL PRACTICE',
  ]) {
    assert.match(surfaces, new RegExp(truth, 'i'));
  }
  assert.doesNotMatch(surfaces, /diamond_reward|Diamonds Earned|Streak Rewards|Challenge Complete|Keep Your Streak Alive|Start Daily Challenge/i);
  assert.doesNotMatch(PAGE, /DailyChallengeCard|challengeCompleted|userStreak|getUserStreak/);
});

test('Jarvis daily suggestions are relabelled and use the same honest local launch', () => {
  const panelStart = PAGE.indexOf('{/* Jarvis Suggestions Panel */}');
  const panelEnd = PAGE.indexOf('{/* Game Mode Selector', panelStart);
  const panel = PAGE.slice(panelStart, panelEnd);
  assert.match(panel, /suggestion\.actionType === 'daily_challenge'/);
  assert.match(panel, /startDailyPractice\(\)/);
  assert.match(panel, /Practice Today\\?'s Posted Range Assignment Locally/);
  assert.match(panel, /Start Local Practice/);
  assert.doesNotMatch(panel, /startGame\(dailyChallenge\.level/);
});
