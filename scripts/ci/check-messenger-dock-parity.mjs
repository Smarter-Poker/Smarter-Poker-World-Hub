// Explicit local cross-consumer comparison; never reads credentials or mutates consumers.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
const peer = process.argv[2];
assert.ok(peer, 'Pass the explicitly owned Club Arena checkout');
const own = resolve('src/components/messenger/dock');
const other = resolve(peer, 'src/components/messenger/dock');
const files = readdirSync(own).filter(file => /\.(?:jsx|mjs|css)$/.test(file));
for (const file of files) assert.equal(readFileSync(join(own,file),'utf8'),readFileSync(join(other,file),'utf8'),`Messenger dock consumer drift: ${file}`);
console.log(`Messenger dock parity passed: ${files.length} portable sources`);
