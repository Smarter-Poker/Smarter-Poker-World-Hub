import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';

const read = (file) => fs.readFileSync(file, 'utf8');
const calendar = read('pages/hub/training/training-calendar.js');
const dailyGoals = read('pages/hub/training/daily-goals.js');
const studyPlan = read('pages/hub/training/study-plan.js');

for (const [name, source] of [
  ['Training Calendar', calendar],
  ['Daily Goals', dailyGoals],
  ['Study Plan', studyPlan],
]) {
  test(`${name} parses after fail-closed history-state hardening`, () => {
    assert.doesNotThrow(() => parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'optionalChaining', 'nullishCoalescingOperator'],
    }));
  });
}

test('Training Calendar never turns unavailable history into a zero activity record', () => {
  assert.match(calendar, /const \[dayMap, setDayMap\] = useState\(null\)/);
  assert.match(calendar, /const \[signedOut, setSignedOut\] = useState\(false\)/);
  assert.match(calendar, /if \(!token\) throw new Error/);
  assert.match(calendar, /data\?\.success !== true \|\| !Array\.isArray\(data\.sessions\)/);
  assert.match(calendar, /const authoritativeDataReady = dayMap !== null/);
  assert.match(
    calendar,
    /!loading && !signedOut && !fetchError && authoritativeDataReady && \(/,
  );
  assert.match(calendar, /Sign In To View Your Training Calendar/);
  assert.match(calendar, /Verified Training Calendar Data Is Unavailable/);
  assert.doesNotMatch(calendar, /if \(!token\) \{ setLoading\(false\); return; \}/);
});

test('Daily Goals requires successful history and streak responses before showing totals', () => {
  assert.match(dailyGoals, /const \[data, setData\] = useState\(null\)/);
  assert.match(dailyGoals, /const \[signedOut, setSignedOut\] = useState\(false\)/);
  assert.match(dailyGoals, /Promise\.all\(\[\s*authedFetch\(`\/api\/training\/get-sessions\?limit=50`\),\s*authedFetch\('\/api\/training\/daily-bonus'\)/s);
  assert.match(
    dailyGoals,
    /sessionsPayload\?\.success !== true \|\| !Array\.isArray\(sessionsPayload\.sessions\)/,
  );
  assert.match(
    dailyGoals,
    /bonusPayload\?\.success !== true \|\| !Number\.isFinite\(Number\(bonusPayload\.streakDays\)\)/,
  );
  assert.match(
    dailyGoals,
    /!loading && !signedOut && !fetchError && data && dailyBonus && \(/,
  );
  assert.match(dailyGoals, /Sign In To View Daily Goals/);
  assert.match(dailyGoals, /Verified Daily Goal Data Is Unavailable/);
  assert.doesNotMatch(dailyGoals, /useState\(\{ goals: \[\], completeCount: 0, totalGoals: 5 \}\)/);
});

test('Study Plan distinguishes verified personalization from an authored starter plan', () => {
  assert.match(studyPlan, /const \[sessions, setSessions\] = useState\(null\)/);
  assert.match(studyPlan, /data\?\.success !== true \|\| !Array\.isArray\(data\.sessions\)/);
  assert.match(
    studyPlan,
    /!loading && !fetchError && !signedOut && Array\.isArray\(sessions\)/,
  );
  assert.match(studyPlan, /const isAuthoredStarterPlan = Array\.isArray\(sessions\) && sessions\.length === 0/);
  assert.match(studyPlan, /Authored Starter Schedule/);
  assert.match(studyPlan, /Personalized From Verified Training History/);
  assert.match(studyPlan, /This Is An Authored Starter Plan Because No Verified Sessions Were Found/);
  assert.match(studyPlan, /plan && !loading && !fetchError && !signedOut && \(/);
  assert.match(studyPlan, /Sign In To Build Your Study Plan/);
  assert.doesNotMatch(studyPlan, />Personalized Training Schedule</);
  assert.doesNotMatch(studyPlan, /if \(!loading && sessions !== null\)/);
});
