/* ═══════════════════════════════════════════════════════════════════════════
   🔍 SCENARIO FILTER PANEL — Custom filtering for Memory Matrix scenarios
   Allows users to practice specific positions, stack depths, and formats
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
    Check,
    Layers3,
    MapPin,
    RotateCcw,
    SlidersHorizontal,
    Table2,
    X,
} from 'lucide-react';

// Filter options
const POSITION_OPTIONS = [
    { value: '', label: 'All Positions' },
    { value: 'UTG', label: 'UTG' },
    { value: 'UTG+1', label: 'UTG+1' },
    { value: 'MP', label: 'MP' },
    { value: 'LJ', label: 'LJ (Lojack)' },
    { value: 'HJ', label: 'HJ (Hijack)' },
    { value: 'CO', label: 'CO (Cutoff)' },
    { value: 'BTN', label: 'BTN (Button)' },
    { value: 'SB', label: 'SB (Small-Blind)' },
    { value: 'BB', label: 'BB (Big-Blind)' },
];

const STACK_DEPTH_OPTIONS = [
    { value: 0, label: 'All Stack Depths' },
    { value: 20, label: '20BB (Short)' },
    { value: 30, label: '30BB' },
    { value: 50, label: '50BB' },
    { value: 100, label: '100BB (Deep)' },
    { value: 200, label: '200BB (Very Deep)' },
];

const FORMAT_OPTIONS = [
    { value: '', label: 'All Formats' },
    { value: '6-max', label: '6-Max' },
    { value: '9-max', label: '9-Max' },
    { value: 'mtt', label: 'MTT (Tournament)' },
    { value: 'ante', label: 'With Ante' },
];

export default function ScenarioFilterPanel({
    onFilterChange,
    onClose,
    currentFilters = {},
    availableScenarios = 0,
    filteredCount = 0,
}) {
    const [position, setPosition] = useState(currentFilters.position || '');
    const [stackDepth, setStackDepth] = useState(currentFilters.stackDepth || 0);
    const [format, setFormat] = useState(currentFilters.format || '');

    const handleApply = () => {
        onFilterChange({
            position: position || null,
            stackDepth: stackDepth || null,
            format: format || null,
        });
    };

    const handleReset = () => {
        setPosition('');
        setStackDepth(0);
        setFormat('');
        onFilterChange({});
    };

    const hasFilters = Boolean(position || stackDepth || format);
    const appliedPosition = currentFilters.position || '';
    const appliedStackDepth = Number(currentFilters.stackDepth) || 0;
    const appliedFormat = currentFilters.format || '';
    const isDirty = position !== appliedPosition
        || stackDepth !== appliedStackDepth
        || format !== appliedFormat;
    const activeFilterCount = [position, stackDepth, format].filter(Boolean).length;

    const handleSubmit = (event) => {
        event.preventDefault();
        handleApply();
    };

    return (
        <motion.section
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="scenario-filter-console"
            aria-labelledby="scenario-filter-title"
            aria-describedby="scenario-filter-description"
            data-filter-state={isDirty ? 'draft' : hasFilters ? 'active' : 'idle'}
        >
            <div className="scenario-filter-header">
                <div className="scenario-filter-heading">
                    <span className="scenario-filter-kicker">
                        <SlidersHorizontal size={13} aria-hidden /> Range tuner
                    </span>
                    <h3 id="scenario-filter-title">Build a practice pool</h3>
                    <p id="scenario-filter-description">
                        Choose the table conditions you want to drill.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="scenario-filter-close"
                    aria-label="Close scenario filters"
                >
                    <X size={18} aria-hidden />
                </button>
            </div>

            <form onSubmit={handleSubmit}>
                <div className="scenario-filter-grid">
                    <div className="scenario-filter-field">
                        <label htmlFor="scenario-filter-position">
                            <MapPin size={14} aria-hidden /> Position
                        </label>
                        <span className="scenario-filter-field-note">Where you are seated</span>
                        <div className="scenario-filter-select-wrap">
                            <select
                                id="scenario-filter-position"
                                value={position}
                                onChange={(event) => setPosition(event.target.value)}
                            >
                                {POSITION_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="scenario-filter-field">
                        <label htmlFor="scenario-filter-stack-depth">
                            <Layers3 size={14} aria-hidden /> Stack depth
                        </label>
                        <span className="scenario-filter-field-note">Effective big blinds</span>
                        <div className="scenario-filter-select-wrap">
                            <select
                                id="scenario-filter-stack-depth"
                                value={stackDepth}
                                onChange={(event) => setStackDepth(parseInt(event.target.value, 10))}
                            >
                                {STACK_DEPTH_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="scenario-filter-field">
                        <label htmlFor="scenario-filter-format">
                            <Table2 size={14} aria-hidden /> Format
                        </label>
                        <span className="scenario-filter-field-note">Table size and structure</span>
                        <div className="scenario-filter-select-wrap">
                            <select
                                id="scenario-filter-format"
                                value={format}
                                onChange={(event) => setFormat(event.target.value)}
                            >
                                {FORMAT_OPTIONS.map(option => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="scenario-filter-readout">
                    <div className="scenario-filter-meter" aria-hidden="true">
                        <span>Practice pool</span>
                        <strong>{isDirty ? '—' : filteredCount}</strong>
                        <small>/ {availableScenarios}</small>
                    </div>
                    <div className="scenario-filter-summary">
                        <span className={position ? 'is-selected' : ''}>{position || 'Any position'}</span>
                        <span className={stackDepth ? 'is-selected' : ''}>{stackDepth ? `${stackDepth}BB` : 'Any stack'}</span>
                        <span className={format ? 'is-selected' : ''}>
                            {FORMAT_OPTIONS.find(option => option.value === format)?.label || 'Any format'}
                        </span>
                    </div>
                    <p className="scenario-filter-status" aria-live="polite">
                        {isDirty
                            ? `${activeFilterCount || 'No'} filter${activeFilterCount === 1 ? '' : 's'} ready to apply`
                            : hasFilters
                                ? `${filteredCount} of ${availableScenarios} scenarios match`
                                : `${availableScenarios} scenarios available`}
                    </p>
                </div>

                <div className="scenario-filter-actions">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="scenario-filter-reset"
                        disabled={!hasFilters}
                    >
                        <RotateCcw size={15} aria-hidden /> Reset
                    </button>
                    <button type="submit" className="scenario-filter-apply">
                        <Check size={16} aria-hidden /> Apply filters
                    </button>
                </div>
            </form>
        </motion.section>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTER SCENARIOS UTILITY
// ═══════════════════════════════════════════════════════════════════════════
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
            const idLower = (scenario.id || '').toLowerCase();

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
            }
        }

        return true;
    });
}
