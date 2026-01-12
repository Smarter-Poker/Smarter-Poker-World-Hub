/* ═══════════════════════════════════════════════════════════════════════════
   SMARTER.POKER — CHAT CENSORSHIP SHIELD
   Physical Redaction Engine for Play Money Legal Fiction
   Blocks: Venmo, CashApp, Zelle, Crypto, PayPal, $, Money references
   ═══════════════════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ CENSORSHIP PATTERNS — PAYMENT/MONEY REDACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List of banned payment-related terms for real-money facilitation prevention.
 * Case-insensitive matching is applied.
 */
const BANNED_PAYMENT_PATTERNS = [
    // Payment Apps
    'venmo',
    'cashapp',
    'cash app',
    'zelle',
    'paypal',
    'pay pal',
    'bitcoin',
    'btc',
    'ethereum',
    'eth',
    'crypto',
    'cryptocurrency',
    'usdt',
    'tether',
    'dogecoin',
    'doge',
    'litecoin',
    'ltc',
    'solana',
    'sol',
    'bnb',
    'binance',
    'coinbase',
    'wire transfer',
    'bank transfer',
    'western union',
    'moneygram',
    'apple pay',
    'google pay',
    'gpay',
    'chime',
    'square cash',

    // Money terms (contextual — these catch explicit money discussions)
    'real money',
    'real cash',
    'cash out',
    'cashout',
    'payout',
    'pay out',
    'send money',
    'transfer funds',
    'wire me',
    'pay me',
    'paid me',
    'settle up',
    'settlement',
    'usd',
    'dollars',
    '$\\d+', // Matches $10, $100, etc.
    '\\d+\\s*dollars',
    '\\d+\\s*usd',
    '\\d+\\s*bucks',
];

/**
 * Build the master regex pattern for content filtering.
 * Uses word boundaries and case-insensitive matching.
 */
const buildCensorshipRegex = (): RegExp => {
    const escapedPatterns = BANNED_PAYMENT_PATTERNS.map(pattern => {
        // Escape special regex characters except for already-intentional patterns
        if (pattern.includes('\\d')) {
            return pattern; // Already a regex pattern
        }
        return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });

    // Join all patterns with OR operator
    const combined = escapedPatterns.join('|');

    // Apply word boundary matching where appropriate
    return new RegExp(`(${combined})`, 'gi');
};

// Compile the master regex
const CENSORSHIP_REGEX = buildCensorshipRegex();

// Standalone dollar sign pattern (matches standalone $ or $amounts)
const DOLLAR_SIGN_REGEX = /\$\d+(\.\d{2})?|\$\s/gi;

// ─────────────────────────────────────────────────────────────────────────────
// 🔧 CHAT SYSTEM UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    userId: string;
    content: string;
    timestamp: Date;
    channelId: string;
    isRedacted?: boolean;
    originalContent?: string; // For admin review only
}

export interface RedactionResult {
    wasRedacted: boolean;
    cleanContent: string;
    flaggedTerms: string[];
}

/**
 * CENSORSHIP SHIELD — Main redaction function
 * Scans message content and replaces banned terms with [REDACTED]
 * 
 * @param content - Raw message content from user
 * @returns RedactionResult with clean content and flag status
 */
export function redactPaymentTerms(content: string): RedactionResult {
    const flaggedTerms: string[] = [];
    let wasRedacted = false;

    // First pass: Check for dollar signs with amounts
    let cleanContent = content.replace(DOLLAR_SIGN_REGEX, (match) => {
        flaggedTerms.push(match.trim());
        wasRedacted = true;
        return '[REDACTED]';
    });

    // Second pass: Check for banned payment/money terms
    cleanContent = cleanContent.replace(CENSORSHIP_REGEX, (match) => {
        flaggedTerms.push(match.toLowerCase());
        wasRedacted = true;
        return '[REDACTED]';
    });

    return {
        wasRedacted,
        cleanContent,
        flaggedTerms: [...new Set(flaggedTerms)], // Deduplicate
    };
}

