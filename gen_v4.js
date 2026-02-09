require('dotenv').config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });
const OpenAI = require('openai');
const fs = require('fs');

const grok = new OpenAI({
    apiKey: process.env.XAI_API_KEY,
    baseURL: 'https://api.x.ai/v1'
});

const AG1_V4 = `*** SYSTEM MESSAGE: ANTI-GRAVITY AGENT V4 ACTIVATED ***
*** CLASSIFICATION: ELITE STRATEGY ONLY ***
*** INTEGRITY PROTOCOL: ZERO FABRICATION ***
*** SYNC PROTOCOL: ANSWER KEY = EXPLANATION ***

IDENTITY:
You are the "Anti-Gravity Agent"—a high-level Tournament Poker Logic Engine.

MANDATORY RULES OF ENGAGEMENT (The 7 Commandments):

1. CONTEXT IS KING: Always specify tournament stage, effective stack, position, and action.
2. DISTRACTOR PROTOCOL: Wrong answers must be PLAUSIBLE MISTAKES. No joke answers.
3. EXPLANATION IS THE PAYLOAD: Explain MATH and LOGIC. Use: Equity, Pot Odds, ICM, Fold Equity. ALWAYS refer to options as A, B, C, D.
4. ZERO FABRICATION: NEVER invent facts. VERIFY BOARD PHYSICS (e.g. J-9 on Q-T-8 = straight, NOT on T-8-2).
5. SYNC CHECK (CRITICAL): correct_index MUST match the option defended in explanation. PRE-OUTPUT CHECK: Read option at correct_index, read first sentence of explanation. They MUST match.
6. CORRECT MATH: Pot Odds = Call / (Pot_Before + Bet + Call). Example: 10/(18.5+10+10) = 10/38.5 = 26%. NEVER omit call from denominator.
7. STRICT JSON OUTPUT: Pure JSON only. No markdown fences.

EXECUTE GENERATION.`;

const categories = [
    {
        id: 'poker_history', name: 'Poker History', focus: 'WSOP milestone years and records',
        extra: 'VERIFIED FACTS: WSOP bracelets first awarded 1976. Jeff Lisandro 3 bracelets in 2009. Phil Hellmuth 17 bracelets all-time. Jamie Gold won 2006 ME. Phil Ivey has 11 bracelets (11th won June 2024). DO NOT guess facts.'
    },
    {
        id: 'famous_hands', name: 'Famous Hands', focus: 'WSOP Main Event iconic hands',
        extra: 'VERIFIED: 2003 Moneymaker SHOVED ALL-IN with K♠7♥ vs Farha Q♠9♥, board 9♠2♦6♠8♠3♥. 1988 Chan: J♣9♣ vs Seidel Q♣7♥, board Q♣T♥8♦ (J-9 makes NUT STRAIGHT Q-J-T-9-8). Dead Mans Hand: A♠A♣8♠8♣ (1876). VERIFY board physics before claiming any hand type.'
    },
    {
        id: 'player_profiles', name: 'Player Profiles', focus: 'Career achievements',
        extra: 'Phil Ivey = 11 bracelets (2024). Phil Hellmuth = 17 bracelets. Daniel Negreanu ~$50M live tournament earnings. Only use facts you are 100% certain of.'
    },
    {
        id: 'rule_knowledge', name: 'Rules & Etiquette', focus: 'TDA ruling scenarios',
        extra: 'TDA: Exposed cards with action pending = hand is LIVE (not dead). Speech play = penalty possible but pot results STAND. SYNC CHECK: the checkmark MUST match explanation.'
    },
    {
        id: 'gto_theory', name: 'GTO Theory', focus: 'Pot odds and MDF calculations',
        extra: 'CORRECT FORMULA: Pot Odds = Call / (Pot_Before + Bet + Call). Example: Pot=18.5, Bet=10, Call=10 -> 10/(18.5+10+10) = 10/38.5 = 26%. NEVER omit call from denominator. MDF = 1 - (Bet / (Pot + Bet)).'
    },
    {
        id: 'tournament_facts', name: 'Tournament Facts', focus: 'WSOP records and statistics',
        extra: 'VERIFIED: WSOP ME largest field = 10,112 entries (2024). 2023 = 10,043. 2006 = 8,773. DO NOT confuse these.'
    },
    {
        id: 'mtt_situations', name: 'MTT Situations', focus: 'Pre-flop push/fold (10-20 BB)',
        extra: '10-15BB on bubble: SHOVE or FOLD. Never min-raise into awkward SPR. SYNC CHECK: If explanation says Shove is +EV, correct_index MUST point to Shove option.'
    },
    {
        id: 'cash_game_situations', name: 'Cash Game Situations', focus: 'Deep stack postflop',
        extra: 'Pot odds = Call / (Pot_Before + Bet + Call). Verify all math. SYNC CHECK is mandatory.'
    },
    {
        id: 'icm_chip_ev', name: 'ICM & Chip EV', focus: 'Bubble factor and risk premium',
        extra: 'ICM bubble factor multiplies required equity. Satellite ICM = 3x+. SYNC CHECK: correct_index must match explanation.'
    },
    {
        id: 'gto_scenarios', name: 'GTO Scenarios', focus: 'C-bet strategy by board texture',
        extra: 'Include board texture with suits. Dry boards = small bets. Wet boards = larger sizing. SYNC CHECK mandatory.'
    },
    {
        id: 'mtt_situations_bonus', name: 'MTT Situations (Bonus)', focus: 'ICM and pay jumps at Final Table',
        extra: 'Show ICM calculation with pay jump percentages. SYNC CHECK: correct_index MUST match the option defended in explanation.'
    },
    {
        id: 'icm_chip_ev_bonus', name: 'ICM & Chip EV (Bonus)', focus: 'Satellite ICM survival math',
        extra: 'Satellite = identical prizes. Survival > chips. SYNC CHECK: If fold is +EV in explanation, correct_index points to Fold.'
    }
];

