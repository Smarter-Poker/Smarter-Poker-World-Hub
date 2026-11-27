/**
 * VIPGateModal - Premium Upgrade Prompt
 *
 * Shows when a user reaches a VIP-gated feature. Built from the VIP offer kit
 * (#SMARTERDESIGN): one steel rim, the crown seal beside a live title, the
 * price THIS account pays, and a one-tap action to the monthly VIP purchase
 * page. A Diamond or mixed gate keeps its Day Pass route as a quieter action.
 */

import { useRouter } from 'next/router';
import { VipDialog, VipGhost, VipIntroPrice, VipMonthlyCta, vipKitStyles as kit } from '../vip/VipKit';

export default function VIPGateModal({ visible, onClose, featureName, featureConfig }) {
    const router = useRouter();

    if (!visible) return null;

    const dayPassCost = featureConfig?.cost || 25;
    const gateType = featureConfig?.gate || 'VIP';
    const dayPass = gateType === 'DIAMOND' || gateType === 'MIXED';

    return (
        <VipDialog open onClose={onClose} parent="VIP Membership" title="Premium Feature" closeLabel="Close">
            <p className={kit.dialogLead}>
                <strong>{featureName}</strong> Is Included With VIP, Along With Every Premium Feature
                Across Smarter.Poker And Club Arena.
            </p>

            <VipIntroPrice enabled={!!visible} />

            <div className={kit.dialogActions}>
                <VipMonthlyCta enabled={!!visible} onNavigate={onClose} />
                {dayPass ? (
                    <div className={kit.dialogPair}>
                        <VipGhost onClick={onClose}>Maybe Later</VipGhost>
                        <VipGhost
                            onClick={() => { onClose(); router.push('/hub/diamond-store'); }}
                            sub="24 Hours"
                        >
                            Day Pass: {dayPassCost} Diamonds
                        </VipGhost>
                    </div>
                ) : (
                    <VipGhost onClick={onClose}>Maybe Later</VipGhost>
                )}
            </div>
        </VipDialog>
    );
}
