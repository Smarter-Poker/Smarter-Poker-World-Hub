/**
 * /staking/statement/[token] - a backer's read-only staking statement (2026-11-28)
 * ═══════════════════════════════════════════════════════════════════════════
 * A staked player creates this link in the Bankroll Manager's Staking Tracker
 * ("Share With Backer") and sends it to their backer. No sign-in: the page is
 * server-rendered and asks fn_staking_statement(p_token) with the publishable
 * key. That function returns only session dates, category, result, the two
 * shares and makeup, for a link that exists, is not revoked and has not
 * expired, and nothing otherwise. So this page shows no player name, venue,
 * buy-in, note or any other deal, and cannot tell "revoked" from "expired"
 * from "never existed" (on purpose).
 *
 * The token is a bearer secret: the response is never cached, never indexed,
 * and sends no referrer to any link on it.
 */
import StakingStatementView from '../../../src/components/bankroll/StakingStatementView';
import {
    normalizeStatementToken,
    readStakingStatement,
} from '../../../src/lib/bankroll/stakingStatement.mjs';

export async function getServerSideProps({ params, res }) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const token = normalizeStatementToken(String(params?.token || ''));
    if (!token) return { props: { status: 'unavailable', rows: [] } };
    try {
        const { status, rows } = await readStakingStatement(token);
        return { props: { status, rows } };
    } catch (err) {
        // Never log the token: it is the link's only secret.
        console.warn('[staking-statement] read failed:', err?.message || err);
        return { props: { status: 'error', rows: [] } };
    }
}

export default function StakingStatementPage(props) {
    return <StakingStatementView {...props} />;
}
