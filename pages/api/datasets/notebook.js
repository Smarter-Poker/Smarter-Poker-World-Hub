import { buildJupyterNotebookPayload } from './catalog';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/x-ipynb+json; charset=utf-8');
  return res.status(200).send(JSON.stringify(buildJupyterNotebookPayload(), null, 2));
}
