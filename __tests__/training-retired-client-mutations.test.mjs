import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { parse } from '@babel/parser';

const ROOT = process.cwd();
const CLIENT_ROOTS = [
  'app',
  'components',
  'config',
  'engine',
  'hooks',
  'lib',
  'pages',
  'services',
  'src',
  'utils',
  'worker',
];
const SOURCE_EXTENSION = /\.(?:cjs|js|jsx|mjs|ts|tsx)$/;

const POLICIES = [
  { endpoint: '/api/training/tournaments', allowedMethods: new Set(['GET']) },
  { endpoint: '/api/training/challenges', allowedMethods: new Set(['GET']) },
  { endpoint: '/api/training/daily-bonus', allowedMethods: new Set(['GET']) },
  // GET exposed solver answers (`correct_action`) and is retired along with its writes.
  { endpoint: '/api/training/spaced-repetition', allowedMethods: new Set() },
  { endpoint: '/api/jarvis/training-session', allowedMethods: new Set() },
  { endpoint: '/api/training/achievements', allowedMethods: new Set(['GET']) },
  // PUT is the separately authenticated milestone-claim read/settle path.
  { endpoint: '/api/training/streak', allowedMethods: new Set(['GET', 'PUT']) },
  { endpoint: '/api/training/update-leaderboard', allowedMethods: new Set() },
  { endpoint: '/api/training/delete-session', allowedMethods: new Set() },
  { endpoint: '/api/training/leaderboard', allowedMethods: new Set(['GET']) },
  { endpoint: '/api/training/share', customShareOnly: true },
];

const MEMORY_GAME_CLIENT_FILES = [
  'pages/hub/memory-games.js',
  'src/games/PatternRecognitionGame.js',
  'src/games/PressureCookerGame.js',
  'src/games/SpeedDrillGame.js',
  'src/games/MixedStrategyGame.js',
  'src/games/TournamentModeGame.jsx',
  'src/games/SpotTrainerGame.jsx',
];

// These legacy entry points accept browser-owned scores, answer maps, or
// completion claims. They cannot be used by a reachable memory-game client
// until the caller has a server-signed attempt receipt.
const RETIRED_MEMORY_MUTATION_METHODS = new Set([
  'recordSession',
  'checkAndUnlock',
  'updateLeaderboard',
  'completeChallenge',
  'processGameResult',
]);
const RETIRED_MEMORY_MUTATION_RPCS = new Set([
  'add_diamonds_to_balance',
  'complete_daily_challenge',
  'process_game_result',
  'record_game_session',
  'record_memory_game_session',
  'unlock_achievement',
  'update_leaderboard',
  'update_user_elo',
]);

function parseClientSource(source, filename = 'inline-client.js') {
  return parse(source, {
    sourceType: 'unambiguous',
    sourceFilename: filename,
    errorRecovery: false,
    plugins: [
      'jsx',
      'typescript',
      'decorators-legacy',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'dynamicImport',
      'importAssertions',
      'topLevelAwait',
    ],
  });
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      walk(value, visit);
    }
  }
}

function collectBindings(ast) {
  const bindings = new Map();
  walk(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.init) {
      bindings.set(node.id.name, node.init);
    }
  });
  return bindings;
}

function staticStrings(node, bindings, seen = new Set()) {
  if (!node) return [];
  if (node.type === 'StringLiteral' || node.type === 'Literal') return [String(node.value)];
  if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
    return staticStrings(node.expression, bindings, seen);
  }
  if (node.type === 'Identifier') {
    if (seen.has(node.name) || !bindings.has(node.name)) return ['<dynamic>'];
    const nextSeen = new Set(seen);
    nextSeen.add(node.name);
    return staticStrings(bindings.get(node.name), bindings, nextSeen);
  }
  if (node.type === 'ConditionalExpression') {
    return [
      ...staticStrings(node.consequent, bindings, seen),
      ...staticStrings(node.alternate, bindings, seen),
    ];
  }
  if (node.type === 'LogicalExpression') {
    return [
      ...staticStrings(node.left, bindings, seen),
      ...staticStrings(node.right, bindings, seen),
    ];
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = staticStrings(node.left, bindings, seen);
    const right = staticStrings(node.right, bindings, seen);
    return left.flatMap((prefix) => right.map((suffix) => `${prefix}${suffix}`));
  }
  if (node.type === 'TemplateLiteral') {
    let candidates = [''];
    for (let index = 0; index < node.quasis.length; index += 1) {
      const quasi = node.quasis[index]?.value?.cooked ?? node.quasis[index]?.value?.raw ?? '';
      candidates = candidates.map((candidate) => `${candidate}${quasi}`);
      if (index < node.expressions.length) {
        const expressions = staticStrings(node.expressions[index], bindings, seen);
        candidates = candidates.flatMap((candidate) => (
          expressions.map((expression) => `${candidate}${expression}`)
        ));
      }
    }
    return candidates;
  }
  return ['<dynamic>'];
}

