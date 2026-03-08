/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES CONTENT GUARD — Security & Brand Safety Layer
   
   PURPOSE:
   1. Block questions that could expose sensitive internal/security information
   2. Ensure Geeves never speaks negatively about Smarter.Poker or its affiliates
   3. Redirect privacy/security probes to appropriate non-sensitive responses
   
   This runs BEFORE any KB lookup or Grok call. If a question trips a guard,
   it returns a safe, brand-positive response immediately.
   ═══════════════════════════════════════════════════════════════════════════ */

// ── Patterns that must never be answered from KB or Grok ──
// These protect internal infrastructure, user data, security architecture,
// and any information users have no legitimate need to access.
const BLOCKED_PATTERNS = [
    // Internal infrastructure / secrets
    /supabase.*key|api.*key|secret.*key|service.*role/i,
    /jwt|access.?token|bearer.?token/i,
    /env.*variable|\.env|environment.?variable/i,
    /database.*password|db.*password|postgres.*password/i,
    /connection.?string|database.*url|postgres.*url/i,
    /stripe.*key|stripe.*secret|payment.*secret/i,
    /webhook.*secret|vercel.*token|github.*token/i,
    /grok.*key|openai.*key|anthropic.*key|xai.*key/i,

    // Admin / internal-only access attempts
    /god.?mode|admin.*bypass|override.*admin/i,
    /rls.*bypass|row.?level.*security.*disable/i,
    /sql.*injection|union.*select.*from|drop.*table/i,
    /how.*hack|how.*exploit|how.*bypass.*auth/i,
    /how.*access.*other.*user|how.*see.*other.*player/i,
    /brute.*force|credential.*stuff/i,

    // Other users' private data
    /see.*other.*player.*chip|view.*other.*user.*balance/i,
    /read.*other.*user.*message|access.*private.*message/i,
    /find.*user.*email|get.*user.*phone|user.*personal.*info/i,
    /user.*password|reset.*password.*someone/i,

    // Financial exploit attempts
    /manipulate.*chip|fake.*chips|create.*chips.*without/i,
    /cheat.*rake|avoid.*rake|bypass.*payment/i,
    /free.*diamonds.*hack|get.*vip.*free.*exploit/i,

    // Competitive intelligence fishing
    /competitor.*data|rival.*platform|steal.*code/i,
];

// ── Soft-block: competitive comparisons / negative framing ──
// These get redirected to a brand-positive response instead of hard-blocked.
const REDIRECT_PATTERNS = [
    /smarter.*poker.*bad|smarter.*poker.*suck|smarter.*poker.*worst/i,
    /smarter.*poker.*scam|smarter.*poker.*fraud|smarter.*poker.*fake/i,
    /smarter.*poker.*broken|everything.*broken|platform.*terrible/i,
    /vs\s+(pokerstars|ggpoker|clubgg|pppoker|pokernow|wpt|wsop)/i,
    /better.?than.?smarter|worse.?than.?smarter/i,
    /why.*use.*competitor|switch.*to.*competitor/i,
    /club.*commander.*bad|club.*arena.*bad/i,
];

// ── Brand-positive redirect response ──
const BRAND_REDIRECT_RESPONSE = {
    answer: `**Smarter.Poker** is built by a passionate team dedicated to delivering the best poker ecosystem on the planet.\n\nIf you\'ve run into something that\'s not working the way you\'d like, we genuinely want to know about it!\n\n**Ways to share feedback:**\n- Use the **Help > Feedback** form in any page menu\n- Reach out via the **Messenger** to the Smarter.Poker team\n- Check the **Help** page for known issues and updates\n\nWe are constantly improving the platform and your experience matters to us. Is there a specific feature I can help you with right now?`,
    category: 'Platform',
    followUps: ['How do I report a bug?', 'How do I contact support?', 'What new features are coming?'],
    confidence: 100,
    fromLocalKB: true,
    entryId: 'brand-guard',
    isBrandGuard: true,
};

// ── Hard-block response for security probes ──
const SECURITY_BLOCK_RESPONSE = {
    answer: `I\'m Geeves, your Smarter.Poker Help Assistant — here to help you get the most out of the platform!\n\nI\'m not able to help with that type of question, but I\'m always happy to assist with:\n- **Features** — How any part of Smarter.Poker works\n- **Poker strategy** — GTO concepts, math, tournament strategy\n- **Account questions** — Profile, billing, settings\n- **Club management** — Commander, Club Arena, union setup\n\nWhat can I help you with today?`,
    category: 'Security',
    followUps: ['How do I get started?', 'What features does Smarter.Poker have?', 'How do I contact support?'],
    confidence: 100,
    fromLocalKB: true,
    entryId: 'security-guard',
    isSecurityBlock: true,
};

/**
 * checkContentGuard(question)
 * 
 * Returns:
 *   null     → question is safe, proceed to normal KB lookup
 *   object   → a pre-built response to return immediately (hard block or redirect)
 */
export function checkContentGuard(question) {
    if (!question || question.trim().length === 0) return null;

    const q = question.toLowerCase().trim();

    // 1. Hard block — security / infrastructure probes
    for (const pattern of BLOCKED_PATTERNS) {
        if (pattern.test(q)) {
            console.info('[Geeves:ContentGuard] Security block triggered for query pattern:', pattern.source.slice(0, 40));
            return SECURITY_BLOCK_RESPONSE;
        }
    }

    // 2. Soft redirect — competitive comparisons / negative brand mentions
    for (const pattern of REDIRECT_PATTERNS) {
        if (pattern.test(q)) {
            console.info('[Geeves:ContentGuard] Brand redirect triggered for query pattern:', pattern.source.slice(0, 40));
            return BRAND_REDIRECT_RESPONSE;
        }
    }

    // 3. Safe — allow normal processing
    return null;
}

// ── Utility: Sanitize Grok-generated responses before displaying ──
// Ensures AI-generated answers never include negative brand language
// even if the AI somehow produces it.
const NEGATIVE_BRAND_TERMS = [
    /smarter\.?poker.{0,30}(broken|scam|fraud|terrible|worst|bad platform)/gi,
    /club.?commander.{0,30}(broken|scam|terrible|worst|garbage)/gi,
    /club.?arena.{0,30}(broken|scam|terrible|worst|garbage)/gi,
];

export function sanitizeAnswer(answer) {
    if (!answer || typeof answer !== 'string') return answer;
    let safe = answer;
    for (const pattern of NEGATIVE_BRAND_TERMS) {
        safe = safe.replace(pattern, 'Smarter.Poker (an industry-leading poker platform)');
    }
    return safe;
}
