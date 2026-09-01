import ScenarioFilterPanel, { filterScenarios } from '../../../games/ScenarioFilterPanel';

export default function MemoryGamesFilters({
    currentFilters = {},
    onFilterChange = () => {},
    onClose = () => {},
    availableScenarios = [],
}) {
    const scenarios = Array.isArray(availableScenarios) ? availableScenarios : [];

    return (
        <ScenarioFilterPanel
            onFilterChange={onFilterChange}
            onClose={onClose}
            currentFilters={currentFilters}
            availableScenarios={scenarios.length}
            filteredCount={filterScenarios(scenarios, currentFilters).length}
        />
    );
}
