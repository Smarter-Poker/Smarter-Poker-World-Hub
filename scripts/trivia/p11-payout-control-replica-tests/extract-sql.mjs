import { readFileSync, writeFileSync } from 'node:fs';

const [mode, ...args] = process.argv.slice(2);

function extractFunction(source, name) {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) throw new Error(`missing predecessor ${name}`);
  const header = source.slice(start);
  const delimiterMatch = header.match(/\bAS (\$[A-Za-z0-9_]*\$)/);
  if (!delimiterMatch) throw new Error(`missing body delimiter for ${name}`);
  const delimiter = delimiterMatch[1];
  const opening = start + delimiterMatch.index + delimiterMatch[0].lastIndexOf(delimiter);
  const closingToken = `${delimiter};`;
  const closing = source.indexOf(closingToken, opening + delimiter.length);
  if (closing < 0) throw new Error(`unterminated predecessor ${name}`);
  return source.slice(start, closing + closingToken.length);
}

if (mode === 'predecessors') {
  const [phase2Path, phase11Path, outputPath] = args;
  if (!phase2Path || !phase11Path || !outputPath) {
    throw new Error('usage: extract-sql.mjs predecessors PHASE2_SQL PHASE11_SQL OUTPUT');
  }
  const phase2 = readFileSync(phase2Path, 'utf8');
  const phase11 = readFileSync(phase11Path, 'utf8');
  const definitions = [
    extractFunction(phase2, 'trivia_ledger_rake'),
    extractFunction(phase2, 'trivia_settlement_settle'),
    extractFunction(phase11, 'trivia_operator_execute_v1'),
  ];
  writeFileSync(outputPath, `${definitions.join('\n\n')}\n`, { flag: 'wx' });
} else if (mode === 'rollback') {
  const [migrationPath, outputPath] = args;
  if (!migrationPath || !outputPath) {
    throw new Error('usage: extract-sql.mjs rollback MIGRATION_SQL OUTPUT');
  }
  const migration = readFileSync(migrationPath, 'utf8');
  const section = migration.indexOf('-- ROLLBACK (Tier 3;');
  if (section < 0) throw new Error('missing rollback section');
  const start = migration.indexOf('-- BEGIN;', section);
  const end = migration.indexOf('-- COMMIT;', start);
  if (start < 0 || end < 0) throw new Error('rollback template is incomplete');
  const commented = migration.slice(start, end + '-- COMMIT;'.length);
  const sql = commented
    .split('\n')
    .map(line => line.replace(/^-- ?/, ''))
    .join('\n');
  writeFileSync(outputPath, `${sql}\n`, { flag: 'wx' });
} else {
  throw new Error('mode must be predecessors or rollback');
}
