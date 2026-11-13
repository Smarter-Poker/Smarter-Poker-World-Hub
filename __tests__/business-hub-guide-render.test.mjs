import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import * as guideData from '../src/lib/businessHubGuide.mjs';
import * as activity from '../src/lib/businessHubGuideActivity.mjs';
import * as journeyData from '../src/lib/businessHubJourney.mjs';
import * as consent from '../src/lib/guideAnalyticsConsent.mjs';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const renderer = require('react-test-renderer');
const ts = require('typescript');
const journeyModule = { exports: {} };
const journeyCompiled = ts.transpileModule(readFileSync(new URL('../src/components/help/BusinessHubJourney.jsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
});
vm.runInNewContext(journeyCompiled.outputText, {
  require: name => name.endsWith('businessHubJourney.mjs') ? journeyData : name.endsWith('businessHubGuide.mjs') ? guideData : require(name),
  module: journeyModule, exports: journeyModule.exports,
});
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
    sessionStorage: { getItem: () => 'yes' },
    posthog: {
      capture: (...args) => calls.push(args),
      has_opted_in_capturing: () => true,
      has_opted_out_capturing: () => false,
    },
  };
  browser.smarterGuideAnalytics = browser.posthog;
  Object.defineProperty(browser, 'posthog', { get: () => browser.smarterGuideAnalytics, set: sdk => { browser.smarterGuideAnalytics = sdk; } });
  const module = { exports: {} };
  const load = path => {
    if (path.endsWith('GuideAnalyticsConsent')) {
      const child = { exports: {} };
      const compiledConsent = ts.transpileModule(readFileSync(new URL('../src/components/help/GuideAnalyticsConsent.jsx', import.meta.url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
      vm.runInNewContext(compiledConsent.outputText, {
        require: name => name.endsWith('guideAnalyticsConsent.mjs') ? {
          guideConsent: () => consent.guideConsent(browser),
          enableGuideAnalytics: () => consent.enableGuideAnalytics(browser, undefined, ''),
          disableGuideAnalytics: () => consent.disableGuideAnalytics(browser),
        } : load(name), module: child, exports: child.exports, window: browser, URLSearchParams,
      });
      return child.exports;
    }
    if (path.endsWith('BusinessHubJourney')) return journeyModule.exports;
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
    '/hub/help#venue-inquiry',
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
  assert.equal(tree.root.findByProps({ id: 'guide-feedback-status' }).children.join(''), guideData.GUIDE_COPY.en.recorded);
  harness.browser.posthog.has_opted_in_capturing = () => false;
  const before = harness.calls.length;
  harness.click('No');
  assert.equal(harness.calls.length, before, 'no consent means no capture');
  assert.equal(tree.root.findByProps({ id: 'guide-feedback-status' }).children.join(''), guideData.GUIDE_COPY.en.unmeasured);
  assert.equal(harness.button('No').props['aria-pressed'], true);
  harness.browser.posthog = undefined;
  harness.click('Español');
  harness.click('Sí');
  assert.equal(harness.calls.length, before, 'missing SDK means no capture');
  assert.equal(tree.root.findByProps({ id: 'guide-feedback-status' }).children.join(''), guideData.GUIDE_COPY.es.unmeasured);
});

test('goal selection and venue drafting work without treating a draft as delivery', t => {
  const harness = setup(t);
  const tree = harness.mount();
  const change = (id, value) => renderer.act(() => tree.root.findByProps({ id }).props.onChange({ target: { value } }));
  assert.match(tree.root.findByProps({ id: 'venue-inquiry' }).props.className, /ph-no-capture/, 'typed fields and generated email href stay out of autocapture and session replay');
  change('guide-goal', 'club_arena');
  assert.ok(tree.root.findAllByType('p').some(node => String(node.children.join('')).includes('Funded Diamond Games Are Not Open')));
  assert.deepEqual(harness.calls.at(-1), ['business_hub_goal_selected', { topic: 'clubs', language: 'en', source: 'business_hub', destination: 'club_arena' }]);
  change('guide-goal', 'commander');
  assert.ok(tree.root.findAllByType('a').some(node => node.props.href === '#venue-inquiry'));
  renderer.act(() => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.ok(tree.root.findByProps({ role: 'alert' }));
  assert.equal(tree.root.findAllByProps({ id: 'venue-draft' }).length, 0);
  change('inquiry-venue', 'Private Test Venue'); change('inquiry-city', 'Chicago, IL'); change('inquiry-tool', 'tables');
  renderer.act(() => tree.root.findByType('form').props.onSubmit({ preventDefault() {} }));
  assert.match(tree.root.findByProps({ id: 'venue-draft' }).props.value, /Private Test Venue/);
  assert.deepEqual(harness.calls.at(-1), ['business_hub_draft_prepared', { topic: 'venues', language: 'en', source: 'business_hub' }]);
  assert.doesNotMatch(JSON.stringify(harness.calls), /Private Test Venue|Chicago/);
  const mail = tree.root.findAllByType('a').find(node => node.props.href.startsWith('mailto:') && node.props.href.includes('&body='));
  assert.ok(mail);
  assert.equal(mail.props.href.split('?')[0], 'mailto:support@smarter.poker');
  harness.click('Español');
  assert.match(tree.root.findByProps({ id: 'venue-draft' }).props.value, /Nombre Del Local/);
  change('inquiry-city', 'Austin, TX');
  assert.equal(tree.root.findAllByProps({ id: 'venue-draft' }).length, 0, 'editing invalidates the prepared draft');
});

test('operator scorecard renders measured zero distinctly from unavailable reporting', () => {
  const module = { exports: {} };
  const source = readFileSync(new URL('../src/components/admin/GrowthScorecard.jsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { require, module, exports: module.exports });
  const html = renderToStaticMarkup(React.createElement(module.exports.default, { report: {
    start: '2026-11-04T00:00:00Z', end: '2026-11-11T00:00:00Z', attribution: 'All Sources', completeness: 'Complete Snapshot',
    metrics: [{ id: 'accounts', label: 'Accounts Created', value: 0, status: 'measured', definition: 'Profile Records' }, { id: 'visits', label: 'Qualified Visits', value: null, status: 'unavailable', definition: 'Not Connected' }],
  } }));
  assert.match(html, /id="growth-scorecard"/);
  assert.match(html, />0<\/p>/);
  assert.match(html, />Unavailable<\/p>/);
  assert.match(html, /Unavailable Does Not Mean Zero/);
  assert.match(renderToStaticMarkup(React.createElement(module.exports.default)), /Growth Data Is Unavailable/);
  const dashboard = readFileSync(new URL('../pages/admin/signup-health.js', import.meta.url), 'utf8');
  assert.match(dashboard, /<GrowthScorecard report=\{state.growth\}/);
  assert.match(dashboard, /growth: json.growth/);
  assert.match(dashboard, /loadGrowthScorecard\(adm\)/);
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
