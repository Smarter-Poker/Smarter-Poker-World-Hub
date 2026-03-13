/**
 * COMPREHENSIVE UPDATE: All 347 horses — using SERVICE ROLE KEY to bypass RLS
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
// SERVICE ROLE KEY — bypasses Row Level Security
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzczMDg0NCwiZXhwIjoyMDgzMzA2ODQ0fQ.bbDqj-me78PID99npWCZ5qUuINSC1-eCBb1BVhgiSRs';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════════
// 350 UNIQUE ALIASES — every one distinct
// ═══════════════════════════════════════════════════════════════
const UNIQUE_ALIASES = [
  "Kingfish", "LadyLuck22", "Nighthawk", "ByteSize", "Caliente305",
  "Sandstorm", "SnowCap", "Mainframe", "Velvet9", "BigJimmy",
  "PhoKing", "RoseBud", "IronMajor", "Melody", "Southie",
  "Peachtree", "MissChalk", "Gearshift", "Frostbite", "PixelQ",
  "Sunburn", "OldSchool", "Bankvault", "GhostRun", "SmokeyQ",
  "Sparkle26", "Buckeye", "TonyAces", "DesertRose", "CodeBreaker",
  "Riveter", "TexasT", "Checkmate", "Jazzy", "SoonerMagic",
  "Roadrunner", "MintJulep", "Ironside", "SpudQueen", "BlueSoul",
  "Roughneck", "GoldRush42", "CharmCity", "BrewDog", "Anchor45",
  "RedBird", "Rocketman", "Magnolia", "FourCard", "TikiBar",
  "Tundra", "Dusty52", "Trailblazer", "Jax54", "Undertow",
  "AltitudeK", "Cruiser", "Blizzard", "TriangleMom", "Sidewinder",
  "Cornfield", "Scrapper", "Borderline", "Thoroughbred", "CoastalT",
  "OldCowboy", "SweetTea", "Ridgeline", "Cornhusker", "Bayou70",
  "Ridgerunner", "Harvester", "DuckCall", "Turnpike", "StatGirl",
  "Sunbird", "Underdog", "Drizzle", "Prairiegal", "Catfish80",
  "Debugger", "Mitten", "NaturalState", "Flotsam", "Actuary",
  "Citrus", "Tigerbait", "Magnolia88", "Piedmont", "Frontera",
  "SaltCity", "BlueDevil", "LowCountry", "Valleyboy", "Launchpad",
  "Rubberband", "Aviator", "MileHigh", "SunDevil", "EmpireGabi",
  // 100
  "ShadowRail", "NeonDusk", "QuietStorm", "HotSauce", "Maverick7",
  "ButtonClick", "SilkRoad", "HammerTime", "Pebbles", "Viper22",
  "SteelTrap", "CoolHand", "Gadget", "DriftWood", "MarbleFox",
  "Torch", "BlackIce", "Remedy", "GoldenArm", "Twister",
  "MojoRisin", "Falcon", "BrickHouse", "Cyclone", "Echo9",
  "Nitro", "Zenith", "Quickdraw", "Pharaoh", "Atlas",
  "Wildfire", "Tempest", "Radar", "Oasis", "Phantom",
  "Diesel", "Mercury", "Saber", "Canyon", "Bolt12",
  "Raven", "Sterling", "Flint", "Nova", "Onyx",
  "Rogue", "Zephyr", "Cobalt", "Turbo", "Granite",
  // 150
  "Ember", "Jester", "Vector", "Summit", "Lasso",
  "Prism", "Comet", "Raptor", "Dynamo", "Ridge",
  "Stryker", "Venom", "Jupiter", "Forge", "Cinder",
  "Blaze", "Titan", "Nomad", "Krypto", "Ranger",
  "Saxon", "Viking", "Apex", "Ronin", "Banshee",
  "Crux", "Jade", "Paladin", "Reaper", "Scout",
  "Thunder", "Frost", "Wraith", "Arrow", "Bishop",
  "Clover", "Dagger", "Griffin", "Hawk", "Jackal",
  "Knight", "Lynx", "Mustang", "Neptune", "Oracle",
  "Pike", "Quartz", "Rebel", "Spartan", "Tank",
  // 200
  "Ursa", "Vandal", "Warden", "Xander", "Yeti",
  "Zodiac", "Ace88", "BombPot", "Cashew", "Delta9",
  "Enigma", "Firefly", "Goliath", "Hercules", "Ivory",
  "Jigsaw", "Kicker", "Lariat", "Matrix", "Neutron",
  "Outlaw", "Panther", "Quantum", "Rampage", "Scorpio",
  "Tandem", "Umbra", "Vertex", "Whiskey", "Xray",
  "Yankee", "Zenon", "Alamo", "Bravo6", "Cascade",
  "Domino", "Eclipse", "Flare", "Gambit", "Horizon",
  "Indigo", "Jolt", "Karma", "Laguna", "Monsoon",
  "Nebula", "Osprey", "Pyro", "Quasar", "Ripple",
  // 250
  "Salvo", "Tango", "Utah", "Vortex", "Wasp",
  "Xenon", "Yukon", "Zapper", "Ammo", "Beacon",
  "Cobblestone", "Dash", "Equinox", "Fury", "Glacier",
  "Halo", "Inferno", "Jetstream", "Kodiak", "Lunar",
  "Magnet", "Niner", "Obsidian", "Pulsar", "Radiant",
  "Sabre", "Talon", "Upshot", "Vapor", "Warthog",
  "Xeno", "Yonder", "Zenith2", "Archon", "Blaster",
  "Catalyst", "Drake", "Everest", "Firebolt", "Grim",
  "Hammer", "Impulse", "Javelin", "Kenai", "Lockdown",
  "Maelstrom", "NightOwl", "Oxide", "Polaris", "QuestR",
  // 300
  "Riptide", "Sentinel", "Trident", "Umbra2", "Vulcan",
  "Warpath", "Xpress", "Yellowjack", "Zulu", "Angler",
  "Bison", "Crusader", "Depot", "Electron", "Freeway",
  "Gizmo", "Husky", "Ibex", "Jackpot", "Kestrel",
  "Leopard", "Marathon", "Napper", "Outcast", "Prowler",
  "Quake", "Rapture", "Sledge", "Trooper", "Uplink",
  "Vanguard", "Wolfpack", "Axle", "Bounty", "Chrome",
  "Dynamo2", "Eagle", "Foxhound", "Grizzly", "Havoc",
  "Ironclad", "Judge", "Kingpin", "Lancer", "Monarch",
  "Ninja", "Olympus", "Patriot", "Quinn", "Rampart",
  // 350
];

const bioTemplates = {
  cash_games: [
    "Regular at the local card room. Focused on fundamentals and bankroll management.",
    "Full-time cash game player. Reads and adjustments are the edge.",
    "Grinding the felt, one session at a time. Patience pays.",
    "Cash game specialist who values position and pot control.",
    "Disciplined player focused on long-term profit. No shortcuts.",
    "Started small, built up through smart play. Consistency is key.",
    "Value betting is an art form. Ask my opponents.",
    "The grind never stops. Chips don't lie.",
  ],
  tournaments: [
    "Tournament player chasing final tables. ICM is life.",
    "Circuit grinder with a taste for deep runs. Bubble play is key.",
    "Love the pressure of late-stage tournament play.",
    "MTT specialist who lives for the final table rush.",
    "Satellite pro — turning small buy-ins into big dreams.",
    "Every tournament is a new story. Let's write one.",
    "Short stack ninja. You'd be surprised what I can do with 15BB.",
    "Fight for every chip, every blind, every pot.",
  ],
  online: [
    "Multi-tabling online grinder. Volume is the game plan.",
    "Online specialist with a focus on database analysis.",
    "Screen time is my edge. The virtual felt is my office.",
    "Grinding online with discipline and a solid study routine.",
    "Stats don't lie — and neither does my win rate.",
    "6-tabling from the comfort of home. Living the dream.",
    "Online poker taught me patience and math. Both paying off.",
    "Data-driven approach to online play. Always adapting.",
  ],
  gto: [
    "Solver work informs my play, but reads close the gap.",
    "GTO student forever. The math doesn't care about your feelings.",
    "Balancing ranges is what I do. Theory meets practice.",
    "Studied game theory before it was mainstream. Still learning.",
    "Equilibrium strategies with exploitative adjustments.",
    "Range analysis is my pregame ritual. Prepared for anything.",
    "Solver outputs guide the way. Exploits finish the job.",
    "Pure strategy with calculated deviations. Balance is everything.",
  ],
  live_cash: [
    "Live player who values table talk and physical tells.",
    "Nothing beats the feel of live chips. Card room regular.",
    "Live cash enthusiast. People skills matter more than solver skills.",
    "The live game is where I belong. Reading people is my edge.",
    "Regular at the local room. The games are good here.",
    "Prefer the live atmosphere. Online can't replicate the energy.",
    "Table presence matters. Confidence is half the battle.",
    "Live poker is a social game. I happen to win at it.",
  ],
  high_stakes: [
    "Moved up through discipline. The games get better up here.",
    "High stakes player focused on elite competition.",
    "Playing against the best to become the best.",
    "Big game regular. The pressure refines the craft.",
  ],
  plo: [
    "PLO is the action game. Four cards, endless possibilities.",
    "Pot-limit Omaha specialist. More cards, more fun.",
    "Transitioned from hold'em and never looked back. PLO forever.",
    "PLO is complex, chaotic, and beautiful. My kind of game.",
  ],
  mixed_games: [
    "Mixed game specialist. Variety keeps the mind sharp.",
    "8-game mix enthusiast. One trick ponies don't survive here.",
    "Every poker variant has something to teach. I play them all.",
    "Stud, Omaha, hold'em — bring it all. Mixed games are real poker.",
  ],
  live_reads: [
    "Body language is my database. Live tells don't lie.",
    "Physical reads and behavioral patterns are my specialty.",
    "Eyes, hands, posture — everything tells a story.",
    "Exploitative player who adapts to individuals. No two players alike.",
  ],
  home_games: [
    "Home game host and community builder. Poker brings people together.",
    "Running a weekly game for years. The best poker is among friends.",
    "Community-focused player. Great games start with great people.",
    "Home game veteran. The social side of poker matters most.",
  ],
};

const defaultBios = [
  "Passionate player focused on continuous improvement.",
  "Playing smart, studying hard, and enjoying the game.",
  "Poker is a journey, not a destination. Always learning.",
  "Dedicated to the craft. Every session is a lesson.",
  "Grinding and growing every day. The felt never lies.",
  "Focused on making good decisions. Results follow.",
  "Been playing for years and still finding new edges.",
  "Love the game. Respect the process.",
];

function getCleanBio(author, index) {
  const specialty = author.specialty || '';
  const templates = bioTemplates[specialty] || defaultBios;
  return templates[index % templates.length];
}

function needsBioClean(bio) {
  if (!bio) return false;
  return /\bAI\b/i.test(bio) || 
    /\bhorse\b/i.test(bio) || 
    /\bsmarter\.poker\b/i.test(bio) || 
    /\bbot\b/i.test(bio) ||
    /\bClub Arena\b/i.test(bio) ||
    /\bUsername:/i.test(bio) ||
    /\bgrinder.*persona\b/i.test(bio);
}

async function updateAll() {
  console.log('🔄 Fetching ALL content_authors with SERVICE ROLE KEY...\n');

  let allAuthors = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('content_authors')
      .select('id, name, alias, bio, specialty, location')
      .order('name')
      .range(offset, offset + 499);

    if (error) { console.error('Fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    allAuthors = allAuthors.concat(data);
    if (data.length < 500) break;
    offset += 500;
  }

  console.log(`📦 Found ${allAuthors.length} authors total\n`);

  let updated = 0;
  let errors = 0;
  let biosCleaned = 0;

  for (let i = 0; i < allAuthors.length; i++) {
    const author = allAuthors[i];
    const newAlias = UNIQUE_ALIASES[i];

    if (!newAlias) {
      console.error(`❌ No alias for index ${i} (${author.name})`);
      errors++;
      continue;
    }

    let newBio = author.bio || '';
    const bioNeedsClean = needsBioClean(newBio);
    if (bioNeedsClean) {
      newBio = getCleanBio(author, i);
      biosCleaned++;
    }

    const { data, error: updateErr } = await supabase
      .from('content_authors')
      .update({ alias: newAlias, bio: newBio })
      .eq('id', author.id)
      .select('id, alias');

    if (updateErr) {
      console.error(`  ❌ ${author.name}: ${updateErr.message}`);
      errors++;
    } else if (!data || data.length === 0) {
      console.error(`  ⚠️ ${author.name}: Update returned no data (RLS block?)`);
      errors++;
    } else {
      updated++;
      if (updated <= 20 || updated % 50 === 0 || updated === allAuthors.length) {
        const bioFlag = bioNeedsClean ? ' [bio cleaned]' : '';
        console.log(`  ✅ #${updated} ${author.name}: "${author.alias}" → "${newAlias}"${bioFlag}`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 DONE!`);
  console.log(`   ✅ ${updated} aliases updated`);
  console.log(`   🧹 ${biosCleaned} bios cleaned`);
  console.log(`   ❌ ${errors} errors`);
  
  // Verify a sample
  console.log('\n=== VERIFICATION SAMPLE ===');
  const { data: sample } = await supabase
    .from('content_authors')
    .select('name, alias, bio')
    .order('name')
    .limit(10);
  sample?.forEach(a => console.log(`  ${a.name}: @${a.alias} — "${a.bio?.substring(0, 60)}"`));

  // Check for any remaining bad bios
  const { data: badBios } = await supabase
    .from('content_authors')
    .select('name, alias, bio')
    .or('bio.ilike.%AI grinder%,bio.ilike.%horse persona%,bio.ilike.%smarter.poker%');
  console.log(`\n  Remaining bad bios: ${badBios?.length || 0}`);
}

updateAll().catch(console.error);
