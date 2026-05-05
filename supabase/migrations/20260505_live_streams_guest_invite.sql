ALTER TABLE live_streams ADD COLUMN guest_invite_code UUID DEFAULT gen_random_uuid();
