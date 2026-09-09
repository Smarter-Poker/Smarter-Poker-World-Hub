import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('Skill Tree contains no client-authored XP, experience-earned, or currency claim', () => {
  const source = read('pages/hub/training/skill-tree.js');

  assert.doesNotMatch(source, /\bxp\b/i);
  assert.doesNotMatch(source, /experience\s+(?:points?\s+)?earned/i);
  assert.doesNotMatch(source, /(?:diamond|reward)\s*(?:earned|paid|awarded)/i);
  assert.doesNotMatch(source, /Math\.random|localStorage/);
  assert.match(source, /Verified Mastery/);
  assert.match(source, /\{hands\} Verified \{hands === 1 \? 'Hand' : 'Hands'\}/);
});

test('Skill Tree derives mastery only from verified server session history', () => {
  const page = read('pages/hub/training/skill-tree.js');
  const api = read('pages/api/training/get-sessions.js');

  assert.match(page, /\/api\/training\/get-sessions\?limit=500/);
  assert.match(page, /setStats\(computeSkillData\(data\.sessions\)\)/);
  assert.match(page, /Mastery From Sealed Training Sessions/);
  assert.match(page, /mastered from verified sessions/);

  assert.match(
    api,
    /training_attempts!training_sessions_attempt_fk!inner\([^)]*user_id[^)]*status[^)]*practice_only[^)]*\)/
  );
  assert.match(api, /\.not\('attempt_id', 'is', null\)/);
  assert.match(api, /\.eq\('training_attempts\.user_id', user\.id\)/);
  assert.match(api, /\.eq\('training_attempts\.status', 'completed'\)/);
  assert.match(api, /\.eq\('training_attempts\.practice_only', false\)/);
  assert.match(api, /\.eq\('practice_only', false\)/);
});

test('Skill Tree fails closed when verified history is missing or unavailable', () => {
  const source = read('pages/hub/training/skill-tree.js');

  assert.match(source, /const \[stats, setStats\] = useState\(null\)/);
  assert.match(source, /!data\.success \|\| !Array\.isArray\(data\.sessions\)/);
  assert.match(source, /setStats\(null\)/);
  assert.match(source, /!loading && !stats/);
  assert.match(source, /No Mastery Status Has Been\s*\n\s*Inferred From Missing Session Data/);
  assert.ok(
    (source.match(/!loading && stats/g) || []).length >= 2,
    'both the mastery overview and branches must require verified stats'
  );
});
