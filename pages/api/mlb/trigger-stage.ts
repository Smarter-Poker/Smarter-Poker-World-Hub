import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { stage } = req.body;

  if (!stage) {
    return res.status(400).json({ error: 'Stage is required' });
  }

  try {
    // TODO: Wire this up to the actual backend pipeline webhook or Supabase RPC
    // For now, this is a stub that waits 2 seconds to simulate a network request
    // and returns a success response.
    console.log(`[API/MLB/Trigger] Simulating trigger for stage: ${stage}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return res.status(200).json({ ok: true, message: `Successfully triggered stage: ${stage}` });
  } catch (error) {
    console.error(`[API/MLB/Trigger] Error triggering stage ${stage}:`, error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