function propertyName(property) {
  if (!property || property.computed) return null;
  if (property.key?.type === 'Identifier') return property.key.name;
  if (property.key?.type === 'StringLiteral') return property.key.value;
  return null;
}

function resolveObject(node, bindings, seen = new Set()) {
  if (!node) return null;
  if (node.type === 'ObjectExpression') return node;
  if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
    return resolveObject(node.expression, bindings, seen);
  }
  if (node.type === 'Identifier' && !seen.has(node.name) && bindings.has(node.name)) {
    const nextSeen = new Set(seen);
    nextSeen.add(node.name);
    return resolveObject(bindings.get(node.name), bindings, nextSeen);
  }
  return null;
}

function objectProperty(object, name) {
  return object?.properties?.find((property) => (
    property.type === 'ObjectProperty' && propertyName(property) === name
  )) || null;
}

function callName(callee) {
  if (callee?.type === 'Identifier') return callee.name;
  if (callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') {
    if (!callee.computed && callee.property?.type === 'Identifier') return callee.property.name;
    if (callee.computed && callee.property?.type === 'StringLiteral') return callee.property.value;
  }
  return null;
}

function resolveBoundExpression(node, bindings, seen = new Set()) {
  if (!node) return null;
  if (node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion') {
    return resolveBoundExpression(node.expression, bindings, seen);
  }
  if (node.type === 'Identifier' && !seen.has(node.name) && bindings.has(node.name)) {
    const nextSeen = new Set(seen);
    nextSeen.add(node.name);
    return resolveBoundExpression(bindings.get(node.name), bindings, nextSeen);
  }
  return node;
}

function scanMemoryAuthoritySource(source, filename = 'inline-memory-client.js') {
  const ast = parseClientSource(source, filename);
  const bindings = collectBindings(ast);
  const violations = [];

  walk(ast, (node) => {
    if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return;
    const callee = resolveBoundExpression(node.callee, bindings);
    const name = callName(callee);

    if (RETIRED_MEMORY_MUTATION_METHODS.has(name)) {
      violations.push({ filename, line: node.loc?.start?.line || 0, kind: 'client-method', name });
    }

    if (name !== 'rpc') return;
    for (const rpcName of staticStrings(node.arguments?.[0], bindings)) {
      if (RETIRED_MEMORY_MUTATION_RPCS.has(rpcName)) {
        violations.push({ filename, line: node.loc?.start?.line || 0, kind: 'client-rpc', name: rpcName });
      }
    }
  });

  return violations;
}

function requestMethod(call, bindings) {
  const name = String(callName(call.callee) || '').toLowerCase();
  if (['get', 'post', 'put', 'patch', 'delete'].includes(name)) {
    return name.toUpperCase();
  }
  if (['useswr', 'useswrinfinite'].includes(name)) return 'GET';
  if (name === 'sendbeacon') return 'POST';
  if (name === 'open') {
    const methods = staticStrings(call.arguments?.[0], bindings).map((value) => value.toUpperCase());
    return methods.length === 1 ? methods[0] : 'UNKNOWN';
  }
  const requestObject = resolveObject(call.arguments?.[0], bindings);
  const options = ['axios', 'request'].includes(name) && requestObject
    ? requestObject
    : resolveObject(call.arguments?.[1], bindings);
  if (!options) return call.arguments?.[1] ? 'UNKNOWN' : 'GET';
  const method = objectProperty(options, 'method');
  if (!method) return 'GET';
  const values = staticStrings(method.value, bindings).map((value) => value.toUpperCase());
  return values.length === 1 ? values[0] : 'UNKNOWN';
}

function isNetworkCall(call) {
  const name = String(callName(call.callee) || '').toLowerCase();
  return [
    'axios',
    'fetch',
    'authedfetch',
    'get',
    'open',
    'post',
    'put',
    'patch',
    'delete',
    'request',
    'sendbeacon',
    'useswr',
    'useswrinfinite',
  ].includes(name);
}

function requestUrls(call, bindings) {
  const name = String(callName(call.callee) || '').toLowerCase();
  if (name === 'open') return staticStrings(call.arguments?.[1], bindings);
  const requestObject = resolveObject(call.arguments?.[0], bindings);
  if (['axios', 'request'].includes(name) && requestObject) {
    return staticStrings(objectProperty(requestObject, 'url')?.value, bindings);
  }
  return staticStrings(call.arguments?.[0], bindings);
}

