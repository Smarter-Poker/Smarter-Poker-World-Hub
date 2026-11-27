import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseFirstTouch } from '../src/lib/acquisition/firstTouch.mjs';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('CRO Law 1: SmarterConversionCta and GuestConversionBar enforce #SMARTERDESIGN with zero banned colors or safe-area violations', () => {
  const ctaSrc = read('src/components/seo/SmarterConversionCta.jsx');
  const barSrc = read('src/components/seo/GuestConversionBar.jsx');
  const appSrc = read('pages/_app.js');

  assert.ok(!ctaSrc.includes('safe-area-inset-top'), 'SmarterConversionCta.jsx must never claim safe-area-inset-top');
  assert.ok(barSrc.includes('env(safe-area-inset-top, 0px)'), 'GuestConversionBar.jsx must own safe-area-inset-top when topmost chrome');

  for (const [name, src] of [['SmarterConversionCta.jsx', ctaSrc], ['GuestConversionBar.jsx', barSrc]]) {
    assert.ok(!src.includes('\u2014'), `${name} must never contain em dashes`);
    assert.ok(src.includes('/auth/signup'), `${name} must link directly to /auth/signup`);
    assert.doesNotMatch(
      src,
      /#(?:f59e0b|fbbf24|facc15|eab308|ffd700|f2b84b|a855f7|c084fc|ec4899|f472b6)\b/i,
      `${name} must never use banned yellow/gold/amber/purple/pink #SMARTERDESIGN colors`,
    );
  }

  assert.match(appSrc, /GuestConversionBar/, 'pages/_app.js must wire GuestConversionBar');
});

test('CRO Law 2: firstTouch captures organic Google/Bing/AI search referrals without breaking untagged visits', () => {
  const google = parseFirstTouch('', '/tools/preflop-ranges/btn', Date.parse('2026-11-27T12:00:00Z'), 'https://www.google.com/');
  assert.equal(google?.utm_source, 'google');
  assert.equal(google?.utm_medium, 'organic');
  assert.equal(google?.landing_path, '/tools/preflop-ranges/btn');

  const androidGoogle = parseFirstTouch('', '/hub/series/5001355', Date.parse('2026-11-27T12:00:00Z'), 'android-app://com.google.android.googlequicksearchbox/');
  assert.equal(androidGoogle?.utm_source, 'google');
  assert.equal(androidGoogle?.utm_medium, 'organic');
  assert.equal(androidGoogle?.landing_path, '/hub/series/5001355');

  const chatgpt = parseFirstTouch('', '/learn/hands/king-five-suited', Date.parse('2026-11-27T12:00:00Z'), 'https://chatgpt.com/');
  assert.equal(chatgpt?.utm_source, 'chatgpt');
  assert.equal(chatgpt?.utm_medium, 'ai_referral');

  const internal = parseFirstTouch('', '/tools/preflop-ranges/btn', Date.parse('2026-11-27T12:00:00Z'), 'https://smarter.poker/');
  assert.equal(internal, null, 'internal smarter.poker referrers must never fabricate an acquisition source');
});

test('CRO Law 3: all top clicked organic page families render SmarterConversionCta', () => {
  const requiredFiles = [
    'pages/tools/preflop-ranges/index.js',
    'pages/tools/push-fold-calculator.js',
    'pages/hub/poker-tools.js',
    'pages/tools/plo-bet-calculator.js',
    'pages/tools/3bet-calculator.js',
    'pages/learn/hands/[hand].js',
    'pages/learn/best-poker-players.js',
    'pages/learn/matchups/[slug].js',
    'pages/games/[variant].js',
    'pages/research/[slug].js',
    'pages/compare/[slug].js',
    'src/components/features/FeatureLanderLayout.js',
    'pages/hub/series/[id].js',
    'pages/hub/venues/[id].js',
    'pages/hub/poker-near-me/in/[state]/index.js',
    'pages/poker-rooms/states/[state].js',
    'pages/hub/training/range-builder.js',
    'pages/hub/training/skill-tree.js',
  ];

  for (const rel of requiredFiles) {
    const src = read(rel);
    assert.ok(
      src.includes('SmarterConversionCta'),
      `${rel} must import and render SmarterConversionCta`,
    );
  }
});

test('CRO Law 4: training/play renders non-empty SSR H1, starting hands include interactive GTO Spot Check, homepage has mobile sticky CTA, and signup has 1-tap Google card', () => {
  const playSrc = read('pages/hub/training/play/[gameId].js');
  assert.match(playSrc, /<h1[\s>]/, 'pages/hub/training/play/[gameId].js must render an SSR-visible <h1>');

  const handSrc = read('pages/learn/hands/[hand].js');
  assert.match(handSrc, /GTO Preflop Spot Check|Quick GTO Spot Check/i, 'starting hand pages must include the interactive GTO Spot Check');

  const homeSrc = read('pages/index.js');
  assert.match(homeSrc, /715\+ Live Rooms/, 'homepage must include the #SMARTERDESIGN sticky mobile CTA');

  const signupSrc = read('pages/auth/signup.js');
  assert.match(signupSrc, /Continue With Google/, 'signup.js must display prominent 1-tap Continue With Google CTA');
  assert.match(signupSrc, /Have A Promo Or Referral Code\?/, 'signup.js must collapse optional promo terms behind an expandable toggle');
});
