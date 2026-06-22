import { getMlbSupabase } from '../../../utils/supabase/mlb';

async function edgeHandler(req: Request) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response(JSON.stringify({ fetchError: true, data: [] }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Allow': 'GET, HEAD'
      },
    });
  }

  try {
    const mlbDb = getMlbSupabase();
    const { data, error } = await mlbDb.rpc('get_mlb_hitter_directory');

    if (error) {
      console.error('[MLB Hitters] directory failed:', error);
      return new Response(JSON.stringify({ fetchError: true, data: [] }), {
        status: 503,
        headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        },
      });
    }

    return new Response(
      JSON.stringify({ fetchError: false, data: Array.isArray(data) ? data : [] }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300'
        },
      }
    );
  } catch (err) {
    console.error('Error fetching hitters:', err);
    return new Response(
      JSON.stringify({ fetchError: true, data: [] }),
      {
        status: 500,
        headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        },
      }
    );
  }
}

import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    let protocol = 'http';
    const xForwardedProto = req.headers['x-forwarded-proto'];
    if (typeof xForwardedProto === 'string') {
        protocol = xForwardedProto.split(',')[0].trim();
    } else if (Array.isArray(xForwardedProto) && xForwardedProto.length > 0) {
        protocol = xForwardedProto[0].split(',')[0].trim();
    }
    const host = req.headers.host || 'localhost';
    const url = `${protocol}://${host}${req.url}`;

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

    const request = new Request(url, requestOptions);
    const response = await edgeHandler(request);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const text = await response.text();
    res.send(text);
  } catch (err: any) {
    console.error('API Polyfill Error:', err);
    res.status(500).json({ fetchError: true, data: [] });
  }
}
