/**
 * useVIPGate — Feature-Level VIP Gating Hook
 * ═══════════════════════════════════════════════════════════════════════════
 * Returns access status for a specific feature based on the VIP feature matrix.
 * 
 * NOTE: This hook is infrastructure-only. No features are actively gated
 * until the platform owner approves the gate map.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import useVIP from './useVIP';
import { VIP_FEATURE_MATRIX } from '../config/vip-feature-matrix';
import { checkFeatureAccess, FEATURE_CONFIG } from '../lib/gates/premiumFeatureGate';

/**
 * @param {string} featureKey - Key from VIP_FEATURE_MATRIX (e.g., 'gto-training', 'bankroll-manager')
 * @returns {{ 
 *   allowed: boolean, 
 *   gateType: string, 
 *   isVip: boolean, 
 *   hasDayPass: boolean,
 *   loading: boolean,
 *   featureConfig: object|null,
 *   showUpgradeModal: function,
 *   hideUpgradeModal: function,
 *   upgradeModalVisible: boolean,
 * }}
 */
export default function useVIPGate(featureKey) {
    const { isVip, userId, initializing } = useVIP();
    const [hasDayPass, setHasDayPass] = useState(false);
    const [loading, setLoading] = useState(true);
    const [upgradeModalVisible, setUpgradeModalVisible] = useState(false);

    const featureConfig = VIP_FEATURE_MATRIX[featureKey] || null;
    const gateType = featureConfig?.gate || 'FREE';

    // Check day-pass access for DIAMOND and MIXED features
    useEffect(() => {
        if (!userId || initializing) return;

        // FREE features don't need access checks
        if (gateType === 'FREE') {
            setLoading(false);
            return;
        }

        // VIP users always have access
        if (isVip) {
            setLoading(false);
            return;
        }

        // Check for active day-pass
        const dayPassKey = featureKey.replace(/-/g, '_');
        if (FEATURE_CONFIG[dayPassKey]) {
            checkFeatureAccess(userId, dayPassKey).then(result => {
                setHasDayPass(result.hasAccess);
                setLoading(false);
            }).catch(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, [userId, isVip, initializing, featureKey, gateType]);

    // Determine if user has access
    let allowed = false;
    if (gateType === 'FREE') {
        allowed = true;
    } else if (isVip) {
        allowed = true;
    } else if (hasDayPass) {
        allowed = true;
    }

    const showUpgradeModal = useCallback(() => {
        setUpgradeModalVisible(true);
    }, []);

    const hideUpgradeModal = useCallback(() => {
        setUpgradeModalVisible(false);
    }, []);

    return {
        allowed,
        gateType,
        isVip,
        hasDayPass,
        loading: loading || initializing,
        featureConfig,
        upgradeModalVisible,
        showUpgradeModal,
        hideUpgradeModal,
    };
}
