/**
 * ORB-5: The Upline — Agent & Commission Contracts
 * 
 * Defines the strict type boundaries for the Club Arena MLM and Rakeback systems.
 * Ensures domain isolation and mathematical security for commission distributions.
 */

export interface RakebackTree {
    /**
     * Recursive tree structure representing the agent upline.
     * Total commission must mathematically never exceed 100%.
     */
    playerId: string;
    clubId: string;
    periodId: string;
    totalRakeGenerated: number;

    /**
     * The list of agents in the upline who receive a cut.
     * Ordered from immediate agent up to the master agent/owner.
     */
    upline: UplineNode[];

    /**
     * Metadata regarding the distribution.
     */
    distributionMeta: {
        processedAt: string;
        totalCommissionPaid: number;
        clubRetained: number;
    };
}

export interface UplineNode {
    agentId: string;
    depth: number; // 0 = direct agent, 1 = parent agent, etc.
    commissionRate: number; // e.g. 0.40 for 40%
    effectiveRate: number; // The actual slice they get after passing up to THEIR parent
    amountEarned: number;
}

export interface ClawbackAudit {
    /**
     * Immutable record of a partial or full chip clawback.
     */
    transactionId: string;
    actionType: 'clawback' | 'clawback_partial';
    clubId: string;
    agentId: string;
    playerId: string;
    requestedAmount: number;
    recoveredAmount: number;
    shortfall: number;
    playerFinalBalance: number;
    agentFinalBalance: number;
    timestamp: string;
}

export interface InfiniteLoopCheckResult {
    valid: boolean;
    maxDepth: number;
    error?: string;
    circularAgentId?: string;
}
