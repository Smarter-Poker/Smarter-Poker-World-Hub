/**
 * Poker Odds Calculator Dedicated Clean URL Lander -- /tools/poker-odds-calculator
 * ==============================================================================
 * Dedicated, indexable root tool lander capturing "poker odds calculator",
 * "free poker equity calculator", and multiway game odds queries.
 * Re-exports the complete PokerToolsPage application with canonical alignment.
 */

import PokerToolsPage from '../hub/poker-tools';

export default function PokerOddsCalculatorLander() {
    return <PokerToolsPage />;
}
