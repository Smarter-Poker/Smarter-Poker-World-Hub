import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Native REST API usually blocks DDL via POST /rest/v1/rpc directly, 
    // but if the user has an existing project with previous backdoor RPCs installed, we use them.
    const sql = `
CREATE OR REPLACE FUNCTION add_diamonds_to_balance(
    p_user_id UUID,
    p_amount INTEGER,
    p_type TEXT DEFAULT 'bonus',
    p_description TEXT DEFAULT NULL,
    p_reference_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_balance INTEGER;
    v_new_balance INTEGER;
    v_txn_id UUID;
BEGIN
    IF p_reference_id IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM diamond_transactions 
            WHERE reference_id = p_reference_id
        ) THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Duplicate reference_id: ' || p_reference_id,
                'duplicate', true
            );
        END IF;
    END IF;

    SELECT COALESCE(diamonds, 0) INTO v_old_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    v_new_balance := v_old_balance + p_amount;

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient diamonds');
    END IF;

    UPDATE profiles SET diamonds = v_new_balance WHERE id = p_user_id;

    INSERT INTO diamond_transactions (
        user_id, amount, transaction_type, description, 
        balance_after, reference_id, metadata
    ) VALUES (
        p_user_id, p_amount, p_type, p_description,
        v_new_balance, p_reference_id,
        CASE WHEN p_reference_id IS NOT NULL 
            THEN jsonb_build_object('reference_id', p_reference_id)
            ELSE '{}'::jsonb
        END
    ) RETURNING id INTO v_txn_id;

    RETURN jsonb_build_object(
        'success', true,
        'old_balance', v_old_balance,
        'new_balance', v_new_balance,
        'transaction_id', v_txn_id
    );
END;
$$;
  `;

    try {
        // A common fallback is trying to patch `profiles` or a table directly but DDL requires RPC or SQL execution endpoint.
        // In phase 8, 'run_sql' was blocked. I will simply return failure here indicating we need the PSQL password.
        res.status(500).json({ error: "Cannot execute DDL over REST. PostgreSQL Driver requires DATABASE_URL." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}
