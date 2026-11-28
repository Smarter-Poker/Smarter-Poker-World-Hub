#!/usr/bin/env node
/**
 * Render the #SMARTERDESIGN seal (the emblem in the round chrome frame on the
 * left of every Training image header) as a purpose-made, page-specific icon:
 * one bold symbol per page, drawn in polished chrome with a cobalt glow on the
 * ink-navy field, instead of a crop of a busy scene render.
 *
 * Each page's symbol is a distinct lucide icon (ISC licence, already a
 * dependency) chosen for what the page does. The script refuses duplicates so
 * no two headers share an emblem, and it never touches the hand-made seals
 * (icm, preflop-charts, training-goals, training-leaderboard) or the Bankroll
 * family.
 *
 *   node scripts/design/render-training-seals.mjs            # all
 *   node scripts/design/render-training-seals.mjs slug ...   # some
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const ICONS = path.join(ROOT, 'node_modules/lucide-react/dist/esm/icons');
const OUT = path.join(ROOT, 'public/images/smarterdesign/headers');

/** page slug -> lucide icon file (kebab-case). One symbol per page. */
export const SEAL_ICONS = {
  'training-lobby': 'gamepad-2',
  'training-achievements': 'medal',
  'training-aggregate': 'chart-column-stacked',
  'training-autopilot': 'bot',
  'training-coach-mode': 'graduation-cap',
  'training-community-leaderboard': 'users-round',
  'training-custom-rake': 'percent',
  'training-custom-solve': 'cpu',
  'training-daily-challenge': 'calendar-check',
  'training-daily-goals': 'list-checks',
  'training-drill-builder': 'hammer',
  'training-equity-calculator': 'calculator',
  'training-famous-finals': 'landmark',
  'training-flashcards': 'layers',
  'training-focus-timer': 'timer',
  'training-glossary': 'book-open',
  'training-gto-news': 'newspaper',
  'training-gto-preloader': 'download',
  'training-hand-comparison': 'scale',
  'training-hand-history-upload': 'upload',
  'training-hand-lab': 'flask-conical',
  'training-icm-simulator': 'chart-pie',
  'training-jarvis': 'brain-circuit',
  'training-live-hud-sync': 'radio-tower',
  'training-mental-journal': 'notebook-pen',
  'training-milestones': 'flag',
  'training-multi-table': 'layout-grid',
  'training-multiway-preflop': 'git-fork',
  'training-my-playbook': 'book-marked',
  'training-position-mastery': 'locate-fixed',
  'training-range-browser': 'grid-3x3',
  'training-progress': 'trending-up',
  'training-pvp-lobby': 'swords',
  'training-qre-explorer': 'sliders-horizontal',
  'training-quick-warmup': 'zap',
  'training-quiz-builder': 'puzzle',
  'training-rake-solutions': 'receipt',
  'training-range-builder': 'paintbrush',
  'training-replay-theater': 'clapperboard',
  'training-reports': 'file-chart-column',
  'training-risk-analyzer': 'shield-alert',
  'training-scenario-demo': 'presentation',
  'training-session-dashboard': 'gauge',
  'training-session-notes': 'sticky-note',
  'training-session-warmup': 'flame',
  'training-short-deck-trainer': 'copy',
  'training-skill-tree': 'network',
  'training-spot-trainer': 'crosshair',
  'training-streaks': 'chart-no-axes-combined',
  'training-study-group': 'messages-square',
  'training-study-group-finder': 'user-search',
  'training-study-plan': 'map',
  'training-table-wizard': 'wand-sparkles',
  'training-tilt-guard': 'heart-pulse',
  'training-tournament-prep': 'clipboard-list',
  'training-tournaments': 'castle',
  'training-training-calendar': 'calendar-days',
  'training-training-feed': 'rss',
  'training-weakness-scanner': 'scan-search',
  'training-bluff-catcher': 'eye',
  'training-ev-trainer': 'sigma',
  'training-final-table-sim': 'armchair',
  'training-icm-final-table': 'crown',
  'training-nodelocking': 'lock-keyhole',
  'training-preflop-advisor': 'lightbulb',
  'training-bounty-trainer': 'target',
  'training-frequency-locking': 'audio-waveform',
  'training-gto-vs-exploitative': 'git-compare-arrows',
  'training-mixed-strategy-lab': 'shuffle',
  'training-multiway-postflop': 'share-2',
  'training-player-profiles': 'id-card',
  'training-pot-geometry': 'triangle-right',
  'training-range-advisor': 'compass',
  'training-spr-trainer': 'ruler',
  'training-three-way-postflop': 'triangle',
  'training-blind-defense': 'shield-half',
  'training-villain-range': 'skull',
  'training-category-mtt': 'trophy',
  'training-category-cash': 'banknote',
  'training-category-spins': 'rotate-cw',
  'training-category-psychology': 'brain',
  'training-category-advanced': 'atom',
  'preflop-stats': 'chart-line',
  'preflop-leaderboard': 'award',
  'preflop-achievements': 'badge-check',
  'preflop-tutorial': 'school',
};

