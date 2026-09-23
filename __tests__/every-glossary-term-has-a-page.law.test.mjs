/**
 * EVERY GLOSSARY TERM HAS A PAGE (AEO section 3.4, 2026-09-22).
 *
 * Before this law the site defined 50 GTO terms in one-line fragments on a
 * single interactive page (/hub/training/glossary), with no URL per term and
 * no definition at all for the club poker and live room vocabulary the site
 * is built around: union, agent, settlement, waitlist, must-move table.
 * A "what is X" prompt retrieves from a page whose URL, title, h1 and first
 * paragraph all answer X, so a definition with no page of its own is a
 * definition an engine cannot cite.
 *
 * Now src/content/glossary/terms.js is the one source of truth, /glossary is
 * the index and /glossary/<slug> is one static page per term. This pins what
 * makes that hold:
 *   - the module: 60 to 80 terms, unique URL-safe slugs, 40 to 80 word
 *     answer-first Title Case definitions, related slugs that resolve, and
 *     the play-credit statement wherever the platform is named
 *   - the pages: both render from the module, server side, with the schema
 *   - the sitemap: offers /glossary and every term page from the same module,
 *     and no longer offers the study tool that now canonicals to /glossary
 *
 * Reads source files and imports plain JS modules; runs in the Build Safety
 * Gate with no install.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GLOSSARY_TERMS,
  GLOSSARY_CATEGORIES,
  CATEGORY_PRODUCTS,
  getGlossaryTerm,
  glossaryTermPath,
} from '../src/content/glossary/terms.js';
import { fitsInAResult } from '../src/lib/seo/titleFit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const words = (text) => String(text).trim().split(/\s+/).filter(Boolean).length;
const INDEX = 'pages/glossary/index.js';
const TERM_PAGE = 'pages/glossary/[term].js';
const TOOL = 'pages/hub/training/glossary.js';

test('the glossary holds 60 to 80 terms, each with a unique, URL-safe slug', () => {
  const n = GLOSSARY_TERMS.length;
  assert.ok(n >= 60 && n <= 80, `${n} terms; the programme calls for 60 to 80`);
  const slugs = GLOSSARY_TERMS.map((t) => t.slug);
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  assert.deepEqual(dupes, [], `duplicate slugs: ${dupes.join(', ')}`);
  for (const t of GLOSSARY_TERMS) {
    assert.match(t.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `"${t.slug}" is not a clean URL slug`);
    assert.ok(t.term && t.term.trim() === t.term, `${t.slug} has a term name`);
    assert.ok(GLOSSARY_CATEGORIES.includes(t.category), `${t.slug} is in an unknown category "${t.category}"`);
    assert.equal(getGlossaryTerm(t.slug), t, `${t.slug} resolves to itself`);
    assert.equal(glossaryTermPath(t.slug), `/glossary/${t.slug}`, 'one URL shape');
  }
  for (const category of GLOSSARY_CATEGORIES) {
    assert.ok(GLOSSARY_TERMS.some((t) => t.category === category), `${category} has no terms`);
    assert.ok((CATEGORY_PRODUCTS[category] || []).length > 0, `${category} links no product`);
  }
});

test('the programme vocabulary is all defined', () => {
  for (const slug of [
    'poker-union', 'club-agent', 'rakeback', 'club-chips-versus-diamonds', 'settlement', 'club-id',
    'gps-and-ip-restriction', 'insurance', 'run-it-twice', 'straddle', 'bomb-pot', 'waitlist',
    'must-move-table', 'table-balancing', 'chip-up', 'comp', 'high-hand-promotion', 'bad-beat-jackpot',
  ]) {
    assert.ok(getGlossaryTerm(slug), `no entry for ${slug}`);
  }
});

test('every definition is 40 to 80 words, answer first, Title Case and clean', () => {
  const offenders = [];
  for (const t of GLOSSARY_TERMS) {
    const d = t.definition;
    const n = words(d);
    if (n < 40 || n > 80) offenders.push(`${t.slug}: ${n} words`);
    // Answer first: the term is the subject of the opening words, so the
    // first sentence is the answer and not a run-up to it.
    const opening = d.split(/\s+/).slice(0, 8).join(' ').toLowerCase();
    const head = t.term.replace(/\s*\(.*\)$/, '').split(/\s+/)[0].toLowerCase();
    if (!opening.includes(head)) offenders.push(`${t.slug}: the definition does not open with the term`);
    // House rule: every word capitalised (a letter straight after a digit is a suffix: 3-Bet, 5-Bet).
    const lower = d.match(/(^|[^A-Za-z0-9'’])[a-z][A-Za-z]*/g);
    if (lower) offenders.push(`${t.slug}: not Title Case at ${lower.slice(0, 3).join(',')}`);
    if (/—/.test(d)) offenders.push(`${t.slug}: em dash`);
    if (/&/.test(d)) offenders.push(`${t.slug}: ampersand`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('every related term resolves, and no term links only to itself', () => {
  const broken = [];
  for (const t of GLOSSARY_TERMS) {
    assert.ok(Array.isArray(t.related) && t.related.length >= 2, `${t.slug} links fewer than 2 related terms`);
    for (const slug of t.related) {
      if (slug === t.slug) broken.push(`${t.slug} relates to itself`);
      else if (!getGlossaryTerm(slug)) broken.push(`${t.slug} -> ${slug}`);
    }
  }
  assert.deepEqual(broken, [], broken.join('\n'));
});

test('a definition that names the platform also states it is play credit only', () => {
  const money = ['poker-union', 'club-agent', 'rakeback', 'club-chips-versus-diamonds', 'settlement'];
  for (const t of GLOSSARY_TERMS) {
    const names = /Smarter\.Poker/.test(t.definition);
    if (money.includes(t.slug)) assert.ok(names, `${t.slug} must say where Smarter.Poker stands`);
    if (names) {
      assert.match(
        t.definition,
        /No Cash Value|No Real-Money Gambling/,
        `${t.slug} names Smarter.Poker without saying chips have no cash value`,
      );
    }
  }
  const chips = getGlossaryTerm('club-chips-versus-diamonds').definition;
  assert.match(chips, /Diamonds Are A Promotional Rewards Currency/);
  assert.match(chips, /Club Chips Are Play Credits/);
});

test('every term title fits a search result whole', () => {
  // The page asks firstThatFits for "What Is X In Poker? ..." first and falls
  // back to the bare term; the bare term must fit so nothing is ever cut.
  for (const t of GLOSSARY_TERMS) {
    assert.ok(fitsInAResult(t.term), `"${t.term}" does not fit a result even alone`);
  }
});

test('the term page is generated from the module and renders the answer first', () => {
  const src = read(TERM_PAGE);
  assert.match(src, /from '\.\.\/\.\.\/src\/content\/glossary\/terms'/, 'it reads the module');
  assert.match(src, /paths: GLOSSARY_TERMS\.map\(/, 'one path per term, generated');
  assert.match(src, /fallback: false/, 'an unknown slug is a real 404');
  assert.match(src, /export async function getStaticProps/, 'statically generated');
  assert.match(
    src,
    /<h1[^>]*>\{term\.term\}<\/h1>\s*<p[^>]*>\{term\.definition\}<\/p>/,
    'the h1 is the term and the definition is the first paragraph under it',
  );
  assert.match(src, /<Link href=\{glossaryTermPath\(r\.slug\)\}/, 'related terms are real links');
  assert.match(src, /<Link href=\{GLOSSARY_PATH\}/, 'it links back to the index');
  assert.match(src, /'@type': 'DefinedTerm'/);
  assert.match(src, /inDefinedTermSet:/);
  assert.match(src, /'@type': 'BreadcrumbList'/);
  assert.match(src, /firstThatFits\(/, 'the title is fitted by the shared helper');
  assert.match(src, /canonical=\{path\}/, 'each term page is its own canonical');
  assert.doesNotMatch(src, /ssr:\s*false|router\.isReady|useEffect/, 'nothing waits for the client');
});

test('the index lists every term as a server-rendered link and ships the set', () => {
  const src = read(INDEX);
  assert.match(src, /from '\.\.\/\.\.\/src\/content\/glossary\/terms'/, 'it reads the module');
  assert.match(src, /glossaryByCategory\(\)/, 'grouped by category');
  assert.match(src, /<Link href=\{glossaryTermPath\(t\.slug\)\}/, 'every term is a real link');
  assert.match(src, /hasDefinedTerm: GLOSSARY_TERMS\.map\(/, 'the set is generated, never hand maintained');
  assert.match(src, /'@type': 'DefinedTermSet'/);
  assert.match(src, /canonical="\/glossary"/);
  assert.doesNotMatch(src, /ssr:\s*false|router\.isReady|useEffect/, 'nothing waits for the client');
  // The categories the index groups by are exactly the module's.
  const grouped = new Set(GLOSSARY_TERMS.map((t) => t.category));
  assert.deepEqual([...grouped].sort(), [...GLOSSARY_CATEGORIES].sort());
});

test('the study tool reads the same module and defers to /glossary', () => {
  const src = read(TOOL);
  assert.match(src, /GLOSSARY_TERMS[^\n]*from '\.\.\/\.\.\/\.\.\/src\/content\/glossary\/terms'/, 'it reads the module');
  assert.doesNotMatch(src, /^\s+def:\s*['"]/m, 'no second copy of any definition');
  assert.match(src, /canonical="\/glossary"/, 'one page per real thing: it canonicals to the reference');
  assert.match(src, /href=\{glossaryTermPath\(t\.slug\)\}/, 'each card links to its term page');
});

test('the sitemap offers the index and every term page, from the module', () => {
  const src = read('pages/sitemap.xml.js');
  assert.match(src, /import \{[^}]*GLOSSARY_TERMS[^}]*\} from '\.\.\/src\/content\/glossary\/terms'/);
  assert.match(src, /\{ path: '\/glossary', /, 'the index is listed');
  assert.match(src, /GLOSSARY_TERMS\.map\(\(t\) => \(\{ path: glossaryTermPath\(t\.slug\)/, 'every term page is listed');
  assert.match(src, /\.\.\.glossaryPages,/, 'and the list reaches the XML');
  assert.doesNotMatch(src, /path: '\/hub\/training\/glossary'/, 'the study tool canonicals away and is not offered');
  assert.ok(fs.existsSync(path.join(ROOT, TERM_PAGE)), 'the term route exists');
  assert.ok(fs.existsSync(path.join(ROOT, INDEX)), 'the index route exists');
});
