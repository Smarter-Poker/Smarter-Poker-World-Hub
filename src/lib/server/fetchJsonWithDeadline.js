export async function fetchJsonWithDeadline(url, { fetchImpl = fetch, timeoutMs = 5_000 } = {}) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error(`Fetch deadline exceeded after ${timeoutMs}ms`);
      error.name = 'TimeoutError';
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) return null;
        return response.json();
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