function iconNode(name) {
  const file = path.join(ICONS, `${name}.js`);
  const src = fs.readFileSync(file, 'utf8');
  const body = src.match(/const __iconNode = (\[[\s\S]*?\n\]);/);
  if (!body) throw new Error(`no icon node in ${name}`);
  // The node list is plain JS literals: [["path", { d: "...", key: "..." }], ...]
  // eslint-disable-next-line no-new-func
  return new Function(`return ${body[1]}`)();
}

function shapeSvg(node) {
  return node.map(([tag, attrs]) => {
    const a = Object.entries(attrs).filter(([k]) => k !== 'key').map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');
    return `<${tag} ${a}/>`;
  }).join('');
}

export function sealSvg(name, size = 352) {
  const shapes = shapeSvg(iconNode(name));
  // Icon drawn on lucide's 24-unit grid, scaled to ~62% of the seal.
  const scale = (size * 0.62) / 24;
  const off = (size - 24 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <radialGradient id="field" cx="42%" cy="34%" r="78%">
      <stop offset="0" stop-color="#20456d"/>
      <stop offset="0.45" stop-color="#0d2236"/>
      <stop offset="1" stop-color="#040b14"/>
    </radialGradient>
    <radialGradient id="halo" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#1981ec" stop-opacity="0.42"/>
      <stop offset="0.6" stop-color="#0c55c0" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#0c55c0" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="4" y1="1" x2="11" y2="23">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="0.22" stop-color="#d9e6f2"/>
      <stop offset="0.42" stop-color="#6d869d"/>
      <stop offset="0.55" stop-color="#22374b"/>
      <stop offset="0.66" stop-color="#b9cde0"/>
      <stop offset="0.86" stop-color="#f4f9ff"/>
      <stop offset="1" stop-color="#8fb3d4"/>
    </linearGradient>
    <filter id="bevel" filterUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.35" result="b"/>
      <feSpecularLighting in="b" surfaceScale="3" specularConstant="1.25" specularExponent="18" lighting-color="#ffffff" result="spec">
        <feDistantLight azimuth="235" elevation="48"/>
      </feSpecularLighting>
      <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
      <feComposite in="SourceGraphic" in2="specIn" operator="arithmetic" k1="0" k2="1" k3="0.55" k4="0"/>
    </filter>
    <filter id="glow" filterUnits="userSpaceOnUse" x="-8" y="-8" width="40" height="40">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.1" result="g"/>
      <feFlood flood-color="#1e8cff" flood-opacity="0.85"/>
      <feComposite in2="g" operator="in"/>
    </filter>
    <filter id="drop" filterUnits="userSpaceOnUse" x="-6" y="-6" width="36" height="36">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.35"/>
      <feOffset dx="0" dy="0.55" result="o"/>
      <feFlood flood-color="#000" flood-opacity="0.7"/>
      <feComposite in2="o" operator="in"/>
    </filter>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#field)"/>
  <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.44}" fill="url(#halo)"/>
  <g transform="translate(${off} ${off}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <g filter="url(#glow)" stroke="#000" stroke-width="2.6">${shapes}</g>
    <g filter="url(#drop)" stroke="#000" stroke-width="2.6">${shapes}</g>
    <g stroke="#0a1626" stroke-width="3.1">${shapes}</g>
    <g filter="url(#bevel)" stroke="url(#chrome)" stroke-width="2.3">${shapes}</g>
  </g>
</svg>`;
}

async function main() {
  const wanted = process.argv.slice(2);
  const entries = Object.entries(SEAL_ICONS).filter(([slug]) => !wanted.length || wanted.includes(slug));
  const icons = Object.values(SEAL_ICONS);
  const dupes = icons.filter((icon, i) => icons.indexOf(icon) !== i);
  if (dupes.length) throw new Error(`duplicate seal icons: ${dupes.join(', ')}`);
  for (const [slug, icon] of entries) {
    const out = path.join(OUT, `${slug}-seal.webp`);
    await sharp(Buffer.from(sealSvg(icon))).webp({ quality: 88, effort: 6 }).toFile(out);
  }
  console.log(`${entries.length} seals rendered`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
