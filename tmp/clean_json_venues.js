/**
 * Clean all-venues.json:
 * 1. Remove 49 duplicate venues (set is_active=false)
 * 2. Fix 52 "Casino Casino" name issues
 */
const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, '..', 'data', 'all-venues.json');
const data = require(jsonPath);
const venues = data.venues || data.data || data || [];

console.log(`Before: ${venues.length} venues`);

const dupeIds = new Set([1947, 2296, 2314, 2346, 2496, 2618, 2627, 2628, 2630, 2631, 2634, 2640, 2642, 2644, 2648, 2650, 2651, 2656, 2659, 2660, 2661, 2664, 2666, 2667, 2669, 2670, 2673, 2675, 2679, 2684, 2693, 2707, 2708, 2711, 2714, 2742, 2743, 2752, 2754, 3067, 3101, 3103, 3111, 3126, 3129, 3341, 3343, 3344, 3345]);

// Name fixes map: id -> corrected name
const nameFixes = {
    2845: 'Skyline Casino',
    2847: 'The Nash Casino',
    2854: 'Maverick Casino',
    2857: 'Riverside Resort & Casino',
    2858: 'Stagecoach Casino',
    2859: 'Wendover Nugget Casino',
    2860: '19th Hole Casino',
    2861: '500 Club Casino',
    2863: 'Aviator Casino',
    2864: 'Bear River Casino',
    2865: 'Blue Lake Casino',
    2866: 'Casino Chico',
    2871: "Diamond Jim's Casino",
    2872: 'El Dorado Hills Casino',
    2873: 'Golden West Casino',
    2875: 'Lake Elsinore Casino',
    2876: "Larry Flynt's Lucky Lady Casino",
    2877: 'Napa Valley Casino',
    2878: "Ocean's 11 Casino",
    2879: 'Oceanview Casino',
    2881: 'Palace Poker Casino',
    2884: 'Players Casino',
    2885: 'Seven Mile Casino',
    2886: 'Stars Casino',
    2887: 'Towers Casino',
    2888: 'Wanaaha Casino',
    2889: 'Big Easy Casino',
    2956: 'Seneca Salamanca Casino',
    2957: 'Tioga Downs Casino',
    2958: 'American Place Casino',
    2965: 'Bay Mills Resort & Casino',
    2967: 'Island Casino',
    2972: 'Odawa Casino',
    2988: 'Three Rivers Casino',
    2989: 'Wildhorse Casino',
    2990: '7 Cedars Casino',
    2994: 'All Star Lanes & Casino',
    2995: 'Black Pearl Casino',
    3006: 'Clearwater Saloon & Casino',
    3013: 'Jokers Casino',
    3015: 'Legends Casino',
    3016: 'Lilac Lanes & Casino',
    3017: 'Little Creek Casino',
    3020: "Papa's Sports Lounge & Casino",
    3022: 'Roxbury Lanes Casino',
    3023: 'Slo Pitch Sports Grill & Casino',
    3024: 'The Last Frontier Casino',
    3025: 'Wild Goose Casino',
    3026: 'Desert Diamond Casino',
    3034: 'Sky Ute Casino',
    3035: 'Ute Mountain Casino',
    3037: 'Fortune Bay Casino',
    3041: 'Shooting Star Casino',
};

let deactivated = 0;
let nameFixed = 0;

for (const v of venues) {
    // Deactivate duplicates
    if (dupeIds.has(v.id)) {
        v.is_active = false;
        deactivated++;
    }
    
    // Fix names
    if (nameFixes[v.id]) {
        v.name = nameFixes[v.id];
        nameFixed++;
    }
}

console.log(`Deactivated: ${deactivated}`);
console.log(`Names fixed: ${nameFixed}`);

// Write back
const output = data.venues ? { ...data, venues } : venues;
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2) + '\n');
console.log(`Updated ${jsonPath}`);

// Verify
const afterData = require(jsonPath);
const afterVenues = afterData.venues || afterData;
const activeCount = afterVenues.filter(v => v.is_active !== false).length;
console.log(`After: ${afterVenues.length} total, ${activeCount} active`);
