/**
 * Bankroll Manager - Export Data (Fully wired)
 */

import BankrollExportFormats from '../../../src/components/bankroll/BankrollExportFormats';
import Link from 'next/link';
import BankrollHelp from '../../../src/components/bankroll/BankrollHelp';
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
                        <header className={`sd-masthead ${layout.mast}`}>
                            <div className={layout.titleGroup}>
                                <div className={layout.productName}>Bankroll Manager</div>
                                <h1>Export Data</h1>
                            </div>
                            <div className={layout.headerActions}>
                                <Link href="/hub/bankroll-manager" className="sd-button">Back To Dashboard</Link>
                            </div>
                            <BankrollHelp title="Export Data" section="export" />
                        </header>
                        <div className="sd-panel">
                            <BankrollExportFormats />
                        </div>
                    </main>
                </div>
            </PageTransition>
        </>
    );
}
