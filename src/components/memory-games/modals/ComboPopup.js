import React from 'react';

export default function ComboPopup({
comboName, C
}) {
    return (
        <div style={styles.comboOverlay}>
                        <div style={styles.comboText}>{comboName}</div>
                        <div style={styles.multiplierText}>{multiplier}x MULTIPLIER</div>
                    </div>
    );
}
