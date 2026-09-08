#!/usr/bin/env node

/**
 * RETIRED: this script used hand-authored answer text while labeling rows PIO.
 *
 * Training cache writes must now go through the canonical policy contract and
 * database receipt path. Keeping this executable as a fail-closed tombstone
 * prevents an old runbook or operator command from reintroducing fabricated
 * solver provenance.
 */

console.error([
  'generate-test-questions.js is permanently retired.',
  'It cannot write training_question_cache because its questions have no canonical source artifact.',
  'Use the live Training APIs for new canonical rows or scripts/backfill-training-cache-truth.mjs for the one-time legacy repair.',
].join('\n'));
process.exitCode = 2;
