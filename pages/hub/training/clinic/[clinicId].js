import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../../src/components/ui/UniversalHeader';
import { getClinicById } from '../../../../src/data/TRAINING_CLINICS';
import { evaluateTrainingSpotWithHorseBrain, buildCustomTrainingArenaHref } from '../../../../src/lib/training/horseBrainTrainingAdapter';

// Each remediation clinic now launches a real catalog drill whose answers are
// graded by the same deterministic engine as the 107-game training library.
// The former clinic page fabricated every question and randomly decided
// whether a selected answer was correct.
const CLINIC_GAME_MAP = {
  'clinic-01': 'cash-003',
  'clinic-02': 'cash-004',
  'clinic-03': 'adv-012',
  'clinic-04': 'cash-006',
  'clinic-05': 'cash-002',
  'clinic-06': 'psy-002',
  'clinic-07': 'psy-001',
  'clinic-08': 'psy-007',
  'clinic-09': 'adv-016',
  'clinic-10': 'adv-015',
  'clinic-11': 'adv-017',
  'clinic-12': 'adv-011',
  'clinic-13': 'mtt-002',
  'clinic-14': 'mtt-005',
  'clinic-15': 'mtt-006',
  'clinic-16': 'mtt-012',
  'clinic-17': 'mtt-011',
  'clinic-18': 'mtt-013',
  'clinic-19': 'mtt-004',
  'clinic-20': 'mtt-015',
  'clinic-21': 'mtt-008',
  'clinic-22': 'mtt-007',
  'clinic-23': 'cash-018',
  'clinic-24': 'cash-016',
  'clinic-25': 'cash-012',
  'clinic-26': 'cash-015',
  'clinic-27': 'cash-014',
  'clinic-28': 'cash-021',
};

export default function ClinicPlayPage() {
  const router = useRouter();
  const clinicId = typeof router.query.clinicId === 'string' ? router.query.clinicId : '';
  const clinic = useMemo(() => (clinicId ? getClinicById(clinicId) : null), [clinicId]);
  const gameId = CLINIC_GAME_MAP[clinicId];

  const [brainVariant, setBrainVariant] = useState('nlh');
  const brainPreview = useMemo(() => {
    return evaluateTrainingSpotWithHorseBrain({
      variant: brainVariant,
      street: 'flop',
      heroPosition: 'BTN',
      villainPosition: 'BB',
      heroCards: brainVariant === 'plo6' ? ['As', 'Ks', 'Qh', 'Jh', 'Td', '9d'] : brainVariant === 'plo5' ? ['As', 'Ks', 'Qh', 'Jh', 'Td'] : (brainVariant === 'plo4' || brainVariant === 'plo8') ? ['As', 'Ks', 'Qh', 'Jh'] : ['As', 'Kd'],
      boardCards: ['Qs', '7d', '2c'],
      potSizeBb: 12,
      facingBetBb: 4,
      effectiveStackBb: 100,
    });
  }, [brainVariant]);

  useEffect(() => {
    if (!router.isReady || !clinic || !gameId) return;
    router.replace({
      pathname: '/hub/training/arena/[gameId]',
      query: { gameId, level: '1', clinic: clinic.id, remediation: '1' },
    });
  }, [router.isReady, clinic, gameId, router]);

  const href = clinic && gameId
    ? `/hub/training/arena/${gameId}?level=1&clinic=${encodeURIComponent(clinic.id)}&remediation=1`
    : '/hub/training';

  return (
    <>
      <SEOHead title="Training Clinic - Smarter.Poker" description="Verified remediation training." noindex />
      <UniversalHeader pageDepth={2} />
      <main style={{ minHeight: 'calc(100dvh - 70px)', padding: 'clamp(26px, 7vw, 80px) 18px', background: 'radial-gradient(circle at 50% 0%, rgba(16, 118, 226, 0.14), transparent 36%), linear-gradient(180deg, #040d18 0%, #02070d 100%)', color: '#fff' }}>
        <section style={{ position: 'relative', maxWidth: 720, margin: '0 auto', padding: 'clamp(24px, 5vw, 48px)', border: '1px solid #688299', borderTopColor: '#aec0d0', background: 'linear-gradient(180deg, rgba(9, 23, 39, 0.96) 0%, rgba(3, 11, 20, 0.98) 100%)', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 30px 70px rgba(0,0,0,.55)' }}>
          <div aria-hidden style={{ position: 'absolute', inset: 7, border: '1px solid rgba(105,207,244,.14)' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Verified Remediation Path</div>
            <h1 style={{ margin: '12px 0 10px', fontSize: 'clamp(28px, 6vw, 52px)', lineHeight: 1, textTransform: 'capitalize' }}>{clinic?.name || 'Training Clinic'}</h1>
            <p style={{ margin: 0, color: '#b7c9d7', lineHeight: 1.7 }}>{clinic?.description || 'That clinic could not be found.'}</p>
            <p style={{ margin: '18px 0 0', color: '#7893a6', fontSize: 12 }}>Opening The Data-Backed Club Arena Training Table. Progress Is Only Recorded From Completed, Graded Hands.</p>
            <a href={href} style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', marginTop: 24, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
              {clinic && gameId ? 'Continue To Verified Drill →' : 'Return To Training Hub →'}
            </a>

            <div
              data-specialty-brain-panel="true"
              data-brain-engine={brainPreview?.engineModule || 'holdem-brain.js'}
              data-recommended-action={brainPreview?.recommendedAction || 'Call'}
              style={{
                marginTop: 28,
                padding: 18,
                border: '1px solid rgba(105,207,244,.32)',
                background: 'rgba(6, 16, 26, 0.85)',
              }}
            >
              <div style={{ color: '#79e6ff', fontSize: 12, fontWeight: 900, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Horse Brain Clinic Calibration
              </div>
              <div style={{ marginTop: 6, color: '#e6f6ff', fontSize: 14, fontWeight: 800 }}>
                Recommended Action: {brainPreview?.recommendedAction || 'Call'} · Score: {brainPreview?.handScore ?? 50} / 100
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 14 }}>
                {['nlh', 'plo4', 'plo5', 'plo6', 'plo8'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-brain-variant-tab={v}
                    onClick={() => setBrainVariant(v)}
                    style={{
                      padding: '6px 12px',
                      border: brainVariant === v ? '1px solid #79e6ff' : '1px solid rgba(255,255,255,0.2)',
                      background: brainVariant === v ? 'rgba(14,116,144,0.5)' : 'rgba(255,255,255,0.06)',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {v.toUpperCase()}
                  </button>
                ))}
                <button
                  type="button"
                  data-launch-club-arena-cta="true"
                  onClick={() => router.push(buildCustomTrainingArenaHref({ format: 'cash', variant: brainVariant, streets: ['flop'], positions: ['BTN'], stackDepth: 100 }, 'clinic'))}
                  style={{
                    padding: '8px 14px',
                    border: '1px solid #a5efff',
                    background: 'linear-gradient(180deg, #087cfa 0%, #0044ac 58%, #002b68 100%)',
                    color: '#fff',
                    fontSize: 12,
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  Launch 1:1 Club Arena Drill
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
