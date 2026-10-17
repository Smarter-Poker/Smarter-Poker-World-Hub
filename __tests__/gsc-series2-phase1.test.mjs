import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ai.txt exists and specifies machine-readable crawler protocols', () => {
  const aiTxtPath = path.resolve(process.cwd(), 'public/ai.txt');
  assert.ok(fs.existsSync(aiTxtPath), 'public/ai.txt must exist');

  const content = fs.readFileSync(aiTxtPath, 'utf8');
  assert.match(content, /User-Agent:\s*\*/i, 'ai.txt must have User-Agent: * block');
  assert.match(content, /Model-Context-Protocol:\s*https:\/\/smarter\.poker\/api\/mcp/i, 'ai.txt must declare MCP endpoint');
  assert.match(content, /LLM-Documentation:\s*https:\/\/smarter\.poker\/llms\.txt/i, 'ai.txt must declare llms.txt');
  assert.match(content, /Full-Corpus:\s*https:\/\/smarter\.poker\/llms-full\.txt/i, 'ai.txt must declare llms-full.txt');
  assert.match(content, /OpenAPI-Specification:\s*https:\/\/smarter\.poker\/api\/openapi\.json/i, 'ai.txt must declare OpenAPI endpoint');
  assert.match(content, /Disallow:\s*\/api\/poker\/engine\//i, 'ai.txt must protect private engine APIs');
});

test('robots.txt lists all sitemaps including sitemap-videos.xml and index sitemaps', () => {
  const robotsPath = path.resolve(process.cwd(), 'public/robots.txt');
  assert.ok(fs.existsSync(robotsPath), 'public/robots.txt must exist');

  const content = fs.readFileSync(robotsPath, 'utf8');
  assert.match(content, /Sitemap:\s*https:\/\/smarter\.poker\/sitemap\.xml/i);
  assert.match(content, /Sitemap:\s*https:\/\/smarter\.poker\/sitemap-videos\.xml/i);
  assert.match(content, /Sitemap:\s*https:\/\/smarter\.poker\/sitemap-venues\.xml/i);
  assert.match(content, /Sitemap:\s*https:\/\/smarter\.poker\/sitemap-series\.xml/i);
});

test('diamond store structured data outputs valid Product and Offer schemas for diamond packages', async () => {
  // Read diamond-store.js to verify structured data includes Product OfferCatalog
  const diamondStorePath = path.resolve(process.cwd(), 'pages/hub/diamond-store.js');
  const code = fs.readFileSync(diamondStorePath, 'utf8');
  assert.ok(code.includes("activeTab === 'diamonds'"), 'Must handle diamonds tab schema');
  assert.ok(code.includes("'@type': 'Product'"), 'Must define Product Schema');
  assert.ok(code.includes("'@type': 'Offer'"), 'Must define Offer Schema');
  assert.ok(code.includes('DIAMOND_STOREFRONT_FALLBACK_PACKAGES'), 'Must reference fallback packages');

  const catalogModule = await import('../src/lib/store/diamondStorefrontCatalog.mjs');
  const pkgs = catalogModule.DIAMOND_STOREFRONT_FALLBACK_PACKAGES;
  assert.ok(Array.isArray(pkgs) && pkgs.length >= 8, 'Must have at least 8 diamond packages');

  pkgs.forEach((pkg) => {
    assert.ok(pkg.id, 'Package must have id');
    assert.ok(pkg.name, 'Package must have name');
    assert.ok(typeof pkg.priceCents === 'number' && pkg.priceCents > 0, 'Package must have valid priceCents');
    assert.ok(typeof pkg.diamonds === 'number' && pkg.diamonds > 0, 'Package must have valid diamonds count');
  });
});
