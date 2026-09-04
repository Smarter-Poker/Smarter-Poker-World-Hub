/**
 * filterScenarios: the pure scenario filter, on its own so the Preflop Charts
 * menu can count matching scenarios without loading the filter PANEL.
 *
 * WHY (mobile phase 2): pages/hub/memory-games.js used to import
 * `filterScenarios` from ScenarioFilterPanel.jsx, and that file imports
 * framer-motion. The menu needs the count on first paint; it does not need the
 * panel (it is closed by default) or framer-motion. Splitting the utility out
 * lets the page keep the panel behind `dynamic()`.
 *
 * ScenarioFilterPanel.jsx re-exports this function, so older imports keep
 * working.
 */
export function filterScenarios(scenarios, filters = {}) {
    if (!filters || (!filters.position && !filters.stackDepth && !filters.format)) {
        return scenarios;
    }

    return scenarios.filter(scenario => {
        // Position filter
        if (filters.position && scenario.position !== filters.position) {
            return false;
        }

        // Stack depth filter
        if (filters.stackDepth && scenario.stackDepth !== filters.stackDepth) {
            return false;
        }

        // Format filter (check title for keywords)
        if (filters.format) {
            const titleLower = (scenario.title || '').toLowerCase();

            switch (filters.format) {
                case '6-max':
                    if (!titleLower.includes('6-max') && !titleLower.includes('6max')) return false;
                    break;
                case '9-max':
                    // Default format is 9-max if not specified
                    if (titleLower.includes('6-max') || titleLower.includes('6max') || titleLower.includes('mtt')) return false;
                    break;
                case 'mtt':
                    if (!titleLower.includes('mtt') && !titleLower.includes('tournament')) return false;
                    break;
                case 'ante':
                    if (!titleLower.includes('ante')) return false;
                    break;
                default:
                    break;
            }
        }

        return true;
    });
}

export default filterScenarios;
