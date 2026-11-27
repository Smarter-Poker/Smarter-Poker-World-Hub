/**
 * Bankroll Manager - Export Data (Fully wired)
 */

import BankrollExportFormats from '../../../src/components/bankroll/BankrollExportFormats';
import Link from 'next/link';
import BankrollImageHeader from '../../../src/components/bankroll/BankrollImageHeader';
import SEOHead from '../../../src/components/seo/SEOHead';
import layout from '../../../styles/BankrollManager.module.css';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';

export default function BankrollExport() {
    return (
        <>
            <SEOHead
                title="Export Bankroll Data"
                description="Export Your Bankroll Data For Tax Reporting Or External Analysis."
                canonical="/hub/bankroll-manager/export"
                noindex={true}
            />

            <PageTransition>
                <div className={layout.export}>
                    <UniversalHeader pageDepth={2} />
                    <main className={`smarterdesign ${layout.exportContent}`}>
                        <div className="sd-back-row">
                            <Link href="/hub/bankroll-manager" className="sd-button">Back To Dashboard</Link>
                        </div>
                        <BankrollImageHeader title="Export Data" art="export" parent="Bankroll Manager" className={layout.mast} />
                        <div className="sd-panel">
                            <BankrollExportFormats />
                        </div>
                    </main>
                </div>
            </PageTransition>
        </>
    );
}
