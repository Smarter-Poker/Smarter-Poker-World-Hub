import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from '@babel/parser';
import { createAccountOperationScope } from '../src/lib/trivia/accountOperationScope.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('dynamic Daily and solo modes invalidate account-scoped state at an auth boundary', () => {
    const source = read('pages/hub/trivia/[mode].js');
    assert.doesNotThrow(() => parse(source, { sourceType: 'module', plugins: ['jsx'] }));
    assert.match(source, /const accountChanged = accountIdentityRef\.current !== resolvedAccountId/);
    assert.match(source, /accountChanged && \['playing', 'saving', 'saving_error'\]\.includes/);
    assert.match(source, /setUserId\(resolvedAccountId\)/);
    assert.match(source, /setQuestions\(\[\]\)/);
    assert.match(source, /setUserDiamonds\(0\)/);
    assert.match(source, /setPersonalBest\(null\)/);
    assert.doesNotMatch(source, /else if \(mode === 'daily'\) \{\s*\/\/ Authentication is required/);
});

test('strategy modes discard stale balances and run state when identity changes', () => {
    const source = read('src/components/trivia/StrategyTrivia.jsx');
    assert.doesNotThrow(() => parse(source, { sourceType: 'module', plugins: ['jsx'] }));
    assert.match(source, /const identityChanged = authIdentityRef\.current !== nextUserId/);
    assert.match(source, /setLocalUserId\(nextUserId\)/);
    assert.match(source, /setSettlementReceipt\(null\)/);
    assert.match(source, /serverResultRef\.current = null/);
    assert.match(source, /authIdentityRef\.current !== uid[\s\S]{0,120}accountOperationScopeRef\.current\.isCurrent/);
    assert.match(source, /if \(previousUserId\) setGameState\('lobby'\)/);
});

test('a delayed completion captured by account A cannot commit after switching to account B', async () => {
    const scope = createAccountOperationScope('account-a');
    const accountA = scope.capture();
    let resolveRequest;
    let committed = null;
    const delayedRequest = new Promise(resolve => { resolveRequest = resolve; })
        .then(value => {
            if (scope.isCurrent(accountA)) committed = value;
        });

    scope.transition('account-b');
    resolveRequest('account-a-result');
    await delayedRequest;

    assert.equal(committed, null);
    const accountB = scope.capture();
    if (scope.isCurrent(accountB)) committed = 'account-b-result';
    assert.equal(committed, 'account-b-result');
});

test('every non-PvP server-run consumer fences delayed account-owned writes', () => {
    for (const file of [
        'pages/hub/trivia/[mode].js',
        'pages/hub/trivia/mixed.js',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/time-attack.js',
        'src/components/trivia/StrategyTrivia.jsx',
    ]) {
        const source = read(file);
        assert.doesNotThrow(() => parse(source, { sourceType: 'module', plugins: ['jsx'] }));
        assert.match(source, /createAccountOperationScope/);
        assert.match(source, /accountOperationScopeRef\.current\.isCurrent\(operationScope\)/);
    }

    const hook = read('src/hooks/useServerGradedRun.js');
    assert.match(hook, /operationScopeRef\.current\.transition\(operationIdentity\)/);
    assert.match(hook, /requireCurrentOperation\(operationScope\)/);
});
