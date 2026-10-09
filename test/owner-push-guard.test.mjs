import { test, expect } from 'vitest';
import { gateDecision } from '../src/lib/push/push-gate.js';

test('owner push guard allows listed types and blocks unlisted', () => {
    const ownerId = '47965354-0e56-43ef-931c-ddaab82af765';
    const allowed = gateDecision({}, 'achievement', { recipient: ownerId });
    expect(allowed.allowed).toBe(true);

    const blocked = gateDecision({}, 'system', { recipient: ownerId });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('owner_unlisted_type:system');
});
