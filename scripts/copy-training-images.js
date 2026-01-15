/**
 * Copy Training Images Script
 * Run with: node scripts/copy-training-images.js
 */
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = '/Users/smarter.poker/.gemini/antigravity/brain/ee340b6d-c7c4-4ca8-a008-3d90b8b0f5fd';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'images', 'training');

// Create output directory
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('📁 Created', OUTPUT_DIR);
}

// Image mappings: [source filename pattern, output filename]
const images = [
    ['mtt_push_fold_', 'mtt_push_fold.png'],
    ['mtt_icm_chart_', 'mtt_icm_chart.png'],
    ['mtt_bubble_tech_', 'mtt_bubble_tech.png'],
    ['mtt_final_table_', 'mtt_final_table.png'],
    ['mtt_pko_bounty_', 'mtt_pko_bounty.png'],
    ['mtt_satellite_', 'mtt_satellite.png'],
    ['mtt_icm_modern_', 'mtt_icm_modern.png'],
    ['mtt_short_stack_', 'mtt_short_stack.png'],
    ['mtt_resteal_', 'mtt_resteal.png'],
    ['mtt_squeeze_', 'mtt_squeeze.png'],
    ['mtt_allin_chips_', 'mtt_allin_chips.png'],
    ['mtt_boss_champion_', 'mtt_boss_champion.png'],
    ['mtt_ante_theft_', 'mtt_ante_theft.png'],
    ['mtt_headsup_', 'mtt_headsup.png'],
    ['mtt_ladder_jump_', 'mtt_ladder_jump.png'],
    ['mtt_button_warfare_', 'mtt_button_warfare.png'],
    ['cash_cbet_mastery_', 'cash_cbet_mastery.png'],
    ['cash_bluff_catcher_', 'cash_bluff_catcher.png'],
    ['cash_preflop_', 'cash_preflop.png'],
    ['cash_deep_stack_', 'cash_deep_stack.png'],
    ['cash_defense_tech_', 'cash_defense_tech.png'],
    ['cash_overbet_', 'cash_overbet.png'],
    ['cash_3bet_pots_', 'cash_3bet_pots.png'],
    ['cash_value_bet_', 'cash_value_bet.png'],
    ['cash_river_decision_', 'cash_river_decision.png'],
    ['cash_4bet_war_', 'cash_4bet_war.png'],
    ['cash_multiway_', 'cash_multiway.png'],
    ['cash_probe_bet_', 'cash_probe_bet.png'],
    ['cash_equity_denial_', 'cash_equity_denial.png'],
    ['spins_jackpot_', 'spins_jackpot.png'],
    ['spins_3max_', 'spins_3max.png'],
    ['spins_endgame_', 'spins_endgame.png'],
    ['spins_turbo_modern_', 'spins_turbo_modern.png'],
    ['spins_phase_shift_', 'spins_phase_shift.png'],
    ['spins_limp_trap_', 'spins_limp_trap.png'],
    ['psychology_zen_', 'psychology_zen.png'],
    ['psychology_focus_', 'psychology_focus.png'],
    ['psychology_brain_', 'psychology_brain.png'],
    ['psychology_pressure_', 'psychology_pressure.png'],
    ['psychology_variance_', 'psychology_variance.png'],
    ['psychology_tilt_control_', 'psychology_tilt_control.png'],
    ['psychology_session_', 'psychology_session.png'],
    ['advanced_solver_hi_', 'advanced_solver_hi.png'],
    ['advanced_blocker_tech_', 'advanced_blocker_tech.png'],
    ['advanced_ev_calc_', 'advanced_ev_calc.png'],
    ['advanced_range_chart_', 'advanced_range_chart.png'],
    ['advanced_gto_', 'advanced_gto.png'],
    ['advanced_node_lock_', 'advanced_node_lock.png'],
    ['advanced_mdf_', 'advanced_mdf.png'],
    ['advanced_polarity_', 'advanced_polarity.png'],
    ['advanced_exploit_', 'advanced_exploit.png'],
    ['advanced_spr_', 'advanced_spr.png'],
    ['mtt_big_stack_', 'mtt_big_stack.png'],
    ['mtt_3max_blitz_', 'mtt_3max_blitz.png'],
    ['cash_check_raise_', 'cash_check_raise.png'],
    ['spins_aggression_', 'spins_aggression.png'],
    ['psychology_confidence_', 'psychology_confidence.png'],
];

console.log('🎮 Copying training game artwork...\n');

let copied = 0;
const files = fs.readdirSync(ARTIFACT_DIR);

images.forEach(([pattern, outputName]) => {
    const sourceFile = files.find(f => f.startsWith(pattern) && f.endsWith('.png'));
    if (sourceFile) {
        const sourcePath = path.join(ARTIFACT_DIR, sourceFile);
        const destPath = path.join(OUTPUT_DIR, outputName);
        fs.copyFileSync(sourcePath, destPath);
        console.log(`  ✅ ${outputName}`);
        copied++;
    } else {
        console.log(`  ⚠️  Missing: ${pattern}*.png`);
    }
});

console.log(`\n🎮 Done! Copied ${copied}/${images.length} images to public/images/training/`);
console.log('🚀 Run "npm run dev" to see your training games with custom artwork!');
