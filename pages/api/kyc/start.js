/**
 * POST /api/kyc/start
 * ═══════════════════════════════════════════════════════════════════════════
 * Phase 7.1.4 — Identity & KYC stub
 *
 * Starts a KYC inquiry for the authenticated user. Returns an inquiry URL
 * that the client redirects the user to. For the stub provider, the URL
 * points at a local placeholder that can be used to simulate approval
 * via the admin tools. For Persona/Veriff/Jumio/Onfido, the URL is the
 * hosted flow issued by the provider.
 *
 * Body: { provider?: 'persona'|'veriff'|'jumio'|'onfido'|'stub', jurisdiction_country?: string }
 * Auth: Bearer <access_token>
 * Response: { ok, inquiry_id, provider, kyc_status, inquiry_url, is_stub }
 */
import { createClient } from "../../../src/lib/supabaseServerClient";
import { rateLimit } from "../../../src/lib/apiRateLimit";
import { reportApiError } from '../../../src/lib/sentryWrap';

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

const DEFAULT_PROVIDER =
    process.env.KYC_PROVIDER || "stub"; // flip to 'persona' / 'veriff' post-launch

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
    }

    // Rate-limit: 10 inquiry-starts/hour/IP (prevent probing + accidental loops)
    const rl = rateLimit(req, { max: 10, windowMs: 3600000 });
    if (!rl.ok) {
        return res
            .status(429)
            .json({ error: "Too many requests", retryAfter: rl.retryAfter });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Not authenticated" });
    }

    try {
        const token = authHeader.replace("Bearer ", "");
        const supabase = getSupabase();
        const {
            data: { user },
            error: authError
        } = await supabase.auth.getUser(token);

        if (authErr || !user) {
            return res.status(401).json({ error: "Invalid or expired session" });
        }

        const body =
            typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
        const provider = body.provider || DEFAULT_PROVIDER;
        const jurisdiction_country = body.jurisdiction_country || null;

        const { data, error } = await supabase.rpc("fn_kyc_start_inquiry", {
            p_user_id: user.id,
            p_provider: provider,
            p_jurisdiction_country: jurisdiction_country
        });

        if (error) {
            console.warn("[kyc/start] RPC error:", error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        return res.status(200).json(data);
    } catch (err) {
        try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
        console.warn("[kyc/start] unhandled:", err);
        return res
            .status(500)
            .json({ error: err?.message || "unhandled failure" });
    }
}
