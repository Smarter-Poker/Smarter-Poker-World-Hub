import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const progress = readFileSync(new URL('../pages/hub/training/progress.js', import.meta.url), 'utf8');
const studyRoom = readFileSync(new URL('../pages/hub/training/study-group.js', import.meta.url), 'utf8');

test('progress polling is bounded, single-flight, visibility-aware, and unmount-safe', () => {
  assert.match(progress, /inFlightRef\.current/);
  assert.match(progress, /if \(inFlightRef\.current\) return/);
  assert.match(progress, /new AbortController\(\)/);
  assert.match(progress, /window\.setTimeout\([\s\S]*?controller\.abort\(\)[\s\S]*?10_000/);
  assert.equal((progress.match(/\.abortSignal\(controller\.signal\)/g) || []).length, 2);
  assert.match(progress, /mountedRef\.current && !controller\.signal\.aborted/);
  assert.match(progress, /requestRef\.current\?\.abort\(\)/);
  assert.match(progress, /document\.hidden/);
  assert.match(progress, /window\.clearInterval\(pollInterval\)/);
  assert.match(progress, /removeEventListener\('visibilitychange', refreshIfVisible\)/);
});

test('study-room polling cannot overlap, outlive the route, or hang indefinitely', () => {
  assert.match(studyRoom, /roomRequestInFlightRef\.current/);
  assert.match(studyRoom, /if \(!roomId \|\| roomRequestInFlightRef\.current\) return/);
  assert.match(studyRoom, /new AbortController\(\)/);
  assert.match(studyRoom, /window\.setTimeout\([\s\S]*?controller\.abort\(\)[\s\S]*?10_000/);
  assert.equal((studyRoom.match(/signal: controller\.signal/g) || []).length, 2);
  assert.match(studyRoom, /mountedRef\.current && !controller\.signal\.aborted/);
  assert.match(studyRoom, /document\.hidden/);
  assert.match(studyRoom, /window\.clearInterval\(timer\)/);
  assert.match(studyRoom, /removeEventListener\('visibilitychange', refreshIfVisible\)/);
  assert.match(studyRoom, /activeRequest\?\.abort\(\)/);
});