function hasCustomShareBody(call, bindings) {
  const options = resolveObject(call.arguments?.[1], bindings);
  const body = objectProperty(options, 'body')?.value;
  if (body?.type !== 'CallExpression' || callName(body.callee) !== 'stringify') return false;
  const payload = resolveObject(body.arguments?.[0], bindings);
  if (!payload || !objectProperty(payload, 'customMessage')) return false;
  const shareType = objectProperty(payload, 'shareType');
  if (!shareType) return true;
  return staticStrings(shareType.value, bindings).every((value) => value === 'custom');
}

function scanSource(source, filename = 'inline-client.js') {
  const ast = parseClientSource(source, filename);
  const bindings = collectBindings(ast);
  const violations = [];

  walk(ast, (node) => {
    if (node.type !== 'CallExpression' && node.type !== 'OptionalCallExpression') return;
    if (!isNetworkCall(node)) return;

    const urls = requestUrls(node, bindings);
    for (const url of urls) {
      const policy = POLICIES.find(({ endpoint }) => url.includes(endpoint));
      if (!policy) continue;

      const method = requestMethod(node, bindings);
      const allowed = policy.customShareOnly
        ? method === 'POST' && hasCustomShareBody(node, bindings)
        : policy.allowedMethods.has(method);
      if (!allowed) {
        violations.push({
          filename,
          line: node.loc?.start?.line || 0,
          endpoint: policy.endpoint,
          method,
        });
      }
    }
  });

  return violations;
}

function clientFiles() {
  const files = [];
  const visit = (absoluteDirectory) => {
    if (!fs.existsSync(absoluteDirectory)) return;
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = path.relative(ROOT, absolutePath);
      if (entry.isDirectory()) {
        if ([path.join('app', 'api'), path.join('pages', 'api')].includes(relativePath)) continue;
        visit(absolutePath);
      } else if (SOURCE_EXTENSION.test(entry.name)) {
        files.push(relativePath);
      }
    }
  };
  for (const root of CLIENT_ROOTS) visit(path.join(ROOT, root));
  return files;
}

test('active clients contain no retired Training mutations or spaced-repetition answer-key downloads', () => {
  const violations = clientFiles().flatMap((filename) => {
    const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
    return scanSource(source, filename);
  });

  assert.deepEqual(violations, []);
});

test('reachable memory games cannot persist locally graded results through retired services or RPCs', () => {
  const violations = MEMORY_GAME_CLIENT_FILES.flatMap((filename) => {
    const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
    return scanMemoryAuthoritySource(source, filename);
  });

  assert.deepEqual(violations, []);
});

