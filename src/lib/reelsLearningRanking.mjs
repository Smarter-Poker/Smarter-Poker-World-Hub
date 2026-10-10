import { createHash } from 'node:crypto';

function compareChronology(a, b) {
  const dateOrder = String(b?.created_at || '').localeCompare(String(a?.created_at || ''));
  if (dateOrder) return dateOrder;
  return String(b?.id || '').localeCompare(String(a?.id || ''));
}

/** Stable source identity used only for Learning-feed diversity. */
export function learningSourceKey(row) {
  const identity = String(
    row?.source_id
      || row?.source_name
      || row?.attribution_name
      || row?.author_id
      || row?.canonical_asset_key
      || row?.id
      || '',
  ).trim().slice(0, 256);
  return identity
    ? createHash('sha256').update(identity).digest('base64url').slice(0, 22)
    : '';
}

/**
 * Losslessly interleave one fixed chronological cohort by source.
 *
 * The cursor stores returned row identities rather than an array offset. Its
 * compact consumed-id set survives takedowns and ranking changes between
 * requests without repeating or skipping a surviving row from the anchored
 * cohort.
 */
export function selectLearningRows(rows, {
  consumedIds = [],
  afterSource = '',
  limit = 20,
} = {}) {
  const consumed = new Set(Array.isArray(consumedIds) ? consumedIds : []);
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const source = learningSourceKey(row);
    if (!source || consumed.has(row?.id)) continue;
    if (!groups.has(source)) groups.set(source, []);
    groups.get(source).push(row);
  }
  const sources = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  for (const source of sources) groups.get(source).sort(compareChronology);

  const start = sources.length && afterSource
    ? Math.max(0, sources.findIndex((source) => source.localeCompare(afterSource) > 0))
    : 0;
  const orderedSources = sources.length
    ? [...sources.slice(start), ...sources.slice(0, start)]
    : [];
  const indexes = new Map(orderedSources.map((source) => [source, 0]));
  const selected = [];
  let lastSource = afterSource || '';
  const safeLimit = Math.max(1, Math.trunc(Number(limit)) || 1);

  while (selected.length < safeLimit) {
    let progressed = false;
    for (const source of orderedSources) {
      const index = indexes.get(source) || 0;
      const row = groups.get(source)?.[index];
      if (!row) continue;
      progressed = true;
      selected.push(row);
      indexes.set(source, index + 1);
      consumed.add(row.id);
      lastSource = source;
      if (selected.length >= safeLimit) break;
    }
    if (!progressed) break;
  }

  const remaining = orderedSources.reduce(
    (count, source) => count + Math.max(0, groups.get(source).length - (indexes.get(source) || 0)),
    0,
  );
  return {
    rows: selected,
    remaining,
    afterSource: lastSource,
    consumedIds: [...consumed],
  };
}
