/**
 * THE GLOSSARY IS READABLE BY AN ENGINE (AEO phase 3, 2026-09-17).
 *
 * /hub/training/glossary already server-rendered all 49 definitions, 866
 * words of prose a crawler running no JavaScript can read, and it was
 * invisible anyway: absent from the sitemap, carrying a bare <title> and
 * not one line of structured data. Measured on production before this
 * law: 0 ld+json blocks, 0 sitemap mentions.
 *
 * A definitional question is the question an AI engine answers most
 * often, which makes a glossary the most quotable thing a site owns. The
 * schema built for it is DefinedTermSet: every term becomes a DefinedTerm
 * with a stable @id and its own anchor URL, so an engine can cite one
 * definition instead of the whole page, and the set points back at the
 * WebSite and Organization nodes so the glossary joins the entity graph
 * rather than floating beside it.
 *
 * This pins the four things that make that work: the page ships real head
 * tags, the set is built from the same TERMS array the page renders, each
 * term has an anchor to be cited at, and the sitemap promotes it.
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
const GLOSSARY = 'pages/hub/training/glossary.js';

test('the glossary ships a real head, not a bare title', () => {
  const src = read(GLOSSARY);
  assert.match(src, /import SEOHead from '[^']+seo\/SEOHead'/, 'it uses the shared SEO head');
  assert.doesNotMatch(src, /<Head>/, 'the bare next/head block is gone');
  assert.match(src, /canonical="\/hub\/training\/glossary"/, 'it declares its canonical');
  const title = src.match(/title="([^"]+)"/)?.[1];
  assert.ok(title, 'it declares a title');
  // What ships, not what the source says: SEOHead appends " | Smarter.Poker".
  // This measured the raw string and let a 65 character title through.
  const shipped = title.includes('Smarter.Poker') ? title : `${title} | Smarter.Poker`;
  assert.ok(shipped.length <= 60, `a ${shipped.length} character title is cut off in a search result: ${shipped}`);
  const description = src.match(/description="([^"]+)"/)?.[1];
  assert.ok(description && description.length >= 80, 'it declares a description worth reading');
});

test('every term the page renders is a term the schema defines', () => {
  const src = read(GLOSSARY);
  const terms = [...src.matchAll(/^ {4}term: '((?:[^'\\]|\\.)*)',$/gm)].map((m) => m[1]);
  assert.ok(terms.length >= 40, `${terms.length} terms is too thin a glossary to cite`);

  // The set is generated from TERMS, so it cannot drift from what renders.
  assert.match(src, /hasDefinedTerm: TERMS\.map\(/, 'the term list is generated, never hand maintained');
  assert.match(src, /'@type':\s*'DefinedTermSet'/, 'the set declares its type');
  assert.match(src, /'@type':\s*'DefinedTerm'/, 'each entry declares its type');
  assert.match(src, /inDefinedTermSet:/, 'each term points back at its set');
});

test('the set joins the entity graph instead of floating beside it', () => {
  const src = read(GLOSSARY);
  assert.match(
    src,
    /isPartOf:\s*\{\s*'@id':\s*'https:\/\/smarter\.poker\/#website'\s*\}/,
    'the set is part of the WebSite node',
  );
  assert.match(
    src,
    /publisher:\s*\{\s*'@id':\s*'https:\/\/smarter\.poker\/#organization'\s*\}/,
    'the Organization publishes it',
  );
  // The ids it references have to be the ids SEOHead actually publishes.
  const head = read('vendor/commander-shared/src/components/seo/SEOHead.js');
  for (const id of ['https://smarter.poker/#website', 'https://smarter.poker/#organization']) {
    assert.ok(head.includes(`'${id}'`), `SEOHead publishes ${id}`);
  }
});

test('each term has an anchor to be cited at, and the sitemap points at the page', () => {
  const src = read(GLOSSARY);
  assert.match(src, /const termSlug =/, 'one slug function, module local, used by both the schema and the markup');
  assert.match(src, /id=\{`term-\$\{termSlug\(t\.term\)\}`\}/, 'the rendered card carries the anchor');
  assert.match(src, /#term-\$\{termSlug\(t\.term\)\}/, 'the DefinedTerm url is that same anchor');
  // A term name is a heading, so an engine reads the page as a list of
  // definitions rather than a wall of styled spans.
  assert.match(src, /<h2[^>]*>\s*\{t\.term\}\s*<\/h2>/, 'the term name is a heading');

  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /path: '\/hub\/training\/glossary'/, 'the sitemap lists the glossary');
});
