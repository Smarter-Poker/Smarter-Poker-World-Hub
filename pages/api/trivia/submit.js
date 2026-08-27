/**
 * Legacy client-scored submission endpoint.
 *
 * Retired because accepting browser-supplied scores, correct counts and
 * diamond amounts cannot produce a verifiable economy ledger. All live modes
 * must use session-start -> session-answer -> session-submit, where the server
 * owns the roster, answer key, score, cap and atomic settlement.
 */
export default function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(410).json({
        success: false,
        error: 'legacy_submit_retired',
        replacement: '/api/trivia/session-submit',
    });
}
