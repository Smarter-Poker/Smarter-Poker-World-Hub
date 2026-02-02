/**
 * Memory Campaign Page - Chart-Based Level Selector
 * Routes to /hub/memory-campaign
 */

import Head from 'next/head';
import { MemoryCampaignView } from '../../src/components/memory';
import PageTransition from '../../src/components/transitions/PageTransition';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

export default function MemoryCampaignPage() {
    return (
        <PageTransition>
            <Head>
                <title>Memory Matrix Campaign | Smarter Poker</title>
                <meta name="description" content="Master GTO preflop ranges through progressive level-based training" />
            </Head>
            <UniversalHeader pageDepth={2} />
            <MemoryCampaignView />
        </PageTransition>
    );
}
