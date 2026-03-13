/**
 * COMPREHENSIVE UPDATE: All 347 horses in the content_authors table
 * - Generates unique 1-2 word aliases for every single one
 * - Removes ALL references to AI, horse, smarter.poker, bot from bios
 * - Replaces "AI grinder horse persona" bios with real-sounding bios
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kuklfnapbkmacvwxktbh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1a2xmbmFwYmttYWN2d3hrdGJoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3MzA4NDQsImV4cCI6MjA4MzMwNjg0NH0.ZGFrUYq7yAbkveFdudh4q_Xk0qN0AZ-jnu4FkX9YKjo';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════════
// 347 UNIQUE ALIASES — Every one is distinct, 1-2 words
// Mix of actual names, poker-themed names, screen name styles
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
  // 50
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
  "Maelstrom", "NightOwl", "Oxide", "Polaris", "Quest",
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
  "Ninja", "Olympus", "Patriot", "Quinn",
  // 347 (we have 349 here, buffer of 2 for safety)
  "Rampart", "Stallion",
];

// ═══════════════════════════════════════════════════════════════
// BIO TEMPLATES — Real sounding bios based on specialty/location
// ═══════════════════════════════════════════════════════════════
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

async function updateAll347() {
  console.log('🔄 Fetching ALL content_authors...\n');

  // Fetch all authors
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

  if (allAuthors.length > UNIQUE_ALIASES.length) {
    console.error(`❌ Need ${allAuthors.length} aliases but only have ${UNIQUE_ALIASES.length}!`);
    process.exit(1);
  }

  // Check for alias uniqueness
  const aliasSet = new Set(UNIQUE_ALIASES.slice(0, allAuthors.length).map(a => a.toLowerCase()));
  if (aliasSet.size < allAuthors.length) {
    console.error('❌ Duplicate aliases detected!');
    process.exit(1);
  }

  let updated = 0;
  let errors = 0;
  let biosCleaned = 0;

  for (let i = 0; i < allAuthors.length; i++) {
    const author = allAuthors[i];
    const newAlias = UNIQUE_ALIASES[i];

    // Determine if bio needs replacement
    let newBio = author.bio || '';
    const needsBioReplace = 
      /\bAI\b/i.test(newBio) || 
      /\bhorse\b/i.test(newBio) || 
      /\bsmarter\.poker\b/i.test(newBio) || 
      /\bbot\b/i.test(newBio) ||
      /\bClub Arena\b/i.test(newBio) ||
      /\bUsername:/i.test(newBio) ||
      /\bgrinder horse persona\b/i.test(newBio);

    if (needsBioReplace) {
      newBio = getCleanBio(author, i);
      biosCleaned++;
    }

    // Update in database
    const { error: updateErr } = await supabase
      .from('content_authors')
      .update({ alias: newAlias, bio: newBio })
      .eq('id', author.id);

    if (updateErr) {
      console.error(`  ❌ ${author.name}: ${updateErr.message}`);
      errors++;
    } else {
      updated++;
      if (updated <= 15 || updated % 50 === 0) {
        const bioFlag = needsBioReplace ? ' [bio cleaned]' : '';
        console.log(`  ✅ #${updated} ${author.name}: "${author.alias}" → "${newAlias}"${bioFlag}`);
      }
    }
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🎉 DONE!`);
  console.log(`   ✅ ${updated} aliases updated`);
  console.log(`   🧹 ${biosCleaned} bios cleaned (removed AI/horse/smarter.poker references)`);
  console.log(`   ❌ ${errors} errors`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

updateAll347().catch(console.error);
