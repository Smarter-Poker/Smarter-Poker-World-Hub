/**
 * Tournament ICM Calculator Dedicated Clean URL Lander -- /tools/icm-calculator
 * ==============================================================================
 * Dedicated, indexable root tool lander capturing "ICM calculator",
 * "tournament ICM equity calculator", and bubble factor decision queries.
 * Re-exports the complete ICMCalculatorPage application with canonical alignment.
 */

import ICMCalculatorPage from '../hub/training/icm-calculator';

export default function ICMCalculatorLander() {
    return <ICMCalculatorPage />;
}
