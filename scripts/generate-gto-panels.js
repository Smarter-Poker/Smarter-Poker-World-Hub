#!/usr/bin/env node
/**
 * Auto-Generate GTO Panels for Memory Games
 * 
 * Uses the locked template format with:
 * - Proper poker capitalization (BTN, BB, 3-Bet, Title Case)
 * - EXPLOIT + SIMPLIFY alternate plays from Grok
 * - Correct action colors (RAISE=green, FOLD=red, CALL=yellow, 3-BET=purple, CHECK=gray, BET=cyan)
 * - Frequencies that sum to 100%
 */

const fs = require('fs');
const path = require('path');

// Configuration
const OUTPUT_DIR = path.join(__dirname, '../public/images/gto-panels');
const TEMPLATE_PATH = path.join(__dirname, '../public/images/gto-panel-template.png');
const XAI_API_KEY = process.env.XAI_API_KEY;
const DELAY_BETWEEN_GENERATIONS = 4000; // 4 seconds between API calls

// Load template image as base64 for reference
let TEMPLATE_BASE64 = null;
try {
    TEMPLATE_BASE64 = fs.readFileSync(TEMPLATE_PATH).toString('base64');
    console.log('✅ Loaded template image for reference');
} catch (e) {
    console.warn('⚠️ Template image not found, generating without reference');
}

// Action color mapping
const ACTION_COLORS = {
    'raise': 'green neon',
    'fold': 'RED',
    'call': 'YELLOW/ORANGE',
    '3-bet': 'PURPLE',
    'check': 'GRAY',
    'bet': 'CYAN'
};

