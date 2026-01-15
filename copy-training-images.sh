#!/bin/bash
# Copy Training Game Images to Public Folder
# Run this script from the hub-vanguard directory

echo "📁 Creating training images directory..."
mkdir -p public/images/training

echo "🎮 Copying game artwork..."

# Copy all generated game images from the artifacts folder
ARTIFACT_DIR="/Users/smarter.poker/.gemini/antigravity/brain/ee340b6d-c7c4-4ca8-a008-3d90b8b0f5fd"

# Copy and rename images to match GAME_IMAGES.js mappings
cp "$ARTIFACT_DIR/mtt_push_fold_1768473659041.png" "public/images/training/mtt_push_fold.png"
cp "$ARTIFACT_DIR/mtt_icm_chart_1768473675367.png" "public/images/training/mtt_icm_chart.png"
cp "$ARTIFACT_DIR/mtt_bubble_tech_1768474278825.png" "public/images/training/mtt_bubble_tech.png"
cp "$ARTIFACT_DIR/mtt_final_table_1768473690782.png" "public/images/training/mtt_final_table.png"
cp "$ARTIFACT_DIR/mtt_pko_bounty_1768473855406.png" "public/images/training/mtt_pko_bounty.png"
cp "$ARTIFACT_DIR/mtt_satellite_1768473930015.png" "public/images/training/mtt_satellite.png"
cp "$ARTIFACT_DIR/mtt_icm_modern_1768474215194.png" "public/images/training/mtt_icm_modern.png"
cp "$ARTIFACT_DIR/mtt_short_stack_1768474090442.png" "public/images/training/mtt_short_stack.png"
cp "$ARTIFACT_DIR/mtt_resteal_1768474420237.png" "public/images/training/mtt_resteal.png"
cp "$ARTIFACT_DIR/mtt_squeeze_1768474360112.png" "public/images/training/mtt_squeeze.png"
cp "$ARTIFACT_DIR/mtt_allin_chips_1768474153942.png" "public/images/training/mtt_allin_chips.png"
cp "$ARTIFACT_DIR/mtt_boss_champion_1768474016422.png" "public/images/training/mtt_boss_champion.png"
cp "$ARTIFACT_DIR/mtt_ante_theft_1768474742868.png" "public/images/training/mtt_ante_theft.png"
cp "$ARTIFACT_DIR/mtt_headsup_1768474867213.png" "public/images/training/mtt_headsup.png"
cp "$ARTIFACT_DIR/mtt_ladder_jump_1768475024135.png" "public/images/training/mtt_ladder_jump.png"

# Cash game images
cp "$ARTIFACT_DIR/cash_cbet_mastery_1768473717070.png" "public/images/training/cash_cbet_mastery.png"
cp "$ARTIFACT_DIR/cash_bluff_catcher_1768473730824.png" "public/images/training/cash_bluff_catcher.png"
cp "$ARTIFACT_DIR/cash_preflop_1768473871340.png" "public/images/training/cash_preflop.png"
cp "$ARTIFACT_DIR/cash_deep_stack_1768473958456.png" "public/images/training/cash_deep_stack.png"
cp "$ARTIFACT_DIR/cash_defense_tech_1768474295853.png" "public/images/training/cash_defense_tech.png"
cp "$ARTIFACT_DIR/cash_overbet_1768474405359.png" "public/images/training/cash_overbet.png"
cp "$ARTIFACT_DIR/cash_3bet_pots_1768474104919.png" "public/images/training/cash_3bet_pots.png"
cp "$ARTIFACT_DIR/cash_value_bet_1768474169274.png" "public/images/training/cash_value_bet.png"
cp "$ARTIFACT_DIR/cash_river_decision_1768474031034.png" "public/images/training/cash_river_decision.png"
cp "$ARTIFACT_DIR/cash_4bet_war_1768474757989.png" "public/images/training/cash_4bet_war.png"
cp "$ARTIFACT_DIR/cash_multiway_1768474834915.png" "public/images/training/cash_multiway.png"
cp "$ARTIFACT_DIR/cash_probe_bet_1768474882145.png" "public/images/training/cash_probe_bet.png"

