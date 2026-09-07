export const HOME_GAME_DIRECTORY_PAGE_SIZE = 1_000;
export const HOME_GAME_DIRECTORY_MAX_ROWS = 50_000;
export const HOME_GAME_DIRECTORY_GROUP_CHUNK_SIZE = 400;

function queryFailure(message) {
  return new Error(message);
}

// Fetches every row deterministically and performs a one-row sentinel query at
// the ceiling. Callers therefore never mistake an implicit PostgREST cap for a
// complete directory response.
export async function fetchAllHomeGameDirectoryRows(
  queryPage,
  {
    pageSize = HOME_GAME_DIRECTORY_PAGE_SIZE,
    maxRows = HOME_GAME_DIRECTORY_MAX_ROWS,
  } = {},
) {
  if (typeof queryPage !== 'function') {
    return { rows: [], error: queryFailure('Home game directory query is unavailable'), complete: false };
  }

  const rows = [];
  let offset = 0;

  while (offset < maxRows) {
    const requested = Math.min(pageSize, maxRows - offset);
    let result;
    try {
      result = await queryPage(offset, offset + requested - 1);
    } catch (error) {
      return { rows: [], error, complete: false };
    }

    if (result?.error) return { rows: [], error: result.error, complete: false };
    const pageRows = Array.isArray(result?.data) ? result.data : [];
    rows.push(...pageRows);

    if (pageRows.length < requested) return { rows, error: null, complete: true };
    offset += pageRows.length;
  }

  let sentinel;
  try {
    sentinel = await queryPage(maxRows, maxRows);
  } catch (error) {
    return { rows: [], error, complete: false };
  }
  if (sentinel?.error) return { rows: [], error: sentinel.error, complete: false };
  if (Array.isArray(sentinel?.data) && sentinel.data.length > 0) {
    return {
      rows: [],
      error: queryFailure(`Home game directory exceeded ${maxRows} rows`),
      complete: false,
    };
  }

  return { rows, error: null, complete: true };
}

export async function fetchHomeGameGroupsInChunks(
  groupIds,
  queryChunk,
  { chunkSize = HOME_GAME_DIRECTORY_GROUP_CHUNK_SIZE } = {},
) {
  const ids = Array.from(new Set((groupIds || []).filter(Boolean).map(String)));
  const rows = [];

  for (let index = 0; index < ids.length; index += chunkSize) {
    let result;
    try {
      result = await queryChunk(ids.slice(index, index + chunkSize));
    } catch (error) {
      return { rows: [], error, complete: false };
    }
    if (result?.error) return { rows: [], error: result.error, complete: false };
    rows.push(...(Array.isArray(result?.data) ? result.data : []));
  }

  return { rows, error: null, complete: true };
}

export function markHomeGameDirectoryUnavailable(res) {
  if (!res) return;
  res.statusCode = 503;
  res.setHeader('Retry-After', '60');
  res.setHeader('Cache-Control', 'no-store');
}

export function homeGameDirectoryUnavailable(res, props) {
  markHomeGameDirectoryUnavailable(res);
  return {
    props: {
      ...props,
      directoryUnavailable: true,
    },
  };
}
