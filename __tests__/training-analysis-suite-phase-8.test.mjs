import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const routes = [
  'equity-calculator',
  'icm-calculator',
  'risk-analyzer',
  'analyzer',
  'hand-comparison',
  'ev-heatmap',
  'performance-heatmap',
  'weakness-scanner',
];

const sources = Object.fromEntries(routes.map((route) => [
  route,
  fs.readFileSync(`pages/hub/training/${route}.js`, 'utf8'),
]));
const handHistoryUpload = fs.readFileSync('pages/hub/training/hand-history-upload.js', 'utf8');
const trainingCss = fs.readFileSync('src/styles/worlds/training.css', 'utf8');
const app = fs.readFileSync('pages/_app.js', 'utf8');

test('the complete analysis family adopts one dimensional tool shell', () => {
  for (const [route, source] of Object.entries(sources)) {
    if (route === 'analyzer') {
      assert.match(source, /getServerSideProps/);
      assert.match(source, /destination:\s*'\/hub\/training\/hand-history-upload\?source=legacy-analyzer'/);
      continue;
    }
    assert.match(source, /sp-training-tool--analysis/, `${route} must adopt the analysis shell`);
    assert.match(source, /sp-training-analysis-(?:header|main)/, `${route} must adopt analysis structure`);
  }
});

test('analysis tools use a phone-first stacked control deck', () => {
  assert.match(sources['risk-analyzer'], /sp-risk-analysis-layout/);
  assert.match(sources['risk-analyzer'], /sp-analysis-control-deck/);
  assert.match(sources['risk-analyzer'], /sp-analysis-output-deck/);
  assert.match(trainingCss, /\.sp-risk-analysis-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(trainingCss, /\.sp-training-analysis-main\s*\{[\s\S]*?max-width:\s*100% !important/);
});

test('comparison panels and upload state use straight metallic surfaces', () => {
  assert.match(sources['hand-comparison'], /sp-analysis-data-panel--a/);
  assert.match(sources['hand-comparison'], /sp-analysis-data-panel--board/);
  assert.match(handHistoryUpload, /Drop Hand History File Here/);
  assert.match(handHistoryUpload, /Grade Only Provenance-Complete Server Audits/);
  assert.match(trainingCss, /\.sp-analysis-data-panel\s*\{[\s\S]*?border-radius:\s*0 !important/);
  assert.match(trainingCss, /\.sp-training-analysis-dropzone\s*\{[\s\S]*?border-radius:\s*0 !important/);
});

test('pressed analysis filters are accessible and carry the cyan instrument state', () => {
  assert.match(sources['equity-calculator'], /aria-pressed=\{numPlayers === n\}/);
  assert.match(sources['performance-heatmap'], /href="\/hub\/training\/gto-reports"/);
  assert.doesNotMatch(sources['performance-heatmap'], /derivePositions|deriveStreets|generateMistakePatterns/);
  assert.match(trainingCss, /button\[aria-pressed='true'\][\s\S]*?#a7f2ff/);
  assert.match(sources['risk-analyzer'], /className="sp-analysis-primary-action"/);
  assert.match(sources['icm-calculator'], /className="sp-analysis-primary-action"/);
  assert.match(trainingCss, /\.sp-analysis-primary-action:not\(:disabled\)[\s\S]*?#baf6ff/);
});

test('the unchanged global header remains outside the training page stage', () => {
  assert.match(app, /\{!trainingPageOwnsHeader && <UniversalHeader pageDepth=\{2\} \/>\}[\s\S]*?<div className="sp-training-page-stage">/);
  assert.doesNotMatch(trainingCss, /\.universal-header[^\n]*sp-training-tool--analysis/);
});
