/**
 * THE ENTITY GRAPH IS CONNECTED (AEO phase 2, 2026-09-17).
 *
 * The home page emitted three schema.org nodes - Organization, WebSite,
 * SoftwareApplication - inside one @graph, and not one of them referred to
 * another. A @graph is only a graph if its nodes point at each other by @id;
 * without that they are three unrelated statements that happen to share a
 * page, and an engine has to guess that the site, the company and the app are
 * the same business. Guessing is the thing this programme is trying to stop.
 *
 * This pins the edges, not the prose: every node has an @id, the site and the
 * app both name the Organization as publisher, and the app's description is
 * the same definition the landing page gives, because an AI engine repeats
 * the definition it meets most often.
 *
 * Reads source files; runs in the Build Safety Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SEO = 'vendor/commander-shared/src/components/seo/SEOHead.js';

const ORG_ID = 'https://smarter.poker/#organization';

test('every node in the graph has an @id', () => {
  const src = read(SEO);
  for (const [node, id] of [
    ['organization', ORG_ID],
    ['website', 'https://smarter.poker/#website'],
    ['softwareApp', 'https://smarter.poker/#app'],
  ]) {
    const block = src.slice(src.indexOf(`    ${node}: {`), src.indexOf('\n    },', src.indexOf(`    ${node}: {`)));
    assert.ok(block, `schemas.${node} exists`);
    assert.ok(block.includes(`'@id': '${id}'`), `schemas.${node} declares @id ${id}`);
  }
});

test('the site and the app both name the organization as their publisher', () => {
  const src = read(SEO);
  for (const node of ['website', 'softwareApp']) {
    const start = src.indexOf(`    ${node}: {`);
    const block = src.slice(start, src.indexOf('\n    },', start));
    assert.match(
      block,
      new RegExp(`publisher: \\{ '@id': '${ORG_ID.replace(/[/#.]/g, '\\$&')}' \\}`),
      `schemas.${node} points at the organization`,
    );
  }
});

test('the app repeats the definition the landing page gives', () => {
  const src = read(SEO);
  const landing = read('pages/index.js');
  const appDescription = src.match(/'(Smarter\.Poker Is A Free Online Poker Platform[^']+)'/)?.[1];
  assert.ok(appDescription, 'the app node carries the platform definition');
  assert.ok(
    landing.includes(appDescription),
    'the app description is word for word the one the home page ships',
  );
});
