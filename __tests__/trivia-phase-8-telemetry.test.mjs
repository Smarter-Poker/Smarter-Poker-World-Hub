import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import {
    buildSoloJourneyEvent,
    createSoloJourneyTracker,
    SOLO_JOURNEY_EVENT,
} from '../src/lib/trivia/soloJourneyAnalytics.mjs';

test('solo journey telemetry exposes every Phase 8 metric through a bounded payload', () => {
    for (const metric of ['completion', 'abandon', 'report', 'retry', 'cap', 'settlement']) {
        const built = buildSoloJourneyEvent('daily', metric, {
            surface: 'daily',
            retry_kind: 'answer',
            settlement_outcome: 'verified',
            sessionId: 'must-not-leak',
            question: 'must-not-leak',
            diamonds: 999,
        });
        assert.equal(built.event, SOLO_JOURNEY_EVENT);
        assert.equal(built.properties.mode, 'daily');
        assert.equal(built.properties.metric, metric);
        assert.equal(built.properties.surface, 'daily');
        assert.equal(built.properties.retry_kind, 'answer');
        assert.equal(built.properties.settlement_outcome, 'verified');
        assert.equal('sessionId' in built.properties, false);
        assert.equal('question' in built.properties, false);
        assert.equal('diamonds' in built.properties, false);
    }
    assert.equal(buildSoloJourneyEvent('arcade', 'completion'), null);
    assert.equal(buildSoloJourneyEvent('daily', 'unknown'), null);
});

test('tracker isolates analytics failure and deduplicates reconnect/replay noise', async () => {
    const captured = [];
    const tracker = createSoloJourneyTracker({
        captureEvent(event, properties) {
            captured.push({ event, properties });
            return Promise.reject(new Error('provider unavailable'));
        },
    });

    assert.equal(tracker.track('gto', 'settlement', { surface: 'strategy', settlement_outcome: 'verified' }), true);
    assert.equal(tracker.track('gto', 'settlement', { surface: 'strategy', settlement_outcome: 'verified' }), false);
    assert.equal(tracker.track('gto', 'settlement', { surface: 'strategy', settlement_outcome: 'replayed' }), true);
    assert.equal(tracker.track('gto', 'retry', { surface: 'strategy', retry_kind: 'answer' }), true);
    assert.equal(tracker.track('gto', 'retry', { surface: 'strategy', retry_kind: 'settlement' }), true);
    assert.equal(tracker.beginRun('11111111-1111-4111-8111-111111111111'), true);
    assert.equal(tracker.beginRun('11111111-1111-4111-8111-111111111111'), false);
    assert.equal(tracker.track('gto', 'settlement', { surface: 'strategy', settlement_outcome: 'verified' }), true);
    assert.equal(tracker.beginRun('22222222-2222-4222-8222-222222222222'), true);
    assert.equal(tracker.track('gto', 'settlement', { surface: 'strategy', settlement_outcome: 'verified' }), true);
    await Promise.resolve();
    assert.equal(captured.length, 6);
});

test('Daily and Strategy wire every required lifecycle metric at the real route owners', () => {
    const read = path => readFileSync(join(process.cwd(), path), 'utf8');
    const daily = read('pages/hub/trivia/[mode].js');
    const strategy = read('src/components/trivia/StrategyTrivia.jsx');
    const game = read('src/components/trivia/TriviaGame.jsx');

    for (const source of [daily, strategy]) {
        for (const metric of ['completion', 'report', 'retry', 'cap', 'settlement']) {
            assert.match(source, new RegExp(`track\\(mode, '${metric}'`));
        }
        assert.match(source, /track\(lifecycle\.mode, 'abandon'/);
        assert.match(source, /beginRun\(/);
    }
    assert.match(game, /onDone=\{onQuestionReported\}/);
    assert.match(game, /onRetry\('answer'\)/);
    assert.match(game, /onRetry\('invalid_question'\)/);
});