// Scenarios to generate panels for
const SCENARIOS = [
    // Level 1 - UTG Opens
    {
        id: 'l1-utg-qq', hand: 'QQ', position: 'UTG', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'QQ Is A Premium Pair That Opens From UTG At 100BB. RAISE Is The Only GTO Action. Queens Dominate Most Hands And Build Massive Value.',
        gtoApproach: 'Solver Always Opens QQ From Every Position. This Is A Pure Value Hand That Performs Best By Building The Pot Preflop.',
        ev: '+2.15BB'
    },
    {
        id: 'l1-utg-jj', hand: 'JJ', position: 'UTG', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'JJ Is A Strong Pair That Opens From UTG At 100BB. RAISE Is The Only GTO Action. Jacks Dominate Calling Ranges And Extract Value.',
        gtoApproach: 'Solver Opens JJ 100% From UTG. This Hand Is Strong Enough To Raise For Value And Protect Equity Against Overcards.',
        ev: '+1.95BB'
    },
    {
        id: 'l1-utg-tt', hand: 'TT', position: 'UTG', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'TT Is A Solid Pair That Opens From UTG At 100BB. RAISE Is The Only GTO Action. Tens Have Good Equity Against Most Calling Ranges.',
        gtoApproach: 'Solver Opens TT 100% From UTG. This Pair Performs Best By Taking Initiative And Building The Pot.',
        ev: '+1.75BB'
    },
    {
        id: 'l1-utg-99', hand: '99', position: 'UTG', action: 'raise', freq: 100, stackBb: 100,
        explanation: '99 Is A Medium Pair That Opens From UTG At 100BB. RAISE Is The Optimal GTO Action. Nines Have Set Mining Value And Decent Showdown.',
        gtoApproach: 'Solver Opens 99 100% From UTG At 100BB. The Hand Has Good Playability And Implied Odds For Flopping Sets.',
        ev: '+1.45BB'
    },
    {
        id: 'l1-utg-aqs', hand: 'AQs', position: 'UTG', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'AQs Is A Premium Suited Broadway. RAISE Is The Only GTO Action From UTG At 100BB. This Hand Has Nut Flush Potential And Dominates AJ/AT.',
        gtoApproach: 'Solver Opens AQs 100% From UTG. Suited Ace-Queen Is A Top-Tier Hand With Excellent Postflop Playability.',
        ev: '+1.65BB'
    },
    {
        id: 'l1-utg-ajs', hand: 'AJs', position: 'UTG', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'AJs Is A Strong Suited Broadway. RAISE Is The Optimal GTO Action From UTG At 100BB. This Hand Has Nut Flush And Top Pair Potential.',
        gtoApproach: 'Solver Opens AJs 100% From UTG. Suited Ace-Jack Is A Value Open With Good Board Coverage.',
        ev: '+1.35BB'
    },

    // Level 1 - BTN Opens
    {
        id: 'l1-btn-a2s', hand: 'A2s', position: 'BTN', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'A2s On The BTN Is A Standard Open. RAISE Is The Optimal GTO Action At 100BB. Suited Wheel Aces Have Nut Flush Potential And Wheel Straight Potential.',
        gtoApproach: 'BTN Opens Very Wide Due To Position. Solver Includes A2s As A Standard Open For Stealing And Playability.',
        ev: '+0.35BB'
    },
    {
        id: 'l1-btn-k5s', hand: 'K5s', position: 'BTN', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'K5s On The BTN Is A Speculative Open. RAISE Is The Optimal GTO Action At 100BB. Suited Kings Have Flush Potential And Can Make Strong Top Pairs.',
        gtoApproach: 'BTN Range Includes Suited Kings For Position Value. Solver Opens K5s 100% To Attack Tight Blinds.',
        ev: '+0.30BB'
    },
    {
        id: 'l1-btn-q8s', hand: 'Q8s', position: 'BTN', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'Q8s On The BTN Is A Standard Open. RAISE Is The Optimal GTO Action At 100BB. Suited Queens Have Good Playability With Flush And Pair Potential.',
        gtoApproach: 'BTN Opens All Suited Queens. Solver Includes Q8s As Part Of The Wide BTN Opening Range.',
        ev: '+0.28BB'
    },
    {
        id: 'l1-btn-j9s', hand: 'J9s', position: 'BTN', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'J9s On The BTN Is A Strong Speculative Open. RAISE Is The Optimal GTO Action At 100BB. This Suited One-Gapper Has Excellent Straight And Flush Potential.',
        gtoApproach: 'BTN Opens Suited Gappers For Playability. Solver Includes J9s As A Premium Speculative Hand.',
        ev: '+0.42BB'
    },
    {
        id: 'l1-btn-t8s', hand: 'T8s', position: 'BTN', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'T8s On The BTN Is A Speculative Open. RAISE Is The Optimal GTO Action At 100BB. Suited Two-Gappers Have Strong Straight And Flush Potential.',
        gtoApproach: 'BTN Opens Suited Connectors And Gappers Wide. Solver Opens T8s 100% To Steal Blinds With A Playable Hand.',
        ev: '+0.38BB'
    },

    // Level 1 - CO Opens
    {
        id: 'l1-co-kts', hand: 'KTs', position: 'CO', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'KTs In The CO Is A Premium Suited Broadway. RAISE Is The Optimal GTO Action At 100BB. This Hand Has Flush, Straight, And Strong Top Pair Potential.',
        gtoApproach: 'CO Opens All Suited Broadways. Solver Includes KTs As A Standard Value Open With Only BTN And Blinds Behind.',
        ev: '+0.55BB'
    },
    {
        id: 'l1-co-a9o', hand: 'A9o', position: 'CO', action: 'raise', freq: 100, stackBb: 100,
        explanation: 'A9o In The CO Is A Marginal Open. RAISE Is The Optimal GTO Action At 100BB. Offsuit Aces Have Top Pair Potential But Less Playability.',
        gtoApproach: 'CO Opens Offsuit Aces Down To A9o. Solver Opens This Hand For Value Against Weaker Calling Ranges.',
        ev: '+0.25BB'
    },

    // Level 1 - HJ Opens
    {
        id: 'l1-hj-66', hand: '66', position: 'HJ', action: 'raise', freq: 100, stackBb: 100,
        explanation: '66 In The HJ Is A Set Mining Open. RAISE Is The Optimal GTO Action At 100BB. Small Pairs Have Excellent Implied Odds For Flopping Sets.',
        gtoApproach: 'HJ Opens Pairs Down To 66 At 100BB. Solver Includes This Hand For Set Value And Occasional Bluff Potential.',
        ev: '+0.85BB'
    },
    {
        id: 'l1-hj-55', hand: '55', position: 'HJ', action: 'raise', freq: 100, stackBb: 100,
        explanation: '55 In The HJ Is A Set Mining Open. RAISE Is The Optimal GTO Action At 100BB. Pocket Fives Have Good Implied Odds In Deep Stacks.',
        gtoApproach: 'HJ Opens 55 At 100BB For Set Value. Solver Includes This Hand With Excellent Multiway Potential.',
        ev: '+0.75BB'
    },

    // BB Defense Scenarios
    {
        id: 'bb-vs-btn-k9o', hand: 'K9o', position: 'BB', action: 'call', freq: 60, stackBb: 100,
        explanation: 'K9o In The BB Vs BTN Open Is A Mixed Defend. CALL Is The Primary GTO Action At 60% Frequency. Broadway Offsuit Has Decent Equity Against Wide BTN Range.',
        gtoApproach: 'BB Defense Ranges Are Wide Due To Good Pot Odds. Solver Mixes Between Calling And Folding With K9o.',
        ev: '+0.15BB'
    },
    {
        id: 'bb-vs-btn-q8o', hand: 'Q8o', position: 'BB', action: 'call', freq: 45, stackBb: 100,
        explanation: 'Q8o In The BB Vs BTN Open Is A Marginal Defend. CALL Is The Primary GTO Action At 45% Frequency. This Hand Is Near The Bottom Of Defending Range.',
        gtoApproach: 'BB Defense With Q8o Is Borderline. Solver Mixes Significantly Between Calling And Folding Here.',
        ev: '+0.05BB'
    },
    {
        id: 'bb-vs-btn-76s', hand: '76s', position: 'BB', action: 'call', freq: 85, stackBb: 100,
        explanation: '76s In The BB Vs BTN Open Is A Strong Defend. CALL Is The Primary GTO Action At 85% Frequency. Suited Connectors Have Excellent Playability.',
        gtoApproach: 'BB Defends Suited Connectors At High Frequency. Solver Calls With 76s For Strong Postflop Equity.',
        ev: '+0.25BB'
    },

    // 3-Bet Scenarios
    {
        id: '3bet-jj-vs-utg', hand: 'JJ', position: 'BTN', action: '3-bet', freq: 100, stackBb: 100,
        explanation: 'JJ On The BTN Vs UTG Open Is A Pure 3-Bet. 3-BET Is The Only GTO Action At 100% Frequency. Jacks Are Strong Enough To 3-Bet For Value.',
        gtoApproach: 'Solver 3-Bets JJ 100% Vs UTG Opens. This Hand Is Too Strong To Flat And Performs Best With Initiative.',
        ev: '+2.85BB'
    },
    {
        id: '3bet-ajs-vs-co', hand: 'AJs', position: 'BTN', action: '3-bet', freq: 80, stackBb: 100,
        explanation: 'AJs On The BTN Vs CO Open Is A 3-Bet. 3-BET Is The Primary GTO Action At 80% Frequency. Suited Ace-Jack Is A Value 3-Bet With Playability.',
        gtoApproach: 'Solver 3-Bets AJs At High Frequency Vs CO. This Hand Has Excellent Blocker And Playability Value.',
        ev: '+1.45BB'
    },
    {
        id: '3bet-a5s-vs-btn', hand: 'A5s', position: 'SB', action: '3-bet', freq: 55, stackBb: 100,
        explanation: 'A5s In The SB Vs BTN Open Is A 3-Bet Bluff. 3-BET Is The Primary GTO Action At 55% Frequency. Suited Wheel Aces Are Ideal 3-Bet Bluffs.',
        gtoApproach: 'SB 3-Bet Range Is Polarized. Solver Uses A5s As A Bluff 3-Bet With Wheel And Flush Backup Equity.',
        ev: '+0.65BB'
    },

    // Postflop Scenarios
    {
        id: 'flop-tptk-dry', hand: 'AK', position: 'IP', action: 'bet', freq: 80, stackBb: 100,
        explanation: 'TPTK On A Dry Flop Is A Value Bet Spot. BET Is The Primary GTO Action At 80% Frequency. Top Pair Top Kicker Extracts Value From Worse Made Hands.',
        gtoApproach: 'On Dry Boards, Solver Bets TPTK At High Frequency For Value And Protection. Range Advantage Favors Aggression.',
        ev: '+1.25BB'
    },
    {
        id: 'flop-overpair-wet', hand: 'QQ', position: 'IP', action: 'bet', freq: 65, stackBb: 100,
        explanation: 'Overpair On A Wet Flop Is A Mixed Bet Spot. BET Is The Primary GTO Action At 65% Frequency. Queens Must Balance Value And Protection.',
        gtoApproach: 'On Wet Boards, Solver Bets Overpairs At Moderate Frequency. Some Checking Protects Range And Controls Pot.',
        ev: '+0.95BB'
    },
    {
        id: 'flop-middlepair-check', hand: '88', position: 'OOP', action: 'check', freq: 75, stackBb: 100,
        explanation: 'Middle Pair On The Flop OOP Is A Check Spot. CHECK Is The Primary GTO Action At 75% Frequency. Position Disadvantage Favors Pot Control.',
        gtoApproach: 'OOP With Middle Pair, Solver Checks At High Frequency. Betting Exposes Us To Raises And Tough Decisions.',
        ev: '+0.35BB'
    },

    // Fold Scenarios
    {
        id: 'fold-83o-utg', hand: '83o', position: 'UTG', action: 'fold', freq: 100, stackBb: 100,
        explanation: '83o Is A Trash Hand That Folds From UTG. FOLD Is The Only GTO Action. This Hand Has Zero Playability With No Flush, Straight, Or Pair Potential.',
        gtoApproach: 'Solver Never Opens 83o From Any Position. This Hand Is Pure Garbage With Negative EV.',
        ev: '-0.50BB'
    },
    {
        id: 'fold-j2o-btn', hand: 'J2o', position: 'BTN', action: 'fold', freq: 100, stackBb: 100,
        explanation: 'J2o Is A Weak Hand That Folds Even From BTN. FOLD Is The Only GTO Action. Offsuit Jack-Deuce Has No Playability.',
        gtoApproach: 'Solver Folds J2o Even From BTN. This Hand Is Too Weak To Open Profitably.',
        ev: '-0.25BB'
    },
];