# Spins images
cp "$ARTIFACT_DIR/spins_jackpot_1768473745950.png" "public/images/training/spins_jackpot.png"
cp "$ARTIFACT_DIR/spins_3max_1768473973151.png" "public/images/training/spins_3max.png"
cp "$ARTIFACT_DIR/spins_endgame_1768474374781.png" "public/images/training/spins_endgame.png"
cp "$ARTIFACT_DIR/spins_turbo_modern_1768474230915.png" "public/images/training/spins_turbo_modern.png"
cp "$ARTIFACT_DIR/spins_phase_shift_1768474819798.png" "public/images/training/spins_phase_shift.png"

# Psychology images
cp "$ARTIFACT_DIR/psychology_zen_1768473898588.png" "public/images/training/psychology_zen.png"
cp "$ARTIFACT_DIR/psychology_focus_1768474343656.png" "public/images/training/psychology_focus.png"
cp "$ARTIFACT_DIR/psychology_brain_1768474184000.png" "public/images/training/psychology_brain.png"
cp "$ARTIFACT_DIR/psychology_pressure_1768474075369.png" "public/images/training/psychology_pressure.png"
cp "$ARTIFACT_DIR/psychology_variance_1768474772384.png" "public/images/training/psychology_variance.png"
cp "$ARTIFACT_DIR/psychology_tilt_control_1768474993884.png" "public/images/training/psychology_tilt_control.png"

# Advanced images
cp "$ARTIFACT_DIR/advanced_solver_hi_1768474046424.png" "public/images/training/advanced_solver_hi.png"
cp "$ARTIFACT_DIR/advanced_blocker_tech_1768474438697.png" "public/images/training/advanced_blocker_tech.png"
cp "$ARTIFACT_DIR/advanced_ev_calc_1768474310773.png" "public/images/training/advanced_ev_calc.png"
cp "$ARTIFACT_DIR/advanced_range_chart_1768474244968.png" "public/images/training/advanced_range_chart.png"
cp "$ARTIFACT_DIR/advanced_gto_1768473988116.png" "public/images/training/advanced_gto.png"
cp "$ARTIFACT_DIR/advanced_node_lock_1768474804093.png" "public/images/training/advanced_node_lock.png"
cp "$ARTIFACT_DIR/advanced_mdf_1768474897130.png" "public/images/training/advanced_mdf.png"
cp "$ARTIFACT_DIR/advanced_polarity_1768475008969.png" "public/images/training/advanced_polarity.png"
cp "$ARTIFACT_DIR/advanced_exploit_1768475373550.png" "public/images/training/advanced_exploit.png"

# Additional images
cp "$ARTIFACT_DIR/spins_limp_trap_1768475341313.png" "public/images/training/spins_limp_trap.png"
cp "$ARTIFACT_DIR/psychology_session_1768475357605.png" "public/images/training/psychology_session.png"
cp "$ARTIFACT_DIR/cash_equity_denial_1768475086524.png" "public/images/training/cash_equity_denial.png"
cp "$ARTIFACT_DIR/mtt_button_warfare_1768475103020.png" "public/images/training/mtt_button_warfare.png"
cp "$ARTIFACT_DIR/spins_phase_shift_1768474819798.png" "public/images/training/spins_phase_shift.png"
cp "$ARTIFACT_DIR/spins_jackpot_wide_1768474962442.png" "public/images/training/spins_jackpot_wide.png"
cp "$ARTIFACT_DIR/mtt_pushfold_wide_1768474930112.png" "public/images/training/mtt_pushfold_wide.png"
cp "$ARTIFACT_DIR/cash_cbet_wide_1768474945688.png" "public/images/training/cash_cbet_wide.png"

echo "✅ Done! Copied $(ls -1 public/images/training/*.png 2>/dev/null | wc -l) images to public/images/training/"
echo ""
echo "🚀 Run 'npm run dev' to see your training games with custom artwork!"
