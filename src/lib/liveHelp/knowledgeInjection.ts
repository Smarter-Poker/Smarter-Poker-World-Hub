/* ═══════════════════════════════════════════════════════════════════════════
   KNOWLEDGE INJECTION SERVICE — Dynamically inject relevant knowledge into prompts
   ═══════════════════════════════════════════════════════════════════════════ */

// Import knowledge base (will be populated from jarvisKnowledgeBase.ts)
const JARVIS_KNOWLEDGE = {
    worldHub: {
        orbs: [
            { name: 'Social Hub', orbNumber: 1, route: '/hub/social-media', status: 'LIVE' },
            { name: 'Club Arena', orbNumber: 2, route: 'https://club.smarter.poker', status: 'LIVE' },
            { name: 'Diamond Arena', orbNumber: 3, route: '/hub/diamond-arena', status: 'LIVE' },
            { name: 'GTO Training', orbNumber: 4, route: '/hub/training', status: 'LIVE' },
            { name: 'News & Content', orbNumber: 5, route: '/hub/news', status: 'LIVE' },
            { name: 'Memory Games', orbNumber: 6, route: '/hub/memory-campaign', status: 'LIVE' },
            { name: 'Trivia', orbNumber: 7, route: '/hub/trivia', status: 'LIVE' },
            { name: 'Video Library', orbNumber: 8, route: '/hub/video-library', status: 'LIVE' },
            { name: 'Poker Near Me', orbNumber: 9, route: '/hub/poker-near-me', status: 'LIVE' },
            { name: 'AI Assistant', orbNumber: 10, route: '/hub/assistant', status: 'LIVE' },
            { name: 'Bankroll Tracker', orbNumber: 11, route: '/hub/bankroll', status: 'LIVE' },
            { name: 'Diamond Store', orbNumber: 12, route: '/hub/diamond-store', status: 'LIVE' },
            { name: 'Arcade', orbNumber: 13, route: '/hub/arcade', status: 'LIVE' }
        ]
    }
};


/**
 * Detect question category from user message
 */
export function categorizeQuestion(message: string): string[] {
    const categories: string[] = [];
    const lowerMessage = message.toLowerCase();

    // Navigation & Platform
    if (lowerMessage.match(/how do i (get|access|find|navigate|go to)/i) ||
        lowerMessage.match(/where (is|can i find)/i) ||
        lowerMessage.match(/orb|hub|header|menu|navigation/i)) {
        categories.push('navigation');
    }

    // GTO Training
    if (lowerMessage.match(/training|gto|game|question|pio|solver|practice|learn/i)) {
        categories.push('training');
    }

    // Club Arena
    if (lowerMessage.match(/club|arena|agent|union|rake|chip|table|poker room/i)) {
        categories.push('club_arena');
    }

    // Diamond Arena
    if (lowerMessage.match(/diamond arena|tournament|competitive|multiplayer/i)) {
        categories.push('diamond_arena');
    }

    // Social Hub
    if (lowerMessage.match(/post|reel|story|messenger|friend|profile|social|hendonmob/i)) {
        categories.push('social');
    }

    // Diamond Store
    if (lowerMessage.match(/diamond|store|buy|purchase|vip|bundle|payment|stripe/i)) {
        categories.push('diamond_store');
    }

    // Gamification
    if (lowerMessage.match(/xp|level|achievement|reward|leaderboard/i)) {
        categories.push('gamification');
    }

    // Ghost Fleet
    if (lowerMessage.match(/horse|ai|ghost|fleet|content|post/i)) {
        categories.push('ghost_fleet');
    }

    // Poker Near Me
    if (lowerMessage.match(/venue|tour|tournament|location|near me|poker room/i)) {
        categories.push('poker_near_me');
    }

    // Technical Support
    if (lowerMessage.match(/error|bug|problem|issue|not working|can't|won't|broken|login|password/i)) {
        categories.push('technical_support');
    }

    return categories.length > 0 ? categories : ['general'];
}

/**
 * Get relevant knowledge based on categories
 */
