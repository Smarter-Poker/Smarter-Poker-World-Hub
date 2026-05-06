# Diamond Sending Restrictions Removed for Kingfish

1. **Live Gifting Bypass (`pages/api/live/gift.js`)**:
   - Bypassed the hard-block for new users (`NEW_USER_BLOCK_DAYS`).
   - Bypassed the source-tiered rolling 30-day cap for non-graduated users (`FREE_EARNED_30DAY_LIMIT` and `PURCHASED_WON_30DAY_LIMIT`).
   - Bypassed the per-broadcaster receive cap (`RECEIVER_30DAY_RECEIVE_LIMIT`) so Kingfish can send diamonds even if the broadcaster has hit their inbound limit.

2. **Direct Transfer Bypass (`pages/api/store/diamond-transfer.js`)**:
   - Bypassed the hard-block for new users.
   - Bypassed the 7-day minimum age restriction on recipients (Kingfish can send to brand new accounts).
   - Bypassed the per-transfer maximum (`maxTransferVip` / `MAX_TRANSFER_STANDARD`).
   - Bypassed the 60-second global cooldown between transfers.
   - Bypassed the rolling 30-day limits and daily transfer limits.
   - Bypassed the per-recipient 30-day transfer limit.
   - Bypassed the 5-minute per-recipient cooldown.
   - Bypassed the recipient's rolling 30-day receive limit.

The user identifier `isKingfish` is checked using `senderProfile?.full_name?.toLowerCase().includes('dan bekavac') || senderProfile?.username?.toLowerCase() === 'kingfish'`, completely lifting all constraints for your account. The code was validated, committed, and successfully pushed to Vercel.
