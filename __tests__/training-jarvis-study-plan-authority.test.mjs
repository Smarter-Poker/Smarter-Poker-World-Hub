import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync('src/world/components/Jarvis/StudyPlanAI.tsx', 'utf8');
const realStudyPlan = fs.readFileSync('pages/hub/training/study-plan.js', 'utf8');

test('Jarvis Study Plan is an honest launcher, not a timer-generated fake plan', () => {
  assert.match(source, /useRouter/);
  assert.match(source, /const STUDY_PLAN_ROUTE = '\/hub\/training\/study-plan\?source=jarvis'/);
  assert.match(source, /router\.push\(STUDY_PLAN_ROUTE\)/);
  assert.match(source, /Progress Is Shown Only From Server-Recorded Arena Sessions/);
  assert.match(source, /Opening A Drill[\s\S]*Never Marks It Complete/);

  assert.doesNotMatch(source, /setTimeout|setStudyPlan|toggleCompleted|generateStudyPlan|StudySession/);
  assert.doesNotMatch(source, /completed:\s*false|Date\.now\(\)|Generating\.\.\./);
  assert.doesNotMatch(source, /onAskJarvis\s*\(/);
});

test('the launched Training Study Plan reads real sessions and opens canonical Arena contracts', () => {
  assert.match(realStudyPlan, /authedFetch\(`\/api\/training\/get-sessions\?limit=100`\)/);
  assert.match(realStudyPlan, /buildCustomTrainingArenaHref/);
  assert.match(realStudyPlan, /completedGames = new Set/);
  assert.match(realStudyPlan, /session\.completed_at \|\| session\.created_at/);
  assert.doesNotMatch(realStudyPlan, /study-plan-completed|study-plan-week/);
});