export function getRelevantKnowledge(categories: string[]): string {
    const knowledgeSections: string[] = [];

    for (const category of categories) {
        switch (category) {
            case 'navigation':
                knowledgeSections.push(`
## NAVIGATION REFERENCE
${JARVIS_KNOWLEDGE.worldHub.orbs.map(orb =>
                    `- **${orb.name}** (Orb #${orb.orbNumber}): ${orb.route} - ${orb.status}`
                ).join('\n')}

**Header Components**: Diamond wallet (+), XP/Level display, Profile orb (32px), Notifications bell, Hamburger menu
**Navigation Pattern**: Click orb → feature, brain icon → back to hub
`);
                break;

            case 'training':
                knowledgeSections.push(`
## GTO TRAINING ENGINE
- **100 Games** across 5 silos: MTT Mastery, Cash Game Grind, Spins & SNGs, Mental Game, Advanced Theory
- **3-Engine Architecture**: PIO Solver → CHART (cached) → SCENARIO (Grok AI)
- **XP Formula**: Level = floor(sqrt(XP/100))+1
- **Views**: PRO (GTO terms) vs STANDARD (beginner-friendly)
- **Access**: Orb #4 from Hub OR /hub/training
`);
                break;

            case 'club_arena':
                knowledgeSections.push(`
## CLUB ARENA SYSTEM
- **Hierarchy**: Union → Club Admin → Agent → Player
- **Triple-Wallet**: Business (earnings), Player (chips), Promo (marketing)
- **Chip Economy**: 38💎 = 100 chips (75% cheaper than competitors)
- **Rake**: 10% flat, 2.5x BB cap, 0.5x BBJ drop, "No Flop No Drop"
- **Access**: Orb #2 from Hub OR https://club.smarter.poker
`);
                break;

            case 'diamond_store':
                knowledgeSections.push(`
## DIAMOND STORE
- **Bundles**: Starter (1,000💎), Value (5,000💎), Premium (10,000💎), Ultimate (50,000💎)
- **VIP Tiers**: Bronze, Silver, Gold
- **Checkout**: Add to cart → cart badge → review → Stripe payment → instant delivery
- **Order History**: /hub/diamond-store/orders
- **Access**: Diamond icon in header OR /hub/diamond-store
`);
                break;

            case 'social':
                knowledgeSections.push(`
## SOCIAL HUB
- **Posts**: Text/images/videos with likes/comments
- **Reels**: TikTok-style vertical video
- **Stories**: 24-hour ephemeral content (colored ring on avatar)
- **Messenger**: Real-time DMs with LiveKit voice/video calling
- **Poker Resume**: HendonMob integration at top of profile
- **Access**: Orb #1 from Hub OR /hub/social-media
`);
                break;

            case 'technical_support':
                knowledgeSections.push(`
## TECHNICAL SUPPORT
- **Login Issues**: Verify email, password reset, clear cache, incognito mode
- **Payment Problems**: Verify card, check funds, review /hub/diamond-store/orders
- **Page Loading**: Refresh (Cmd+R), /clear-cache route, check internet
- **Settings**: /hub/settings for Profile, Privacy, Notifications, Security
- **Support**: support@smarter.poker, live chat, support tickets
`);
                break;
        }
    }

    return knowledgeSections.join('\n\n');
}

/**
 * Detect user's current page from context
 */
export function detectCurrentPage(context: any): string | null {
    if (!context?.currentPage) return null;
    return context.currentPage;
}

/**
 * Get page-specific knowledge
 */
export function getPageSpecificKnowledge(page: string): string {
    const pageKnowledge: Record<string, string> = {
        '/hub/training': 'User is on Training page - emphasize GTO games, PIO solver, practice modes',
        '/hub/club-arena': 'User is on Club Arena - emphasize club management, chip economy, rake system',
        '/hub/diamond-store': 'User is on Diamond Store - emphasize bundles, VIP tiers, checkout process',
        '/hub/social-media': 'User is on Social Hub - emphasize posts, reels, stories, messenger',
        '/hub/poker-near-me': 'User is on Poker Near Me - emphasize venues, tours, live schedules',
        '/hub/settings': 'User is on Settings - emphasize profile, privacy, notifications, security',
    };

    for (const [path, knowledge] of Object.entries(pageKnowledge)) {
        if (page.startsWith(path)) {
            return `\n**CURRENT PAGE CONTEXT**: ${knowledge}\n`;
        }
    }

    return '';
}

/**
 * Build enhanced system prompt with knowledge injection
 */
export function injectKnowledge(
    basePrompt: string,
    userMessage: string,
    context: any
): string {
    // Categorize the question
    const categories = categorizeQuestion(userMessage);

    // Get relevant knowledge
    const relevantKnowledge = getRelevantKnowledge(categories);

    // Get page-specific knowledge
    const currentPage = detectCurrentPage(context);
    const pageKnowledge = currentPage ? getPageSpecificKnowledge(currentPage) : '';

    // Inject knowledge into prompt
    return `${basePrompt}

${pageKnowledge}

## RELEVANT KNOWLEDGE FOR THIS QUESTION
${relevantKnowledge}

Use the above knowledge to provide accurate, specific answers. Reference exact page routes, button names, and features.`;
}
