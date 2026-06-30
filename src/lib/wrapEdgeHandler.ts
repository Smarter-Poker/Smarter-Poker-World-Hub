import type { NextApiRequest, NextApiResponse } from 'next';

/**
 * Adapts a Web-standard `(req: Request) => Promise<Response>` "edge" handler so
 * it runs on the Next.js Pages Router (Node) runtime.
 *
 * This is the exact request/response polyfill that was copy-pasted inline at
 * the bottom of ~12 MLB API routes (pages/api/mlb/*.ts). Extracting it to one
 * place means there is a single implementation to maintain; behavior is
 * byte-for-byte identical to the previous inline version. Routes can adopt it
 * incrementally — `export default wrapEdgeHandler(edgeHandler)`.
 *
 * NOTE: this intentionally does NOT switch routes to the Edge runtime. The
 * Node polyfill is the established platform pattern; changing runtimes is a
 * separate, riskier migration (Node API + Supabase client compatibility).
 */
export function wrapEdgeHandler(
  edgeHandler: (req: Request) => Promise<Response>
): (req: NextApiRequest, res: NextApiResponse) => Promise<void> {
  return async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
      // x-forwarded-proto can be a comma-separated list behind multiple proxies (e.g. "https, http").
      // Always take the FIRST value. Also handle the case where Next.js gives us an array.
      const rawProto = Array.isArray(req.headers['x-forwarded-proto'])
        ? req.headers['x-forwarded-proto'][0]
        : (req.headers['x-forwarded-proto'] || 'http');
      const protocol = rawProto.split(',')[0].trim();
      const host = req.headers.host || 'localhost';
      const url = `${protocol}://${host}${req.url}`;

      // Safely convert headers to Record<string, string>
      const safeHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          safeHeaders[key] = value.join(', ');
        } else if (value !== undefined) {
          safeHeaders[key] = value;
        }
      }

      const requestOptions: RequestInit = {
        method: req.method,
        headers: safeHeaders,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        requestOptions.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      }

      const request = new Request(url, requestOptions);
      const response = await edgeHandler(request);

      res.status(response.status);
      response.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });

      const text = await response.text();
      if (text) {
        try {
          res.json(JSON.parse(text));
        } catch {
          res.send(text);
        }
      } else {
        res.end();
      }
    } catch (err: any) {
      console.error('API Polyfill Error:', err);
      res.status(500).json({ error: err.message || 'Internal Server Error' });
    }
  };
}
