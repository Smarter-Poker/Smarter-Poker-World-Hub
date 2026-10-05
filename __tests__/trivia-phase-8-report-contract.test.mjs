import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const read = relativePath => readFileSync(join(ROOT, relativePath), 'utf8');

test('question reports bind the exact served question and revision without accepting forged session authority', () => {
    const component = read('src/components/trivia/ReportQuestionButton.jsx');

    assert.doesNotThrow(() => parse(component, {
        sourceType: 'module',
        plugins: ['jsx'],
        errorRecovery: false,
    }));
    assert.match(component, /function ReportQuestionButton\(\{ questionId, sessionId, accountId, userToken, onDone \}\)/);
    assert.match(component, /typeof sessionId === 'string' && UUID_RE\.test\(sessionId\)/);
    assert.match(component, /\? \{ session_id: sessionId \}\s*:\s*\{\}/);
    assert.doesNotMatch(component, /session_id:\s*sessionId\s*,?\s*\n/, 'an absent or malformed session id must be omitted, not posted as authority');
    assert.match(component, /activeScopeRef\.current = requestScope/);
    assert.match(component, /useEffect\(\(\) => \{[\s\S]*requestRef\.current\?\.abort\(\)[\s\S]*setDone\(false\)[\s\S]*\}, \[accountId, questionId, sessionId\]\)/);
    assert.match(component, /signal: controller\.signal/);
    assert.match(component, /activeScopeRef\.current !== submittedScope/);

    const strategy = read('src/components/trivia/StrategyTrivia.jsx');
    const strategyReports = strategy.match(/<ReportQuestionButton[\s\S]*?\/>/g) || [];
    assert.equal(strategyReports.length, 2);
    for (const report of strategyReports) {
        assert.match(report, /sessionId=\{serverRun\.sessionId\}/);
        assert.match(report, /accountId=\{userId\}/);
    }

    const endpoint = read('pages/api/trivia/report-question.js');
    assert.match(endpoint, /const suppliedSessionId = req\.body\?\.session_id/);
    assert.match(endpoint, /suppliedSessionId != null[\s\S]*session_id must be a valid UUID when supplied/);
    assert.match(endpoint, /const sessionId = typeof suppliedSessionId === 'string' \? suppliedSessionId : null/);
    assert.match(endpoint, /p_session_id: sessionId/);
    assert.match(endpoint, /rpc\('trivia_submit_question_report_v2'/);

    const migration = read('supabase/migrations/20261005182000_trivia_p8_solo_integrity.sql');
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.trivia_submit_question_report_v2/);
    assert.match(migration, /IF p_session_id IS NULL THEN[\s\S]*'session_required'/);
    assert.match(migration, /array_position\(s\.question_ids, p_question_id\) IS NULL/);
    assert.match(migration, /question_not_in_session/);
    assert.match(migration, /IF s\.engine_version IS NOT NULL THEN[\s\S]*SELECT a\.revision_id INTO v_rev/);
    assert.match(migration, /v_rev := \(s\.question_revision_ids ->> p_question_id::text\)::uuid/);
    assert.match(migration, /r\.id = v_rev AND r\.question_id = p_question_id/);
    assert.match(migration, /revision_provenance_unavailable/);
    assert.doesNotMatch(migration, /s\.question_ids && ARRAY\(/, 'canonical siblings cannot stand in for the exact served question');
});
