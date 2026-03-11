-- Add cancellation reason tracking to vip_subscriptions
-- These columns store the user's reason for cancelling VIP membership

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vip_subscriptions' AND column_name = 'cancel_reason') THEN
        ALTER TABLE vip_subscriptions ADD COLUMN cancel_reason TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'vip_subscriptions' AND column_name = 'cancel_reason_text') THEN
        ALTER TABLE vip_subscriptions ADD COLUMN cancel_reason_text TEXT;
    END IF;
END $$;
