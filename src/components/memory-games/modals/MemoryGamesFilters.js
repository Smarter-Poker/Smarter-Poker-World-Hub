import React from 'react';

export default function MemoryGamesFilters({
filterPos, setFilterPos, filterAction, setFilterAction, filterStack, setFilterStack
}) {
    return (
        <ScenarioFilterPanel
                                            onFilterChange={(filters) => {
                                                setScenarioFilters(filters);
                                            }}
                                            onClose={() => setShowFilters(false)}
                                            currentFilters={scenarioFilters}
                                            availableScenarios={(() => {
                                                const allScenarios = [
                                                    ...LEVEL_1_SCENARIOS,
                                                    ...LEVEL_2_SCENARIOS,
                                                    ...LEVEL_3_SCENARIOS,
                                                    ...LEVEL_4_SCENARIOS,
                                                    ...LEVEL_5_SCENARIOS,
                                                    ...LEVEL_6_SCENARIOS,
                                                    ...LEVEL_7_SCENARIOS,
                                                    ...LEVEL_8_SCENARIOS,
                                                    ...LEVEL_9_SCENARIOS,
                                                    ...LEVEL_10_SCENARIOS,
                                                ];
                                                return allScenarios.length;
                                            })()}
                                            filteredCount={(() => {
                                                const allScenarios = [
                                                    ...LEVEL_1_SCENARIOS,
                                                    ...LEVEL_2_SCENARIOS,
                                                    ...LEVEL_3_SCENARIOS,
                                                    ...LEVEL_4_SCENARIOS,
                                                    ...LEVEL_5_SCENARIOS,
                                                    ...LEVEL_6_SCENARIOS,
                                                    ...LEVEL_7_SCENARIOS,
                                                    ...LEVEL_8_SCENARIOS,
                                                    ...LEVEL_9_SCENARIOS,
                                                    ...LEVEL_10_SCENARIOS,
                                                ];
                                                return filterScenarios(allScenarios, scenarioFilters).length;
                                            })()}
                                        />
    );
}
