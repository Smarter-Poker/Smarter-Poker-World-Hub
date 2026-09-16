/**
 * POST /api/kyc/webhook
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.4 — Identity & KYC stub
 *
 * Receives KYC provider callbacks and updates profiles.kyc_status. Each
 * provider has its own signature verification scheme — we dispatch on the
 * `provider` query param. For the stub provider, the payload is trusted
 * locally (dev/staging only); in production a bearer secret guards the stub
 * endpoint so only admin tools can flip statuses.
 *
 * Query: ?provider=persona|veriff|jumio|onfido|stub
 * Body:  provider-specific JSON payload. Required canonical fields:
 *          { inquiry_id, outcome: 'approved'|'rejected'|'expired',
 *            rejection_reason?: string }
 * Auth:
 *   - stub: Bearer ${KYC_WEBHOOK_SECRET} (required — no anon access).
 *   - persona: HMAC-SHA256 signature in `Persona-Signature` header (TBD).
 *   - veriff: HMAC-SHA256 signature in `x-hmac-signature` header (TBD).
 *   - jumio/onfido: HTTP Basic or HMAC per provider (TBD).
 *
 * Response: { ok, user_id, previous_status, new_status }
 */
import { createClient } from "../../../src/lib/supabaseServerClient";
import { reportApiError } from '../../../src/lib/sentryWrap';

// NOTE: Removed edge runtime — this handler uses Node.js Pages Router API (req.query/res.status/etc)
// and cannot run on Vercel Edge Runtime. Keep as Node.js runtime.

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url =
            process.env.NEXT_PUBLIC_SUPABASE_URL ||
            "https://kuklfnapbkmacvwxktbh.supabase.co";
        const key =
            process.env.SUPABASE_SERVICE_ROLE_KEY ||
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Provider-specific signature checks. Returns { ok, payload } or { ok: false, error }.
function verifyStub(req) {
    const auth = req.headers.authorization;
    const secret = process.env.KYC_WEBHOOK_SECRET;
    if (!secret) {
        return {
            ok: false,
            error: "KYC_WEBHOOK_SECRET not configured"
        };
    }
    if (auth !== `Bearer ${secret}`) {
        return { ok: false, error: "Unauthorized" };
    }
    return {
        ok: true,
        payload: typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}
    };
}

// Persona / Veriff / Jumio / Onfido signature verification stubs.
// Replace each with real HMAC checks when the provider is selected.
function verifyNotYetImplemented(providerName) {
    return () => ({
        ok: false,
        error: `${providerName} webhook signature verification not yet implemented`
    });
}

const VERIFIERS = {
    stub: verifyStub,
    persona: verifyNotYetImplemented("persona"),
    veriff: verifyNotYetImplemented("veriff"),
    jumio: verifyNotYetImplemented("jumio"),
    onfido: verifyNotYetImplemented("onfido")
};

export default async function handler(req, res) {
  try {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    const provider = (req.query.provider || "stub").toString().toLowerCase();
    const verifier = VERIFIERS[provider];
    if (!verifier) {
        return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    const verified = verifier(req);
    if (!verified.ok) {
        return res.status(401).json({ error: verified.error || "Unauthorized" });
    }

    const payload = verified.payload;
    const inquiry_id = payload?.inquiry_id;
    const outcome = payload?.outcome;

    if (!inquiry_id || !outcome) {
        return res
            .status(400)
            .json({ error: "inquiry_id and outcome are required in the body" });
    }

    try {
        const supabase = getSupabase();
        const { data, error } = await supabase.rpc("fn_kyc_resolve_inquiry", {
            p_inquiry_id: inquiry_id,
            p_outcome: outcome,
            p_rejection_reason: payload?.rejection_reason || null,
            p_raw_payload: payload
        });

        if (error) {
            console.warn("[kyc/webhook] RPC error:", error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (!data?.ok) {
            return res.status(404).json(data);
        }

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[kyc/webhook] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }

  } catch (err) {
    console.warn('[API] Unhandled exception in handler:', err?.message || err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error', message: err?.message || 'Unknown error' });
    }
  }
}
