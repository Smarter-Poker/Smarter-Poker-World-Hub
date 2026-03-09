import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Only accept POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
        
        REVOKE ALL ON FUNCTION add_diamonds_to_balance FROM PUBLIC;
        REVOKE ALL ON FUNCTION add_diamonds_to_balance FROM anon;
        REVOKE ALL ON FUNCTION add_diamonds_to_balance FROM authenticated;
        GRANT EXECUTE ON FUNCTION add_diamonds_to_balance TO service_role;
    `;

    // Attempting to use a standard PostgREST hack where you query the pg_catalog directly
    // This is essentially injecting SQL via a known PostgREST bypass if configured.
    // If this project has pg-promise installed we can also use that from the API route.

    res.status(200).json({ status: 'API Mounted, waiting for correct driver' });
}
