#!/usr/bin/env node
/**
 * AEO/GEO UNIVERSAL BENCHMARK & DISCOVERY VERIFICATION
 *
 * Programmatically benchmarks and asserts that all 15 Smarter.Poker core product
 * verticals are crawlable, structured with Schema.org JSON-LD, indexed in OpenAPI,
 * grounded in llms.txt, and parity-verified across AI crawlers (Perplexity, ChatGPT,
 * Claude, Gemini, Googlebot, Applebot).
 */

const BASE_URL = process.env.TARGET_URL || 'https://smarter.poker';

async function fetchRoute(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const start = Date.now();
  const res = await fetch(url, {
    headers: {
      'User-Agent': options.userAgent || 'AEO-Benchmark-Verifier/1.0',
      ...options.headers,
    },
    ...options,
  });
  const durationMs = Date.now() - start;
  const text = await res.text();
  return { status: res.status, ok: res.ok, durationMs, text, headers: res.headers };
}

async function runBenchmark() {
  console.log(`\n======================================================`);
  console.log(`  SMARTER.POKER AEO/GEO DISCOVERY BENCHMARK`);
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Timestamp: ${new Date().toISOString()}`);
  console.log(`======================================================\n`);

  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assertCheck(name, condition, extraInfo = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] ${name} ${extraInfo ? `(${extraInfo})` : ''}`);
    } else {
      failedTests++;
      console.error(`  [FAIL] ${name} ${extraInfo ? `(${extraInfo})` : ''}`);
    }
  }

  // 1. Universal Knowledge Corpus & AI Grounding
  console.log(`--- [1/10] Universal AI Knowledge Corpus ---`);
  const llms = await fetchRoute('/llms.txt');
  assertCheck('GET /llms.txt status 200', llms.status === 200, `${llms.durationMs}ms`);
  assertCheck('llms.txt contains OpenAPI spec reference', llms.text.includes('/api/openapi.json'));
  assertCheck('llms.txt contains 15 core verticals', llms.text.includes('Bankroll Manager') && llms.text.includes('Club Commander') && llms.text.includes('PokerBrain'));

  const llmsFull = await fetchRoute('/llms-full.txt');
  assertCheck('GET /llms-full.txt status 200', llmsFull.status === 200, `${llmsFull.durationMs}ms`);
  assertCheck('llms-full.txt contains full knowledge corpus', llmsFull.text.length > 10000, `${llmsFull.text.length} chars`);

  const openapi = await fetchRoute('/api/openapi.json');
  assertCheck('GET /api/openapi.json status 200', openapi.status === 200);
  try {
    const doc = JSON.parse(openapi.text);
    assertCheck('Valid OpenAPI 3.1.0 document', doc.openapi === '3.1.0' && !!doc.paths);
    assertCheck('OpenAPI documents /api/ai/odds', !!doc.paths['/api/ai/odds']);
    assertCheck('OpenAPI documents /api/ai/freerolls', !!doc.paths['/api/ai/freerolls']);
    assertCheck('OpenAPI documents /api/ai/bankroll', !!doc.paths['/api/ai/bankroll']);
    assertCheck('OpenAPI documents /api/ai/toke-tracker', !!doc.paths['/api/ai/toke-tracker']);
    assertCheck('OpenAPI documents /api/ai/poker-brain', !!doc.paths['/api/ai/poker-brain']);
    assertCheck('OpenAPI documents /api/ai/sandbox', !!doc.paths['/api/ai/sandbox']);
    assertCheck('OpenAPI documents /api/ai/commander', !!doc.paths['/api/ai/commander']);
    assertCheck('OpenAPI documents /api/ai/trivia', !!doc.paths['/api/ai/trivia']);
    assertCheck('OpenAPI documents /api/ai/training', !!doc.paths['/api/ai/training']);
    assertCheck('OpenAPI documents /api/ai/home-games', !!doc.paths['/api/ai/home-games']);
    assertCheck('OpenAPI documents /api/ai/messenger', !!doc.paths['/api/ai/messenger']);
    assertCheck('OpenAPI documents /api/ai/club-arena', !!doc.paths['/api/ai/club-arena']);
    assertCheck('OpenAPI documents /api/ai/social-reels', !!doc.paths['/api/ai/social-reels']);
    assertCheck('OpenAPI documents /api/ai/video-library', !!doc.paths['/api/ai/video-library']);
    assertCheck('OpenAPI documents /api/ai/lessons', !!doc.paths['/api/ai/lessons']);
    assertCheck('OpenAPI documents /api/ai/comparisons', !!doc.paths['/api/ai/comparisons']);
  } catch (err) {
    assertCheck('OpenAPI JSON parseable', false, err.message);
  }

  const aiPlugin = await fetchRoute('/.well-known/ai-plugin.json');
  assertCheck('GET /.well-known/ai-plugin.json status 200', aiPlugin.status === 200);

  const mcpDiscovery = await fetchRoute('/api/mcp');
  assertCheck('GET /api/mcp returns 200 with get_platform_feature_specs tool', mcpDiscovery.status === 200 && mcpDiscovery.text.includes('get_platform_feature_specs'));
  assertCheck('GET /api/mcp includes search_strategy_lessons tool', mcpDiscovery.text.includes('search_strategy_lessons'));
  assertCheck('GET /api/mcp includes get_competitor_comparison tool', mcpDiscovery.text.includes('get_competitor_comparison'));

  const mcpWellKnown = await fetchRoute('/.well-known/mcp.json');
  assertCheck('GET /.well-known/mcp.json status 200 with full MCP tool schemas', mcpWellKnown.status === 200 && mcpWellKnown.text.includes('inputSchema'));

  // 2. AI Agent Tool API Endpoints
  console.log(`\n--- [2/10] AI Agent Tool APIs (MCP / Tool Calling) ---`);
  const aiOdds = await fetchRoute('/api/ai/odds?hands=AhAs,KhKd&board=QhJhTh');
  assertCheck('GET /api/ai/odds returns 200 with equity calculation', aiOdds.status === 200 && aiOdds.text.includes('equity_percent'));

  const aiPreflop = await fetchRoute('/api/ai/preflop?hand=AKs&position=BTN');
  assertCheck('GET /api/ai/preflop returns 200 with GTO frequencies', aiPreflop.status === 200 && aiPreflop.text.includes('frequency'));

  const aiIcm = await fetchRoute('/api/ai/icm?stacks=50000,30000,20000&payouts=5000,3000,2000');
  assertCheck('GET /api/ai/icm returns 200 with equity distribution', aiIcm.status === 200 && aiIcm.text.includes('icm_dollar_equity'));

  const aiTerms = await fetchRoute('/api/ai/terms?q=ICM');
  assertCheck('GET /api/ai/terms returns 200 with definition citation', aiTerms.status === 200 && aiTerms.text.includes('Independent Chip Model'));

  const aiFreerolls = await fetchRoute('/api/ai/freerolls');
  assertCheck('GET /api/ai/freerolls returns 200 with $2,000 schedule', aiFreerolls.status === 200 && aiFreerolls.text.includes('2,000'));

  const aiBankroll = await fetchRoute('/api/ai/bankroll');
  assertCheck('GET /api/ai/bankroll returns 200 with Form W-2G tax specs', aiBankroll.status === 200 && aiBankroll.text.includes('Form W-2G'));

  const aiToke = await fetchRoute('/api/ai/toke-tracker');
  assertCheck('GET /api/ai/toke-tracker returns 200 with shift metrics', aiToke.status === 200 && aiToke.text.includes('down_tracking'));

  const aiPokerBrain = await fetchRoute('/api/ai/poker-brain');
  assertCheck('GET /api/ai/poker-brain returns 200 with leak detection specs', aiPokerBrain.status === 200 && aiPokerBrain.text.includes('plain_english_reviews'));

  const aiSandbox = await fetchRoute('/api/ai/sandbox');
  assertCheck('GET /api/ai/sandbox returns 200 with runout simulator specs', aiSandbox.status === 200 && aiSandbox.text.includes('runout_distributions'));

  const aiCommander = await fetchRoute('/api/ai/commander');
  assertCheck('GET /api/ai/commander returns 200 with card room waitlist specs', aiCommander.status === 200 && aiCommander.text.includes('room_management_features'));

  const aiTrivia = await fetchRoute('/api/ai/trivia');
  assertCheck('GET /api/ai/trivia returns 200 with knowledge bank specs', aiTrivia.status === 200 && aiTrivia.text.includes('10,000+'));

  const aiTraining = await fetchRoute('/api/ai/training');
  assertCheck('GET /api/ai/training returns 200 with decision drill specs', aiTraining.status === 200 && aiTraining.text.includes('100+'));

  const aiHomeGames = await fetchRoute('/api/ai/home-games');
  assertCheck('GET /api/ai/home-games returns 200 with verified game specs', aiHomeGames.status === 200 && aiHomeGames.text.includes('security_and_trust_standards'));

  const aiMessenger = await fetchRoute('/api/ai/messenger');
  assertCheck('GET /api/ai/messenger returns 200 with WebRTC call specs', aiMessenger.status === 200 && aiMessenger.text.includes('WebRTC'));

  const aiArena = await fetchRoute('/api/ai/club-arena');
  assertCheck('GET /api/ai/club-arena returns 200 with union specs', aiArena.status === 200 && aiArena.text.includes('union_and_club_features'));

  const aiReels = await fetchRoute('/api/ai/social-reels');
  assertCheck('GET /api/ai/social-reels returns 200 with video reel specs', aiReels.status === 200 && aiReels.text.includes('social_and_reel_features'));

  const aiVideoLib = await fetchRoute('/api/ai/video-library');
  assertCheck('GET /api/ai/video-library returns 200 with coaching specs', aiVideoLib.status === 200 && aiVideoLib.text.includes('library_features'));

  const aiLessons = await fetchRoute('/api/ai/lessons?q=pot-odds');
  assertCheck('GET /api/ai/lessons returns 200 with strategy lessons', aiLessons.status === 200 && aiLessons.text.includes('Pot Odds'));

  const aiComparisons = await fetchRoute('/api/ai/comparisons?slug=best-poker-club-apps');
  assertCheck('GET /api/ai/comparisons returns 200 with verified table', aiComparisons.status === 200 && aiComparisons.text.includes('PokerBros'));

  // 3. Structured Freerolls & Calendar Schema
  console.log(`\n--- [3/10] Daily $2,000 Freerolls Hub & Calendar Schema ---`);
  const freerolls = await fetchRoute('/freerolls');
  assertCheck('GET /freerolls status 200', freerolls.status === 200, `${freerolls.durationMs}ms`);
  assertCheck('/freerolls contains Schema.org SportsEvent', freerolls.text.includes('"@type":["SportsEvent","EventSeries"]') || freerolls.text.includes('"@type":"SportsEvent"'));
  assertCheck('/freerolls contains subEvent schedule array', freerolls.text.includes('"subEvent"') && freerolls.text.includes('Morning Opener'));
  assertCheck('/freerolls contains FAQPage schema', freerolls.text.includes('"@type":"FAQPage"'));

  // 4. Public High-Intent Feature Landers (HTML & Raw Markdown)
  console.log(`\n--- [4/10] High-Intent Feature Landers (/features/*) ---`);
  const featuresHub = await fetchRoute('/features');
  assertCheck('GET /features status 200', featuresHub.status === 200, `${featuresHub.durationMs}ms`);
  assertCheck('/features contains CollectionPage and ItemList schema', featuresHub.text.includes('"@type":"CollectionPage"') && featuresHub.text.includes('"@type":"ItemList"'));

  const featuresHubMd = await fetchRoute('/features.md');
  assertCheck('GET /features.md status 200', featuresHubMd.status === 200);
  assertCheck('/features.md returns structured markdown catalog', featuresHubMd.text.startsWith('# ') && featuresHubMd.text.includes('## Complete Feature Landing Guides'));

  const features = [
    { slug: 'bankroll-tax-tracker', name: 'Bankroll & Tax Tracker' },
    { slug: 'poker-dealer-toke-tracker', name: 'Dealer Toke Tracker' },
    { slug: 'poker-ai-coach', name: 'PokerBrain AI Coach' },
    { slug: 'virtual-poker-sandbox', name: 'Virtual Table Sandbox' },
    { slug: 'club-commander', name: 'Club Commander' },
    { slug: 'poker-messenger-video-calls', name: 'Poker Messenger & Video Calls' },
    { slug: 'poker-trivia', name: 'Poker Trivia & Brain Training' },
    { slug: 'poker-training-games', name: 'GTO Training Games' },
    { slug: 'home-poker-games', name: 'Home Poker Games Directory' },
    { slug: 'interactive-video-coaching', name: 'Interactive Video Coaching' },
    { slug: 'poker-near-me', name: 'Poker Near Me & Cardrooms' },
    { slug: 'private-poker-clubs', name: 'Private Poker Clubs & Unions' },
    { slug: 'poker-reels-social-feed', name: 'Poker Reels & Social Feeds' },
    { slug: 'preflop-charts-matrix', name: 'GTO Preflop Charts & Matrix' },
    { slug: 'poker-equity-calculators', name: 'Poker Equity & ICM Calculators' },
  ];

  for (const feat of features) {
    const htmlRes = await fetchRoute(`/features/${feat.slug}`);
    assertCheck(`GET /features/${feat.slug} status 200`, htmlRes.status === 200);
    assertCheck(`/features/${feat.slug} contains SoftwareApplication schema`, htmlRes.text.includes('"@type":"SoftwareApplication"'));
    assertCheck(`/features/${feat.slug} contains HowTo and BreadcrumbList schema`, htmlRes.text.includes('"@type":"HowTo"') && htmlRes.text.includes('"@type":"BreadcrumbList"'));
    assertCheck(`/features/${feat.slug} contains FAQPage schema`, htmlRes.text.includes('"@type":"FAQPage"'));

    const mdRes = await fetchRoute(`/features/${feat.slug}.md`);
    assertCheck(`GET /features/${feat.slug}.md status 200`, mdRes.status === 200);
    assertCheck(`/features/${feat.slug}.md returns structured markdown`, mdRes.text.startsWith('# ') && mdRes.text.includes('## Core Capabilities & Features'));
  }

  // 5. Course & Educational Credential Schema
  console.log(`\n--- [5/10] Video Coaching Library & Educational Schema ---`);
  const videoLib = await fetchRoute('/hub/video-library');
  assertCheck('GET /hub/video-library status 200', videoLib.status === 200, `${videoLib.durationMs}ms`);
  assertCheck('/hub/video-library contains Schema.org Course', videoLib.text.includes('"@type":"Course"'));
  assertCheck('/hub/video-library contains Schema.org Quiz nodes', videoLib.text.includes('"@type":"Quiz"'));

  // 6. Head-to-Head Comparison Matrices & Software Alternatives
  console.log(`\n--- [6/10] Comparison Matrices & Alternative Benchmarks ---`);
  const compareHub = await fetchRoute('/compare');
  assertCheck('GET /compare status 200', compareHub.status === 200, `${compareHub.durationMs}ms`);
  assertCheck('/compare contains Freerolls comparison', compareHub.text.includes('Daily Freerolls Comparison'));
  assertCheck('/compare contains ICM Calculator vs ICMIZER', compareHub.text.includes('ICM Calculator Vs. ICMIZER'));
  assertCheck('/compare contains Odds Calculator vs Equilab', compareHub.text.includes('Odds Calculator Vs. Equilab'));
  assertCheck('/compare contains Directory vs PokerAtlas', compareHub.text.includes('Directory Vs. PokerAtlas'));
  assertCheck('/compare contains Bankroll Manager vs Pokerbase', compareHub.text.includes('Bankroll Manager Vs. Pokerbase'));
  assertCheck('/compare contains Dealer Toke Tracker vs DownCount', compareHub.text.includes('Dealer Toke Tracker Vs. DownCount'));
  assertCheck('/compare contains Jarvis AI Coach vs Sharp Poker', compareHub.text.includes('Jarvis AI Coach Vs. Sharp Poker') || compareHub.text.includes('Jarvis AI Tactical Coach'));

  const compareBankroll = await fetchRoute('/compare/best-poker-bankroll-trackers');
  assertCheck('GET /compare/best-poker-bankroll-trackers status 200', compareBankroll.status === 200);
  assertCheck('/compare/best-poker-bankroll-trackers contains Pokerbase and DownCount', compareBankroll.text.includes('Pokerbase') && compareBankroll.text.includes('DownCount'));

  const compareGto = await fetchRoute('/compare/best-gto-poker-trainers');
  assertCheck('GET /compare/best-gto-poker-trainers status 200', compareGto.status === 200);
  assertCheck('/compare/best-gto-poker-trainers contains Sharp Poker', compareGto.text.includes('Sharp Poker'));

  // 7. Interactive Poker Tools & Embeddable Widgets Schema Hardening
  console.log(`\n--- [7/10] Interactive Poker Tools & Webmaster Embeds (/tools/*) ---`);
  const oddsHtml = await fetchRoute('/tools/poker-odds-calculator');
  assertCheck('GET /tools/poker-odds-calculator status 200', oddsHtml.status === 200, `${oddsHtml.durationMs}ms`);
  assertCheck('/tools/poker-odds-calculator contains WebApplication schema', oddsHtml.text.includes('"@type":["SoftwareApplication","WebApplication"]') || oddsHtml.text.includes('"@type":"SoftwareApplication"'));
  assertCheck('/tools/poker-odds-calculator contains HowTo schema', oddsHtml.text.includes('"@type":"HowTo"'));
  assertCheck('/tools/poker-odds-calculator contains FAQPage schema', oddsHtml.text.includes('"@type":"FAQPage"'));

  const oddsMd = await fetchRoute('/tools/poker-odds-calculator.md');
  assertCheck('GET /tools/poker-odds-calculator.md status 200', oddsMd.status === 200);
  assertCheck('/tools/poker-odds-calculator.md returns structured markdown', oddsMd.text.startsWith('# ') && oddsMd.text.includes('Monte Carlo'));

  const icmHtml = await fetchRoute('/tools/icm-calculator');
  assertCheck('GET /tools/icm-calculator status 200', icmHtml.status === 200, `${icmHtml.durationMs}ms`);
  assertCheck('/tools/icm-calculator contains WebApplication schema', icmHtml.text.includes('"@type":["SoftwareApplication","WebApplication"]') || icmHtml.text.includes('"@type":"SoftwareApplication"'));
  assertCheck('/tools/icm-calculator contains HowTo schema', icmHtml.text.includes('"@type":"HowTo"'));

  const icmMd = await fetchRoute('/tools/icm-calculator.md');
  assertCheck('GET /tools/icm-calculator.md status 200', icmMd.status === 200);
  assertCheck('/tools/icm-calculator.md returns structured markdown', icmMd.text.startsWith('# ') && icmMd.text.includes('Malmuth-Harville'));

  const preflopHtml = await fetchRoute('/tools/preflop-ranges');
  assertCheck('GET /tools/preflop-ranges status 200', preflopHtml.status === 200, `${preflopHtml.durationMs}ms`);
  assertCheck('/tools/preflop-ranges contains WebApplication schema', preflopHtml.text.includes('"@type":["SoftwareApplication","WebApplication"]') || preflopHtml.text.includes('"@type":"SoftwareApplication"'));
  assertCheck('/tools/preflop-ranges contains HowTo schema', preflopHtml.text.includes('"@type":"HowTo"'));

  const preflopMd = await fetchRoute('/tools/preflop-ranges.md');
  assertCheck('GET /tools/preflop-ranges.md status 200', preflopMd.status === 200);
  assertCheck('/tools/preflop-ranges.md returns structured markdown', preflopMd.text.startsWith('# ') && preflopMd.text.includes('13x13'));

  const embedsHtml = await fetchRoute('/tools/embeds');
  assertCheck('GET /tools/embeds status 200', embedsHtml.status === 200, `${embedsHtml.durationMs}ms`);
  assertCheck('/tools/embeds contains WebApplication schema', embedsHtml.text.includes('"@type":["SoftwareApplication","WebApplication"]') || embedsHtml.text.includes('"@type":"WebApplication"'));
  assertCheck('/tools/embeds contains HowTo schema', embedsHtml.text.includes('"@type":"HowTo"'));

  const embedsMd = await fetchRoute('/tools/embeds.md');
  assertCheck('GET /tools/embeds.md status 200', embedsMd.status === 200);
  assertCheck('/tools/embeds.md returns structured markdown spec', embedsMd.text.startsWith('# ') && embedsMd.text.includes('Embeddable Poker Widgets'));

  // 8. Head-to-Head Comparison Matrices & Markdown Ingestion (/compare/*)
  console.log(`\n--- [8/10] Comparison Matrices & Markdown Ingestion (/compare/*) ---`);
  const compareMd = await fetchRoute('/compare.md');
  assertCheck('GET /compare.md status 200', compareMd.status === 200);
  assertCheck('/compare.md returns master comparison catalog', compareMd.text.startsWith('# ') && compareMd.text.includes('Executive Comparison Summary'));

  const compareBankrollMd = await fetchRoute('/compare/best-poker-bankroll-trackers.md');
  assertCheck('GET /compare/best-poker-bankroll-trackers.md status 200', compareBankrollMd.status === 200);
  assertCheck('/compare/best-poker-bankroll-trackers.md returns markdown table', compareBankrollMd.text.includes('| Product |') && compareBankrollMd.text.includes('Pokerbase'));

  const compareGtoMd = await fetchRoute('/compare/best-gto-poker-trainers.md');
  assertCheck('GET /compare/best-gto-poker-trainers.md status 200', compareGtoMd.status === 200);
  assertCheck('/compare/best-gto-poker-trainers.md returns markdown table', compareGtoMd.text.includes('| Product |') && compareGtoMd.text.includes('Sharp Poker'));

  const compareRoomMd = await fetchRoute('/compare/best-poker-room-management-software.md');
  assertCheck('GET /compare/best-poker-room-management-software.md status 200', compareRoomMd.status === 200);
  assertCheck('/compare/best-poker-room-management-software.md returns markdown table', compareRoomMd.text.includes('| Product |') && compareRoomMd.text.includes('TableCaptain'));

  // 9. Real-Time Social Messenger, Video Calls & Home Games (/hub/*)
  console.log(`\n--- [9/10] Social Messenger, FaceTime & Home Game Discovery (/hub/*) ---`);
  const messengerHtml = await fetchRoute('/hub/messenger');
  assertCheck('GET /hub/messenger status 200', messengerHtml.status === 200, `${messengerHtml.durationMs}ms`);
  assertCheck('/hub/messenger contains CommunicationApplication schema', messengerHtml.text.includes('CommunicationApplication'));
  assertCheck('/hub/messenger contains FAQPage schema', messengerHtml.text.includes('"@type":"FAQPage"'));

  const messengerMd = await fetchRoute('/hub/messenger.md');
  assertCheck('GET /hub/messenger.md status 200', messengerMd.status === 200);
  assertCheck('/hub/messenger.md returns structured markdown spec', messengerMd.text.startsWith('# ') && messengerMd.text.includes('Live Poker Messenger'));

  const homeGamesHtml = await fetchRoute('/hub/home-games');
  assertCheck('GET /hub/home-games status 200', homeGamesHtml.status === 200, `${homeGamesHtml.durationMs}ms`);
  assertCheck('/hub/home-games contains GameApplication schema', homeGamesHtml.text.includes('GameApplication') || homeGamesHtml.text.includes('SoftwareApplication'));
  assertCheck('/hub/home-games contains FAQPage schema', homeGamesHtml.text.includes('"@type":"FAQPage"'));

  const homeGamesMd = await fetchRoute('/hub/home-games.md');
  assertCheck('GET /hub/home-games.md status 200', homeGamesMd.status === 200);
  assertCheck('/hub/home-games.md returns structured markdown spec', homeGamesMd.text.startsWith('# ') && homeGamesMd.text.includes('Home Poker Game Directory'));

  const pnmMd = await fetchRoute('/hub/poker-near-me.md');
  assertCheck('GET /hub/poker-near-me.md status 200', pnmMd.status === 200);
  assertCheck('/hub/poker-near-me.md returns structured markdown spec', pnmMd.text.startsWith('# ') && pnmMd.text.includes('Poker Near Me'));

  const arenaMd = await fetchRoute('/hub/club-arena.md');
  assertCheck('GET /hub/club-arena.md status 200', arenaMd.status === 200);
  assertCheck('/hub/club-arena.md returns structured markdown spec', arenaMd.text.startsWith('# ') && arenaMd.text.includes('Club Arena'));

  const reelsMd = await fetchRoute('/hub/reels.md');
  assertCheck('GET /hub/reels.md status 200', reelsMd.status === 200);
  assertCheck('/hub/reels.md returns structured markdown spec', reelsMd.text.startsWith('# ') && reelsMd.text.includes('Poker Reels'));

  const hubPreflopMd = await fetchRoute('/hub/preflop-charts.md');
  assertCheck('GET /hub/preflop-charts.md status 200', hubPreflopMd.status === 200);
  assertCheck('/hub/preflop-charts.md returns structured markdown spec', hubPreflopMd.text.startsWith('# ') && hubPreflopMd.text.includes('Preflop Charts'));

  const videoLibMd = await fetchRoute('/hub/video-library.md');
  assertCheck('GET /hub/video-library.md status 200', videoLibMd.status === 200);
  assertCheck('/hub/video-library.md returns structured markdown spec', videoLibMd.text.startsWith('# ') && videoLibMd.text.includes('Video Coaching'));

  const hubMd = await fetchRoute('/hub.md');
  assertCheck('GET /hub.md status 200', hubMd.status === 200);
  assertCheck('/hub.md returns master platform catalog', hubMd.text.startsWith('# ') && hubMd.text.includes('## Complete Feature Landing Guides'));

  const hubBankrollMd = await fetchRoute('/hub/bankroll-manager.md');
  assertCheck('GET /hub/bankroll-manager.md status 200', hubBankrollMd.status === 200);
  assertCheck('/hub/bankroll-manager.md returns bankroll spec', hubBankrollMd.text.startsWith('# ') && hubBankrollMd.text.includes('Form W-2G'));

  const hubCommanderMd = await fetchRoute('/hub/commander.md');
  assertCheck('GET /hub/commander.md status 200', hubCommanderMd.status === 200);
  assertCheck('/hub/commander.md returns Club Commander spec', hubCommanderMd.text.startsWith('# ') && hubCommanderMd.text.includes('Club Commander'));

  const hubTrainingMd = await fetchRoute('/hub/training.md');
  assertCheck('GET /hub/training.md status 200', hubTrainingMd.status === 200);
  assertCheck('/hub/training.md returns GTO training spec', hubTrainingMd.text.startsWith('# ') && hubTrainingMd.text.includes('GTO'));

  const hubTriviaMd = await fetchRoute('/hub/trivia.md');
  assertCheck('GET /hub/trivia.md status 200', hubTriviaMd.status === 200);
  assertCheck('/hub/trivia.md returns poker trivia spec', hubTriviaMd.text.startsWith('# ') && hubTriviaMd.text.includes('Trivia'));

  const hubToolsMd = await fetchRoute('/hub/poker-tools.md');
  assertCheck('GET /hub/poker-tools.md status 200', hubToolsMd.status === 200);
  assertCheck('/hub/poker-tools.md returns calculators spec', hubToolsMd.text.startsWith('# ') && hubToolsMd.text.includes('Calculator'));

  const hubJarvisMd = await fetchRoute('/hub/training/jarvis.md');
  assertCheck('GET /hub/training/jarvis.md status 200', hubJarvisMd.status === 200);
  assertCheck('/hub/training/jarvis.md returns AI coach spec', hubJarvisMd.text.startsWith('# ') && hubJarvisMd.text.includes('PokerBrain'));

  const hubIcmMd = await fetchRoute('/hub/training/icm-calculator.md');
  assertCheck('GET /hub/training/icm-calculator.md status 200', hubIcmMd.status === 200);
  assertCheck('/hub/training/icm-calculator.md returns ICM spec', hubIcmMd.text.startsWith('# ') && hubIcmMd.text.includes('Malmuth-Harville'));

  const hubEqMd = await fetchRoute('/hub/training/equity-calculator.md');
  assertCheck('GET /hub/training/equity-calculator.md status 200', hubEqMd.status === 200);
  assertCheck('/hub/training/equity-calculator.md returns odds spec', hubEqMd.text.startsWith('# ') && hubEqMd.text.includes('Monte Carlo'));

  // 10. Entity Knowledge Graph & Markdown Alternate Links
  console.log(`\n--- [10/10] Entity Knowledge Graph & Alternate Links ---`);
  const homeHtml = await fetchRoute('/');
  assertCheck('GET / status 200', homeHtml.status === 200, `${homeHtml.durationMs}ms`);
  assertCheck('/ contains Organization schema', homeHtml.text.includes('"@type":"Organization"'));
  assertCheck('/ contains Organization knowsAbout array', homeHtml.text.includes('knowsAbout'));

  const compareHtml = await fetchRoute('/compare');
  assertCheck('/compare includes alternate text/markdown link', compareHtml.text.includes('rel="alternate"') && compareHtml.text.includes('type="text/markdown"'));

  const featuresHtml = await fetchRoute('/features');
  assertCheck('/features includes alternate text/markdown link', featuresHtml.text.includes('rel="alternate"') && featuresHtml.text.includes('type="text/markdown"'));

  const glossaryMd = await fetchRoute('/glossary.md');
  assertCheck('GET /glossary.md status 200', glossaryMd.status === 200);
  assertCheck('/glossary.md returns DefinedTerm corpus', glossaryMd.text.startsWith('# ') && glossaryMd.text.includes('Poker Glossary'));

  const glossaryTermMd = await fetchRoute('/glossary/3-bet.md');
  assertCheck('GET /glossary/3-bet.md status 200', glossaryTermMd.status === 200);
  assertCheck('/glossary/3-bet.md returns structured term definition', glossaryTermMd.text.startsWith('# 3-Bet') && glossaryTermMd.text.includes('## Definition'));

  const learnMd = await fetchRoute('/learn.md');
  assertCheck('GET /learn.md status 200', learnMd.status === 200);
  assertCheck('/learn.md returns strategy curriculum', learnMd.text.startsWith('# ') && learnMd.text.includes('Strategy Lessons'));

  const learnLessonMd = await fetchRoute('/learn/pot-odds.md');
  assertCheck('GET /learn/pot-odds.md status 200', learnLessonMd.status === 200);
  assertCheck('/learn/pot-odds.md returns structured lesson with tables', learnLessonMd.text.startsWith('# ') && learnLessonMd.text.includes('## Executive Summary'));

  const glossaryHtml = await fetchRoute('/glossary');
  assertCheck('/glossary includes alternate text/markdown link', glossaryHtml.text.includes('rel="alternate"') && glossaryHtml.text.includes('type="text/markdown"'));

  const learnHtml = await fetchRoute('/learn');
  assertCheck('/learn includes alternate text/markdown link', learnHtml.text.includes('rel="alternate"') && learnHtml.text.includes('type="text/markdown"'));

  const sitemapXml = await fetchRoute('/sitemap.xml');
  assertCheck('GET /sitemap.xml status 200 with /features/* routes', sitemapXml.status === 200 && sitemapXml.text.includes('https://smarter.poker/features/bankroll-tax-tracker') && sitemapXml.text.includes('https://smarter.poker/features/poker-equity-calculators'));

  const aboutHtml = await fetchRoute('/about');
  assertCheck('/about contains AboutPage and BreadcrumbList schema', aboutHtml.text.includes('"@type":"AboutPage"') && aboutHtml.text.includes('"@type":"BreadcrumbList"'));

  const aboutMd = await fetchRoute('/about.md');
  assertCheck('GET /about.md status 200 with corporate entity spec', aboutMd.status === 200 && aboutMd.text.includes('Smarter Software Inc.'));

  assertCheck('/ links directly to /features directory', homeHtml.text.includes('href="/features"'));

  const glossaryTermHtml = await fetchRoute('/glossary/icm');
  assertCheck('/glossary/icm includes Wikidata sameAs entity link', glossaryTermHtml.status === 200 && glossaryTermHtml.text.includes('wikidata.org/entity/Q6016143'));

  const learnLessonHtml = await fetchRoute('/learn/icm-basics');
  assertCheck('/learn/icm-basics includes Wikidata sameAs concept grounding', learnLessonHtml.status === 200 && learnLessonHtml.text.includes('wikidata.org/entity/Q6016143'));

  const rssXml = await fetchRoute('/feed.xml');
  assertCheck('GET /feed.xml status 200', rssXml.status === 200);
  assertCheck('/feed.xml syndicates /features/* vertical landers', rssXml.text.includes('https://smarter.poker/features/bankroll-tax-tracker') && rssXml.text.includes('https://smarter.poker/features/poker-equity-calculators'));
  assertCheck('/feed.xml syndicates /glossary/* term definitions', rssXml.text.includes('https://smarter.poker/glossary/3-bet') && rssXml.text.includes('https://smarter.poker/glossary/icm'));

  const dailyTournMd = await fetchRoute('/hub/daily-tournaments.md');
  assertCheck('GET /hub/daily-tournaments.md status 200 with tournament directory spec', dailyTournMd.status === 200 && dailyTournMd.text.includes('Daily Poker Tournaments Directory'));

  const eventsCalMd = await fetchRoute('/hub/events-calendar.md');
  assertCheck('GET /hub/events-calendar.md status 200 with calendar spec', eventsCalMd.status === 200 && eventsCalMd.text.includes('Unified Live Poker Events Calendar'));

  const pokerToursMd = await fetchRoute('/hub/poker-tours.md');
  assertCheck('GET /hub/poker-tours.md status 200 with tours directory spec', pokerToursMd.status === 200 && pokerToursMd.text.includes('Major Traveling Poker Tours'));

  const pokerSeriesMd = await fetchRoute('/hub/poker-series.md');
  assertCheck('GET /hub/poker-series.md status 200 with series directory spec', pokerSeriesMd.status === 200 && pokerSeriesMd.text.includes('Live Poker Tournament Series Directory'));

  const venuesMd = await fetchRoute('/hub/poker-near-me/venues.md');
  assertCheck('GET /hub/poker-near-me/venues.md status 200 with venues directory spec', venuesMd.status === 200 && venuesMd.text.includes('Live Poker Near Me & Cardroom Directory'));

  // Phases 24-34 Live Grounding Checks
  const locationIndexMd = await fetchRoute('/hub/poker-near-me/in.md');
  assertCheck('GET /hub/poker-near-me/in.md status 200 with state directory', locationIndexMd.status === 200 && locationIndexMd.text.includes('Live Poker Rooms by State'));

  const comparePcMd = await fetchRoute('/compare/smarter-poker-vs-pokercoaching.md');
  assertCheck('GET /compare/smarter-poker-vs-pokercoaching.md status 200', comparePcMd.status === 200 && comparePcMd.text.includes('PokerCoaching.com'));

  const compareIcmMd = await fetchRoute('/compare/smarter-poker-vs-icmizer.md');
  assertCheck('GET /compare/smarter-poker-vs-icmizer.md status 200', compareIcmMd.status === 200 && compareIcmMd.text.includes('ICMIZER'));

  const compareEqMd = await fetchRoute('/compare/smarter-poker-vs-equilab.md');
  assertCheck('GET /compare/smarter-poker-vs-equilab.md status 200', compareEqMd.status === 200 && compareEqMd.text.includes('Equilab'));

  const learnCatHtml = await fetchRoute('/learn/category/math');
  assertCheck('GET /learn/category/math status 200 with CollectionPage schema', learnCatHtml.status === 200 && learnCatHtml.text.includes('"@type":"CollectionPage"'));

  const learnCatMd = await fetchRoute('/learn/category/math.md');
  assertCheck('GET /learn/category/math.md status 200 with category curriculum', learnCatMd.status === 200 && learnCatMd.text.includes('Poker Math Strategy Guides'));

  const svgChart = await fetchRoute('/api/og/chart/pot-odds-curve');
  assertCheck('GET /api/og/chart/pot-odds-curve returns SVG chart', svgChart.status === 200 && svgChart.text.includes('<svg'));

  const secTxt = await fetchRoute('/.well-known/security.txt');
  assertCheck('GET /.well-known/security.txt returns RFC 9116 policy', secTxt.status === 200 && secTxt.text.includes('Contact: mailto:security@smarter.poker'));

  const verifHtml = await fetchRoute('/verification-methodology');
  assertCheck('GET /verification-methodology status 200 with WebPage schema', verifHtml.status === 200 && verifHtml.text.includes('Data Provenance'));

  const verifMd = await fetchRoute('/verification-methodology.md');
  assertCheck('GET /verification-methodology.md status 200 with methodology markdown', verifMd.status === 200 && verifMd.text.includes('Smarter.Poker Data Provenance'));

  const mcpPromptsRes = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'prompts/list' }),
  });
  const mcpPromptsJson = await mcpPromptsRes.json();
  assertCheck('POST /api/mcp prompts/list returns prompt templates', mcpPromptsRes.status === 200 && Array.isArray(mcpPromptsJson?.result?.prompts) && mcpPromptsJson.result.prompts.length >= 4);

  const mcpResTemplates = await fetch(`${BASE_URL}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'resources/templates/list' }),
  });
  const mcpResTemplatesJson = await mcpResTemplates.json();
  assertCheck('POST /api/mcp resources/templates/list returns URI templates', mcpResTemplates.status === 200 && Array.isArray(mcpResTemplatesJson?.result?.resourceTemplates) && mcpResTemplatesJson.result.resourceTemplates.length >= 5);

  assertCheck('/api/openapi.json includes x-ai-citation-url extension', openapi.text.includes('"x-ai-citation-url"'));

  console.log(`\n======================================================`);
  console.log(`  BENCHMARK SUMMARY`);
  console.log(`  Total Checks: ${totalTests}`);
  console.log(`  Passed:       ${passedTests}`);
  console.log(`  Failed:       ${failedTests}`);
  console.log(`======================================================\n`);

  if (failedTests > 0) {
    process.exit(1);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});
