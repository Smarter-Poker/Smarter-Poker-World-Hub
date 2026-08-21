import { getAll } from '../../src/data/AVATAR_LIBRARY';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const avatars = getAll();
    res.status(200).json(avatars);
  } catch (error) {
    console.error('[Avatar API] Error fetching library:', error);
    res.status(500).json({ error: 'Failed to load avatar library' });
  }
}
