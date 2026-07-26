/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  DIAMOND WALLET — Utility Function Tests (R8-I23)
 *  Tests for helper functions used in DiamondWalletModal.jsx
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ── Helper: recreate utility functions for isolated testing ──
// These mirror the implementations in DiamondWalletModal.jsx

function getDateGroup(dateStr) {
    const now = new Date();
    const dt = new Date(dateStr);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    if (dt >= today) return 'Today';
    if (dt >= yesterday) return 'Yesterday';
    if (dt >= weekAgo) return 'This Week';
    return 'Earlier';
}

function parseRateLimitError(errorText) {
    if (!errorText) return null;
    // Parse "wait X seconds between transfers" and "X second(s) remaining/cooldown/left" formats
    const secondsMatch = errorText.match(/(\d+)\s*seconds?/i);
    const minutesMatch = errorText.match(/(\d+)\s*minutes?/i);
    const isCooldownText = /wait|cooldown|remaining|left/i.test(errorText);
    if (isCooldownText && secondsMatch) {
        return { type: 'cooldown', seconds: parseInt(secondsMatch[1]) };
    }
    if (isCooldownText && minutesMatch) {
        return { type: 'cooldown', seconds: parseInt(minutesMatch[1]) * 60 };
    }
    // Parse "Daily transfer limit reached" type messages (Guard 3)
    if (/daily\s*(transfer\s*)?limit\s*reached/i.test(errorText)) return { type: 'daily_limit' };
    // Parse "per day to the same friend" messages (Guard 10)
    if (/per\s*day\s*to\s*(the\s*)?same\s*friend/i.test(errorText)) return { type: 'friend_limit' };
    // Parse "daily receive limit" messages (Guard 12)
    if (/daily\s*receive\s*limit/i.test(errorText)) return { type: 'daily_limit' };
    // Parse "per-friend limit" or "per-recipient" messages (generic)
    if (/per[- ]?(friend|recipient)/i.test(errorText)) return { type: 'friend_limit' };
    return null;
}

function getPersistedRecipients() {
    try {
        const raw = localStorage.getItem('sp-wallet-recent-recipients');
        if (!raw) return [];
        return JSON.parse(raw).slice(0, 5);
    } catch (_) { return []; }
}

function persistRecipients(recipients) {
    try {
        localStorage.setItem('sp-wallet-recent-recipients', JSON.stringify(recipients.slice(0, 5)));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
}

const TX_TYPES = {
    purchase: { label: 'Purchase', color: '#ef4444' },
    bonus: { label: 'Bonus', color: '#a855f7' },
    daily_bonus: { label: 'Daily Bonus', color: '#3b82f6' },
    adjustment: { label: 'Adjustment', color: '#94a3b8' },
    diamond_gift_sent: { label: 'Gift Sent', color: '#ffffff' },
    diamond_gift_received: { label: 'Gift Received', color: '#22c55e' },
};

async function copyReceiptToClipboard(tx) {
    const txType = tx.transaction_type || tx.type;
    const config = TX_TYPES[txType] || TX_TYPES.adjustment;
    const dt = new Date(tx.created_at);
    const receipt = `Smarter.Poker Diamond Receipt\nRef: ${tx.id || 'N/A'}\nType: ${config.label}\nAmount: ${tx.amount >= 0 ? '+' : ''}${tx.amount} Diamonds\nBalance After: ${tx.balance_after ?? 'N/A'} Diamonds\nDate: ${dt.toLocaleString()}`;
    try {
        await navigator.clipboard.writeText(receipt);
        return true;
    } catch (_) {
        return false;
    }
}

// ── Mock localStorage ──
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] ?? null,
        setItem: (key, value) => { store[key] = String(value); },
        removeItem: (key) => { delete store[key]; },
        clear: () => { store = {}; },
    };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ── Mock navigator.clipboard ──
