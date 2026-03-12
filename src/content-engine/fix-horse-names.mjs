/**
 * 🐴 FIX HORSE NAMES — Replace alias-style names with real, diverse names
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Replaces all 208 "HUDMaster HM" / "SwingTrader" style names with 
 * real, culturally-diverse, gender-specific names.
 * 
 * Run: node src/content-engine/fix-horse-names.mjs
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://kuklfnapbkmacvwxktbh.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo'
);

// ═══════════════════════════════════════════════════════════════════════════
// REAL NAME POOLS — Culturally diverse, gender-specific
// ═══════════════════════════════════════════════════════════════════════════

const MALE_NAMES = [
    // Caucasian
    'Jake Sullivan', 'Ethan O\'Connor', 'Logan Bennett', 'Mason Crawford', 
    'Tyler Richardson', 'Colton Harper', 'Brady Walsh', 'Shane McAllister',
    'Garrett Morrison', 'Dustin Palmer', 'Travis Coleman', 'Brett Lawson',
    'Blake Donaldson', 'Hunter Sinclair', 'Chase Brennan', 'Reid Hamilton',
    'Grant Fitzgerald', 'Dean Callahan', 'Nolan Pierce', 'Wyatt Chandler',
    'Brody Fletcher', 'Cody Mercer', 'Owen Donahue', 'Brock Whitfield',
    'Trent Kessler', 'Liam Gallagher', 'Connor Shea', 'Sean Rafferty',
    'Patrick Brennan', 'Declan Byrne', 'Finn McCormick', 'Aidan Kelley',
    
    // African American
    'Darius Washington', 'Jamal Brooks', 'Marcus Jefferson', 'Terrence Howard',
    'DeAndre Mitchell', 'Xavier Coleman', 'Tyrone Ellis', 'Kendrick Davis',
    'Lamar Robinson', 'Deshawn Harris', 'Malik Carter', 'Dante Simmons',
    'Jalen Foster', 'Trevon Pierce', 'Isaiah Green', 'Andre Patterson',
    'Donovan Blake', 'Rashad Williams', 'Corey Jackson', 'Damian Price',
    'Marquis Taylor', 'Kareem Jones', 'Devonte Alexander', 'Rodrick Thompson',
    
    // Hispanic/Latino
    'Carlos Herrera', 'Miguel Fuentes', 'Diego Ramirez', 'Alejandro Vega',
    'Mateo Castillo', 'Javier Moreno', 'Rafael Gutierrez', 'Enrique Delgado',
    'Luis Sandoval', 'Arturo Padilla', 'Fernando Reyes', 'Hugo Cervantes',
    'Ricardo Navarro', 'Oscar Dominguez', 'Emilio Cruz', 'Antonio Espinoza',
    'Gabriel Soto', 'Sebastian Rojas', 'Adrian Mendoza', 'Victor Aguirre',
    
    // Asian
    'Kevin Tran', 'Jason Huang', 'Andy Zhao', 'Victor Lam',
    'Peter Nakamura', 'Danny Choi', 'Tommy Tanaka', 'Alan Pham',
    'Henry Hsu', 'Brian Chang', 'Raymond Nguyen', 'Philip Kwon',
    'Wesley Suzuki', 'Dennis Liao', 'Frank Yamamoto', 'Arthur Ito',
    'Jonathan Wu', 'Richard Yeo', 'Eugene Sato', 'Darren Cheung',
    
    // South Asian
    'Nikhil Patel', 'Arjun Sharma', 'Ravi Kapoor', 'Sanjay Reddy',
    'Vikram Singh', 'Rohan Gupta', 'Amit Malhotra', 'Kiran Desai',
    'Raj Bhatt', 'Suresh Nair', 'Pranav Joshi', 'Arun Chakraborty',
    
    // Middle Eastern
    'Omar Hassan', 'Karim Mansour', 'Tariq Abbas', 'Samir Khalil',
    'Nabil Farouk', 'Yusuf Aydin', 'Rashid Bakr', 'Fadi Khoury',
];

const FEMALE_NAMES = [
    // Caucasian
    'Emma Sutherland', 'Olivia Prescott', 'Chloe Montgomery', 'Sophia Carmichael',
    'Ava Thornton', 'Isabella Merritt', 'Natalie Winslow', 'Paige Beaumont',
    'Brooke Calloway', 'Savannah Whitmore', 'Taylor Ashford', 'Kennedy Davenport',
    'Peyton Holbrook', 'Riley Blackwell', 'Morgan Stratton', 'Mackenzie Harrington',
    'Leah Sinclair', 'Claire Ellington', 'Audrey Bancroft', 'Grace Pemberton',
    'Molly Fitzgerald', 'Sienna O\'Brien', 'Fiona Gallagher', 'Bridget Callahan',
    
    // African American
    'Jasmine Lee Washington', 'Aaliyah Brooks', 'Destiny Carter', 'Imani Williams',
    'Keisha Robinson', 'Tamara Jefferson', 'Shanice Harris', 'Dominique Mitchell',
    'Brianna Foster', 'Tiffany Coleman', 'Kiara Stevens', 'Maya Richardson',
    'Monique Thompson', 'Ebony Hamilton', 'Janelle Porter', 'Simone Baptiste',
    
    // Hispanic/Latina
    'Valentina Reyes', 'Sofia Castillo', 'Isabella Guerrero', 'Camila Fuentes',
    'Lucia Herrera', 'Marisol Vega', 'Catalina Moreno', 'Adriana Sandoval',
    'Elena Padilla', 'Rosa Cervantes', 'Gabriela Dominguez', 'Carmen Espinoza',
    
    // Asian
    'Jennifer Tran', 'Michelle Nguyen', 'Lisa Wang', 'Amy Tanaka',
    'Christine Park', 'Diana Chang', 'Victoria Lam', 'Angela Suzuki',
    'Stephanie Liu', 'Grace Kim', 'Helen Yamada', 'Cindy Zhao',
    
    // South Asian
    'Priya Patel', 'Ananya Sharma', 'Neha Kapoor', 'Divya Singh',
    'Meera Gupta', 'Kavita Reddy', 'Sunita Malhotra', 'Aisha Hussain',
    
    // Middle Eastern
    'Leila Mansour', 'Yasmin Farouk', 'Nadia Khalil', 'Samira Aydin',
];

// ═══════════════════════════════════════════════════════════════════════════
// MAIN FIX FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

async function fixHorseNames() {
    console.log('🐴 FIXING HORSE NAMES\n');
    console.log('═'.repeat(60));

    // Get all content_authors added today
    const { data: todayHorses, error } = await supabase
        .from('content_authors')
        .select('id, name, alias, gender, profile_id, location, bio')
        .gte('created_at', '2026-03-11T00:00:00')
        .order('id');

    if (error) { console.error('Query failed:', error.message); return; }
    console.log(`Found ${todayHorses?.length || 0} horses to fix\n`);

    if (!todayHorses?.length) return;

    // Detect which horses need name fixes (alias-style names)
    const needsNameFix = todayHorses.filter(h => {
        // Check if name looks like an alias (short with abbreviation, no real last name)
        const name = h.name || '';
        // Real names: "Marcus Chen", "Sarah Mitchell" — have first + last with no abbreviations
        // Alias names: "HUDMaster HM", "SwingTrader", "GTOPlayer GP" — have abbreviations or single words
        const parts = name.split(' ');
        if (parts.length === 1) return true; // Single word = alias
        if (parts.length === 2 && parts[1].length <= 3) return true; // "AutoFold AF" pattern
        if (name.match(/[A-Z]{2,}/)) return true; // Contains abbreviation like GTO, HUD
        return false;
    });

    console.log(`Horses needing name fix: ${needsNameFix.length}`);

    // Create shuffled name pools
    const malePool = [...MALE_NAMES].sort(() => Math.random() - 0.5);
    const femalePool = [...FEMALE_NAMES].sort(() => Math.random() - 0.5);
    let maleIdx = 0;
    let femaleIdx = 0;

    // Assign ~30% female, 70% male for diversity (matching the original 80/20)
    // But we'll aim for better representation: 35% female
    const updates = [];
    let femaleCount = 0;
    const targetFemalePercent = 0.35;

    for (const horse of needsNameFix) {
        const currentPercent = updates.length > 0 ? femaleCount / updates.length : 0;
        const makeFemale = currentPercent < targetFemalePercent && femaleIdx < femalePool.length;
        
        let newName;
        let newGender;

        if (makeFemale) {
            newName = femalePool[femaleIdx++];
            newGender = 'female';
            femaleCount++;
        } else {
            newName = malePool[maleIdx++];
            newGender = 'male';
        }

        if (!newName) {
            console.warn(`Ran out of names at index ${updates.length}`);
            break;
        }

        updates.push({
            id: horse.id,
            oldName: horse.name,
            newName,
            newGender,
            profileId: horse.profile_id,
            alias: horse.alias
        });
    }

    console.log(`\nPrepared ${updates.length} name updates`);
    console.log(`Gender split: ${femaleCount} female / ${updates.length - femaleCount} male\n`);

    // Apply updates in batches
    let success = 0;
    let profilesUpdated = 0;
    const BATCH_SIZE = 25;

    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        for (const update of batch) {
            // 1. Update content_authors
            const { error: authError } = await supabase
                .from('content_authors')
                .update({ 
                    name: update.newName,
                    gender: update.newGender 
                })
                .eq('id', update.id);

            if (authError) {
                console.error(`  ❌ ${update.oldName}: ${authError.message}`);
                continue;
            }

            // 2. Update profiles.display_name if profile exists
            if (update.profileId) {
                const { error: profError } = await supabase
                    .from('profiles')
                    .update({ display_name: update.newName })
                    .eq('id', update.profileId);

                if (!profError) profilesUpdated++;
            }

            success++;
        }

        console.log(`Batch ${batchNum}: ${batch.length} updates applied`);
        // Show samples
        batch.slice(0, 3).forEach(u => {
            console.log(`  "${u.oldName}" → "${u.newName}" (${u.newGender})`);
        });
    }

    console.log('\n' + '═'.repeat(60));
    console.log(`✅ DONE! ${success} horse names updated`);
    console.log(`   Profiles updated: ${profilesUpdated}`);
    console.log(`   Gender: ${femaleCount} female / ${success - femaleCount} male`);
    console.log('═'.repeat(60));
}

fixHorseNames().catch(console.error);
