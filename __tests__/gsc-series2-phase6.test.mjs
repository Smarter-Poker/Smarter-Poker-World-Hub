import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildQuizSchema, POKER_TRIVIA_QUIZ_QUESTIONS } from '../src/lib/seo/quizStructuredData.mjs';
import { summarySchema, SCHEMA_ROUTES } from '../src/lib/seo/summarySchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

describe('GSC / AEO Series 2 - Phase 6: Growth & Distribution Engines', () => {
  it('quizStructuredData builds compliant Schema.org Quiz and Question nodes', () => {
    assert.ok(Array.isArray(POKER_TRIVIA_QUIZ_QUESTIONS));
    assert.ok(POKER_TRIVIA_QUIZ_QUESTIONS.length >= 5);

    for (const q of POKER_TRIVIA_QUIZ_QUESTIONS) {
      assert.ok(q.question, 'Question must have text');
      assert.ok(Array.isArray(q.answers), 'Must have answers array');
      const correct = q.answers.filter((a) => a.isCorrect);
      assert.equal(correct.length, 1, 'Must have exactly one accepted answer');
      assert.ok(q.explanation, 'Must have explanation for answer');
    }

    const quizGraph = buildQuizSchema({
      path: '/hub/trivia',
      name: 'Poker Trivia Quiz',
      description: 'Test Your GTO Poker Skills',
    });

    assert.equal(quizGraph['@context'], 'https://schema.org');
    assert.ok(Array.isArray(quizGraph['@graph']));
    const quizNode = quizGraph['@graph'].find((n) => n['@type'] === 'Quiz');
    assert.ok(quizNode, 'Graph must include Quiz node');
    assert.equal(quizNode.name, 'Poker Trivia Quiz');
    assert.equal(quizNode.hasPart.length, POKER_TRIVIA_QUIZ_QUESTIONS.length);

    const firstQ = quizNode.hasPart[0];
    assert.equal(firstQ['@type'], 'Question');
    assert.equal(firstQ.eduQuestionType, 'Multiple choice');
    assert.ok(firstQ.acceptedAnswer);
    assert.equal(firstQ.acceptedAnswer['@type'], 'Answer');
    assert.ok(firstQ.acceptedAnswer.comment);
  });

  it('summarySchema attaches Quiz nodes to trivia routes for search rich snippets', () => {
    const triviaSummary = {
      heading: 'About Poker Trivia',
      lead: 'Poker Trivia Offers Server Scored Questions On Hand Rankings, Pot Odds, Tournament History And Rules.',
    };

    const graph = summarySchema('trivia', triviaSummary);
    assert.ok(graph);
    const quizNode = graph['@graph'].find((n) => n['@type'] === 'Quiz');
    assert.ok(quizNode, 'Trivia page summarySchema must attach Quiz node');
    assert.match(quizNode['@id'], /\/hub\/trivia#quiz$/);
    assert.ok(quizNode.hasPart.length >= 5);

    // Also check mode routes (e.g. trivia-endless)
    const endlessSummary = {
      heading: 'About Endless Poker Trivia',
      lead: 'One Hundred Questions, With A Three Miss Limit.',
    };
    const endlessGraph = summarySchema('trivia-endless', endlessSummary);
    const endlessQuizNode = endlessGraph['@graph'].find((n) => n['@type'] === 'Quiz');
    assert.ok(endlessQuizNode, 'Endless trivia mode must attach Quiz node');
    assert.match(endlessQuizNode['@id'], /\/hub\/trivia\/endless#quiz$/);
  });

  it('Poker Odds Calculator page provides embed widget code with clean dofollow attribution', () => {
    const pokerToolsSrc = fs.readFileSync(
      path.join(rootDir, 'pages/hub/poker-tools.js'),
      'utf8'
    );

    // Recognizes embed mode query
    assert.match(pokerToolsSrc, /router\.query\?\.embed === 'true'/);

    // Contains Embed Widget trigger
    assert.match(pokerToolsSrc, /setShowEmbedModal\(true\)/);

    // Contains iframe embed code
    assert.match(pokerToolsSrc, /<iframe src="https:\/\/smarter\.poker\/hub\/poker-tools\?embed=true"/);

    // Contains dofollow attribution backlink
    assert.match(pokerToolsSrc, /Powered By <a href="https:\/\/smarter\.poker\/hub\/poker-tools" target="_blank" rel="noopener"/);
    assert.match(pokerToolsSrc, /Smarter\.Poker Free Poker Odds Calculator<\/a>/);

    // Contains embed mode credit bar
    assert.match(pokerToolsSrc, /odds-embed-credit/);
  });
});
