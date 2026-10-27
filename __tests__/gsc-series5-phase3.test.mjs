import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { datasetSchema, courseSchema } from '../src/lib/seo/hubPageSchema.js';
import { createLobbyJsonLd } from '../src/components/poker-near-me/lobby/lobbyController.js';

const ROOT = process.cwd();

test('datasetSchema emits a connected Schema.org Dataset node with license, creator, and spatialCoverage', () => {
  const node = datasetSchema({
    path: '/hub/events-calendar',
    name: 'US Live Poker Events Dataset',
    description: 'Live poker events and series.',
  });
  assert.equal(node['@type'], 'Dataset');
  assert.equal(node['@id'], 'https://smarter.poker/hub/events-calendar#dataset');
  assert.equal(node.license, 'https://smarter.poker/terms');
  assert.equal(node.isAccessibleForFree, true);
  assert.equal(node.creator['@id'], 'https://smarter.poker/#organization');
  assert.equal(node.spatialCoverage.name, 'United States');
});

test('courseSchema emits a connected Schema.org Course & CourseInstance node with free Offer', () => {
  const node = courseSchema({
    path: '/hub/training',
    name: 'Smarter.Poker GTO Poker Training Curriculum',
  });
  assert.equal(node['@type'], 'Course');
  assert.equal(node['@id'], 'https://smarter.poker/hub/training#course');
  assert.equal(node.provider['@id'], 'https://smarter.poker/#organization');
  assert.equal(node.offers.price, '0');
  assert.equal(node.hasCourseInstance['@type'], 'CourseInstance');
});

test('createLobbyJsonLd includes Dataset structured data node in @graph', () => {
  const graph = createLobbyJsonLd({ '@type': 'WebSite', '@id': 'https://smarter.poker/#website' });
  const datasetNode = graph['@graph'].find((n) => n['@type'] === 'Dataset');
  assert.ok(datasetNode, 'createLobbyJsonLd must include Dataset node');
  assert.equal(datasetNode['@id'], 'https://smarter.poker/hub/poker-near-me/lobby#dataset');
  assert.equal(datasetNode.license, 'https://smarter.poker/terms');
});

test('pages/learn/[topic].js and pages/glossary/[term].js include SpeakableSpecification and educational schema', () => {
  const learnSrc = fs.readFileSync(path.join(ROOT, 'pages/learn/[topic].js'), 'utf8');
  assert.match(learnSrc, /learningResourceType:\s*'GTO Poker Strategy Guide'/);
  assert.match(learnSrc, /educationalLevel:\s*'Beginner To Advanced'/);
  assert.match(learnSrc, /'@type':\s*'SpeakableSpecification'/);

  const glossarySrc = fs.readFileSync(path.join(ROOT, 'pages/glossary/[term].js'), 'utf8');
  assert.match(glossarySrc, /'@type':\s*'SpeakableSpecification'/);
});
