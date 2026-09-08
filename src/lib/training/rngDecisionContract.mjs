function optionId(option) {
  return String(option?.id ?? option ?? '');
}

function frequencyFor(frequencies, id) {
  const exact = Number(frequencies?.[id]);
  if (Number.isFinite(exact)) return exact;
  const lower = id.toLowerCase();
  const key = Object.keys(frequencies || {}).find((candidate) => (
    String(candidate).toLowerCase() === lower
  ));
  const matched = Number(key ? frequencies[key] : 0);
  return Number.isFinite(matched) ? matched : 0;
}

export function normalizeRngMode(mode) {
  const normalized = String(mode || '').toLowerCase();
  return normalized === 'low' || normalized === 'high' ? normalized : null;
}

/** Build one exact, gap-free 1..100 randomiser dial from a solver mix. */
export function buildRngRanges(options, frequencies, mode = 'low') {
  const normalizedMode = normalizeRngMode(mode);
  if (!normalizedMode) return [];
  const entries = (Array.isArray(options) ? options : [])
    .map((option) => ({
      id: optionId(option),
      text: typeof option === 'string' ? option : String(option?.text || ''),
      frequency: Math.max(0, frequencyFor(frequencies, optionId(option))),
    }))
    .filter((entry) => entry.id && entry.frequency > 0);
  const total = entries.reduce((sum, entry) => sum + entry.frequency, 0);
  if (!(total > 0)) return [];

  let previousEnd = 0;
  const lowRanges = entries.map((entry, index) => {
    const cumulative = entries
      .slice(0, index + 1)
      .reduce((sum, candidate) => sum + candidate.frequency, 0);
    const end = index === entries.length - 1
      ? 100
      : Math.max(previousEnd, Math.min(100, Math.round((cumulative / total) * 100)));
    const range = {
      id: entry.id,
      text: entry.text,
      start: previousEnd + 1,
      end,
      frequency: entry.frequency,
    };
    previousEnd = end;
    return range;
  }).filter((range) => range.end >= range.start);

  if (normalizedMode === 'low') return lowRanges;
  return lowRanges.map((range) => ({
    ...range,
    start: 101 - range.end,
    end: 101 - range.start,
  }));
}

export function resolveRngTarget(options, frequencies, roll, mode = 'low') {
  const numericRoll = Number(roll);
  if (!Number.isInteger(numericRoll) || numericRoll < 1 || numericRoll > 100) return null;
  return buildRngRanges(options, frequencies, mode)
    .find((range) => numericRoll >= range.start && numericRoll <= range.end) || null;
}

export function gradeRngAdherence(selectedAnswer, targetAction) {
  const targetActionId = String(targetAction?.id || '');
  const selectedActionId = String(selectedAnswer || '');
  if (!targetActionId || !selectedActionId) return null;
  const isCorrect = selectedActionId.toLowerCase() === targetActionId.toLowerCase();
  return {
    isCorrect,
    classification: isCorrect ? 'best' : 'wrong',
    targetActionId,
  };
}
