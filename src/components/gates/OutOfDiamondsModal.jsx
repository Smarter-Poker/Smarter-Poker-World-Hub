/**
 * OUT OF DIAMONDS MODAL - Shown when a non-VIP user cannot afford a game.
 *
 * Built from the VIP offer kit (#SMARTERDESIGN): one steel rim, the crown
 * seal beside a live title, the price THIS account pays as the largest thing
 * in the popup, and a one-tap action to the monthly VIP purchase page. The
 * second row keeps the two quieter choices: leave, or buy Diamonds.
 *
 * Dismissal: phone back (useModalHistory), a tap outside (useScrimDismiss),
 * Escape, or the labeled 44px close control.
 */

import React from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { VipDialog, VipGhost, VipIntroPrice, VipMonthlyCta, VipPhoneOfferBody, usePhoneOfferStep, vipKitStyles as kit } from '../vip/VipKit';

function OutOfDiamondsModal({ isOpen, onClose, gameCost = 5, isVIP = false, userId = null }) {
    useModalHistory(!!isOpen, onClose);
    const scrim = useScrimDismiss(onClose);
    // Phone verification reward first (Dan, 2026-11-27): an eligible account
    // sees the free month and welcome diamonds before the VIP price; Skip
    // shows the popup below unchanged.
    const phoneStep = usePhoneOfferStep(userId, { enabled: !!isOpen && !isVIP });

    if (!isOpen) return null;

    const sellVip = !isVIP;

    if (sellVip && phoneStep.show) {
        return (
            <VipDialog open onClose={onClose} scrim={scrim} parent="Diamond Entry" title="Claim Your Free VIP Month" closeLabel="Close">
                <p className={kit.dialogLead}>
                    You Need <strong>{gameCost} Diamonds</strong> To Play This Game. Verify Your Phone Number To Play Free With VIP.
                </p>
                <VipPhoneOfferBody offer={phoneStep.offer} onSkip={phoneStep.skip} compact={false} />
            </VipDialog>
        );
    }

    return (
        <VipDialog
            open
            onClose={onClose}
            scrim={scrim}
            parent="Diamond Entry"
            title="Out Of Diamonds"
            closeLabel="Close"
        >
            <p className={kit.dialogLead}>
                You Need <strong>{gameCost} Diamonds</strong> To Play This Game.
                {sellVip && ' VIP Members Play Free.'}
            </p>

            {sellVip && (
                <>
                    {/* Account-aware: asks the status route only while open. */}
                    <VipIntroPrice accountId={userId} enabled={sellVip} />
                    <ul className={kit.perks} aria-label="What VIP Includes">
                        <li><span>Game Entry</span><span>Free, Unlimited</span></li>
                        <li><span>Diamonds Needed</span><span>None</span></li>
                    </ul>
                </>
            )}

            <div className={kit.dialogActions}>
                {sellVip && <VipMonthlyCta accountId={userId} enabled={sellVip} />}
                <div className={kit.dialogPair}>
                    <VipGhost onClick={onClose}>Maybe Later</VipGhost>
                    <VipGhost href="/hub/diamond-store">Get Diamonds</VipGhost>
                </div>
            </div>
        </VipDialog>
    );
}

export default OutOfDiamondsModal;
