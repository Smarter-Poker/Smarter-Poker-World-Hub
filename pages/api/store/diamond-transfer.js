import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { setPrivateCommerceResponse } from '../../../src/lib/store/privateCommerceResponse';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REQUEST = /^[a-z0-9][a-z0-9._:-]{11,127}$/i;
export default async function handler(req, res) {
  setPrivateCommerceResponse(res);
  res.setHeader('Allow', 'POST');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!applyRateLimit(req, res, LIMITS.write)) return;
  const bearer = req.headers.authorization;
  if (typeof bearer !== 'string' || !/^Bearer \S+$/i.test(bearer)) {
    return res.status(401).json({ error: 'Sign In To Send Diamonds' });
  }
  const { recipientId, amount, message = null } = req.body || {};
  const idempotencyKey = req.headers['x-idempotency-key'];
  if (
    typeof recipientId !== 'string' ||
    !UUID.test(recipientId) ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647 ||
    typeof idempotencyKey !== 'string' ||
    !REQUEST.test(idempotencyKey) ||
    (message !== null && (typeof message !== 'string' || message.length > 280))
  ) {
    return res.status(400).json({ error: 'Invalid Transfer Request' });
  }
  const asPlayer = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: bearer } }, auth: { persistSession: false } }
  );
  try {
    const { data: auth, error: authError } = await asPlayer.auth.getUser(bearer.slice(7));
    if (authError || !auth?.user) return res.status(401).json({ error: 'Sign In Again' });
    const { data, error } = await asPlayer.rpc('send_wallet_diamond_transfer', {
      p_recipient_id: recipientId.toLowerCase(),
      p_amount: amount,
      p_message: message,
      p_reference_id: idempotencyKey,
    });
    if (error && ['42501', '22023', 'P0001'].includes(error.code)) {
      return res
        .status(400)
        .json({
          success: false,
          code: 'transfer_refused',
          idempotencyTerminal: true,
          error: 'Transfer Refused. Verify The Friend And Amount.',
        });
    }
    if (error) throw error;
    if (data?.success === false)
      return res.status(400).json({ ...data, idempotencyTerminal: true });
    if (
      data?.success !== true ||
      data.sender_id !== auth.user.id ||
      data.recipient_id !== recipientId.toLowerCase() ||
      data.amount !== amount ||
      data.request_id !== idempotencyKey
    )
      throw new Error('Transfer Receipt Missing Or Mismatched');
    return res.status(200).json(data);
  } catch (error) {
    console.error('[diamond-transfer] Unverified transfer receipt:', error?.message || error);
    return res
      .status(503)
      .json({
        success: false,
        code: 'transfer_unconfirmed',
        error: 'Transfer Not Yet Confirmed. Retry With The Same Request ID.',
      });
  }
}