(async () => {
    const allQuestions = [];
    for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        console.log(`[${i + 1}/${categories.length}] Generating 2 for ${cat.name}...`);
        try {
            const resp = await grok.chat.completions.create({
                model: 'grok-3',
                messages: [
                    { role: 'system', content: AG1_V4 },
                    {
                        role: 'user', content: `Generate exactly 2 unique poker trivia questions.

CATEGORY: ${cat.name}
TOPIC FOCUS: ${cat.focus}
DIFFICULTY: 1 medium, 1 hard

INTEGRITY RULES FOR THIS BATCH:
${cat.extra}

CRITICAL — SYNC CHECK (READ THIS BEFORE OUTPUTTING):
For EACH question, before outputting, perform this mandatory check:
1. Look at the option at position correct_index (0=A, 1=B, 2=C, 3=D).
2. Read what action that option describes (e.g., "Shove", "Fold", "Call").
3. Read the first sentence of the explanation.
4. The explanation MUST defend that SAME action and reference that SAME letter.
5. If they disagree, FIX correct_index to match the explanation.

RANDOMIZE correct answer position across A/B/C/D. Do NOT always put correct on A or B.

Return ONLY a valid JSON array:
[{"question":"...","options":["A","B","C","D"],"correct_index":0,"explanation":"...","difficulty":"medium|hard","subcategory":"..."}]` }
                ],
                temperature: 0.7,
                max_tokens: 4000
            });
            const content = resp.choices[0].message.content.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
            const parsed = JSON.parse(content);
            const questions = (Array.isArray(parsed) ? parsed : parsed.questions || []).map(q => ({ ...q, category: cat.id, topicFocus: cat.focus }));
            allQuestions.push(...questions);
            console.log(`  Got ${questions.length} questions`);
        } catch (err) {
            console.error(`  ERROR for ${cat.name}: ${err.message}`);
        }
        await new Promise(r => setTimeout(r, 1200));
    }

    fs.writeFileSync('/tmp/v4_raw.json', JSON.stringify(allQuestions, null, 2));
    console.log(`\nDone! ${allQuestions.length} V4 questions saved to /tmp/v4_raw.json`);
})().catch(console.error);
