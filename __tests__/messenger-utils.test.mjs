/**
 * Messenger Utility Unit Tests
 * ═══════════════════════════════════════════════════════════════════
 * Standalone test script — no test framework needed.
 * Run with: node __tests__/messenger-utils.test.mjs
 * ═══════════════════════════════════════════════════════════════════
 */

import { sanitizeMessage, escapeLikeQuery } from '../src/utils/messageSanitizer.js';

let passed = 0;
let failed = 0;
const failures = [];

function assert(name, actual, expected) {
    if (actual === expected) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        failures.push({ name, actual, expected });
        console.log(`  ❌ ${name}`);
        console.log(`     Expected: ${JSON.stringify(expected)}`);
        console.log(`     Actual:   ${JSON.stringify(actual)}`);
    }
}

function assertTruthy(name, val) {
    if (val) { passed++; console.log(`  ✅ ${name}`); }
    else { failed++; failures.push({ name, actual: val, expected: 'truthy' }); console.log(`  ❌ ${name}`); }
}

// ═══════════════════════════════════════════════════════════════════
// sanitizeMessage() tests
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 sanitizeMessage()');

assert('Pass-through normal text',
    sanitizeMessage('Hello world'), 'Hello world');

assert('Null input returns null',
    sanitizeMessage(null), null);

assert('Empty string returns empty',
    sanitizeMessage(''), '');

assert('Strips <script> tags',
    sanitizeMessage('<script>alert("xss")</script>'), '[Removed Malicious Code]');

assert('Strips inline event handlers (onerror)',
    sanitizeMessage('Hello onerror=alert(1)'),
    'Hello data-blocked=alert(1)');

assert('Strips inline event handlers (onclick)',
    sanitizeMessage('Hello onclick=something'),
    'Hello data-blocked=something');

assert('Preserves normal HTML-like text',
    sanitizeMessage('2 < 3 is true'), '2 < 3 is true');

assert('Mixed XSS with normal text',
    sanitizeMessage('Hi there <script>alert(1)</script> friend'),
    'Hi there [Removed Malicious Code] friend');

// ═══════════════════════════════════════════════════════════════════
// escapeLikeQuery() tests
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 escapeLikeQuery()');

assert('Pass-through normal text',
    escapeLikeQuery('poker'), 'poker');

assert('Null input returns null',
    escapeLikeQuery(null), null);

assert('Escapes % wildcard',
    escapeLikeQuery('100%'), '100\\%');

assert('Escapes _ wildcard',
    escapeLikeQuery('user_name'), 'user\\_name');

assert('Escapes backslashes',
    escapeLikeQuery('path\\file'), 'path\\\\file');

assert('Escapes multiple special chars',
    escapeLikeQuery('50%_off'), '50\\%\\_off');

// ═══════════════════════════════════════════════════════════════════
// timeAgo() — inline test (function is not exported, test logic)
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 timeAgo() logic');

function timeAgo(timestamp) {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
    return date.toLocaleDateString();
}

assert('Null timestamp returns empty',
    timeAgo(null), '');

assert('Just now for 10s ago',
    timeAgo(new Date(Date.now() - 10000).toISOString()), 'Just now');

assert('Minutes for 5m ago',
    timeAgo(new Date(Date.now() - 300000).toISOString()), '5m');

assert('Hours for 2h ago',
    timeAgo(new Date(Date.now() - 7200000).toISOString()), '2h');

assert('Days for 3d ago',
    timeAgo(new Date(Date.now() - 259200000).toISOString()), '3d');

assertTruthy('Falls back to date for old timestamps',
    timeAgo(new Date(Date.now() - 864000000).toISOString()).length > 0);

// ═══════════════════════════════════════════════════════════════════
// formatMessageTime() — inline test
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 formatMessageTime() logic');

function formatMessageTime(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

assert('Null returns empty',
    formatMessageTime(null), '');

assertTruthy('Returns time string for valid timestamp',
    formatMessageTime(new Date().toISOString()).length > 0);

// ═══════════════════════════════════════════════════════════════════
// formatDateHeader() — inline test  
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 formatDateHeader() logic');

function formatDateHeader(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

assert('Null returns empty',
    formatDateHeader(null), '');

assert('Today for today',
    formatDateHeader(new Date().toISOString()), 'Today');

assert('Yesterday for yesterday',
    formatDateHeader(new Date(Date.now() - 86400000).toISOString()), 'Yesterday');

assertTruthy('Returns formatted date for older',
    formatDateHeader(new Date(Date.now() - 604800000).toISOString()).includes(',') ||
    formatDateHeader(new Date(Date.now() - 604800000).toISOString()).length > 5);

// ═══════════════════════════════════════════════════════════════════
// Delivery status tier tests (logic validation)
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 Message status tier logic');

function getStatusTier(status, is_read) {
    if (status === 'sending') return 'sending';
    if (status === 'failed') return 'failed';
    if (status === 'read' || is_read) return 'read';
    if (status === 'delivered') return 'delivered';
    return 'sent';
}

assert('Sending status',
    getStatusTier('sending', false), 'sending');

assert('Failed status',
    getStatusTier('failed', false), 'failed');

assert('Read status from status field',
    getStatusTier('read', false), 'read');

assert('Read status from is_read field',
    getStatusTier('sent', true), 'read');

assert('Delivered status',
    getStatusTier('delivered', false), 'delivered');

assert('Sent status (default)',
    getStatusTier('sent', false), 'sent');

assert('Read takes priority over delivered',
    getStatusTier('read', true), 'read');

// ═══════════════════════════════════════════════════════════════════
// LRU cache eviction test
// ═══════════════════════════════════════════════════════════════════
console.log('\n🧪 LRU profile cache eviction');

function testLRU() {
    const cache = new Map();
    const MAX = 5;
    
    // Fill cache
    for (let i = 0; i < MAX; i++) {
        cache.set(`user-${i}`, { name: `User ${i}` });
    }
    assert('Cache fills to max', cache.size, MAX);
    
    // Add one more — should evict oldest
    if (cache.size >= MAX) {
        const oldestKey = cache.keys().next().value;
        cache.delete(oldestKey);
    }
    cache.set('user-new', { name: 'New User' });
    
    assert('Cache stays at max after eviction', cache.size, MAX);
    assert('Oldest entry (user-0) was evicted', cache.has('user-0'), false);
    assert('New entry exists', cache.has('user-new'), true);
    assert('Second entry (user-1) still exists', cache.has('user-1'), true);
}
testLRU();

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(50));
console.log(`📊 Results: ${passed} passed, ${failed} failed (${passed + failed} total)`);
if (failed > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach(f => console.log(`  - ${f.name}: got ${JSON.stringify(f.actual)}, expected ${JSON.stringify(f.expected)}`));
    process.exit(1);
} else {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
}
