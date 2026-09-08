/**
 * RETIRED: the legacy route accepted caller-owned score and accuracy values
 * and could repeatedly mutate a profile rank without a sealed attempt.
 */
export default function handler(_req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  return res.status(410).json({
    success: false,
    code: 'MEMORY_ELO_MUTATION_RETIRED',
    error: 'Ranked Memory ELO is unavailable until server-authoritative match evidence is live.',
  });
}
