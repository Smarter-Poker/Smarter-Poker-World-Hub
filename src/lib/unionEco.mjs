const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = value => typeof value === 'number' && Number.isFinite(value) &&
    Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 0.00001;

/** Preserve historical combined totals; never invent their missing split. */
export function unionEcoComponents(value, { recorded = false } = {}) {
    if (value?.eco_version !== 2 || !Array.isArray(value.eco_components) || value.eco_components.length !== 2 || !money(value.eco_amount)) return null;
    const components = value.eco_components;
    const activities = new Set();
    for (const c of components) {
        if (!c || !['cash', 'tournament'].includes(c.activity) || activities.has(c.activity) ||
            typeof c.enabled !== 'boolean' || c.base_mode !== 'club_profit' || !money(c.base) || !money(c.amount) ||
            typeof c.rate !== 'number' || !Number.isFinite(c.rate) || c.rate < 0 || c.rate > 1 ||
            !UUID.test(c.terms_id || '') || !['preview', 'recorded'].includes(c.status) ||
            (recorded && c.status !== 'recorded') ||
            (c.status === 'recorded' ? !UUID.test(c.record_id || '') : c.record_id !== null)) return null;
        activities.add(c.activity);
        const expected = c.enabled ? -c.base * c.rate : 0;
        const expectedCents = Math.sign(expected) * Math.round(Math.abs(expected) * 100 + 1e-8);
        if (Math.round(c.amount * 100) !== expectedCents) return null;
    }
    if (components.every(c => c.status === 'recorded') && components[0].record_id === components[1].record_id) return null;
    if (components[0].status !== components[1].status) return null;
    if (Math.round(value.eco_amount * 100) !== components.reduce((sum, c) => sum + Math.round(c.amount * 100), 0)) return null;
    return ['cash', 'tournament'].map(activity => components.find(c => c.activity === activity));
}

export function unionEcoRows(value, options) {
    const components = unionEcoComponents(value, options);
    return ['cash', 'tournament'].map((activity, index) => ({
        label: activity === 'cash' ? 'Cash ECO' : 'Tournament ECO',
        amount: components ? components[index].amount : null,
        detail: components ? `${(components[index].rate * 100).toFixed(1)}% Of ${components[index].base.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Club Profit / Loss${components[index].enabled ? '' : ' (Disabled)'}` : 'Separate ECO Details Unavailable',
    }));
}
