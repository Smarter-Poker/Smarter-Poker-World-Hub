const TOKEN_ALIASES = Object.freeze({
  bluff: ['bluffing', 'fold equity', 'semi bluff'],
  tournament: ['mtt', 'icm', 'bubble'],
  cash: ['cash game', 'deep stack'],
  preflop: ['opening range', 'three bet', '3 bet'],
  postflop: ['flop', 'turn', 'river'],
  math: ['equity', 'pot odds', 'outs'],
});

const MAX_SEEN = 240;

export function searchTerms(value) {
  const words = String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return [...new Set(words.flatMap((word) => [word, ...(TOKEN_ALIASES[word] || [])]))].slice(0, 24);
}

export function searchableVideoText(video = {}) {
  return [
    video.title,
    video.sourceName,
    video.source,
    ...(Array.isArray(video.tags) ? video.tags : []),
    ...(Array.isArray(video.concepts) ? video.concepts : []),
    ...(Array.isArray(video.chapters) ? video.chapters.map((chapter) => chapter?.title) : []),
    video.approvedTranscript,
  ].filter(Boolean).join(' ').toLowerCase();
}

export function semanticRelevance(video, query) {
  const terms = searchTerms(query);
  if (!terms.length) return 0;
  const text = searchableVideoText(video);
  return terms.reduce((score, term) => score + (text.includes(term) ? (term.includes(' ') ? 2 : 1) : 0), 0) / terms.length;
}

export function normalizeSeenIds(value) {
  const input = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(input.map((item) => String(item || '').trim()).filter((item) => /^[A-Za-z0-9_-]{3,64}$/.test(item)))].slice(-MAX_SEEN);
}

export function recommendationScore(video, context = {}) {
  const relevance = semanticRelevance(video, context.query);
  const authoritativeSearchRank = Math.max(0, Number(video.semanticRank || 0));
  const published = Date.parse(video.publishedAt || video.scrapedAt || 0);
  const ageDays = Number.isFinite(published) ? Math.max(0, (context.nowMs - published) / 86_400_000) : 365;
  const freshness = Math.max(0, 1 - ageDays / 180);
  const completion = Number(context.progressById?.[video.id]?.completion || 0);
  const saved = context.savedIds?.has(video.id) ? 1 : 0;
  const goalText = (context.learningGoals || []).join(' ');
  const goalMatch = semanticRelevance(video, goalText);
  const explicitPenalty = context.hiddenIds?.has(video.id) ? 10 : 0;
  const seenPenalty = context.seenIds?.has(video.id) ? 2.5 : 0;
  return (authoritativeSearchRank * 12) + (relevance * 4) + (freshness * 1.5) + (saved * 1.25) + (goalMatch * 2)
    + (completion > 0 && completion < 0.9 ? 1.75 : 0) - explicitPenalty - seenPenalty;
}

export function explainRecommendation(video, context = {}) {
  const reasons = [];
  if (Number(video.semanticRank || 0) > 0) reasons.push('Strong transcript or concept match');
  if (semanticRelevance(video, context.query) > 0) reasons.push('Matches your search');
  if (semanticRelevance(video, (context.learningGoals || []).join(' ')) > 0) reasons.push('Supports your learning goals');
  const completion = Number(context.progressById?.[video.id]?.completion || 0);
  if (completion > 0 && completion < 0.9) reasons.push('Continue where you stopped');
  if (context.savedIds?.has(video.id)) reasons.push('Saved for study');
  if (!reasons.length) reasons.push('Fresh verified lesson');
  return reasons.slice(0, 3);
}

export function rankLearningVideos(videos, context = {}) {
  const nowMs = Number(context.nowMs) || Date.now();
  const normalized = { ...context, nowMs };
  const ranked = (Array.isArray(videos) ? videos : [])
    .filter((video) => !context.hiddenIds?.has(video.id))
    .map((video) => ({
      ...video,
      recommendationScore: recommendationScore(video, normalized),
      recommendationReasons: explainRecommendation(video, normalized),
    }))
    .sort((a, b) => b.recommendationScore - a.recommendationScore
      || Date.parse(b.publishedAt || b.scrapedAt || 0) - Date.parse(a.publishedAt || a.scrapedAt || 0)
      || String(a.id).localeCompare(String(b.id)));

  const selected = [];
  const deferred = [];
  const recentCreators = [];
  const recentTopics = [];
  for (const video of ranked) {
    const creator = video.source || video.sourceName || 'unknown';
    const topic = video.tags?.[0] || video.type || 'general';
    const diverse = !recentCreators.slice(-2).includes(creator) && !recentTopics.slice(-2).includes(topic);
    if (diverse || ranked.length - selected.length <= 3) {
      selected.push(video);
      recentCreators.push(creator);
      recentTopics.push(topic);
    } else {
      deferred.push(video);
    }
  }
  return [...selected, ...deferred];
}

export function chronologicalVideos(videos) {
  return [...(Array.isArray(videos) ? videos : [])].sort((a, b) =>
    Date.parse(b.publishedAt || b.scrapedAt || 0) - Date.parse(a.publishedAt || a.scrapedAt || 0)
    || String(a.id).localeCompare(String(b.id)));
}

export function learningActions(video, progress = {}) {
  const seconds = Math.max(0, Number(progress.progressSeconds || 0));
  const topic = video.tags?.[0] || video.type || 'poker';
  return {
    continueAtSeconds: seconds,
    fullVideo: { videoId: video.id, startSeconds: seconds },
    geeves: { kind: 'explanation', videoId: video.id, timestampSeconds: seconds, topic },
    quiz: { kind: 'quiz', sourceVideoId: video.id, topic },
    sandbox: { kind: 'verified-training-launch', topic, path: '/hub/training' },
    relatedLessons: { topic, excludeVideoId: video.id },
  };
}

export function organicAnalyticsEligible(profile) {
  return Boolean(profile?.id) && profile.is_horse !== true;
}
