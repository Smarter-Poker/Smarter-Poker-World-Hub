-- ═══════════════════════════════════════════════════════════════════
-- CLEANUP: Remove generic duplicate venues from poker_venues
-- ═══════════════════════════════════════════════════════════════════
-- Audit identified 49 duplicate venue records and 52 name quality issues.
-- 
-- CATEGORY 1: TRUE DUPLICATES — same venue appearing twice with slightly
--   different names (e.g., "Delaware Park" + "Delaware Park Casino")
--
-- CATEGORY 2: SERIES ENTRIES — poker series records that duplicate
--   the base venue they're hosted at (e.g., "South Point Poker Series"
--   duplicates "South Point Casino"). The base venue is kept.
--
-- CATEGORY 3: NAME FIXES — 52 venues with "Casino Casino" double-word
--   issue from a bulk import bug.
-- ═══════════════════════════════════════════════════════════════════

-- ═══ STEP 1: Soft-delete 49 duplicate venues (set is_active = false) ═══
-- These are either exact duplicates or series entries that duplicate base venues.
-- Keeping the record with richer data (logo, games, trust score, etc.)
UPDATE poker_venues SET is_active = false WHERE id IN (
    -- TRUE DUPLICATES (Category 1)
    2631,  -- Thunder Valley Poker Series (dupe of Thunder Valley Casino #1824)
    2627,  -- Choctaw Poker Series (dupe of Choctaw Casino Resort #1840)
    3101,  -- Hard Rock Casino Cincinnati (dupe of Hard Rock Cincinnati #1879)
    2656,  -- River Spirit Poker Series (dupe of River Spirit Casino #1882)
    3129,  -- Rivers Pittsburgh (dupe of Rivers Casino Pittsburgh #1889)
    2666,  -- Muckleshoot Poker Series (dupe of Muckleshoot Casino #1893)
    3067,  -- Horseshoe Casino Bossier City (dupe of Horseshoe Bossier City #1907)
    2346,  -- Ameristar Kansas City (dupe of Ameristar Casino Hotel Kansas City #1929)
    2707,  -- Derby Lane Poker Series (dupe of Derby Lane Poker Room #1943)
    2634,  -- South Point Poker Series (dupe of South Point Casino #1987)
    2675,  -- Orleans Poker Series (dupe of Orleans Casino #1988)
    3111,  -- Horseshoe Tunica (dupe of Horseshoe Casino Tunica #2032)
    2630,  -- Aria Poker Classic (dupe of Aria Casino #2036)
    2754,  -- Magic City Poker Open (dupe of Magic City Casino #2235)
    3345,  -- Seminole Brighton Poker Series (dupe of Seminole Brighton #2244)
    3344,  -- Sarasota Kennel Club Poker Series (dupe of Sarasota Kennel Club #2256)
    3343,  -- Prime Social Poker Series (dupe of Prime Social #2262)
    2314,  -- Hollywood Aurora (dupe of Hollywood Casino Aurora #2654)
    2496,  -- Delaware Park (dupe of Delaware Park Casino #2692)
    2640,  -- FireKeepers Casino Poker Series (dupe of FireKeepers Casino Hotel #2730)
    2669,  -- Horseshoe Council Bluffs Poker Series (dupe of Horseshoe Council Bluffs #2701)
    
    -- SERIES DUPLICATING BASE VENUES (Category 2)
    2673,  -- Bellagio Five Diamond Poker Classic (base = Bellagio Poker Room #2499)
    2684,  -- Graton Poker Series (base = Graton Resort & Casino #1823)
    2618,  -- Seminole Hard Rock Poker Open (base = Seminole Hard Rock Hollywood #1825)
    2752,  -- Hard Rock Tampa Poker Series (base = Seminole Hard Rock Tampa #1826)
    2708,  -- Tampa Bay Downs Poker Series (base = Silks Poker Tampa Bay Downs #1948)
    3126,  -- Jacksonville Poker Room (base = bestbet Jacksonville #1827)
    2296,  -- Resorts Casino (base = Resorts Casino Atlantic City #1897)
    2650,  -- Parx Big Stax Poker Series (base = Parx Casino #1833)
    2642,  -- Foxwoods Poker Classic (base = Foxwoods Resort Casino #1835)
    2711,  -- Live Casino Poker Series (base = Live! Casino Maryland #1837)
    3103,  -- Turning Stone Casino (base = Turning Stone Resort #1839)
    2628,  -- WinStar Poker Series (base = WinStar World Casino #1842)
    2742,  -- Potawatomi Poker Series (base = Potawatomi Hotel & Casino #1846)
    2664,  -- Talking Stick Poker Series (base = Talking Stick Resort #1853)
    2644,  -- Rivers Casino Poker Series (base = Rivers Casino Des Plaines #1868)
    2693,  -- Cherokee Poker Classic (base = Harrah's Cherokee #1878)
    2651,  -- SugarHouse Poker Series (base = SugarHouse Philadelphia #2302)
    2667,  -- Tulalip Poker Series (base = Tulalip Resort Casino #1894)
    2714,  -- Livermore Poker Room Series (base = Livermore Casino #1940)
    1947,  -- Ebro Poker Room (base = Ebro Greyhound Park #2249)
    2661,  -- Canterbury Park Poker Classic (base = Canterbury Park Card Club #1983)
    2679,  -- Hawaiian Gardens Poker Series (base = Gardens Casino #2186)
    3341,  -- Bike Series (The Bicycle Casino) (base = The Bicycle Casino #2505)
    2743,  -- Mohegan Sun Fall Poker Championship (dupe of Mohegan Sun Poker Series #2643)
    2648,  -- Pearl River Poker Open (base = Pearl River Resort #3062)
    2659,  -- Black Hawk Poker Classic (base = generic + overlaps Horseshoe Black Hawk #3031)
    2660,  -- Ameristar Black Hawk Poker Series (base = generic + already deactivated)
    2670   -- Boomtown Poker Series (base = Boomtown Casino New Orleans #3064)
);

-- ═══ STEP 2: Fix 52 "Casino Casino" double-word name issues ═══
UPDATE poker_venues SET name = 'Skyline Casino' WHERE id = 2845;
UPDATE poker_venues SET name = 'The Nash Casino' WHERE id = 2847;
UPDATE poker_venues SET name = 'Maverick Casino' WHERE id = 2854;
UPDATE poker_venues SET name = 'Riverside Resort & Casino' WHERE id = 2857;
UPDATE poker_venues SET name = 'Stagecoach Casino' WHERE id = 2858;
UPDATE poker_venues SET name = 'Wendover Nugget Casino' WHERE id = 2859;
UPDATE poker_venues SET name = '19th Hole Casino' WHERE id = 2860;
UPDATE poker_venues SET name = '500 Club Casino' WHERE id = 2861;
UPDATE poker_venues SET name = 'Aviator Casino' WHERE id = 2863;
UPDATE poker_venues SET name = 'Bear River Casino' WHERE id = 2864;
UPDATE poker_venues SET name = 'Blue Lake Casino' WHERE id = 2865;
UPDATE poker_venues SET name = 'Casino Chico' WHERE id = 2866;
UPDATE poker_venues SET name = 'Diamond Jim''s Casino' WHERE id = 2871;
UPDATE poker_venues SET name = 'El Dorado Hills Casino' WHERE id = 2872;
UPDATE poker_venues SET name = 'Golden West Casino' WHERE id = 2873;
UPDATE poker_venues SET name = 'Lake Elsinore Casino' WHERE id = 2875;
UPDATE poker_venues SET name = 'Larry Flynt''s Lucky Lady Casino' WHERE id = 2876;
UPDATE poker_venues SET name = 'Napa Valley Casino' WHERE id = 2877;
UPDATE poker_venues SET name = 'Ocean''s 11 Casino' WHERE id = 2878;
UPDATE poker_venues SET name = 'Oceanview Casino' WHERE id = 2879;
UPDATE poker_venues SET name = 'Palace Poker Casino' WHERE id = 2881;
UPDATE poker_venues SET name = 'Players Casino' WHERE id = 2884;
UPDATE poker_venues SET name = 'Seven Mile Casino' WHERE id = 2885;
UPDATE poker_venues SET name = 'Stars Casino' WHERE id = 2886;
UPDATE poker_venues SET name = 'Towers Casino' WHERE id = 2887;
UPDATE poker_venues SET name = 'Wanaaha Casino' WHERE id = 2888;
UPDATE poker_venues SET name = 'Big Easy Casino' WHERE id = 2889;
UPDATE poker_venues SET name = 'Seneca Salamanca Casino' WHERE id = 2956;
UPDATE poker_venues SET name = 'Tioga Downs Casino' WHERE id = 2957;
UPDATE poker_venues SET name = 'American Place Casino' WHERE id = 2958;
UPDATE poker_venues SET name = 'Bay Mills Resort & Casino' WHERE id = 2965;
UPDATE poker_venues SET name = 'Island Casino' WHERE id = 2967;
UPDATE poker_venues SET name = 'Odawa Casino' WHERE id = 2972;
UPDATE poker_venues SET name = 'Three Rivers Casino' WHERE id = 2988;
UPDATE poker_venues SET name = 'Wildhorse Casino' WHERE id = 2989;
UPDATE poker_venues SET name = '7 Cedars Casino' WHERE id = 2990;
UPDATE poker_venues SET name = 'All Star Lanes & Casino' WHERE id = 2994;
UPDATE poker_venues SET name = 'Black Pearl Casino' WHERE id = 2995;
UPDATE poker_venues SET name = 'Clearwater Saloon & Casino' WHERE id = 3006;
UPDATE poker_venues SET name = 'Jokers Casino' WHERE id = 3013;
UPDATE poker_venues SET name = 'Legends Casino' WHERE id = 3015;
UPDATE poker_venues SET name = 'Lilac Lanes & Casino' WHERE id = 3016;
UPDATE poker_venues SET name = 'Little Creek Casino' WHERE id = 3017;
UPDATE poker_venues SET name = 'Papa''s Sports Lounge & Casino' WHERE id = 3020;
UPDATE poker_venues SET name = 'Roxbury Lanes Casino' WHERE id = 3022;
UPDATE poker_venues SET name = 'Slo Pitch Sports Grill & Casino' WHERE id = 3023;
UPDATE poker_venues SET name = 'The Last Frontier Casino' WHERE id = 3024;
UPDATE poker_venues SET name = 'Wild Goose Casino' WHERE id = 3025;
UPDATE poker_venues SET name = 'Desert Diamond Casino' WHERE id = 3026;
UPDATE poker_venues SET name = 'Sky Ute Casino' WHERE id = 3034;
UPDATE poker_venues SET name = 'Ute Mountain Casino' WHERE id = 3035;
UPDATE poker_venues SET name = 'Fortune Bay Casino' WHERE id = 3037;
UPDATE poker_venues SET name = 'Shooting Star Casino' WHERE id = 3041;
