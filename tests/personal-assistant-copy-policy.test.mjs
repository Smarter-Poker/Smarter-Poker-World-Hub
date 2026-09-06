import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import test from 'node:test';
import {
  applyPersonalAssistantCopyPolicy,
  isPersonalAssistantVerbatimElement,
  normalizePersonalAssistantCopy,
} from '../src/lib/personal-assistant/copyPolicy.mjs';

const routeFiles = [
  'pages/hub/personal-assistant/index.js',
  'pages/hub/personal-assistant/sandbox.js',
  'pages/hub/personal-assistant/leaks.js',
  'pages/sandbox/[id].js',
];

const visibleSourceRoots = [
  'pages/hub/personal-assistant',
  'pages/api/assistant',
  'src/components/personal-assistant',
  'src/components/sandbox',
];

async function sourceFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (['.js', '.jsx', '.mjs', '.ts', '.tsx'].includes(extname(entry.name))) files.push(path);
  }
  return files;
}

test('Personal Assistant copy normalizer replaces separators and empty-value marks', () => {
  const mark = '\u2014';
  assert.equal(normalizePersonalAssistantCopy(mark), 'Not Available');
  assert.equal(normalizePersonalAssistantCopy(`Ready ${mark} Run Audit`), 'Ready · Run Audit');
  assert.equal(normalizePersonalAssistantCopy('Already Compliant'), 'Already Compliant');
  assert.equal(normalizePersonalAssistantCopy('open this shared hand'), 'Open This Shared Hand');
  assert.equal(normalizePersonalAssistantCopy("player's hand can't load"), "Player's Hand Can't Load");
});

test('copy policy preserves technical content while normalizing ordinary UI copy', () => {
  const ordinaryParent = { tagName: 'P', matches: () => false, closest: () => null };
  const codeParent = { tagName: 'CODE', matches: selector => selector.includes('code'), closest: () => null };
  const verbatimParent = { tagName: 'SPAN', matches: () => false, closest: () => ({ dataset: { paVerbatim: 'true' } }) };
  const ordinaryText = { nodeType: 3, nodeValue: 'open saved hand', parentElement: ordinaryParent };
  const codeText = { nodeType: 3, nodeValue: '{"heroPosition":"small blind"}', parentElement: codeParent };
  const urlText = { nodeType: 3, nodeValue: 'https://smarter.poker/sandbox/aBc123?x=foo', parentElement: verbatimParent };
  const normalInput = {
    matches: () => false,
    closest: () => null,
    attributes: { placeholder: 'search saved hands' },
    getAttribute(name) { return this.attributes[name] || null; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const technicalInput = {
    matches: selector => selector.includes('[data-pa-verbatim]'),
    closest: () => null,
    attributes: { placeholder: '{"heroPosition":"small blind"}' },
    getAttribute(name) { return this.attributes[name] || null; },
    setAttribute(name, value) { this.attributes[name] = value; },
  };
  const nodes = [ordinaryText, codeText, urlText];
  const root = {
    nodeType: 1,
    matches: () => false,
    closest: () => null,
    getAttribute: () => null,
    querySelectorAll: () => [normalInput, technicalInput],
  };
  const previous = {
    document: globalThis.document,
    Node: globalThis.Node,
    NodeFilter: globalThis.NodeFilter,
  };

  try {
    globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1, DOCUMENT_FRAGMENT_NODE: 11 };
    globalThis.NodeFilter = { SHOW_TEXT: 4 };
    globalThis.document = {
      createTreeWalker: () => {
        let index = 0;
        return { nextNode: () => nodes[index++] || null };
      },
    };
    applyPersonalAssistantCopyPolicy(root);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
  }

  assert.equal(ordinaryText.nodeValue, 'Open Saved Hand');
  assert.equal(codeText.nodeValue, '{"heroPosition":"small blind"}');
  assert.equal(urlText.nodeValue, 'https://smarter.poker/sandbox/aBc123?x=foo');
  assert.equal(normalInput.attributes.placeholder, 'Search Saved Hands');
  assert.equal(technicalInput.attributes.placeholder, '{"heroPosition":"small blind"}');
  assert.equal(isPersonalAssistantVerbatimElement(codeParent), true);
  assert.equal(isPersonalAssistantVerbatimElement(verbatimParent), true);
  assert.equal(isPersonalAssistantVerbatimElement(ordinaryParent), false);
});

test('every Personal Assistant route installs the shared copy policy', async () => {
  for (const file of routeFiles) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /import PersonalAssistantCopyPolicy/);
    assert.match(source, /<PersonalAssistantCopyPolicy\s*\/>/);
  }
});

test('copy policy covers body text, placeholders, dynamic mutations, and accessible labels', async () => {
  const source = await readFile('src/components/personal-assistant/PersonalAssistantCopyPolicy.js', 'utf8');
  assert.match(source, /document\.body/);
  assert.match(source, /MutationObserver/);
  assert.match(source, /characterData: true/);
  assert.match(source, /attributeFilter: \['alt', 'aria-label', 'aria-description', 'aria-roledescription', 'aria-valuetext', 'placeholder', 'title', 'data-tooltip'\]/);
  assert.match(source, /text-transform: capitalize !important/);
  assert.match(source, /:is\(pre, code, \[data-pa-verbatim\]\)/);
  assert.match(source, /text-transform: none !important/);
  const policy = await readFile('src/lib/personal-assistant/copyPolicy.mjs', 'utf8');
  assert.match(policy, /normalizePersonalAssistantCopy/);
  assert.match(policy, /titleCasePersonalAssistantCopy/);
  assert.match(policy, /normalizePersonalAssistantCopy\(root\.nodeValue/);
  assert.match(policy, /normalizePersonalAssistantCopy\(textNode\.nodeValue/);
  assert.match(policy, /isPersonalAssistantVerbatimElement/);
});

test('shared signed-out state links to the canonical login route', async () => {
  const source = await readFile('src/components/sandbox/paKit.jsx', 'utf8');
  assert.match(source, /href = '\/auth\/login'/);
  assert.doesNotMatch(source, /href = '\/auth'/);
  await readFile('pages/auth/login.js', 'utf8');
});

test('owned Personal Assistant surfaces contain no banned em dash in SSR or exported copy', async () => {
  const files = [
    ...new Set((await Promise.all(visibleSourceRoots.map(sourceFiles))).flat()),
    'pages/sandbox/[id].js',
    'src/lib/personal-assistant/copyPolicy.mjs',
    'src/lib/sandbox/scenarioContract.mjs',
    'src/lib/sandbox/trainingCacheSolver.mjs',
  ];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /—|&mdash;|&#8212;/i, `${file} contains a banned em dash`);
  }
});
