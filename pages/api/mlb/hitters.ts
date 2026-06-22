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

export default edgeHandler;

export const config = {
  runtime: 'edge',
};
