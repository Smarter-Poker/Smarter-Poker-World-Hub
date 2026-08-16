/**
 * supabaseKeys.test.mjs — key-format resolution for the 2026-08-16 outage.
 *
 * Run: node --test src/lib/__tests__/supabaseKeys.test.mjs
 *
 * Context: legacy JWT API keys (anon / service_role) were disabled on project
 * kuklfnapbkmacvwxktbh at 00:38:16 UTC on 2026-08-16. Production went degraded
 * -- the site served HTTP 200 while every DB-backed route failed, because the
 * app was still presenting keys the platform had stopped accepting. The
 * hardcoded fallback in authUtils made it worse: it was itself a legacy key,
 * so the "fallback for production stability" pointed at a guaranteed failure.
 *
 * These assertions pin the resolution rules. No network, no secrets.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
    resolveAnonKey,
    isLegacyJwtKey,
    isModernKey,
    anonKeyWarning,
    SUPABASE_PUBLISHABLE_FALLBACK,
} from '../supabaseKeys.js';

// Structurally a legacy key; not a live credential (payload is nonsense).
const LEGACY_SHAPE = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl';
const MODERN_PUBLISHABLE = 'sb_publishable_TESTTESTTESTTESTTEST';
const MODERN_SECRET = 'sb_secret_TESTTESTTESTTESTTEST';

describe('key format detection', () => {
    test('a three-segment eyJ token is recognised as a legacy JWT', () => {
        assert.equal(isLegacyJwtKey(LEGACY_SHAPE), true);
    });

    test('modern keys are not mistaken for legacy ones', () => {
        assert.equal(isLegacyJwtKey(MODERN_PUBLISHABLE), false);
        assert.equal(isLegacyJwtKey(MODERN_SECRET), false);
        assert.equal(isModernKey(MODERN_PUBLISHABLE), true);
        assert.equal(isModernKey(MODERN_SECRET), true);
    });

    test('empty and malformed values are neither', () => {
        for (const v of ['', null, undefined, 'not-a-key', 'eyJonlyonesegment']) {
            assert.equal(isLegacyJwtKey(v), false, `legacy: ${v}`);
            assert.equal(isModernKey(v), false, `modern: ${v}`);
        }
    });

    test('detection is structural, so it recognises ANY project\'s legacy key', () => {
        // Not tied to one project's literal -- the next rotation or a preview
        // database must be recognised the same way.
        assert.equal(isLegacyJwtKey('eyJhbGciOiJIUzI1NiJ9.eyJyZWYiOiJvdGhlciJ9.eHl6'), true);
    });
});

describe('anon key resolution', () => {
    test('a modern configured key is used verbatim -- rotations keep working', () => {
        const r = resolveAnonKey(MODERN_PUBLISHABLE);
        assert.equal(r.key, MODERN_PUBLISHABLE);
        assert.equal(r.source, 'env');
    });

    test('a LEGACY configured key is replaced by the publishable fallback', () => {
        // This is the outage case: the env var is set, so every "is it
        // configured?" check passed, and every request still 401'd.
        const r = resolveAnonKey(LEGACY_SHAPE);
        assert.equal(r.key, SUPABASE_PUBLISHABLE_FALLBACK);
        assert.equal(r.source, 'fallback-legacy');
    });

    test('a missing key falls back rather than sending an empty apikey', () => {
        for (const v of ['', undefined, null, '   ']) {
            const r = resolveAnonKey(v);
            assert.equal(r.key, SUPABASE_PUBLISHABLE_FALLBACK);
            assert.equal(r.source, 'fallback-missing');
        }
    });

    test('surrounding whitespace is stripped, not passed into a header', () => {
        // Vercel production values for several NEXT_PUBLIC_* vars carry a
        // literal trailing newline; a newline inside an apikey header throws
        // "Invalid header value" instead of returning a clean 401.
        const r = resolveAnonKey(`  ${MODERN_PUBLISHABLE}\n`);
        assert.equal(r.key, MODERN_PUBLISHABLE);
        assert.equal(r.source, 'env');
    });

    test('the shipped fallback is a publishable key, never a secret one', () => {
        // A secret key compiled into the browser bundle would be a real
        // credential leak. A publishable key is public by design.
        assert.ok(SUPABASE_PUBLISHABLE_FALLBACK.startsWith('sb_publishable_'));
        assert.equal(isModernKey(SUPABASE_PUBLISHABLE_FALLBACK), true);
        assert.equal(isLegacyJwtKey(SUPABASE_PUBLISHABLE_FALLBACK), false);
    });
});

describe('operator warning', () => {
    test('the healthy path stays silent', () => {
        assert.equal(anonKeyWarning('env'), null);
    });

    test('both fallback paths say what to change', () => {
        for (const s of ['fallback-legacy', 'fallback-missing']) {
            const w = anonKeyWarning(s);
            assert.ok(typeof w === 'string' && w.length > 40, s);
            assert.match(w, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
        }
        // The legacy warning must name the actual cause, or an operator
        // reading it will go looking for a missing variable that is present.
        assert.match(anonKeyWarning('fallback-legacy'), /LEGACY/);
    });
});