// Title case converter with poker capitalization
function toPokerTitleCase(text) {
    // List of words that should be lowercase (unless first word)
    const lowercaseWords = ['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'vs', 'with', 'of', 'in'];

    // Poker abbreviations that should be ALL CAPS
    const pokerCaps = ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB', 'IP', 'OOP', 'GTO', 'EV', 'TPTK', 'AK', 'KK', 'QQ', 'JJ', 'TT', 'AA'];

    return text.split(' ').map((word, index) => {
        const upperWord = word.toUpperCase();

        // Check if it's a poker abbreviation
        if (pokerCaps.includes(upperWord)) {
            return upperWord;
        }

        // Check if it ends with BB (like 100BB, +0.25BB)
        if (/^\+?\-?\d+\.?\d*BB$/i.test(word)) {
            return word.replace(/bb$/i, 'BB');
        }

        // Check if first word or not a lowercase word
        if (index === 0 || !lowercaseWords.includes(word.toLowerCase())) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }

        return word.toLowerCase();
    }).join(' ');
}

// Generate alternate lines from Grok
async function generateAlternateLines(scenario) {
    const mainFrequency = scenario.freq;
    const remainingFrequency = 100 - mainFrequency;

    const systemPrompt = `You are generating Alternate Plays for a poker training scenario.
CRITICAL RULES:
1. Alternate Plays are COACHING suggestions, NOT GTO or solver-derived
2. You MUST NOT invent fake EV numbers
3. Keep advice concise and actionable (max 12 words per line)
4. The main GTO action is ${scenario.action.toUpperCase()} at ${mainFrequency}%
${remainingFrequency > 0 ? `5. The remaining ${remainingFrequency}% should be split among alternate lines` : '5. Since main action is 100%, alternates are coaching only - no frequencies'}

OUTPUT FORMAT (JSON only):
{
  "exploit": { ${remainingFrequency > 0 ? '"freq": number,' : ''} "advice": "string (max 12 words)" },
  "simplify": { ${remainingFrequency > 0 ? '"freq": number,' : ''} "advice": "string (max 12 words)" }
}`;

    const userPrompt = `Hand: ${scenario.hand} | Position: ${scenario.position} | Action: ${scenario.action.toUpperCase()} ${mainFrequency}% | Stack: ${scenario.stackBb}BB
Return JSON only.`;

    try {
        const response = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'grok-3-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 200
            })
        });

        if (!response.ok) {
            throw new Error(`Grok API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        // Parse JSON
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (error) {
        console.error(`  ⚠️  Grok error for ${scenario.id}: ${error.message}`);
    }

    // Fallback alternate lines
    return {
        exploit: { advice: 'Adjust Sizing Based On Opponent Tendencies' },
        simplify: { advice: 'Use Standard Sizing For Balanced Play' }
    };
}

// Build the image generation prompt (compact - max 1024 chars)
function buildPrompt(scenario, alternateLines) {
    const action = scenario.action.toUpperCase();
    const color = ACTION_COLORS[scenario.action] || 'green';
    const ev = scenario.ev;
    const exploitAdvice = (alternateLines.exploit?.advice || 'Adjust sizing').substring(0, 35);
    const simplifyAdvice = (alternateLines.simplify?.advice || 'Standard play').substring(0, 35);
    const shortExp = scenario.explanation.substring(0, 80);

    return `Futuristic metal poker HUD panel. Dark navy frame, silver borders, cyan glow.

HEADER: Jarvis robot avatar left, "${action}" in ${color} center with "${scenario.freq}%" badge, "Smarter Poker Data" right.

4 SECTIONS with metal frames:
1. Explanation: "${shortExp}..."
2. GTO Approach: Solver strategy for ${scenario.hand} ${scenario.position}
3. EV: "${ev}" in ${ev.startsWith('-') ? 'red' : 'green'} glow
4. Alternate Plays (Coaching): EXPLOIT "${exploitAdvice}" | SIMPLIFY "${simplifyAdvice}"

Premium Iron Man style. Reference template exactly.`;
}

// Main generation function
async function generatePanel(scenario, index, total) {
    console.log(`\n[${index + 1}/${total}] Generating: ${scenario.id}`);
    console.log(`  Hand: ${scenario.hand} | Position: ${scenario.position} | Action: ${scenario.action.toUpperCase()} ${scenario.freq}%`);

    // Get alternate lines from Grok
    console.log('  📡 Fetching alternate lines from Grok...');
    const alternateLines = await generateAlternateLines(scenario);
    console.log(`  ✅ EXPLOIT: ${alternateLines.exploit?.advice}`);
    console.log(`  ✅ SIMPLIFY: ${alternateLines.simplify?.advice}`);

    // Build prompt
    const prompt = buildPrompt(scenario, alternateLines);

    // Generate image via xAI (with template reference for style matching)
    console.log('  🎨 Generating panel image...');
    try {
        // Build request body with optional image reference
        const requestBody = {
            model: 'grok-2-image-1212',
            prompt: prompt,
            n: 1,
            response_format: 'b64_json'
        };

        // Add template image for image-to-image if available
        if (TEMPLATE_BASE64) {
            requestBody.image = `data:image/png;base64,${TEMPLATE_BASE64}`;
        }

        const response = await fetch('https://api.x.ai/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${XAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Image API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const b64Image = data.data?.[0]?.b64_json;

        if (!b64Image) {
            throw new Error('No image data in response');
        }

        // Save image
        const filename = `gto_${scenario.id}_${Date.now()}.png`;
        const filepath = path.join(OUTPUT_DIR, filename);
        fs.writeFileSync(filepath, Buffer.from(b64Image, 'base64'));

        console.log(`  ✅ Saved: ${filename}`);
        return { success: true, filename };

    } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// Main execution
async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  GTO PANEL AUTO-GENERATOR');
    console.log('  Template: Locked (Futuristic Metal + EXPLOIT/SIMPLIFY)');
    console.log('═══════════════════════════════════════════════════════════════');

    if (!XAI_API_KEY) {
        console.error('❌ XAI_API_KEY environment variable not set');
        process.exit(1);
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log(`\n📁 Output: ${OUTPUT_DIR}`);
    console.log(`📊 Scenarios: ${SCENARIOS.length}`);
    console.log(`⏱️  Delay: ${DELAY_BETWEEN_GENERATIONS}ms between generations\n`);

    const results = { success: 0, failed: 0, errors: [] };

    for (let i = 0; i < SCENARIOS.length; i++) {
        const scenario = SCENARIOS[i];
        const result = await generatePanel(scenario, i, SCENARIOS.length);

        if (result.success) {
            results.success++;
        } else {
            results.failed++;
            results.errors.push({ id: scenario.id, error: result.error });
        }

        // Delay between generations
        if (i < SCENARIOS.length - 1) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GENERATIONS));
        }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  GENERATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  ✅ Success: ${results.success}`);
    console.log(`  ❌ Failed: ${results.failed}`);

    if (results.errors.length > 0) {
        console.log('\n  Errors:');
        results.errors.forEach(e => console.log(`    - ${e.id}: ${e.error}`));
    }

    console.log(`\n  Total panels in folder: ${fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png')).length}`);
}

main().catch(console.error);
