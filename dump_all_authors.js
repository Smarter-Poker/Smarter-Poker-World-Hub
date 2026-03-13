/**
 * Fetch ALL 347 content_authors from Supabase, dump their current names/aliases
 * so we can generate unique replacements for every single one.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function dumpAll() {
    // Fetch ALL content_authors — paginate if needed
    let allAuthors = [];
    let offset = 0;
    const pageSize = 500;

    while (true) {
        const { data, error } = await supabase
            .from('content_authors')
            .select('id, name, alias, bio, gender, location, specialty, stakes, voice')
            .order('id')
            .range(offset, offset + pageSize - 1);

        if (error) {
            console.error('Error:', error.message);
            break;
        }
        if (!data || data.length === 0) break;
        allAuthors = allAuthors.concat(data);
        if (data.length < pageSize) break;
        offset += pageSize;
    }

    console.log(`Total authors found: ${allAuthors.length}`);
    console.log('');

    // Output as JSON for processing
    console.log(JSON.stringify(allAuthors, null, 2));
}

dumpAll().catch(console.error);