Object.defineProperty(global, 'navigator', {
    value: {
        clipboard: {
            writeText: jest.fn().mockResolvedValue(undefined),
        },
    },
    writable: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
//  TEST SUITES
// ═══════════════════════════════════════════════════════════════════════════════

describe('getDateGroup', () => {
    it('returns "Today" for current date', () => {
        const now = new Date();
        expect(getDateGroup(now.toISOString())).toBe('Today');
    });

    it('returns "Yesterday" for yesterday', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(12, 0, 0, 0); // Midday to avoid midnight edge case
        expect(getDateGroup(yesterday.toISOString())).toBe('Yesterday');
    });

    it('returns "This Week" for 3 days ago', () => {
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        threeDaysAgo.setHours(12, 0, 0, 0);
        expect(getDateGroup(threeDaysAgo.toISOString())).toBe('This Week');
    });

    it('returns "Earlier" for 30 days ago', () => {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        expect(getDateGroup(monthAgo.toISOString())).toBe('Earlier');
    });

    it('handles invalid date gracefully', () => {
        expect(getDateGroup('invalid')).toBe('Earlier');
    });
});

describe('parseRateLimitError', () => {
    it('parses "45 seconds remaining" message', () => {
        const result = parseRateLimitError('Please wait. 45 seconds remaining');
        expect(result).toEqual({ type: 'cooldown', seconds: 45 });
    });

    it('parses "60 second cooldown" message', () => {
        const result = parseRateLimitError('Rate limited. 60 second cooldown');
        expect(result).toEqual({ type: 'cooldown', seconds: 60 });
    });

    it('parses server "Please wait X seconds between transfers" format', () => {
        const result = parseRateLimitError('Please wait 30 seconds between transfers');
        expect(result).toEqual({ type: 'cooldown', seconds: 30 });
    });

    it('parses minutes-based cooldown messages', () => {
        const result = parseRateLimitError('Please wait 2 minutes before your next transfer');
        expect(result).toEqual({ type: 'cooldown', seconds: 120 });
    });

    it('identifies daily limit errors (Guard 3 wording)', () => {
        expect(parseRateLimitError('Daily transfer limit reached')).toEqual({ type: 'daily_limit' });
        expect(parseRateLimitError('Daily limit reached')).toEqual({ type: 'daily_limit' });
    });

    it('identifies daily receive limit errors (Guard 12 wording)', () => {
        const result = parseRateLimitError('Recipient has hit their daily receive limit');
        expect(result).toEqual({ type: 'daily_limit' });
    });

    it('identifies per-friend limit errors', () => {
        expect(parseRateLimitError('Per-friend transfer limit reached')).toEqual({ type: 'friend_limit' });
        expect(parseRateLimitError('You can only send 200 per day to the same friend')).toEqual({ type: 'friend_limit' });
    });

    it('returns null for non-rate-limit errors', () => {
        expect(parseRateLimitError('Transfer failed')).toBeNull();
    });

    it('handles null/undefined safely', () => {
        expect(parseRateLimitError(null)).toBeNull();
        expect(parseRateLimitError(undefined)).toBeNull();
    });
});

describe('Recent Recipients Persistence', () => {
    beforeEach(() => {
        localStorageMock.clear();
    });

    it('returns empty array when no stored recipients', () => {
        expect(getPersistedRecipients()).toEqual([]);
    });

    it('persists and retrieves recipients', () => {
        const recipients = [
            { id: '1', display_name: 'Alice', lastAmount: 50, lastSent: Date.now() },
            { id: '2', display_name: 'Bob', lastAmount: 25, lastSent: Date.now() },
        ];
        persistRecipients(recipients);
        expect(getPersistedRecipients()).toEqual(recipients);
    });

    it('respects the 5-recipient limit', () => {
        const recipients = Array.from({ length: 8 }, (_, i) => ({
            id: String(i), display_name: `User${i}`, lastAmount: 10, lastSent: Date.now(),
        }));
        persistRecipients(recipients);
        expect(getPersistedRecipients().length).toBe(5);
    });

    it('handles corrupt localStorage gracefully', () => {
        localStorageMock.setItem('sp-wallet-recent-recipients', 'not-valid-json');
        expect(getPersistedRecipients()).toEqual([]);
    });
});

describe('copyReceiptToClipboard', () => {
    it('generates correct receipt text for positive amount', async () => {
        const tx = {
            id: 'tx-123',
            transaction_type: 'bonus',
            amount: 50,
            balance_after: 150,
            created_at: '2026-03-01T12:00:00Z',
        };
        const result = await copyReceiptToClipboard(tx);
        expect(result).toBe(true);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining('Bonus')
        );
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining('+50 Diamonds')
        );
    });

    it('generates correct receipt text for negative amount', async () => {
        const tx = {
            id: 'tx-456',
            transaction_type: 'purchase',
            amount: -20,
            balance_after: 130,
            created_at: '2026-03-01T12:00:00Z',
        };
        await copyReceiptToClipboard(tx);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining('-20 Diamonds')
        );
    });

    it('falls back to adjustment for unknown types', async () => {
        const tx = {
            id: 'tx-789',
            transaction_type: 'unknown_type',
            amount: 5,
            balance_after: 100,
            created_at: '2026-03-01T12:00:00Z',
        };
        await copyReceiptToClipboard(tx);
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
            expect.stringContaining('Adjustment')
        );
    });

    it('returns false when the async clipboard write rejects', async () => {
        navigator.clipboard.writeText.mockRejectedValueOnce(new Error('NotAllowedError'));
        const tx = {
            id: 'tx-999',
            transaction_type: 'bonus',
            amount: 10,
            balance_after: 110,
            created_at: '2026-03-01T12:00:00Z',
        };
        const result = await copyReceiptToClipboard(tx);
        expect(result).toBe(false);
    });
});

