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
 * with a stable @id and its own URL, so an engine can cite one definition
 * instead of the whole page, and the set points back at the WebSite and
 * Organization nodes so the glossary joins the entity graph rather than
 * floating beside it.
 *
 * AEO section 3.4 (2026-09-22) moved the reference to /glossary. The terms
 * now live in src/content/glossary/terms.js, /glossary is the index, each
 * term has its own page at /glossary/<slug>, and the study tool at
 * /hub/training/glossary reads the same module and canonicals to /glossary
 * (one page per real thing). The pins below were literal pins on the study
 * tool; they are now the same four invariants on whichever page is the
 * reference: real head tags, a set generated from the rendered terms, a
 * citable URL per term, and a sitemap that promotes the reference.
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
const TOOL = 'pages/hub/training/glossary.js';
const INDEX = 'pages/glossary/index.js';
const TERMS = 'src/content/glossary/terms.js';

function assertRealHead(src, file, canonical) {
  assert.match(src, /import SEOHead from '[^']+seo\/SEOHead'/, `${file} uses the shared SEO head`);
  assert.doesNotMatch(src, /<Head>/, `${file} has no bare next/head block`);
  assert.match(src, new RegExp(`canonical="${canonical.replace(/\//g, '\\/')}"`), `${file} declares canonical ${canonical}`);
  const title = src.match(/title="([^"]+)"/)?.[1];
  assert.ok(title, `${file} declares a title`);
  // What ships, not what the source says: SEOHead appends " | Smarter.Poker".
  // This measured the raw string and let a 65 character title through.
  const shipped = title.includes('Smarter.Poker') ? title : `${title} | Smarter.Poker`;
  assert.ok(shipped.length <= 60, `a ${shipped.length} character title is cut off in a search result: ${shipped}`);
  const description = src.match(/description="([^"]+)"/)?.[1];
  assert.ok(description && description.length >= 80, `${file} declares a description worth reading`);
}

test('the glossary ships a real head, not a bare title', () => {
  assertRealHead(read(INDEX), INDEX, '/glossary');
  // The study tool shows the same definitions, so it names the reference as
  // its canonical instead of competing with it.
  assertRealHead(read(TOOL), TOOL, '/glossary');
});

test('every term the page renders is a term the schema defines', () => {
  const terms = [...read(TERMS).matchAll(/^ {4}term: '((?:[^'\\]|\\.)*)',$/gm)].map((m) => m[1]);
  assert.ok(terms.length >= 40, `${terms.length} terms is too thin a glossary to cite`);

  // One list: both pages render the module, and the set is generated from it,
  // so the schema cannot drift from what renders.
  for (const file of [INDEX, TOOL]) {
    assert.match(read(file), /GLOSSARY_TERMS[\s\S]{0,200}from '[./]+src\/content\/glossary\/terms'/, `${file} renders the module`);
  }
  assert.doesNotMatch(read(TOOL), /^ {4}term: '/m, 'the study tool keeps no private copy of the terms');
  const index = read(INDEX);
  assert.match(index, /hasDefinedTerm: GLOSSARY_TERMS\.map\(/, 'the term list is generated, never hand maintained');
  assert.match(index, /'@type':\s*'DefinedTermSet'/, 'the set declares its type');
  assert.match(index, /'@type':\s*'DefinedTerm'/, 'each entry declares its type');
  assert.match(index, /inDefinedTermSet:/, 'each term points back at its set');
});

test('the set joins the entity graph instead of floating beside it', () => {
  const src = read(INDEX);
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

test('each term has a URL to be cited at, and the sitemap points at the reference', () => {
  const index = read(INDEX);
  // Each DefinedTerm's url is the term's own page, not an anchor on a list.
  assert.match(index, /url: `https:\/\/smarter\.poker\$\{glossaryTermPath\(t\.slug\)\}`/, 'the DefinedTerm url is the term page');
  assert.match(read(TERMS), /return `\/glossary\/\$\{slug\}`;/, 'one URL shape, in the module');

  const tool = read(TOOL);
  assert.match(tool, /id=\{`term-\$\{t\.slug\}`\}/, 'the study tool card still carries a stable anchor');
  // A term name is a heading, so an engine reads the page as a list of
  // definitions rather than a wall of styled spans.
  assert.match(tool, /<h2[^>]*>\s*\{t\.term\}\s*<\/h2>/, 'the term name is a heading');

  const sitemap = read('pages/sitemap.xml.js');
  assert.match(sitemap, /path: '\/glossary'/, 'the sitemap lists the glossary');
  assert.doesNotMatch(sitemap, /path: '\/hub\/training\/glossary'/, 'and not the study tool that canonicals to it');
});
