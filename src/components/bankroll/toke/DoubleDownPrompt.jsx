/**
 * DOUBLE DOWN PROMPT
 * ═══════════════════════════════════════════════════════════════
 * 35-min timer prompt asking "Same table — Double Down?"
 * Extracted from TokeTracker.jsx for maintainability.
 * ═══════════════════════════════════════════════════════════════
 */

import React, { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const DOWN_TYPE_LABELS = {
    cash: 'Cash Game',
    tournament: 'Tournament',
    break: 'On Break',
    brush: 'Brush',
};

function DoubleDownPrompt({ show, promptDown, onYes, onNo, styles }) {
    if (!show || !promptDown) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={styles.modalOverlay}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                    style={styles.promptCard}
                >
                    <div style={styles.promptIcon}>35m</div>
                    <h3 style={styles.promptTitle}>
                        {promptDown.down_type === 'break' ? 'Still On Break?' :
                            promptDown.down_type === 'brush' ? 'Still Brushing?' :
                                'Same Table — Double Down?'}
                    </h3>
                    <p style={styles.promptSub}>
                        {promptDown.down_type === 'break' ? 'Your break has been going 35 minutes.' :
                            promptDown.down_type === 'brush' ? 'Your brush down has been 35 minutes.' : (
                                <>
                                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>
                                        {promptDown.game_type || DOWN_TYPE_LABELS[promptDown.down_type]}
                                        {promptDown.table_number ? ` · Table ${promptDown.table_number}` : ''}
                                    </span>
                                    {' — still at this table after 35 minutes?'}
                                </>
                            )}
                    </p>
                    <div style={styles.promptActions}>
                        <button onClick={onYes} style={styles.promptYesBtn}>
                            Yes, Double Down
                        </button>
                        <button onClick={onNo} style={styles.promptNoBtn}>
                            No, New Down
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default memo(DoubleDownPrompt);
