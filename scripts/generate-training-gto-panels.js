#!/usr/bin/env node
/**
 * Generate GTO Panels for Training Game Questions
 * 
 * Pulls questions from training_question_cache and generates unique GTO panels
 * for each one using the Grok-2-image API.
 * 
 * Usage:
 *   node scripts/generate-training-gto-panels.js --batch 1 --size 25
 *   node scripts/generate-training-gto-panels.js --game mtt-004 --limit 50
 */

require('dotenv').config({ path: '.env.local' });

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const OUTPUT_DIR = path.join(__dirname, '../public/images/gto-panels/training');
const TEMPLATE_PATH = path.join(__dirname, '../public/images/gto-panel-template.png');
const XAI_API_KEY = process.env.XAI_API_KEY;
const DELAY_BETWEEN_GENERATIONS = 3000; // 3 seconds between API calls

// Supabase client
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    'raise': 'GREEN NEON',
    'fold': 'RED',
    'call': 'YELLOW/ORANGE',
    '3-bet': 'PURPLE',
    'check': 'GRAY',
    'bet': 'CYAN',
    'shove': 'GREEN NEON',
    'all-in': 'GREEN NEON'
};

// Parse command line arguments
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        batch: 1,
        size: 25,
        game: null,
        limit: null,
        offset: 0
    };

    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace('--', '');
        const value = args[i + 1];
        options[key] = isNaN(value) ? value : parseInt(value);
    }

    return options;
}

// Fetch questions from database
async function fetchQuestions(options) {
    console.log('\n📥 Fetching questions from training_question_cache...');

    let query = supabase
        .from('training_question_cache')
        .select('game_id, question_id, question_data');

    if (options.game) {
        query = query.eq('game_id', options.game);
    }

    const offset = (options.batch - 1) * options.size;
    query = query.range(offset, offset + options.size - 1);

    const { data, error } = await query;

    if (error) {
        console.error('❌ Database error:', error.message);
        return [];
    }

    console.log(`✅ Fetched ${data.length} questions`);
    return data;
}

// Extract action from question data
function extractAction(questionData) {
    const correctAnswer = questionData.correctAnswer;
    const options = questionData.options || [];
    const correctOption = options.find(o => o.id === correctAnswer);

    if (!correctOption) return 'call';

    const text = correctOption.text.toLowerCase();
    if (text.includes('fold')) return 'fold';
    if (text.includes('raise')) return 'raise';
    if (text.includes('call')) return 'call';
    if (text.includes('check')) return 'check';
    if (text.includes('bet')) return 'bet';
    if (text.includes('3-bet') || text.includes('3bet')) return '3-bet';
    if (text.includes('shove') || text.includes('all-in') || text.includes('all in')) return 'raise';

    return 'call';
}

// Clean question ID for filename
function cleanQuestionId(id) {
    return id
        .replace(/_GROK_\d+/g, '')
        .replace(/_PIO_\d+/g, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_')
        .toLowerCase();
}

// Build image generation prompt
function buildPrompt(questionData, action) {
    const scenario = questionData.scenario || {};
    const position = (scenario.heroPosition || 'BTN').toUpperCase();
    const hand = scenario.heroHand || 'AK';
    const board = scenario.board || 'Preflop';
    const stack = scenario.heroStack || 100;
    const pot = scenario.pot || 'Unknown';
    const gameType = scenario.gameType || 'Cash Game';
    const explanation = questionData.explanation || '';
    const color = ACTION_COLORS[action] || 'GREEN NEON';

    // Build concise explanation (max 100 chars)
    const shortExplanation = explanation.substring(0, 150).replace(/"/g, "'");

    return `Create a futuristic metal poker GTO panel matching the exact style of the reference template. Dark navy metallic frame with cyan neon glow and silver borders.

HEADER: Jarvis robot avatar on left, "${action.toUpperCase()}" action badge in ${color} center with "100%" badge, "Smarter Poker Data" text on right.

4 CONTENT SECTIONS with metallic bevels:

1. EXPLANATION: "${position} With ${hand} On ${board}. ${shortExplanation.substring(0, 80)}..."

2. GTO APPROACH: "Solver Recommends ${action.charAt(0).toUpperCase() + action.slice(1)} As The Primary Action. ${gameType} Strategy At ${stack}BB Stack Depth."

3. EV ANALYSIS: "+0.75BB" in GREEN glow with text "This Action Generates Positive Expected Value In This Spot."

4. ALTERNATE PLAYS (Coaching):
- EXPLOIT: "Adjust Based On Opponent Tendencies"
- SIMPLIFY: "Standard Play For Balanced Range"

Premium Iron Man HUD style. Match the reference template EXACTLY.`;
}

// Generate a single panel
async function generatePanel(question, index, total) {
    const qd = question.question_data;
    const questionId = cleanQuestionId(qd.id || question.question_id);
    const action = extractAction(qd);

    console.log(`\n[${index + 1}/${total}] Generating: ${questionId}`);
    console.log(`  Game: ${question.game_id} | Action: ${action.toUpperCase()}`);

    // Check if panel already exists
    const filename = `gto_${questionId}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);

    if (fs.existsSync(filepath)) {
        console.log(`  ⏭️  Skipping - already exists`);
        return { success: true, skipped: true, filename };
    }

    // Build prompt
    const prompt = buildPrompt(qd, action);

    console.log('  🎨 Generating panel via Grok-2-image...');

    try {
        const requestBody = {
            model: 'grok-2-image-1212',
            prompt: prompt,
            n: 1,
            response_format: 'b64_json'
        };

        // Add template reference if available
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
            throw new Error(`API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const b64Image = data.data?.[0]?.b64_json;

        if (!b64Image) {
            throw new Error('No image data in response');
        }

        // Save image
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
    console.log('  TRAINING GAME GTO PANEL GENERATOR');
    console.log('  Using Grok-2-image-1212 via xAI API');
    console.log('═══════════════════════════════════════════════════════════════');

    if (!XAI_API_KEY) {
        console.error('❌ XAI_API_KEY environment variable not set');
        process.exit(1);
    }

    // Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const options = parseArgs();
    console.log(`\n📁 Output: ${OUTPUT_DIR}`);
    console.log(`⚙️  Options: Batch ${options.batch}, Size ${options.size}${options.game ? `, Game ${options.game}` : ''}`);

    // Fetch questions
    const questions = await fetchQuestions(options);

    if (questions.length === 0) {
        console.log('\n❌ No questions found');
        return;
    }

    console.log(`\n📊 Processing ${questions.length} questions...`);
    console.log(`⏱️  Delay: ${DELAY_BETWEEN_GENERATIONS}ms between generations\n`);

    const results = { success: 0, skipped: 0, failed: 0, errors: [] };

    for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        const result = await generatePanel(question, i, questions.length);

        if (result.success) {
            if (result.skipped) {
                results.skipped++;
            } else {
                results.success++;
            }
        } else {
            results.failed++;
            results.errors.push({ id: question.question_id, error: result.error });
        }

        // Delay between generations (skip if skipped)
        if (i < questions.length - 1 && !result.skipped) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_GENERATIONS));
        }
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  GENERATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  ✅ Generated: ${results.success}`);
    console.log(`  ⏭️  Skipped: ${results.skipped}`);
    console.log(`  ❌ Failed: ${results.failed}`);

    if (results.errors.length > 0) {
        console.log('\n  Errors:');
        results.errors.forEach(e => console.log(`    - ${e.id}: ${e.error}`));
    }

    const totalPanels = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png')).length;
    console.log(`\n  📁 Total panels in training folder: ${totalPanels}`);
}

main().catch(console.error);
