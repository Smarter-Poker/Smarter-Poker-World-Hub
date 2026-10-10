import test from 'node:test';
import assert from 'node:assert/strict';
import {migration} from './playerControlFixture.mjs';
test('P3 acquires only its complete trigger footprint NOWAIT before any DDL',()=>{
 const install=migration.split('COMMIT;')[0];
 const expected=[...new Set([...install.matchAll(/CREATE TRIGGER[^;]+?ON (public\.\w+)\s+FOR EACH ROW/g)].map(m=>m[1]))].sort();
 const lock=/LOCK TABLE ([\s\S]+?) IN SHARE ROW EXCLUSIVE MODE NOWAIT;/.exec(install);
 assert.match(install,/SET LOCAL statement_timeout = '30s';/);
 assert.ok(lock);const actual=lock[1].split(',').map(x=>x.trim());
 assert.deepEqual(actual,expected);assert.equal(actual.length,27);
 assert.ok(install.indexOf(lock[0])<install.indexOf('CREATE TABLE'));
 assert.doesNotMatch(lock[0],/auth\.users/);
});
