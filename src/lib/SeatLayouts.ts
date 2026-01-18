/**
 * 🪑 SEAT LAYOUTS - Dynamic Position Configuration
 * 
 * Maps seat indices to CSS coordinates for each table size.
 * Supports 9-Handed, 6-Max, 4-Max, and Heads-Up formats.
 * 
 * Coordinate System:
 * - x: 0-100 (percentage from left)
 * - y: 0-100 (percentage from top)
 * - angle: rotation for cards/chips animation direction
 */

export type TableSize = 9 | 6 | 4 | 2;

export interface SeatPosition {
    x: number;      // Percentage from left
    y: number;      // Percentage from top
    angle: number;  // Rotation for visual elements
    label: string;  // Position label (BTN, SB, BB, etc.)
}

export interface SeatConfig {
    index: number;
    position: SeatPosition;
    isVisible: boolean;
    isHero: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// 9-HANDED LAYOUT (Full Ring - The Golden Template)
// ═══════════════════════════════════════════════════════════════════════════
const LAYOUT_9: SeatPosition[] = [
    { x: 50, y: 85, angle: 0, label: 'Hero' },      // Seat 0: Hero (Bottom Center)
    { x: 20, y: 75, angle: 45, label: 'SB' },       // Seat 1: Bottom Left
    { x: 8, y: 55, angle: 70, label: 'BB' },        // Seat 2: Left Side Upper
    { x: 8, y: 35, angle: 90, label: 'UTG' },       // Seat 3: Left Side Lower
    { x: 20, y: 15, angle: 120, label: 'UTG+1' },   // Seat 4: Top Left
    { x: 50, y: 8, angle: 180, label: 'MP' },       // Seat 5: Top Center
    { x: 80, y: 15, angle: 220, label: 'MP+1' },    // Seat 6: Top Right
    { x: 92, y: 35, angle: 270, label: 'CO' },      // Seat 7: Right Side Lower
    { x: 92, y: 55, angle: 290, label: 'BTN' },     // Seat 8: Right Side Upper
];

// ═══════════════════════════════════════════════════════════════════════════
// 6-MAX LAYOUT (Short-Handed)
// ═══════════════════════════════════════════════════════════════════════════
const LAYOUT_6: SeatPosition[] = [
    { x: 50, y: 85, angle: 0, label: 'Hero' },      // Seat 0: Hero (Bottom Center)
    { x: 12, y: 60, angle: 60, label: 'SB' },       // Seat 1: Left Side
    { x: 12, y: 30, angle: 100, label: 'BB' },      // Seat 2: Top Left  
    { x: 50, y: 8, angle: 180, label: 'UTG' },      // Seat 3: Top Center
    { x: 88, y: 30, angle: 260, label: 'CO' },      // Seat 4: Top Right
    { x: 88, y: 60, angle: 300, label: 'BTN' },     // Seat 5: Right Side
];

// ═══════════════════════════════════════════════════════════════════════════
// 4-MAX LAYOUT (Short-Handed Turbo)
// ═══════════════════════════════════════════════════════════════════════════
const LAYOUT_4: SeatPosition[] = [
    { x: 50, y: 85, angle: 0, label: 'Hero' },      // Seat 0: Hero (Bottom)
    { x: 10, y: 45, angle: 90, label: 'SB' },       // Seat 1: Left
    { x: 50, y: 8, angle: 180, label: 'BB' },       // Seat 2: Top
    { x: 90, y: 45, angle: 270, label: 'BTN' },     // Seat 3: Right
];

// ═══════════════════════════════════════════════════════════════════════════
// HEADS-UP LAYOUT (1v1)
// ═══════════════════════════════════════════════════════════════════════════
const LAYOUT_2: SeatPosition[] = [
    { x: 50, y: 82, angle: 0, label: 'Hero (BTN/SB)' },   // Seat 0: Hero (Bottom) - BTN is SB in HU
    { x: 50, y: 12, angle: 180, label: 'Villain (BB)' },  // Seat 1: Villain (Top)
];

// ═══════════════════════════════════════════════════════════════════════════
// SEAT LAYOUTS MASTER CONFIG
// ═══════════════════════════════════════════════════════════════════════════
export const SEAT_LAYOUTS: Record<TableSize, SeatPosition[]> = {
    9: LAYOUT_9,
    6: LAYOUT_6,
    4: LAYOUT_4,
    2: LAYOUT_2,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all seat configurations for a table size
 */
export function getSeatsForTableSize(
    tableSize: TableSize,
    heroSeatIndex: number = 0
): SeatConfig[] {
    const layout = SEAT_LAYOUTS[tableSize];

    return layout.map((position, index) => ({
        index,
        position,
        isVisible: true,
        isHero: index === heroSeatIndex,
    }));
}

/**
 * Get the position label for a seat based on table size and button position
 */
export function getPositionLabel(
    tableSize: TableSize,
    seatIndex: number,
    buttonSeat: number
): string {
    const playerCount = tableSize;

    // Calculate relative position from button
    const positionsFromButton = (seatIndex - buttonSeat + playerCount) % playerCount;

    if (tableSize === 2) {
        // Heads-Up: BTN is SB
        if (positionsFromButton === 0) return 'BTN/SB';
        return 'BB';
    }

    if (tableSize === 6) {
        const positions = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
        return positions[positionsFromButton] || 'MP';
    }

    if (tableSize === 4) {
        const positions = ['BTN', 'SB', 'BB', 'CO'];
        return positions[positionsFromButton] || 'MP';
    }

    // 9-Handed
    const positions9 = ['BTN', 'SB', 'BB', 'UTG', 'UTG+1', 'MP', 'MP+1', 'HJ', 'CO'];
    return positions9[positionsFromButton] || 'MP';
}

/**
 * Get blind positions for a table size
 */
export function getBlindPositions(tableSize: TableSize, buttonSeat: number): {
    sbSeat: number;
    bbSeat: number;
} {
    if (tableSize === 2) {
        // Heads-Up: Button is SB
        return {
            sbSeat: buttonSeat,
            bbSeat: (buttonSeat + 1) % 2,
        };
    }

    // All other formats: SB is 1 after button, BB is 2 after
    return {
        sbSeat: (buttonSeat + 1) % tableSize,
        bbSeat: (buttonSeat + 2) % tableSize,
    };
}

/**
 * Get the action order for preflop (first to act after BB)
 */
export function getPreflopActionOrder(tableSize: TableSize, buttonSeat: number): number[] {
    const order: number[] = [];

    if (tableSize === 2) {
        // Heads-Up: BTN/SB acts first preflop
        order.push(buttonSeat);
        order.push((buttonSeat + 1) % 2);
    } else {
        // Standard: UTG (3 after button) acts first
        const firstToAct = (buttonSeat + 3) % tableSize;
        for (let i = 0; i < tableSize; i++) {
            order.push((firstToAct + i) % tableSize);
        }
    }

    return order;
}

/**
 * Get villain names based on table size
 */
export function getVillainNames(tableSize: TableSize): string[] {
    const allNames = [
        'Viking', 'Wizard', 'Ninja', 'Wolf', 'Spartan',
        'Pharaoh', 'Pirate', 'Cowboy', 'Fox', 'Samurai'
    ];

    // Return appropriate number of names
    return allNames.slice(0, tableSize - 1); // -1 because Hero takes one seat
}

/**
 * Get table format name for display
 */
export function getTableFormatName(tableSize: TableSize): string {
    switch (tableSize) {
        case 9: return 'Full Ring (9-Max)';
        case 6: return '6-Max';
        case 4: return '4-Max';
        case 2: return 'Heads-Up';
        default: return 'Unknown';
    }
}

/**
 * Validate that a seat index is valid for a table size
 */
export function isValidSeat(tableSize: TableSize, seatIndex: number): boolean {
    return seatIndex >= 0 && seatIndex < tableSize;
}
