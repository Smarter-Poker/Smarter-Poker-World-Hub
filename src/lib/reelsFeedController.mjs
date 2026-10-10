import { scanReelsContinuations } from './reelsContinuation.mjs';
import { fetchPokerReels } from './reelsFeedClient.js';
import { capReelsInMemory, reelsFeedModeContract } from './reelsDeliveryContract.mjs';

/** One cursor/ranking controller for standalone, Social Media, and Library clients. */
export async function loadCanonicalReelsWindow({
  cursor = null,
  id = null,
  mode = null,
  category = null,
  sort = null,
  scope = 'standalone',
  accessToken = null,
  signal,
  limit = 120,
  signedIn = false,
  selectRows = (rows) => rows,
  fetchPage = fetchPokerReels,
} = {}) {
  const inferredMode = mode || (category === 'poker' ? 'learning' : 'latest');
  const contract = reelsFeedModeContract(inferredMode, { signedIn });
  const effectiveCategory = category || contract.category;
  const effectiveSort = sort || contract.sort;
  const effectiveScope = effectiveCategory === 'following' ? 'following' : scope;
  const result = await scanReelsContinuations({
    cursor,
    fetchPage: (pageCursor, pageNumber) => fetchPage({
      limit,
      cursor: pageCursor,
      id: pageNumber === 1 ? id : null,
      sort: effectiveSort,
      signal,
      scope: effectiveScope,
      category: effectiveCategory,
      accessToken,
    }),
    selectRows,
  });
  return {
    ...result,
    data: capReelsInMemory(result.data),
    mode: contract.id,
    category: effectiveCategory,
    sort: effectiveSort,
  };
}
