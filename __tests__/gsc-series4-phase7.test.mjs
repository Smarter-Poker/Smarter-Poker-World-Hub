import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

test('pages/_app.js configures display: swap and adjustFontFallback: true on all 7 next/font/google declarations', () => {
  const src = fs.readFileSync(path.join(ROOT, 'pages/_app.js'), 'utf8');
  const fonts = [
    'Orbitron',
    'Inter',
    'Plus_Jakarta_Sans',
    'Space_Grotesk',
    'Rajdhani',
    'Roboto_Condensed',
    'IBM_Plex_Mono',
  ];

  for (const fontName of fonts) {
    const match = src.match(new RegExp(`${fontName}\\(\\{([\\s\\S]*?)\\}\\);`));
    assert.ok(match, `${fontName} declaration must exist in pages/_app.js`);
    const body = match[1];
    assert.match(body, /display:\s*'swap'/, `${fontName} must set display: 'swap'`);
    assert.match(
      body,
      /adjustFontFallback:\s*true/,
      `${fontName} must set adjustFontFallback: true to prevent hydration CLS`
    );
  }
});

test('SEOHead emits explicit og:image:width (1200) and og:image:height (630) dimensions for zero-CLS social cards', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'vendor/commander-shared/src/components/seo/SEOHead.js'),
    'utf8'
  );
  assert.match(src, /property="og:image:width"\s+content="1200"/);
  assert.match(src, /property="og:image:height"\s+content="630"/);
});
