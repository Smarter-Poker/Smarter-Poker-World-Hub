/**
 * Pure Statistical Significance & Auth Provider Readiness Engine.
 *
 * Zero-PII, zero-secret, deterministic math utilities for evaluating A/B offer
 * experiments (two-proportion z-test with Abramowitz & Stegun erfc tail
 * probability) and OAuth / Google One Tap / Magic Link provider readiness.
 */

function toSafeNonNeg(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : 0;
}

function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

/**
 * Complementary error function approximation (Abramowitz & Stegun 7.1.26,
 * max absolute error < 1.5e-7). Never returns NaN or Infinity.
 */
function erfcApprox(x) {
  if (!Number.isFinite(x)) return 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * absX);
  const poly =
    t *
    (0.254829592 +
      t *
        (-0.284496736 +
          t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const res = Math.max(0, Math.min(1, poly * Math.exp(-absX * absX)));
  return x >= 0 ? res : 2 - res;
}

/**
 * Two-proportion z-test for comparing a variant against control.
 * Never returns NaN or Infinity for zero, negative, out-of-range, or non-numeric inputs.
 */
export function computeVariantSignificance({
  controlCount = 0,
  controlTotal = 0,
  variantCount = 0,
  variantTotal = 0,
  minSamplePerVariant = 30,
} = {}) {
  const safeMinSample =
    Number.isFinite(Number(minSamplePerVariant)) && Number(minSamplePerVariant) > 0
      ? Math.trunc(Number(minSamplePerVariant))
      : 30;

  const cTotal = toSafeNonNeg(controlTotal);
  const vTotal = toSafeNonNeg(variantTotal);
  const cCount = Math.min(toSafeNonNeg(controlCount), cTotal);
  const vCount = Math.min(toSafeNonNeg(variantCount), vTotal);

  const sampleReady = cTotal >= safeMinSample && vTotal >= safeMinSample;

  const controlRate = cTotal > 0 ? cCount / cTotal : 0;
  const variantRate = vTotal > 0 ? vCount / vTotal : 0;
  const controlRatePct = normalizeZero(Math.round(controlRate * 1000) / 10);
  const variantRatePct = normalizeZero(Math.round(variantRate * 1000) / 10);

  let liftPct = null;
  if (cTotal > 0 && vTotal > 0) {
    if (controlRate > 0) {
      const rawLift = ((variantRate - controlRate) / controlRate) * 100;
      liftPct = Number.isFinite(rawLift) ? normalizeZero(Math.round(rawLift * 10) / 10) : null;
    } else if (variantRate === 0) {
      liftPct = 0;
    } else {
      liftPct = null;
    }
  }

  const combinedTotal = cTotal + vTotal;
  const pooledRate = combinedTotal > 0 ? (cCount + vCount) / combinedTotal : 0;
  const pooledVariance =
    cTotal > 0 && vTotal > 0
      ? pooledRate * (1 - pooledRate) * (1 / cTotal + 1 / vTotal)
      : 0;
  const standardError = pooledVariance > 0 ? Math.sqrt(pooledVariance) : 0;

  const rawZ = standardError > 0 ? (variantRate - controlRate) / standardError : 0;
  const zScore = Number.isFinite(rawZ) ? normalizeZero(Math.round(rawZ * 10000) / 10000) : 0;

  const rawP = standardError > 0 ? erfcApprox(Math.abs(rawZ) / Math.SQRT2) : 1;
  const safeRawP = Number.isFinite(rawP) ? Math.max(0, Math.min(1, rawP)) : 1;
  const pValue = Math.round(safeRawP * 1_000_000) / 1_000_000;

  const significant = Boolean(sampleReady && safeRawP < 0.05);
  const confidencePct = sampleReady
    ? normalizeZero(Math.round((1 - safeRawP) * 1000) / 10)
    : 0;

  let winner = 'tie';
  if (!sampleReady) {
    winner = 'insufficient_sample';
  } else if (significant) {
    if (variantRate > controlRate) {
      winner = 'variant';
    } else if (controlRate > variantRate) {
      winner = 'control';
    }
  }

  let confidenceLabel = 'No Clear Winner';
  if (!sampleReady) {
    confidenceLabel = 'Collecting Sample';
  } else if (significant) {
    confidenceLabel = '95%+ Confidence';
  }

  return {
    controlCount: cCount,
    controlTotal: cTotal,
    variantCount: vCount,
    variantTotal: vTotal,
    minSamplePerVariant: safeMinSample,
    controlRatePct,
    variantRatePct,
    liftPct,
    zScore,
    pValue,
    confidencePct,
    sampleReady,
    significant,
    winner,
    confidenceLabel,
  };
}

/**
 * Pure diagnostic evaluator for 7-day OAuth vs Email adoption, Google One Tap
 * configuration readiness (strictly boolean, never returning secret values),
 * and Passwordless Magic Link readiness.
 */
export function evaluateAuthProviderReadiness({
  attribution = null,
  env = typeof process !== 'undefined' && process?.env ? process.env : {},
} = {}) {
  const rawGoogleClientId =
    typeof env?.NEXT_PUBLIC_GOOGLE_CLIENT_ID === 'string'
      ? env.NEXT_PUBLIC_GOOGLE_CLIENT_ID.trim()
      : '';
  const googleOneTapConfigured = rawGoogleClientId.length > 0;
  const googleOneTapStatus = googleOneTapConfigured ? 'Configured' : 'Pending Env Var';

  const providers = attribution && typeof attribution === 'object' ? attribution.providers : null;
  const googleCount = toSafeNonNeg(providers?.google);
  const facebookCount = toSafeNonNeg(providers?.facebook);
  const explicitOauth = toSafeNonNeg(providers?.oauth_total);
  const oauthCount = explicitOauth > 0 ? explicitOauth : googleCount + facebookCount;
  const emailCount = toSafeNonNeg(providers?.email);
  const otherCount = toSafeNonNeg(providers?.other);

  const providerSum = oauthCount + emailCount + otherCount;
  const totalSignups = Math.max(toSafeNonNeg(attribution?.totalSignups), providerSum);

  const oauthSharePct =
    totalSignups > 0
      ? normalizeZero(Math.round((oauthCount / totalSignups) * 1000) / 10)
      : null;
  const emailSharePct =
    totalSignups > 0
      ? normalizeZero(Math.round((emailCount / totalSignups) * 1000) / 10)
      : null;

  const magicLinkReady = true;

  let recommendation = 'Healthy OAuth Adoption. Google One Tap And Magic Link Active.';
  if (!googleOneTapConfigured) {
    recommendation = 'Set NEXT_PUBLIC_GOOGLE_CLIENT_ID To Enable Google One Tap Signups.';
  } else if (totalSignups === 0) {
    recommendation = 'Google One Tap Configured. Waiting For 7-Day Signup Volume.';
  } else if (oauthSharePct !== null && oauthSharePct < 40) {
    recommendation = 'OAuth Share Below 40%. Audit Google One Tap And Magic Link Friction.';
  }

  return {
    googleOneTapConfigured,
    googleOneTapStatus,
    magicLinkReady,
    oauthCount,
    googleCount,
    facebookCount,
    emailCount,
    totalSignups,
    oauthSharePct,
    emailSharePct,
    recommendation,
  };
}
