import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { hasHubGraphics } from '../src/world/hubGraphics.js';

test('unavailable or refused graphics chooses navigation without throwing', () => {
    for (const getContext of [() => null, () => { throw new Error('GPU unavailable'); }]) {
        assert.equal(hasHubGraphics(() => ({ getContext })), false);
    }
});

test('supported graphics releases the probe and admits the existing carousel', () => {
    for (const supported of ['webgl2', 'webgl']) {
        let released = 0;
        assert.equal(hasHubGraphics(() => ({ getContext: name => name === supported ? {
            getExtension: () => ({ loseContext() { released++; } }),
        } : null })), true);
        assert.equal(released, 1);
    }
});

test('navigation renders only the supplied visible cards and uses their real action', () => {
    const file = new URL('../src/world/HubCardNavigation.jsx', import.meta.url);
    const source = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(source, { module, exports: module.exports, require: createRequire(file) });
    const selected = [];
    const tree = module.exports.HubCardNavigation({
        orbs: [{ id: 'club-arena', label: 'Poker Arena', imageUrl: '/cards/poker-arena.webp' }],
        onOrbSelect: id => selected.push(id),
    });
    assert.equal(tree.type, 'nav');
    assert.equal(tree.props.children.length, 1);
    const card = tree.props.children[0];
    assert.equal(card.type, 'button');
    assert.equal(card.props['aria-label'], 'Poker Arena');
    card.props.onClick();
    assert.deepEqual(selected, ['club-arena']);
    const hub = readFileSync(new URL('../src/world/WorldHub.tsx', import.meta.url), 'utf8');
    assert.match(hub, /graphicsAvailable \? <Canvas/);
    assert.match(hub, /fallback={<HubCardNavigation orbs={carouselOrbs} onOrbSelect={handleOrbSelect}/);
});
