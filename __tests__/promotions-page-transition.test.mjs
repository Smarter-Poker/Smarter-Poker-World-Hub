import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'pages/hub/promotions.js'), 'utf8');

test('promotions imports and closes the PageTransition wrapper it renders', () => {
    assert.match(source, /import PageTransition from '\.\.\/\.\.\/src\/components\/transitions\/PageTransition'/);
    assert.equal((source.match(/<PageTransition>/g) || []).length, 1);
    assert.equal((source.match(/<\/PageTransition>/g) || []).length, 1);
});