/**
 * Check if content contains banned terms WITHOUT redacting.
 * Useful for pre-validation before sending.
 * 
 * @param content - Message content to check
 * @returns true if banned content detected
 */
export function containsBannedContent(content: string): boolean {
    return CENSORSHIP_REGEX.test(content) || DOLLAR_SIGN_REGEX.test(content);
}

/**
 * Get list of banned terms found in content.
 * 
 * @param content - Message content to scan
 * @returns Array of matched banned terms
 */
export function extractBannedTerms(content: string): string[] {
    const terms: string[] = [];

    // Dollar patterns
    const dollarMatches = content.match(DOLLAR_SIGN_REGEX);
    if (dollarMatches) {
        terms.push(...dollarMatches);
    }

    // Payment term patterns
    const paymentMatches = content.match(CENSORSHIP_REGEX);
    if (paymentMatches) {
        terms.push(...paymentMatches);
    }

    return [...new Set(terms)];
}

// ─────────────────────────────────────────────────────────────────────────────
// 📥 CHAT MESSAGE PROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process an incoming chat message through the censorship shield.
 * This is the main entry point for all user-generated content.
 * 
 * @param message - Raw ChatMessage object
 * @returns Processed ChatMessage with redacted content
 */
export function processChatMessage(message: ChatMessage): ChatMessage {
    const { wasRedacted, cleanContent, flaggedTerms } = redactPaymentTerms(message.content);

    if (wasRedacted) {
        console.log(`[CENSORSHIP_SHIELD] Redacted message from user ${message.userId}:`, flaggedTerms);

        return {
            ...message,
            content: cleanContent,
            isRedacted: true,
            // Store original for admin review (server-side only, never sent to client)
            originalContent: message.content,
        };
    }

    return message;
}

/**
 * Process a batch of chat messages.
 * 
 * @param messages - Array of ChatMessage objects
 * @returns Array of processed messages
 */
export function processChatBatch(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(processChatMessage);
}

// ─────────────────────────────────────────────────────────────────────────────
// 🤖 AI AGENT CONTENT FILTER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Filter AI agent responses to ensure no payment facilitation language.
 * Applied to all AI-generated content before display.
 * 
 * @param aiResponse - Raw AI agent response text
 * @returns Cleaned response text
 */
export function filterAgentResponse(aiResponse: string): string {
    const { cleanContent } = redactPaymentTerms(aiResponse);
    return cleanContent;
}

// ─────────────────────────────────────────────────────────────────────────────
// 📋 MODERATION UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export interface ModerationReport {
    messageId: string;
    userId: string;
    flaggedTerms: string[];
    timestamp: Date;
    severity: 'low' | 'medium' | 'high';
}

/**
 * Generate a moderation report for flagged content.
 * 
 * @param message - Original message
 * @param flaggedTerms - Terms that triggered the filter
 * @returns ModerationReport object
 */
export function generateModerationReport(
    message: ChatMessage,
    flaggedTerms: string[]
): ModerationReport {
    // Severity based on number of flagged terms
    let severity: 'low' | 'medium' | 'high' = 'low';
    if (flaggedTerms.length >= 3) severity = 'high';
    else if (flaggedTerms.length >= 2) severity = 'medium';

    // Boost severity for explicit payment app mentions
    const explicitPaymentApps = ['venmo', 'cashapp', 'zelle', 'paypal', 'bitcoin'];
    if (flaggedTerms.some(term =>
        explicitPaymentApps.some(app => term.toLowerCase().includes(app))
    )) {
        severity = 'high';
    }

    return {
        messageId: message.id,
        userId: message.userId,
        flaggedTerms,
        timestamp: new Date(),
        severity,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 🧪 EXPORTS & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const CENSORSHIP_SHIELD = {
    redact: redactPaymentTerms,
    check: containsBannedContent,
    extract: extractBannedTerms,
    processMessage: processChatMessage,
    processBatch: processChatBatch,
    filterAgent: filterAgentResponse,
    report: generateModerationReport,
};

export default CENSORSHIP_SHIELD;