describe('DATE_RANGE filtering logic', () => {
    const now = new Date();
    const transactions = [
        { created_at: new Date().toISOString(), amount: 10 },
        { created_at: new Date(Date.now() - 5 * 86400000).toISOString(), amount: 20 },
        { created_at: new Date(Date.now() - 15 * 86400000).toISOString(), amount: 30 },
        { created_at: new Date(Date.now() - 60 * 86400000).toISOString(), amount: 40 },
        { created_at: new Date(Date.now() - 120 * 86400000).toISOString(), amount: 50 },
    ];

    function filterByDateRange(txns, range) {
        if (range === 'all') return txns;
        const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
        const days = daysMap[range] || 0;
        if (days === 0) return txns;
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        return txns.filter(tx => new Date(tx.created_at) >= cutoff);
    }

    it('returns all transactions for "all"', () => {
        expect(filterByDateRange(transactions, 'all').length).toBe(5);
    });

    it('filters to last 7 days', () => {
        const result = filterByDateRange(transactions, '7d');
        expect(result.length).toBe(2);
    });

    it('filters to last 30 days', () => {
        const result = filterByDateRange(transactions, '30d');
        expect(result.length).toBe(3);
    });

    it('filters to last 90 days', () => {
        const result = filterByDateRange(transactions, '90d');
        expect(result.length).toBe(4);
    });
});

describe('Monthly trend computation', () => {
    it('computes month-over-month change correctly', () => {
        const lastMonthEarned = 100;
        const thisMonthEarned = 150;
        const earnedChange = lastMonthEarned > 0
            ? ((thisMonthEarned - lastMonthEarned) / lastMonthEarned * 100)
            : 0;
        expect(earnedChange).toBe(50); // 50% increase
    });

    it('handles zero last month (no division by zero)', () => {
        const lastMonthEarned = 0;
        const thisMonthEarned = 100;
        const earnedChange = lastMonthEarned > 0
            ? ((thisMonthEarned - lastMonthEarned) / lastMonthEarned * 100)
            : 0;
        expect(earnedChange).toBe(0); // Safe fallback
    });
});

describe('TX_TYPES icon config', () => {
    it('all types have label and color properties', () => {
        Object.entries(TX_TYPES || {}).forEach(([key, config]) => {
            expect(config.label).toBeDefined();
            expect(config.color).toBeDefined();
            expect(typeof config.label).toBe('string');
            expect(config.color).toMatch(/^#[0-9a-f]{6}$/i);
        });
    });
});
