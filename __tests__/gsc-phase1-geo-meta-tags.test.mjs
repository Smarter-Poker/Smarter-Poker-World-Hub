import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('SEOHead component supports geo meta tags (geo.region, geo.placename, geo.position, ICBM)', () => {
  const seoHeadPath = path.join(rootDir, 'src/components/seo/SEOHead.js');
  const content = fs.readFileSync(seoHeadPath, 'utf8');

  assert.match(content, /geoRegion/, 'SEOHead must destructure or reference geoRegion prop');
  assert.match(content, /geo\.region/, 'SEOHead must emit meta name="geo.region"');
  assert.match(content, /geoPlacename/, 'SEOHead must destructure or reference geoPlacename prop');
  assert.match(content, /geo\.placename/, 'SEOHead must emit meta name="geo.placename"');
  assert.match(content, /geoPosition/, 'SEOHead must destructure or reference geoPosition prop');
  assert.match(content, /geo\.position/, 'SEOHead must emit meta name="geo.position"');
  assert.match(content, /ICBM/, 'SEOHead must emit meta name="ICBM"');
});

test('pages/hub/venues/[id].js computes and passes geo meta tags to SEOHead', () => {
  const venueDetailPath = path.join(rootDir, 'pages/hub/venues/[id].js');
  const content = fs.readFileSync(venueDetailPath, 'utf8');

  assert.match(content, /geoRegion:\s*venue\.state/, 'buildVenueSeo must compute geoRegion from venue.state');
  assert.match(content, /geoPlacename:/, 'buildVenueSeo must compute geoPlacename from venue city and state');
  assert.match(content, /geoPosition:/, 'buildVenueSeo must compute geoPosition from latitude and longitude');
  assert.match(content, /geoRegion=\{seo\.geoRegion\}/, 'SEOHead must receive geoRegion prop');
  assert.match(content, /geoPlacename=\{seo\.geoPlacename\}/, 'SEOHead must receive geoPlacename prop');
  assert.match(content, /geoPosition=\{seo\.geoPosition\}/, 'SEOHead must receive geoPosition prop');
});

test('pages/hub/series/[id].js computes and passes geo meta tags to SEOHead', () => {
  const seriesDetailPath = path.join(rootDir, 'pages/hub/series/[id].js');
  const content = fs.readFileSync(seriesDetailPath, 'utf8');

  assert.match(content, /geoRegion\s*=\s*series\.state/, 'Series detail must compute geoRegion from series.state');
  assert.match(content, /geoPlacename\s*=\s*\[series\.city,\s*series\.state\]/, 'Series detail must compute geoPlacename');
  assert.match(content, /geoRegion=\{geoRegion\}/, 'SEOHead must receive geoRegion prop in series detail');
  assert.match(content, /geoPlacename=\{geoPlacename\}/, 'SEOHead must receive geoPlacename prop in series detail');
});
