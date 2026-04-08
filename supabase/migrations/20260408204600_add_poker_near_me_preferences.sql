ALTER TABLE profiles ADD COLUMN IF NOT EXISTS poker_near_me_preferences JSONB DEFAULT '{
  "geofenceAlerts": true,
  "locationEnabled": true,
  "showNewcomerFriendly": true
}'::jsonb;