test('memory-game result rewards remain honest, guest-only local practice balances', () => {
  const dynamicGames = MEMORY_GAME_CLIENT_FILES.slice(1);

  for (const filename of dynamicGames) {
    const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
    const awards = source.match(/DiamondEngine\.award\s*\(/g) || [];
    const guestGuards = source.match(/if\s*\(\s*!userId\s*&&[^)]*\)\s*\{[\s\S]{0,180}?DiamondEngine\.award\s*\(/g) || [];
    assert.equal(awards.length, guestGuards.length, `${filename}: every award must be guarded by !userId`);
    assert.doesNotMatch(source, /Diamonds Earned!/i, `${filename}: signed-in UI must not promise an unverified award`);
  }

  const rangeLab = fs.readFileSync(path.join(ROOT, MEMORY_GAME_CLIENT_FILES[0]), 'utf8');
  assert.match(rangeLab, /if\s*\(\s*!user\?\.id\s*&&\s*economyReady\s*\)\s*DiamondEngine\.award\s*\(/);
});

test('retired controls disclose unavailability while local card sharing and downloads remain live', () => {
  for (const filename of [
    'pages/hub/training/autopilot.js',
    'pages/hub/training/streaks.js',
    'src/components/training/AchievementToast.jsx',
  ]) {
    const source = fs.readFileSync(path.join(ROOT, filename), 'utf8');
    assert.match(source, /disabled[\s\S]{0,900}(?:Feed Sharing|Share Unavailable)/, filename);
  }

  const achievements = fs.readFileSync(
    path.join(ROOT, 'pages/hub/training/achievements.js'),
    'utf8',
  );
  assert.doesNotMatch(achievements, /api\/training\/share|navigator\.share|Feed Sharing/);

  const arena = fs.readFileSync(path.join(ROOT, 'src/components/training/GodModeArena.jsx'), 'utf8');
  assert.match(arena, /onClick=\{\(\) => setShowShareCard\(true\)\}/);
  assert.match(arena, /<SessionShareCard/);
  assert.match(arena, /disabled[\s\S]{0,900}Feed Posting Unavailable/);

  const shareCard = fs.readFileSync(path.join(ROOT, 'src/components/training/SessionShareCard.jsx'), 'utf8');
  assert.match(shareCard, /navigator\.share/);
  assert.match(shareCard, /link\.download/);

  const legacySession = fs.readFileSync(path.join(ROOT, 'src/components/training/GameSession.tsx'), 'utf8');
  assert.match(legacySession, /diamondsEarned: 0/);
  assert.match(legacySession, /Rewards: Unavailable For This Legacy Session/);

  const facade = fs.readFileSync(path.join(ROOT, 'services/GamificationService.js'), 'utf8');
  assert.match(facade, /success: false/);
  assert.match(facade, /TRAINING_VERIFIED_ATTEMPT_REQUIRED/);
});

test('individual deletion of sealed Training session projections is retired', () => {
  const endpoint = fs.readFileSync(
    path.join(ROOT, 'pages/api/training/delete-session.js'),
    'utf8',
  );

  assert.match(endpoint, /status\(410\)/);
  assert.match(endpoint, /TRAINING_SESSION_DELETE_RETIRED/);
  assert.doesNotMatch(endpoint, /service.role|SUPABASE_SERVICE_ROLE_KEY|\.from\(['"]training_sessions['"]\)\.delete/is);
});

test('the retired-client scanner fails closed against disguised writes and answer-key reads', () => {
  const attacks = [
    "fetch('/api/training/tournaments', { method: 'POST' });",
    "authedFetch('/api/training/challenges', { method: 'PUT' });",
    "fetch('/api/training/daily-bonus', { method: 'POST' });",
    "const base = '/api/training'; fetch(`${base}/spaced-repetition?count=25`);",
    "useSWR('/api/training/spaced-repetition?count=25', authedFetcher);",
    "const endpoint = '/api/training/spaced-repetition'; const options = { method: 'PATCH' }; fetch(endpoint, options);",
    "window.fetch('/api/jarvis/training-session', { method: 'POST' });",
    "navigator.sendBeacon('/api/jarvis/training-session', JSON.stringify(answerKey));",
    "authedFetch('/api/training/achievements', { method: 'POST' });",
    "authedFetch('/api/training/streak', { method: 'POST' });",
    "fetch('/api/training/update-leaderboard', { method: 'POST' });",
    "fetch('/api/training/delete-session', { method: 'POST', body: JSON.stringify({ sessionId }) });",
    "fetch('/api/training/leaderboard', { method: 'POST' });",
    "axios({ url: '/api/training/tournaments', method: 'POST' });",
    "xhr.open('POST', '/api/training/update-leaderboard');",
    "authedFetch('/api/training/share', { method: 'POST', body: JSON.stringify({ shareType: 'achievement', data: stats }) });",
  ];

  for (const [index, source] of attacks.entries()) {
    assert.ok(scanSource(source, `attack-${index}.js`).length > 0, source);
  }

  assert.deepEqual(scanSource("fetch('/api/training/tournaments?status=live');"), []);
  assert.deepEqual(scanSource("authedFetch('/api/training/streak', { method: 'PUT' });"), []);
  assert.deepEqual(scanSource(
    "authedFetch('/api/training/share', { method: 'POST', body: JSON.stringify({ shareType: 'custom', customMessage: message }) });",
  ), []);
});

test('the memory-authority scanner fails closed against aliased service calls and RPC names', () => {
  const attacks = [
    'gameSessionService.recordSession(user.id, localResult);',
    'achievementService.checkAndUnlock(user.id, locallyGradedStats);',
    'leaderboardService.updateLeaderboard(user.id, mode, level, localScore);',
    'dailyChallengeService.completeChallenge(user.id, challenge.id, localScore);',
    'processGameResult(user.id, level, localAccuracy, gamesPlayed);',
    'const persist = leaderboardService.updateLeaderboard; persist(user.id, mode, level, score);',
    "const mutation = 'complete_' + 'daily_challenge'; supabase.rpc(mutation, payload);",
    "supabase.rpc('update_leaderboard', browserOwnedScore);",
  ];

  for (const [index, source] of attacks.entries()) {
    assert.ok(scanMemoryAuthoritySource(source, `memory-attack-${index}.js`).length > 0, source);
  }

  assert.deepEqual(scanMemoryAuthoritySource('leaderboardService.getLeaderboard(mode, null, 50);'), []);
  assert.deepEqual(scanMemoryAuthoritySource('dailyChallengeService.getTodaysChallenge();'), []);
  assert.deepEqual(scanMemoryAuthoritySource("authedFetch('/api/training/attempt/complete', signedReceipt);"), []);
});
