import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const read = path => readFileSync(join(ROOT, path), 'utf8');

const NON_PVP = [
    ['pages/hub/trivia/[mode].js', /useServerGradedRun\(mode, \{ accountId: resolvedAccountId \}\)/],
    ['src/components/trivia/StrategyTrivia.jsx', /useServerGradedRun\(mode, \{[\s\S]*?accountId: userId/],
    ['pages/hub/trivia/mixed.js', /useServerGradedRun\('mixed', \{ accountId: resolvedAccountId \}\)/],
    ['pages/hub/trivia/endless.js', /useServerGradedRun\('endless', \{ accountId: resolvedAccountId \}\)/],
    ['pages/hub/trivia/survival-game.js', /useServerGradedRun\('survival', \{ accountId: resolvedAccountId \}\)/],
    ['pages/hub/trivia/time-attack.js', /useServerGradedRun\('time-attack', \{ accountId: resolvedAccountId \}\)/],
];

function defaultComponent(source, file) {
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const exported = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration');
    assert.equal(exported?.declaration?.type, 'FunctionDeclaration', `${file} keeps a named default component`);
    return exported.declaration;
}

function directServerRunDeclarations(component) {
    return component.body.body.filter(statement => statement.type === 'VariableDeclaration')
        .flatMap(statement => statement.declarations)
        .filter(declaration => declaration.init?.type === 'CallExpression'
            && declaration.init.callee?.type === 'Identifier'
            && declaration.init.callee.name === 'useServerGradedRun');
}

test('every server-graded consumer keeps its hook unconditional and account-scopes non-PvP custody', () => {
    for (const [file, expectedCall] of NON_PVP) {
        const source = read(file);
        assert.match(source, expectedCall, `${file} passes the resolved account id`);
        assert.equal(
            directServerRunDeclarations(defaultComponent(source, file)).length,
            1,
            `${file} calls useServerGradedRun once at component top level`,
        );
    }

    const pvpFile = 'src/components/trivia/pvp/PvpCompetitiveExperience.jsx';
    const pvp = read(pvpFile);
    assert.match(pvp, /useServerGradedRun\('pvp', \{ accessTokenProvider: getFreshAccessToken \}\)/);
    assert.doesNotMatch(pvp, /useServerGradedRun\('pvp',[\s\S]{0,120}accountId/);
    assert.equal(directServerRunDeclarations(defaultComponent(pvp, pvpFile)).length, 1);
});

test('mounted solo pages drop prior-account custody at a signed-out auth boundary', () => {
    for (const file of [
        'pages/hub/trivia/[mode].js',
        'pages/hub/trivia/mixed.js',
        'pages/hub/trivia/endless.js',
        'pages/hub/trivia/survival-game.js',
        'pages/hub/trivia/time-attack.js',
    ]) {
        assert.match(read(file), /setUserId\(null\)/, `${file} clears its resolved account id`);
    }
    assert.match(
        read('src/components/trivia/StrategyTrivia.jsx'),
        /setLocalUserId\(null\)/,
        'strategy fallback identity cannot survive sign-out after VIP identity clears',
    );
});

test('solo settlement custody is retired only from a committed terminal screen', () => {
    const expectations = [
        ['pages/hub/trivia/[mode].js', /gameState === 'results'[\s\S]{0,180}acknowledgeSettlement/],
        ['src/components/trivia/StrategyTrivia.jsx', /gameState === 'results'[\s\S]{0,180}acknowledgeSettlement/],
        ['pages/hub/trivia/mixed.js', /gameState === 'results'[\s\S]{0,180}acknowledgeSettlement/],
        ['pages/hub/trivia/endless.js', /gameState === 'gameover'[\s\S]{0,180}acknowledgeSettlement/],
        ['pages/hub/trivia/survival-game.js', /\['levelComplete', 'gameOver', 'victory'\][\s\S]{0,220}acknowledgeSettlement/],
        ['pages/hub/trivia/time-attack.js', /gameState === 'complete'[\s\S]{0,180}acknowledgeSettlement/],
    ];
    for (const [file, terminalAcknowledgement] of expectations) {
        assert.match(read(file), terminalAcknowledgement, `${file} acknowledges after its result view commits`);
    }

    assert.doesNotMatch(
        read('src/components/trivia/pvp/PvpCompetitiveExperience.jsx'),
        /acknowledgeSettlement/,
        'PvP intentionally owns match settlement outside solo recovery custody',
    );
});

test('legacy solo start actions fail closed until their authenticated account id is resolved', () => {
    const expectations = [
        ['pages/hub/trivia/mixed.js', /async function startGame\(\)[\s\S]{0,520}if \(!userId\)/],
        ['pages/hub/trivia/endless.js', /async function startGame\(\)[\s\S]{0,520}if \(!userId\)/],
        ['pages/hub/trivia/survival-game.js', /async function startLevel\(level\)[\s\S]{0,520}if \(!userId\)/],
        ['pages/hub/trivia/time-attack.js', /async function handleStart\(\)[\s\S]{0,520}if \(!userId\)/],
    ];
    for (const [file, guard] of expectations) {
        assert.match(read(file), guard, `${file} refuses start before account custody exists`);
    }

    assert.match(
        read('pages/hub/trivia/[mode].js'),
        /if \(serverGraded && !userId\)/,
        'free dynamic modes require the same account custody as paid and Daily modes',
    );
    assert.match(
        read('src/components/trivia/StrategyTrivia.jsx'),
        /async function startGame\(\)[\s\S]{0,1600}if \(!userId\)/,
        'strategy modes refuse start before account custody exists',
    );
});

function visit(node, inspect) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.type === 'string') inspect(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => visit(child, inspect));
        else if (value && typeof value === 'object') visit(value, inspect);
    }
}

function resetCalls(node) {
    const calls = [];
    visit(node, child => {
        if (child.type === 'CallExpression'
            && child.callee.type === 'MemberExpression'
            && child.callee.object.name === 'serverRun'
            && child.callee.property.name === 'reset') calls.push(child);
    });
    return calls;
}

test('post-start roster validation preserves custody; UI reset requires authoritative retirement', () => {
    for (const [file, retirementName] of [
        ['pages/hub/trivia/mixed.js', null],
        ['pages/hub/trivia/endless.js', 'leaveRetiredRun'],
        ['pages/hub/trivia/survival-game.js', 'leaveRetiredLevel'],
        ['pages/hub/trivia/time-attack.js', null],
    ]) {
        const source = read(file);
        const component = defaultComponent(source, file);
        if (!retirementName) {
            assert.equal(resetCalls(component).length, 0, `${file} preserves retry custody after start`);
            continue;
        }
        const retirement = component.body.body.find(node =>
            node.type === 'FunctionDeclaration' && node.id.name === retirementName);
        assert.ok(retirement, `${file} has an explicit retirement boundary`);
        const guard = retirement.body.body[0];
        assert.equal(guard.type, 'IfStatement');
        assert.equal(guard.test.type, 'UnaryExpression');
        assert.equal(guard.test.operator, '!');
        assert.equal(guard.test.argument.callee.name, 'isRetiredTriviaRunError');
        assert.equal(guard.test.argument.arguments[0].name, 'error');
        assert.equal(guard.consequent.type, 'ReturnStatement');
        assert.equal(guard.consequent.argument.value, false);
        assert.equal(resetCalls(retirement).length, 1);
        assert.equal(resetCalls(component).length, 1,
            `${file} cannot reset from roster validation or another unguarded path`);
    }
});
