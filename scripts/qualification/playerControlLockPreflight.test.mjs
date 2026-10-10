import test from 'node:test';
import assert from 'node:assert/strict';
import {migration} from './playerControlFixture.mjs';
test('P3 bounds the first hot target then acquires its remaining exact footprint NOWAIT',()=>{
 const install=migration.split('COMMIT;')[0];
 const expected=[...new Set([...install.matchAll(/CREATE TRIGGER[^;]+?ON (public\.\w+)\s+FOR EACH ROW/g)].map(m=>m[1]))].sort();
 const lock=/LOCK TABLE (public\.ca_player_restrictions,[\s\S]+?) IN SHARE ROW EXCLUSIVE MODE NOWAIT;/.exec(install);
 assert.match(install,/SET LOCAL statement_timeout = '30s';/);
 assert.ok(lock);const actual=lock[1].split(',').map(x=>x.trim());
 assert.deepEqual([...actual,'public.tournament_players'].sort(),expected);assert.equal(actual.length,26);
 const first='LOCK TABLE public.tournament_players IN SHARE ROW EXCLUSIVE MODE;';
 assert.ok(install.indexOf(first)<install.indexOf(lock[0]));
 assert.ok(install.indexOf(first)<install.indexOf('CREATE TABLE'));
 assert.equal((install.match(/LOCK TABLE/g)||[]).length,2);
 assert.ok(install.indexOf(lock[0])<install.indexOf('CREATE TABLE'));
 assert.doesNotMatch(lock[0],/auth\.users/);
});
