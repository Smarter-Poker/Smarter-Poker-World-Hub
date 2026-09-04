/**
 * modalHistoryCore: the back-gesture bookkeeping behind useModalHistory,
 * driven against a fake history stack. Every case here is a bug class the
 * first draft of the hook had: an X-close that broke the NEXT back gesture,
 * a back gesture that closed two stacked sheets at once, and a pop that Next
 * turned into a route change (scroll to top).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('src/hooks/modalHistoryCore.js', 'utf8');
const core = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function fakeWindow() {
  const stack = [{ __N: true, page: true }];
  let index = 0;
  const listeners = [];
  const win = {
    history: {
      get state() {
        return stack[index];
      },
      pushState(state) {
        stack.splice(index + 1);
        stack.push(state);
        index += 1;
      },
      back() {
        // Browsers deliver popstate asynchronously; queue it.
        pending.push(() => {
          if (index === 0) return;
          index -= 1;
          const ev = { state: stack[index] };
          listeners.forEach((l) => l(ev));
        });
      },
    },
    addEventListener(type, fn) {
      if (type === 'popstate') listeners.push(fn);
    },
  };
  const pending = [];
  // Wire the hook's global listener the way useModalHistory does.
  win.addEventListener('popstate', (e) => core.handlePopState(win, e.state));
  return {
    win,
    stack,
    depth: () => index,
    flush() {
      while (pending.length) pending.shift()();
    },
    userBack() {
      win.history.back();
      this.flush();
    },
  };
}

test('open then X: pops own entry once, onClose not re-fired, next back leaves the page', () => {
  core.resetModalHistoryForTests();
  const h = fakeWindow();
  let closes = 0;
  const id = core.openModalEntry(h.win, () => () => { closes += 1; });
  assert.equal(h.depth(), 1);
  assert.equal(core.shouldRouterHandlePop(h.stack[0]), false, 'a pop that would close the modal is ours');

  core.closeModalEntry(h.win, id); // the X
  assert.equal(core.shouldRouterHandlePop(h.stack[0]), false, 'still ours while the back() is in flight');
  h.flush();
  assert.equal(h.depth(), 0, 'our entry is gone');
  assert.equal(closes, 0, 'onClose was not fired by our own back()');
  assert.equal(core.openModalCount(), 0);
  assert.equal(core.shouldRouterHandlePop(h.stack[0]), true, 'the next back is a real navigation');
});

test('open then back gesture: onClose fires once, entry gone, router not invoked', () => {
  core.resetModalHistoryForTests();
  const h = fakeWindow();
  let closes = 0;
  core.openModalEntry(h.win, () => () => { closes += 1; });
  assert.equal(core.shouldRouterHandlePop(h.stack[0]), false);
  h.userBack();
  assert.equal(closes, 1);
  assert.equal(h.depth(), 0);
  assert.equal(core.openModalCount(), 0);
});

test('X-close after a back-close does not pop a second time', () => {
  core.resetModalHistoryForTests();
  const h = fakeWindow();
  // Give the page a real previous entry so a stray back() would be visible.
  h.win.history.pushState({ __N: true, page: 2 });
  const id = core.openModalEntry(h.win, () => () => {});
  h.userBack(); // gesture closes it
  assert.equal(h.depth(), 1);
  core.closeModalEntry(h.win, id); // React unmount cleanup runs after onClose
  h.flush();
  assert.equal(h.depth(), 1, 'the page entry survived: no dead second pop');
});

test('two stacked sheets: back closes only the top one, then the next', () => {
  core.resetModalHistoryForTests();
  const h = fakeWindow();
  const log = [];
  core.openModalEntry(h.win, () => () => log.push('A'));
  core.openModalEntry(h.win, () => () => log.push('B'));
  assert.equal(h.depth(), 2);
  h.userBack();
  assert.deepEqual(log, ['B']);
  assert.equal(h.depth(), 1);
  assert.equal(core.shouldRouterHandlePop(h.stack[0]), false, 'A is still open');
  h.userBack();
  assert.deepEqual(log, ['B', 'A']);
  assert.equal(h.depth(), 0);
});

test('X on the top sheet leaves the sheet under it open', () => {
  core.resetModalHistoryForTests();
  const h = fakeWindow();
  const log = [];
  const a = core.openModalEntry(h.win, () => () => log.push('A'));
  const b = core.openModalEntry(h.win, () => () => log.push('B'));
  core.closeModalEntry(h.win, b);
  h.flush();
  assert.deepEqual(log, [], 'neither onClose fired by the X');
  assert.equal(core.isModalEntryOpen(a), true);
  assert.equal(h.depth(), 1);
  core.closeModalEntry(h.win, a);
  h.flush();
  assert.equal(h.depth(), 0);
});

test('rapid close then reopen: the in-flight pop does not swallow the new entry', () => {
  core.resetModalHistoryForTests();
  const h = fakeWindow();
  let closes = 0;
  const a = core.openModalEntry(h.win, () => () => { closes += 1; });
  core.closeModalEntry(h.win, a); // back() queued, not yet delivered
  const b = core.openModalEntry(h.win, () => () => { closes += 1; });
  h.flush(); // the pop lands, then the queued push runs
  assert.equal(closes, 0);
  assert.equal(core.isModalEntryOpen(b), true);
  assert.equal(h.depth(), 1, 'exactly one modal entry on the stack');
  h.userBack();
  assert.equal(closes, 1);
  assert.equal(h.depth(), 0);
});

test('a page entry pushed above a modal (Next shallow push) does not close it on the way back', () => {
  core.resetModalHistoryForTests();
  const h = fakeWindow();
  let closes = 0;
  core.openModalEntry(h.win, () => () => { closes += 1; });
  h.win.history.pushState({ __N: true, page: 'view=chart' });
  assert.equal(core.shouldRouterHandlePop(h.stack[1]), true, 'landing on our own entry is not a close');
  h.userBack(); // lands on the modal entry
  assert.equal(closes, 0);
  h.userBack(); // now the modal closes
  assert.equal(closes, 1);
});

test('no history object: open and close are harmless no-ops', () => {
  core.resetModalHistoryForTests();
  const id = core.openModalEntry({}, () => () => {});
  core.closeModalEntry({}, id);
  assert.equal(core.openModalCount(), 0);
  assert.equal(core.shouldRouterHandlePop(null), true);
});
