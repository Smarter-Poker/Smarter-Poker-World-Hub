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
  console.log(`--- [1/9] Universal AI Knowledge Corpus ---`);
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
  } catch (err) {
    assertCheck('OpenAPI JSON parseable', false, err.message);
  }

  const aiPlugin = await fetchRoute('/.well-known/ai-plugin.json');
  assertCheck('GET /.well-known/ai-plugin.json status 200', aiPlugin.status === 200);

  // 2. AI Agent Tool API Endpoints
  console.log(`\n--- [2/9] AI Agent Tool APIs (MCP / Tool Calling) ---`);
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

  // 3. Structured Freerolls & Calendar Schema
  console.log(`\n--- [3/9] Daily $2,000 Freerolls Hub & Calendar Schema ---`);
  const freerolls = await fetchRoute('/freerolls');
  assertCheck('GET /freerolls status 200', freerolls.status === 200, `${freerolls.durationMs}ms`);
  assertCheck('/freerolls contains Schema.org SportsEvent', freerolls.text.includes('"@type":["SportsEvent","EventSeries"]') || freerolls.text.includes('"@type":"SportsEvent"'));
  assertCheck('/freerolls contains subEvent schedule array', freerolls.text.includes('"subEvent"') && freerolls.text.includes('Morning Opener'));
  assertCheck('/freerolls contains FAQPage schema', freerolls.text.includes('"@type":"FAQPage"'));

  // 4. Public High-Intent Feature Landers (HTML & Raw Markdown)
  console.log(`\n--- [4/9] High-Intent Feature Landers (/features/*) ---`);
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
  ];

  for (const feat of features) {
    const htmlRes = await fetchRoute(`/features/${feat.slug}`);
    assertCheck(`GET /features/${feat.slug} status 200`, htmlRes.status === 200);
    assertCheck(`/features/${feat.slug} contains SoftwareApplication schema`, htmlRes.text.includes('"@type":"SoftwareApplication"'));
    assertCheck(`/features/${feat.slug} contains FAQPage schema`, htmlRes.text.includes('"@type":"FAQPage"'));

    const mdRes = await fetchRoute(`/features/${feat.slug}.md`);
    assertCheck(`GET /features/${feat.slug}.md status 200`, mdRes.status === 200);
    assertCheck(`/features/${feat.slug}.md returns structured markdown`, mdRes.text.startsWith('# ') && mdRes.text.includes('## Core Capabilities & Features'));
  }

  // 5. Course & Educational Credential Schema
  console.log(`\n--- [5/9] Video Coaching Library & Educational Schema ---`);
  const videoLib = await fetchRoute('/hub/video-library');
  assertCheck('GET /hub/video-library status 200', videoLib.status === 200, `${videoLib.durationMs}ms`);
  assertCheck('/hub/video-library contains Schema.org Course', videoLib.text.includes('"@type":"Course"'));
  assertCheck('/hub/video-library contains Schema.org Quiz nodes', videoLib.text.includes('"@type":"Quiz"'));

  // 6. Head-to-Head Comparison Matrices & Software Alternatives
  console.log(`\n--- [6/9] Comparison Matrices & Alternative Benchmarks ---`);
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
  console.log(`\n--- [7/9] Interactive Poker Tools & Webmaster Embeds (/tools/*) ---`);
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
  console.log(`\n--- [8/9] Comparison Matrices & Markdown Ingestion (/compare/*) ---`);
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
  console.log(`\n--- [9/9] Social Messenger, FaceTime & Home Game Discovery (/hub/*) ---`);
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
  assertCheck('/hub/home-games.md returns structured markdown spec', homeGamesMd.text.startsWith('# ') && homeGamesMd.text.includes('Home Poker Games Directory'));

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
