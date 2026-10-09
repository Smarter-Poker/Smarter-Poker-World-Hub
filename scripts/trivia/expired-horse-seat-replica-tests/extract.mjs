import fs from 'node:fs';
import path from 'node:path';
const [repo, out, migration] = process.argv.slice(2);
const source = fs.readFileSync(path.join(repo, 'supabase/migrations/20261001200000_trivia_p6_nightly_tournament_engine.sql'), 'utf8');
for (const name of ['prepare_horse_seat', 'resolve_matchup']) {
  const marker = `CREATE OR REPLACE FUNCTION public.trivia_tournament_${name}(`;
  const start = source.indexOf(marker);
  const end = source.indexOf('\n$$;', start);
  if (start < 0 || end < 0) throw new Error(`Missing original ${name}`);
  fs.writeFileSync(path.join(out, `${name}.sql`), source.slice(start, end + 4));
}
const correction = fs.readFileSync(migration, 'utf8');
const uncommented = correction.split('\n').filter(line => line.startsWith('-- ')).map(line => line.slice(3)).join('\n');
const start = uncommented.indexOf('DO $rollback$');
const end = uncommented.indexOf('END $rollback$;', start);
if (start < 0 || end < 0) throw new Error('Executable documented rollback absent');
const body = uncommented.slice(start, end + 'END $rollback$;'.length);
fs.writeFileSync(path.join(out, 'rollback.sql'), `BEGIN;\nDELETE FROM public.calls;\nUPDATE public.trivia_tournament_seats SET status='waiting', result_outcome=NULL, finished_at=NULL;\nUPDATE public.trivia_tournament_matchups SET status='ready', decided_reason=NULL;\n${body}\n`);
// Verify actual documented rollback refuses retained no-show history.
fs.writeFileSync(path.join(out, 'rollback-refusal.sql'), `DO $check$ BEGIN BEGIN EXECUTE ${'$sql$'}${body}${'$sql$'}; RAISE EXCEPTION 'rollback unexpectedly accepted retained no-show history'; EXCEPTION WHEN SQLSTATE 'P0001' THEN IF SQLERRM <> 'rollback incompatible with retained no-show horse history' THEN RAISE; END IF; END; END $check$;\n`);
