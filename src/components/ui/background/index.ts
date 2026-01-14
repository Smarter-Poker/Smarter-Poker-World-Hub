/* ═══════════════════════════════════════════════════════════════════════════
   NEURAL CONDUCTION FIELD — BARREL EXPORT
   Core PokerIQ visual identity system
   ═══════════════════════════════════════════════════════════════════════════ */

// Main component
export { NeuralConductionField, default } from './NeuralConductionField';

// Context and API
export {
    NeuralFieldProvider,
    useNeuralField,
    DEFAULT_THEME,
    INTENSITY_PRESETS,
    type NeuralFieldAPI,
    type NeuralTheme,
    type IntensityMode,
    type IntensityConfig,
} from './NeuralFieldContext';

// Path graphs (for advanced customization)
export {
    ALL_BRAIN_PATHS,
    BRAIN_OUTLINE_PATHS,
    INTERNAL_BRAIN_PATHS,
    samplePathPoints,
    type PathPoint,
    type PathSegment,
} from './paths/BrainPathGraph';

export {
    generateGTOMatrix,
    getGridIntersections,
    DEFAULT_GTO_MATRIX,
    DEFAULT_GRID_CONFIG,
    type GTOGridConfig,
} from './paths/GTOMatrixGraph';

export {
    JUNCTION_BRIDGES,
    BRIDGE_PATHS,
    generateBridgePaths,
    findNearestBridge,
    type JunctionBridge,
} from './paths/JunctionBridges';
