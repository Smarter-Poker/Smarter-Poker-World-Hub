import { readFileSync, writeFileSync } from 'node:fs';

const [soloSourcePath, phase8SourcePath, outputPath] = process.argv.slice(2);
if (!soloSourcePath || !phase8SourcePath || !outputPath) {
    throw new Error('usage: extract-predecessors.mjs SOLO_SOURCE PHASE8_SOURCE OUTPUT');
}

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

const soloSource = readFileSync(soloSourcePath, 'utf8');
const phase8Source = readFileSync(phase8SourcePath, 'utf8');
const definitions = [
    extractFunction(soloSource, 'trivia_solo_spend'),
    ...[
        'trivia_p8_legacy_grade_locked_v1',
        'trivia_session_answer_v4',
        'trivia_legacy_session_answer_v1',
        'trivia_session_settle_solo_v4',
        'award_trivia_run_v4',
    ].map(name => extractFunction(phase8Source, name)),
];
writeFileSync(outputPath, `${definitions.join('\n\n')}\n`, { flag: 'wx' });
