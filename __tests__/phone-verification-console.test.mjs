import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/components/gates/VerificationConsole.jsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require: (name) => name.endsWith('.css') ? new Proxy({}, { get: (_, key) => String(key) }) : name === 'next/link' ? 'a' : require(name) });
const Console = exports.default;
function nodes(node) { return [node, ...[node?.props?.children].flat(Infinity).filter(Boolean).flatMap(nodes)]; }
function fixture(overrides = {}) {
  const calls = [];
  const props = { checking: false, alreadyVerified: false, stage: 'phone', busy: false, phone: '5555555555', digits: '5555555555', code: '', cooldown: 0, formatPhone: x => x, sendCode: () => calls.push('send'), verifyCode: () => calls.push('verify'), skip: () => calls.push('skip'), goHub: () => calls.push('hub'), changePhone: () => calls.push('change'), vipDays: 30, welcomeDiamonds: 500, ...overrides };
  const all = nodes(Console(props));
  return { calls, all, find: predicate => all.find(predicate) };
}
test('phone input and send action occupy real semantic controls', () => {
  const f = fixture();
  assert.equal(f.find(n => n?.type === 'input').props.autoComplete, 'tel-national');
  const send = f.find(n => n?.props?.type === 'submit');
  assert.equal(send.props.disabled, false);
  f.find(n => n?.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(f.calls, ['send']);
  assert.equal(fixture({ digits: '555' }).find(n => n?.props?.type === 'submit').props.disabled, true);
});
test('code stage uses code input, verification and cooldown controls', () => {
  const f = fixture({ stage: 'code', code: '1234', cooldown: 18 });
  assert.equal(f.find(n => n?.type === 'input').props.autoComplete, 'one-time-code');
  assert.equal(f.find(n => n?.type === 'input').props.maxLength, 4);
  assert.equal(f.find(n => n?.props?.children === 'Resend In 18s').props.disabled, true);
  f.find(n => n?.type === 'form').props.onSubmit({ preventDefault() {} });
  f.find(n => n?.props?.children === 'Change Number').props.onClick();
  assert.deepEqual(f.calls, ['verify', 'change']);
});
test('completion and busy account checks prevent further code submission', () => {
  const done = fixture({ stage: 'done' });
  assert.equal(done.find(n => n?.type === 'input'), undefined);
  done.find(n => n?.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(done.calls, ['hub']);
  const checking = fixture({ checking: true });
  checking.find(n => n?.type === 'form').props.onSubmit({ preventDefault() {} });
  assert.deepEqual(checking.calls, []);
  assert.equal(checking.find(n => n?.props?.type === 'submit').props.disabled, true);
  assert.equal(fixture({ busy: true }).find(n => n?.props?.type === 'submit').props.disabled, true);
});
test('close and skip share the existing dismissal handler and errors are announced', () => {
  const f = fixture({ error: 'Invalid Code' });
  f.find(n => n?.props?.['aria-label'] === 'Close Verification').props.onClick();
  f.find(n => n?.props?.['aria-label'] === 'Skip For Now').props.onClick();
  assert.deepEqual(f.calls, ['skip', 'skip']);
  assert.equal(f.find(n => n?.props?.role === 'alert').props.children, 'Invalid Code');
});
