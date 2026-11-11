import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import * as guideData from '../src/lib/businessHubGuide.mjs';
import * as activity from '../src/lib/businessHubGuideActivity.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const renderer = require('react-test-renderer');
const ts = require('typescript');
const source = readFileSync(new URL('../src/components/help/BusinessHubGuide.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  reportDiagnostics: true,
});
assert.equal(compiled.diagnostics.length, 0, 'guide JSX transpiles');

function setup(t, search = '?source=business_hub&private=never-capture-this') {
  const calls = [];
  const browser = {
    location: { search }, navigator: {},
    posthog: {
      capture: (...args) => calls.push(args),
      has_opted_in_capturing: () => true,
      has_opted_out_capturing: () => false,
    },
  };
  const module = { exports: {} };
  const load = path => {
    if (path.endsWith('businessHubGuide.mjs')) return guideData;
    if (path.endsWith('businessHubGuideActivity.mjs')) {
      // Exercise the real consent/payload helper against this isolated browser.
      return { captureBusinessHubGuideEvent: (stage, props) => activity.captureBusinessHubGuideEvent(stage, props, browser) };
    }
    return require(path);
  };
  vm.runInNewContext(compiled.outputText, {
    require: load, module, exports: module.exports, window: browser, URLSearchParams, Set,
  });
  const Guide = module.exports.default;
  let tree;
  t.after(() => { if (tree) renderer.act(() => tree.unmount()); });
  return {
    browser, calls, Guide,
    mount() { renderer.act(() => { tree = renderer.create(React.createElement(Guide)); }); return tree; },
    update() { renderer.act(() => tree.update(React.createElement(Guide))); },
    button(label) { return tree.root.findAllByType('button').find(node => node.children.join('') === label); },
    click(label) { const node = this.button(label); assert.ok(node, `${label} button exists`); renderer.act(() => node.props.onClick()); },
  };
}

test('server rendering includes readable answers and working official destinations without analytics', t => {
  const { Guide, calls } = setup(t);
  const html = renderToStaticMarkup(React.createElement(Guide));
  assert.match(html, /id="start" lang="en"/);
  assert.equal((html.match(/<details/g) || []).length, 9);
  assert.equal((html.match(/<summary/g) || []).length, 9);
  for (const href of [
    '/hub/training', '/hub/poker-near-me/lobby', '/hub/bankroll-manager',
    '/hub/club-arena', '/hub/commander', 'mailto:support@smarter.poker',
    'mailto:support@smarter.poker?subject=Venue%20Onboarding',
    '/terms', '/legal/official-rules', '/privacy',
  ]) assert.ok(html.includes(`href="${href}"`), `SSR includes ${href}`);
  assert.match(html, /Funded Diamond Games Are Not Open For Play Yet/);
  assert.match(html, /Payment Does Not Increase Reward Chances/);
  assert.match(html, /Passwords, Verification Codes, Government ID Or Financial Credentials/);
  assert.match(html, /scope="col"/);
  assert.match(html, /scope="row"/);
  assert.equal(calls.length, 0, 'rendering alone never captures a view');
});

test('language controls change the rendered guide and destination events retain the selected language', t => {
  const harness = setup(t);
  const tree = harness.mount();
  assert.deepEqual(harness.calls, [['business_hub_guide_view', { language: 'en', source: 'business_hub' }]]);
  harness.update();
  assert.equal(harness.calls.length, 1, 'rerendering does not duplicate the view');
  harness.click('Español');
  assert.equal(tree.root.findByProps({ id: 'start' }).props.lang, 'es');
  assert.equal(harness.button('Español').props['aria-pressed'], true);
  assert.equal(harness.button('English').props['aria-pressed'], false);
  assert.ok(tree.root.findAllByType('summary').some(node => node.children.join('') === '¿Está Abierto Diamond Arena?'));
  const bankroll = tree.root.findAllByType('a').find(node => node.props.href === '/hub/bankroll-manager');
  renderer.act(() => bankroll.props.onClick());
  assert.deepEqual(harness.calls.at(-1), ['business_hub_destination_click', {
    topic: 'bankroll', language: 'es', source: 'business_hub', destination: 'bankroll',
  }]);
  harness.click('English');
  assert.equal(tree.root.findByProps({ id: 'start' }).props.lang, 'en');
  assert.equal(harness.calls.filter(([event]) => event === 'business_hub_guide_view').length, 1);
});

test('feedback distinguishes an accepted SDK call from unavailable or nonconsented analytics', t => {
  const harness = setup(t);
  const tree = harness.mount();
  harness.click('Yes');
  assert.deepEqual(harness.calls.at(-1), ['business_hub_feedback', {
    language: 'en', source: 'business_hub', helpful: true,
  }]);
  assert.equal(tree.root.findByProps({ role: 'status' }).children.join(''), guideData.GUIDE_COPY.en.recorded);
  harness.browser.posthog.has_opted_in_capturing = () => false;
  const before = harness.calls.length;
  harness.click('No');
  assert.equal(harness.calls.length, before, 'no consent means no capture');
  assert.equal(tree.root.findByProps({ role: 'status' }).children.join(''), guideData.GUIDE_COPY.en.unmeasured);
  assert.equal(harness.button('No').props['aria-pressed'], true);
  harness.browser.posthog = undefined;
  harness.click('Español');
  harness.click('Sí');
  assert.equal(harness.calls.length, before, 'missing SDK means no capture');
  assert.equal(tree.root.findByProps({ role: 'status' }).children.join(''), guideData.GUIDE_COPY.es.unmeasured);
});

test('initial source attribution accepts only the finite whitelist and never captures raw URLs', async t => {
  for (const [search, expected] of [
    ['?source=help&private=never-capture-this', 'help'],
    ['?source=direct', 'direct'],
    ['?source=https://private.example/token&email=private@example.com', 'direct'],
    ['?source=BUSINESS_HUB', 'direct'],
    ['', 'direct'],
  ]) {
    await t.test(search || 'no source', subtest => {
      const harness = setup(subtest, search);
      harness.mount();
      assert.deepEqual(harness.calls, [['business_hub_guide_view', { language: 'en', source: expected }]]);
      assert.doesNotMatch(JSON.stringify(harness.calls), /private|token|email|never-capture/);
    });
  }
});
