const MODE_CATEGORIES = Object.freeze({
    gto: Object.freeze([
        'gto_theory',
        'gto_scenarios',
        'mtt_situations',
        'cash_game_situations',
        'icm_chip_ev',
    ]),
    mtt: Object.freeze(['mtt_situations']),
    cash: Object.freeze(['cash_game_situations']),
    icm: Object.freeze(['icm_chip_ev']),
});

const ALL_CATEGORIES = new Set(Object.values(MODE_CATEGORIES).flat());

export function isStrategyVisualCardMode(mode) {
    return typeof mode === 'string'
        && Object.prototype.hasOwnProperty.call(MODE_CATEGORIES, mode);
}

export function isStrategyVisualCardCategory(category) {
    return typeof category === 'string' && ALL_CATEGORIES.has(category);
}

export function canRenderStrategyVisualCard(mode, category) {
    return isStrategyVisualCardMode(mode)
        && typeof category === 'string'
        && MODE_CATEGORIES[mode].includes(category);
}

export const STRATEGY_VISUAL_CARD_MODE_CATEGORIES = MODE_CATEGORIES;
