/**
 * INLINE CSS IS NEVER ESCAPED (2026-09-22).
 *
 * Dozens of components wrote their CSS as a React text child:
 *
 *     <style>{`.x { font-family: 'Inter'; background: url("data:...") }`}</style>
 *
 * React escapes a text child when it renders on the server, so a quote
 * becomes &#x27; or &quot;, and ">" becomes &gt;. But the HTML parser reads
 * the inside of a <style> element as raw text and never decodes entities,
 * so the browser was handed CSS that literally said
 * font-family: &#x27;Inter&#x27; and url(&quot;data:image/svg+xml...&quot;).
 * Those declarations are invalid and dropped on first paint (wrong fonts on
 * /terms, /hub/poker-series, every /hub/venues/<id> page, /hub/news), child
 * selectors written with ">" never match, and the url() ones made browsers
 * request junk paths like /hub/&quot;data:image/svg+xml... that showed up as
 * 404s in the production logs.
 *
 * The cure is to hand React the CSS as raw HTML, which it does not escape:
 *
 *     <style dangerouslySetInnerHTML={{ __html: `...css...` }} />
 *
 * styled-jsx (<style jsx>) compiles its CSS away and is not affected.
 *
 * This law scans pages/ and src/ for any <style> that is not styled-jsx and
 * whose child is a template literal, a string literal, or a same-file
 * constant holding CSS with a character React would escape (' " < > &).
 * Reads source files only; no network, no database.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ESCAPED_BY_REACT = /["'<>&]/;

function sourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(jsx?|tsx?|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Reads a template literal starting at src[i] === '`'; returns its static text and end. */
function readTemplate(src, i) {
  let text = '';
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === '\\') { text += src.slice(j, j + 2); j += 2; continue; }
    if (ch === '`') return { text, end: j + 1 };
    if (ch === '$' && src[j + 1] === '{') {
      // Skip the interpolation: it is JavaScript, not CSS text.
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        if (src[j] === '`') { j = readTemplate(src, j).end; continue; }
        if (src[j] === '{') depth++;
        else if (src[j] === '}') depth--;
        j++;
      }
      continue;
    }
    text += ch;
    j++;
  }
  return { text, end: j };
}

/** The static CSS text a <style>{...}</style> child would render, or null if unknown. */
function childText(src, start) {
  let i = start;
  while (/\s/.test(src[i] || '')) i++;
  if (src[i] === '`') return readTemplate(src, i).text;
  if (src[i] === "'" || src[i] === '"') {
    const q = src[i];
    const end = src.indexOf(q, i + 1);
    return end > i ? src.slice(i + 1, end) : null;
  }
  const id = /^([A-Za-z_$][\w$]*)\s*\}/.exec(src.slice(i));
  if (id) {
    const decl = new RegExp(`(?:const|let|var)\\s+${id[1]}\\s*=\\s*\``).exec(src);
    if (decl) return readTemplate(src, decl.index + decl[0].length - 1).text;
  }
  return null;
}

export function escapedInlineStyles(src) {
  const found = [];
  const open = /<\s*style\b([^>]*)>\s*\{/g;
  let m;
  while ((m = open.exec(src))) {
    const attrs = m[1];
    if (/\bjsx\b/.test(attrs) || /dangerouslySetInnerHTML/.test(attrs)) continue;
    const text = childText(src, m.index + m[0].length);
    if (text !== null && ESCAPED_BY_REACT.test(text)) {
      found.push(src.slice(0, m.index).split('\n').length);
    }
  }
  return found;
}

test('the scanner catches the shapes that broke production and spares the fix', () => {
  assert.deepEqual(escapedInlineStyles("<style>{`body{font-family:'Inter'}`}</style>"), [1]);
  assert.deepEqual(escapedInlineStyles('<style suppressHydrationWarning>{`a{background:url("x")}`}</style>'), [1]);
  assert.deepEqual(escapedInlineStyles('< style > {`\n.a > .b { color: red }`}</style >'), [1]);
  assert.deepEqual(escapedInlineStyles('const css = `a{font-family:"X"}`;\n<style>{css}</style>'), [2]);
  // Quotes inside an interpolation are JavaScript, not CSS.
  assert.deepEqual(escapedInlineStyles("<style>{`a{color:${ok ? 'red' : 'blue'}}`}</style>"), []);
  assert.deepEqual(escapedInlineStyles("<style jsx>{`a{font-family:'Inter'}`}</style>"), []);
  assert.deepEqual(escapedInlineStyles("<style jsx global>{`a{font-family:'Inter'}`}</style>"), []);
  assert.deepEqual(escapedInlineStyles("<style dangerouslySetInnerHTML={{ __html: `a{font-family:'Inter'}` }} />"), []);
  assert.deepEqual(escapedInlineStyles('<style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>'), []);
});

test('no <style> in pages/ or src/ hands React CSS it would escape', () => {
  const offenders = [];
  for (const file of [...sourceFiles(path.join(ROOT, 'pages')), ...sourceFiles(path.join(ROOT, 'src'))]) {
    const src = fs.readFileSync(file, 'utf8');
    if (!src.includes('style')) continue;
    for (const line of escapedInlineStyles(src)) offenders.push(`${path.relative(ROOT, file)}:${line}`);
  }
  assert.deepEqual(
    offenders,
    [],
    'These <style> elements pass CSS as a React text child, so quotes and ">" are served as ' +
      'HTML entities inside the stylesheet and the declarations are dropped. Use ' +
      '<style dangerouslySetInnerHTML={{ __html: `...` }} /> instead:\n  ' +
      offenders.join('\n  '),
  );
});
