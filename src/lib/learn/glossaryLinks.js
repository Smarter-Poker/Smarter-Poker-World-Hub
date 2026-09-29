/**
 * WHICH GLOSSARY TERMS A LESSON CAN LINK TO (AEO section 3.7, 2026-09-22).
 *
 * Each lesson names the glossary terms it uses, by slug. A link is only
 * worth printing if the term has a page, and the one place that decides
 * that is the glossary module, src/content/glossary/terms.js, which
 * generates /glossary/<slug> with fallback false.
 *
 * This reads that module's slugs and display names at build time, from
 * getStaticProps, so a lesson links a term exactly when its page exists:
 * no dangling link to a term the glossary does not define, and no second
 * copy of the glossary here to drift. When the glossary module is absent
 * the result is empty and the lesson prints no glossary links at all.
 *
 * __tests__/every-lesson-answers-first.law.test.mjs requires every slug a
 * lesson names to resolve here whenever the glossary module exists.
 *
 * Server only (node:fs). Plain JavaScript, so a law can run it under node.
 */
import fs from 'node:fs';
import path from 'node:path';

export const GLOSSARY_MODULE = 'src/content/glossary/terms.js';
export const GLOSSARY_PAGE = 'pages/glossary/[term].js';

const unescape = (s) => s.replace(/\\(.)/g, '$1');

/** slug -> display name for every term that has a page, or an empty map. */
export function readGlossaryTerms(root = process.cwd()) {
  const terms = new Map();
  const moduleFile = path.join(root, GLOSSARY_MODULE);
  if (!fs.existsSync(moduleFile) || !fs.existsSync(path.join(root, GLOSSARY_PAGE))) return terms;
  const src = fs.readFileSync(moduleFile, 'utf8');
  const entry = /slug:\s*'([^']+)',\s*term:\s*'((?:[^'\\]|\\.)*)'/g;
  for (const m of src.matchAll(entry)) terms.set(m[1], unescape(m[2]));
  return terms;
}

/** The lesson's glossary slugs that resolve, as { slug, term }, in order. */
export function glossaryLinksFor(slugs, terms) {
  return (slugs || []).filter((s) => terms.has(s)).map((s) => ({ slug: s, term: terms.get(s) }));
}
