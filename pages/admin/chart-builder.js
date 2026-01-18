/**
 * Chart Builder - Admin Interface
 * Visual 13x13 grid painter for creating preflop range charts
 */

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import {
    generateHandMatrix,
    getHandAtPosition,
    getActionColor,
    RANKS
} from '../../src/utils/poker-grid';
import {
    getAllCharts,
    createChart,
    updateChart,
    deleteChart,
    chartNameExists
} from '../../src/services/chart-service';

const ACTIONS = ['Fold', 'Call', 'Raise'];

export default function ChartBuilder() {
    const router = useRouter();

    // Chart metadata
    const [chartName, setChartName] = useState('');
    const [category, setCategory] = useState('Preflop');
    const [position, setPosition] = useState('');
    const [stackDepth, setStackDepth] = useState(100);
    const [topology, setTopology] = useState('9-Max');

    // Grid state
    const [chartGrid, setChartGrid] = useState({});
    const [selectedAction, setSelectedAction] = useState('Raise');
    const [isMouseDown, setIsMouseDown] = useState(false);

    // UI state
    const [existingCharts, setExistingCharts] = useState([]);
    const [editingChartId, setEditingChartId] = useState(null);
    const [saveStatus, setSaveStatus] = useState('');
    const [loading, setLoading] = useState(false);

    // Load existing charts on mount
    useEffect(() => {
        loadCharts();
    }, []);

    const loadCharts = async () => {
        const { data, error } = await getAllCharts();
        if (!error && data) {
            setExistingCharts(data);
        }
    };

    // Handle cell click/drag painting
    const handleCellAction = useCallback((row, col) => {
        const hand = getHandAtPosition(row, col);
        if (!hand) return;

        setChartGrid(prev => {
            const newGrid = { ...prev };

            if (selectedAction === 'Fold') {
                // Remove from grid (fold is default)
                delete newGrid[hand];
            } else {
                // Add/update action
                newGrid[hand] = {
                    action: selectedAction,
                    freq: 1.0,
                    size: selectedAction === 'Raise' ? '3bb' : undefined
                };
            }

            return newGrid;
        });
    }, [selectedAction]);

    const handleMouseDown = (row, col) => {
        setIsMouseDown(true);
        handleCellAction(row, col);
    };

    const handleMouseEnter = (row, col) => {
        if (isMouseDown) {
            handleCellAction(row, col);
        }
    };

    const handleMouseUp = () => {
        setIsMouseDown(false);
    };

    // Save chart
    const handleSave = async () => {
        if (!chartName.trim()) {
            setSaveStatus('Error: Chart name is required');
            return;
        }

        if (Object.keys(chartGrid).length === 0) {
            setSaveStatus('Error: Chart grid cannot be empty');
            return;
        }

        // Check for duplicate name
        const exists = await chartNameExists(chartName, editingChartId);
        if (exists) {
            setSaveStatus('Error: Chart name already exists');
            return;
        }

        setLoading(true);
        setSaveStatus('Saving...');

        const chartData = {
            chart_name: chartName,
            category,
            chart_grid: chartGrid,
            stack_depth: stackDepth || null,
            topology: topology || null,
            position: position || null
        };

        let result;
        if (editingChartId) {
            result = await updateChart(editingChartId, chartData);
        } else {
            result = await createChart(chartData);
        }

        setLoading(false);

        if (result.error) {
            setSaveStatus(`Error: ${result.error.message}`);
        } else {
            setSaveStatus(`✓ Chart ${editingChartId ? 'updated' : 'created'} successfully!`);
            loadCharts();

            // Clear form after 2 seconds
            setTimeout(() => {
                handleNewChart();
                setSaveStatus('');
            }, 2000);
        }
    };

    // Load chart for editing
    const handleEditChart = (chart) => {
        setChartName(chart.chart_name);
        setCategory(chart.category);
        setChartGrid(chart.chart_grid || {});
        setStackDepth(chart.stack_depth || 100);
        setTopology(chart.topology || '9-Max');
        setPosition(chart.position || '');
        setEditingChartId(chart.id);
        setSaveStatus('');

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Delete chart
    const handleDeleteChart = async (id, name) => {
        if (!confirm(`Delete chart "${name}"?`)) return;

        const { error } = await deleteChart(id);
        if (!error) {
            setSaveStatus('✓ Chart deleted');
            loadCharts();
            if (editingChartId === id) {
                handleNewChart();
            }
        } else {
            setSaveStatus(`Error: ${error.message}`);
        }
    };

    // Clear form
    const handleNewChart = () => {
        setChartName('');
        setCategory('Preflop');
        setChartGrid({});
        setStackDepth(100);
        setTopology('9-Max');
        setPosition('');
        setEditingChartId(null);
        setSaveStatus('');
    };

    // Clear grid
    const handleClearGrid = () => {
        if (confirm('Clear entire grid?')) {
            setChartGrid({});
        }
    };

    // Render grid
    const renderGrid = () => {
        const matrix = generateHandMatrix();

        return (
            <div
                style={styles.gridContainer}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                {/* Column headers */}
                <div style={styles.gridHeader}>
                    <div style={styles.cornerCell}></div>
                    {RANKS.map(rank => (
                        <div key={rank} style={styles.headerCell}>{rank}</div>
                    ))}
                </div>

                {/* Grid rows */}
                {matrix.map((row, rowIdx) => (
                    <div key={rowIdx} style={styles.gridRow}>
                        {/* Row header */}
                        <div style={styles.headerCell}>{RANKS[rowIdx]}</div>

                        {/* Cells */}
                        {row.map((hand, colIdx) => {
                            const cellData = chartGrid[hand];
                            const action = cellData?.action || 'Fold';
                            const colors = getActionColor(action);
                            const isPair = rowIdx === colIdx;

                            return (
                                <div
                                    key={hand}
                                    style={{
                                        ...styles.gridCell,
                                        background: colors.bg,
                                        borderColor: colors.border,
                                        fontWeight: isPair ? 900 : 600
                                    }}
                                    onMouseDown={() => handleMouseDown(rowIdx, colIdx)}
                                    onMouseEnter={() => handleMouseEnter(rowIdx, colIdx)}
                                >
                                    <div style={{ fontSize: 11, color: '#fff' }}>{hand}</div>
                                    {action !== 'Fold' && (
                                        <div style={{ fontSize: 8, color: colors.text, marginTop: 2 }}>
                                            {action.toUpperCase()}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            <Head>
                <title>Chart Builder | Smarter Poker Admin</title>
            </Head>

            <div style={styles.container}>
                {/* Header */}
                <div style={styles.header}>
                    <button onClick={() => router.push('/hub')} style={styles.backButton}>
                        ← Back to Hub
                    </button>
                    <h1 style={styles.title}>📊 Chart Builder</h1>
                    <div style={{ width: 100 }}></div>
                </div>

                {/* Main content */}
                <div style={styles.content}>
                    {/* Left panel: Grid */}
                    <div style={styles.leftPanel}>
                        <div style={styles.section}>
                            <div style={styles.sectionHeader}>
                                <h2 style={styles.sectionTitle}>Range Grid</h2>
                                <button onClick={handleClearGrid} style={styles.clearButton}>
                                    Clear Grid
                                </button>
                            </div>

                            {/* Action selector */}
                            <div style={styles.actionSelector}>
                                {ACTIONS.map(action => {
                                    const colors = getActionColor(action);
                                    const isSelected = selectedAction === action;

                                    return (
                                        <button
                                            key={action}
                                            onClick={() => setSelectedAction(action)}
                                            style={{
                                                ...styles.actionButton,
                                                background: isSelected ? colors.bg : 'rgba(255,255,255,0.05)',
                                                borderColor: isSelected ? colors.border : 'rgba(255,255,255,0.2)',
                                                color: isSelected ? colors.text : 'rgba(255,255,255,0.6)'
                                            }}
                                        >
                                            {action}
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={styles.gridInstructions}>
                                Click or drag to paint ranges. Selected action: <strong>{selectedAction}</strong>
                            </div>

                            {renderGrid()}
                        </div>
                    </div>

                    {/* Right panel: Form & Charts */}
                    <div style={styles.rightPanel}>
                        {/* Chart metadata form */}
                        <div style={styles.section}>
                            <h2 style={styles.sectionTitle}>
                                {editingChartId ? '✏️ Edit Chart' : '➕ New Chart'}
                            </h2>

                            <div style={styles.form}>
                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Chart Name *</label>
                                    <input
                                        type="text"
                                        value={chartName}
                                        onChange={(e) => setChartName(e.target.value)}
                                        placeholder="e.g., UTG_Open_100bb_9Max"
                                        style={styles.input}
                                    />
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Category *</label>
                                    <select
                                        value={category}
                                        onChange={(e) => setCategory(e.target.value)}
                                        style={styles.select}
                                    >
                                        <option value="Preflop">Preflop</option>
                                        <option value="PushFold">PushFold</option>
                                        <option value="Nash">Nash</option>
                                    </select>
                                </div>

                                <div style={styles.formRow}>
                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Position</label>
                                        <input
                                            type="text"
                                            value={position}
                                            onChange={(e) => setPosition(e.target.value)}
                                            placeholder="e.g., UTG, BTN"
                                            style={styles.input}
                                        />
                                    </div>

                                    <div style={styles.formGroup}>
                                        <label style={styles.label}>Stack (BB)</label>
                                        <input
                                            type="number"
                                            value={stackDepth}
                                            onChange={(e) => setStackDepth(parseInt(e.target.value))}
                                            style={styles.input}
                                        />
                                    </div>
                                </div>

                                <div style={styles.formGroup}>
                                    <label style={styles.label}>Topology</label>
                                    <select
                                        value={topology}
                                        onChange={(e) => setTopology(e.target.value)}
                                        style={styles.select}
                                    >
                                        <option value="HU">Heads Up</option>
                                        <option value="3-Max">3-Max</option>
                                        <option value="6-Max">6-Max</option>
                                        <option value="9-Max">9-Max</option>
                                    </select>
                                </div>

                                <div style={styles.formActions}>
                                    <button
                                        onClick={handleSave}
                                        disabled={loading}
                                        style={styles.saveButton}
                                    >
                                        {loading ? 'Saving...' : editingChartId ? 'Update Chart' : 'Save Chart'}
                                    </button>

                                    {editingChartId && (
                                        <button onClick={handleNewChart} style={styles.cancelButton}>
                                            Cancel
                                        </button>
                                    )}
                                </div>

                                {saveStatus && (
                                    <div style={{
                                        ...styles.statusMessage,
                                        color: saveStatus.startsWith('Error') ? '#ff4444' : '#00ff88'
                                    }}>
                                        {saveStatus}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Existing charts list */}
                        <div style={styles.section}>
                            <h2 style={styles.sectionTitle}>Saved Charts ({existingCharts.length})</h2>

                            <div style={styles.chartsList}>
                                {existingCharts.length === 0 ? (
                                    <div style={styles.emptyState}>No charts created yet</div>
                                ) : (
                                    existingCharts.map(chart => (
                                        <div
                                            key={chart.id}
                                            style={{
                                                ...styles.chartItem,
                                                borderColor: editingChartId === chart.id ? '#00D4FF' : 'rgba(255,255,255,0.1)'
                                            }}
                                        >
                                            <div style={styles.chartInfo}>
                                                <div style={styles.chartName}>{chart.chart_name}</div>
                                                <div style={styles.chartMeta}>
                                                    <span style={styles.chartBadge}>{chart.category}</span>
                                                    {chart.position && <span>• {chart.position}</span>}
                                                    {chart.stack_depth && <span>• {chart.stack_depth}bb</span>}
                                                    {chart.topology && <span>• {chart.topology}</span>}
                                                </div>
                                                <div style={styles.chartStats}>
                                                    {Object.keys(chart.chart_grid || {}).length} hands
                                                </div>
                                            </div>

                                            <div style={styles.chartActions}>
                                                <button
                                                    onClick={() => handleEditChart(chart)}
                                                    style={styles.editButton}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteChart(chart.id, chart.chart_name)}
                                                    style={styles.deleteButton}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%)',
        color: '#fff',
        padding: '20px',
        userSelect: 'none'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 30,
        padding: '0 20px'
    },
    backButton: {
        padding: '10px 20px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#fff',
        cursor: 'pointer',
        fontSize: 14
    },
    title: {
        fontSize: 32,
        fontWeight: 900,
        fontFamily: 'Orbitron, sans-serif',
        margin: 0
    },
    content: {
        display: 'flex',
        gap: 30,
        maxWidth: 1600,
        margin: '0 auto'
    },
    leftPanel: {
        flex: 1
    },
    rightPanel: {
        width: 400,
        display: 'flex',
        flexDirection: 'column',
        gap: 20
    },
    section: {
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 16,
        padding: 24,
        border: '1px solid rgba(255,255,255,0.1)'
    },
    sectionHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: 700,
        margin: 0
    },
    clearButton: {
        padding: '6px 12px',
        background: 'rgba(255,68,68,0.2)',
        border: '1px solid rgba(255,68,68,0.4)',
        borderRadius: 6,
        color: '#ff4444',
        cursor: 'pointer',
        fontSize: 12
    },
    actionSelector: {
        display: 'flex',
        gap: 12,
        marginBottom: 16
    },
    actionButton: {
        flex: 1,
        padding: '12px',
        border: '2px solid',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        transition: 'all 0.2s'
    },
    gridInstructions: {
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 16,
        textAlign: 'center'
    },
    gridContainer: {
        display: 'inline-block',
        background: 'rgba(0,0,0,0.3)',
        padding: 12,
        borderRadius: 12,
        border: '2px solid rgba(0,212,255,0.3)'
    },
    gridHeader: {
        display: 'flex',
        marginBottom: 4
    },
    cornerCell: {
        width: 30,
        height: 30
    },
    headerCell: {
        width: 50,
        height: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 700,
        color: '#00D4FF'
    },
    gridRow: {
        display: 'flex',
        marginBottom: 4
    },
    gridCell: {
        width: 50,
        height: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid',
        borderRadius: 4,
        cursor: 'pointer',
        transition: 'all 0.1s',
        marginRight: 4
    },
    form: {
        display: 'flex',
        flexDirection: 'column',
        gap: 16
    },
    formGroup: {
        display: 'flex',
        flexDirection: 'column',
        gap: 6
    },
    formRow: {
        display: 'flex',
        gap: 12
    },
    label: {
        fontSize: 13,
        fontWeight: 600,
        color: 'rgba(255,255,255,0.8)'
    },
    input: {
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14
    },
    select: {
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer'
    },
    formActions: {
        display: 'flex',
        gap: 12,
        marginTop: 8
    },
    saveButton: {
        flex: 1,
        padding: '12px',
        background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
        border: 'none',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer'
    },
    cancelButton: {
        padding: '12px 20px',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: 8,
        color: '#fff',
        fontSize: 14,
        cursor: 'pointer'
    },
    statusMessage: {
        padding: 12,
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        textAlign: 'center'
    },
    chartsList: {
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        maxHeight: 500,
        overflowY: 'auto'
    },
    emptyState: {
        padding: 40,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.4)',
        fontSize: 14
    },
    chartItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid',
        borderRadius: 8
    },
    chartInfo: {
        flex: 1
    },
    chartName: {
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 4
    },
    chartMeta: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 4
    },
    chartBadge: {
        padding: '2px 6px',
        background: 'rgba(0,212,255,0.2)',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        color: '#00D4FF'
    },
    chartStats: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.5)'
    },
    chartActions: {
        display: 'flex',
        gap: 8
    },
    editButton: {
        padding: '6px 12px',
        background: 'rgba(0,212,255,0.2)',
        border: '1px solid rgba(0,212,255,0.4)',
        borderRadius: 6,
        color: '#00D4FF',
        fontSize: 12,
        cursor: 'pointer'
    },
    deleteButton: {
        padding: '6px 12px',
        background: 'rgba(255,68,68,0.2)',
        border: '1px solid rgba(255,68,68,0.4)',
        borderRadius: 6,
        color: '#ff4444',
        fontSize: 12,
        cursor: 'pointer'
    }
};
