import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const read = (relative) => readFileSync(join(ROOT, relative), 'utf8');

const FILES = {
  analyzer: 'pages/hub/training/analyzer.js',
  finals: 'pages/hub/training/famous-finals.js',
  multiway: 'pages/hub/training/multiway-preflop.js',
  quiz: 'pages/hub/training/quiz-gauntlet.js',
  sandboxApi: 'pages/api/assistant/sandbox/analyze.js',
  sandboxPage: 'pages/hub/personal-assistant/sandbox.js',
  assistantHub: 'pages/hub/personal-assistant/index.js',
  assistantLeaks: 'pages/hub/personal-assistant/leaks.js',
  sharedScenario: 'pages/sandbox/[id].js',
  hamburgerMenus: 'src/config/hamburgerMenus.js',
  videoLibrary: 'pages/hub/video-library.js',
  reels: 'pages/hub/reels.js',
};

for (const [name, relative] of Object.entries(FILES)) {
  test(`${name} authority surface parses`, () => {
    assert.doesNotThrow(() => parse(read(relative), {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
    }));
  });
}

test('the legacy client-only analyzer redirects to the server-audited review path', () => {
  const source = read(FILES.analyzer);
  assert.match(source, /getServerSideProps/);
  assert.match(source, /hand-history-upload\?source=legacy-analyzer/);
  assert.doesNotMatch(source, /classifyMove\s*\(|solverFreqs\s*=|totalEVLoss\s*[+=]/);
});

test('Famous Finals is an ungraded archive with no authored answer bank', () => {
  const source = read(FILES.finals);
  assert.match(source, /data-training-authority="archive-ungraded"/);
  assert.match(source, /Authored Reconstructions/);
  assert.match(source, /No Answer, Frequency, EV, Accuracy, Progress, Reward, Or Streak Is Recorded/);
  assert.doesNotMatch(source, /\bcorrect\s*:|\bfreq\s*:|\bev\s*:|savePracticeSession|SESSION_END|session-complete/);
});

test('Multiway Preflop is explicitly authored read-only reference material', () => {
  const source = read(FILES.multiway);
  assert.match(source, /data-training-authority="authored-reference-ungraded"/);
  assert.match(source, /Authored Teaching References/);
  assert.match(source, /Do Not Produce A Grade, EV Result, Progress, Or\s+Reward/);
  assert.match(source, /CO Open → BTN 3-Bet → SB 4-Bet → BB Decision/);
  assert.match(source, /UTG Limp → SB Complete → BB Iso-Raise/);
  assert.doesNotMatch(source, /SB Open → BB 3-Bet → BTN Over-Call/);
  assert.doesNotMatch(source, /savePracticeSession|gtowScore|totalEVLoss|useTrainingFeedback|SESSION_END|session-complete/);
});

test('the legacy Quiz Gauntlet cannot grade a browser-authored answer bank', () => {
  const source = read(FILES.quiz);
  assert.match(source, /getServerSideProps/);
  assert.match(source, /arena\/quiz-gauntlet\?level=1&source=legacy-quiz-gauntlet/);
  assert.doesNotMatch(source, /Math\.random|correctAnswer|solverAction|savePracticeSession|SESSION_END|q\.options\.map/);
});

test('sandbox analysis fails closed without legacy reads, approximate matches, or generated answers', () => {
  const source = read(FILES.sandboxApi);
  assert.match(source, /status\(410\)/);
  assert.match(source, /private, no-store, max-age=0/);
  assert.match(source, /SANDBOX_ANALYSIS_REQUIRES_VERIFIED_EVIDENCE/);
  assert.doesNotMatch(source, /\.from\s*\(|createClient|getGrokClient|optimalAction|solver_approx|ai_approx|normalizeStack\s*\(/);
});

test('the reachable Sandbox UI exposes only verified destinations and records nothing locally', () => {
  const source = read(FILES.sandboxPage);
  assert.match(source, /data-training-authority="verified-evidence-required"/);
  assert.match(source, /\/hub\/training\?source=assistant-sandbox-retired/);
  assert.match(source, /spot-trainer\?source=assistant-sandbox-retired/);
  assert.match(source, /hand-history-upload\?source=assistant-sandbox-retired/);
  assert.match(source, /No Answer, Frequency, EV, Accuracy, Streak, Reward, Study Record, Or Progress Is Created/);
  assert.doesNotMatch(source, /localSolve|gradeAction|correct_action|optimalAction|truthLevel|setSrs|setStreak|Forced override/);
});

test('direct Sandbox navigation no longer promises unavailable analysis authority', () => {
  const hub = read(FILES.assistantHub);
  const menus = read(FILES.hamburgerMenus);
  const video = read(FILES.videoLibrary);
  const footer = JSON.parse(read('src/config/world-footer-navigation.json'));
  const assistantFooter = footer.worlds.find((world) => world.id === 'personal-assistant');
  const sandboxFooterItem = assistantFooter?.items?.find((item) => item.href === '/hub/personal-assistant/sandbox');

  assert.match(hub, /Scenario Analysis Archive/);
  assert.match(hub, /Training Pipeline Connected/);
  assert.match(hub, /\/hub\/training\?source=personal-assistant-hero/);
  assert.doesNotMatch(hub, /solver-verified strategy|Solver Connected|Start New Scenario|Load In Sandbox|Virtual Sandbox/i);

  assert.match(menus, /GTO Sandbox/);
  assert.deepEqual(sandboxFooterItem, {
    href: '/hub/personal-assistant/sandbox',
    label: 'Sandbox',
    title: 'GTO Sandbox',
    icon: 'target',
  });

  assert.match(video, /\/hub\/training\?source=video-library/);
  assert.match(video, /Open Verified Training/);
  assert.doesNotMatch(video, /buildSandboxUrl|extractCardsFromContext|Solve in Sandbox|Open in Virtual Sandbox/);
});

test('reels never turns extracted video context into an unverified solver launch', () => {
  const source = read(FILES.reels);

  assert.match(source, /hand-history-upload\?source=reels/);
  assert.match(source, /Open Audited Hand Review/);
  assert.doesNotMatch(source, /buildSandboxUrl|extractCardsFromContext|Solve in Sandbox|Open in Virtual Sandbox/);
});

test('Leak Finder never rebuilds an unsealed spot in the retired Sandbox', () => {
  const source = read(FILES.assistantLeaks);

  assert.match(source, /hand-history-upload\?source=personal-assistant-leaks/);
  assert.match(source, /hand-history-upload\?source=personal-assistant-leak-example/);
  assert.match(source, /Historical choices only · no provenance-sealed grade/);
  assert.match(source, /Recorded Choice: \{spot\?\.user_pick \|\| 'Not Available'\} · Reference Not Verified/);
  assert.doesNotMatch(source, /pathname:\s*['"]\/hub\/personal-assistant\/sandbox['"]/);
  assert.doesNotMatch(source, /buildPracticeQuery|Practice Leak In Sandbox|Practice In Sandbox/);
  assert.doesNotMatch(source, /GTO accuracy|EV \{num\(spot\?\.ev_delta\)|GTO: \{spot\?\.gto_action/);
  assert.match(source, /data-pa-insights-authority="verified-destinations-only"/);
  assert.match(source, /\/hub\/training\/gto-reports\?source=personal-assistant-leaks/);
  assert.match(source, /\/hub\/training\/hand-history-upload\?source=personal-assistant-leaks/);
  assert.doesNotMatch(source, /CoachLeaderboard|MacroLeakDetector|LeakHeatmap|SessionAnalytics/);
  assert.doesNotMatch(source, /api\/sandbox\/(?:leaderboard|macro-analysis|session-stats)/);
});

test('legacy shared Scenario links never hydrate or forward an unsealed browser snapshot', () => {
  const source = read(FILES.sharedScenario);

  assert.match(source, /data-training-authority="verified-evidence-required"/);
  assert.match(source, /hand-history-upload\?source=retired-shared-sandbox/);
  assert.match(source, /\/hub\/training\?source=retired-shared-sandbox/);
  assert.match(source, /No Answer, Frequency, EV, Accuracy, Reward, Streak, Or Progress Is Created Here/);
  assert.doesNotMatch(source, /sandbox_shared_scenarios|createClient|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /state_json|sessionStorage|loadShared|compressToEncodedURIComponent/);
  assert.doesNotMatch(source, /href=.*personal-assistant\/sandbox|window\.location\.replace/);
});
