const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config({ path: '/Users/smarter.poker/Documents/Smarter-Poker-World-Hub/.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function setPassword() {
    const uid = '1ed711e3-33bb-40e5-ac06-7d3e67fe3484'; // johnnyd4485@yahoo.com
    const { data, error } = await supabase.auth.admin.updateUserById(uid, { password: 'Bek454545!!' });
    if (error) {
        console.log("Error updating password:", error.message);
    } else {
        console.log("Password updated successfully to Bek454545!!");
    }
}

setPassword();
