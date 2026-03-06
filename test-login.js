const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateLink() {
    const { data, error } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: 'johndonnahue4485@yahoo.com',
        options: {
            redirectTo: 'http://localhost:3000/commander'
        }
    });
    if (error) {
        console.error("Error generating link:", error);
    } else {
        console.log("MAGIC LINK:");
        console.log(data.properties.action_link);
    }
}

generateLink();
