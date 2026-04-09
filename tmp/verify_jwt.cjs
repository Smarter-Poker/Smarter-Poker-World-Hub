require('dotenv').config({ path: '.agent/skills/credentials/.env' });
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const SUPER_URL = "https://kuklfnapbkmacvwxktbh.supabase.co";
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET; 
// If JWT secret is not in env, we can't sign it locally. But usually it's there. 
// Actually Service Role Key CAN act as a bearer!
