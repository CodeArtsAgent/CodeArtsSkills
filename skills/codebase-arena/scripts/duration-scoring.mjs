const roundRatio = (value) => Number(value.toFixed(6));

export function assessDuration(durationMs, referenceTimeoutMs, unfinished = false) {
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new Error('durationMs must be a non-negative finite number');
  if (!Number.isFinite(referenceTimeoutMs) || referenceTimeoutMs <= 0) throw new Error('referenceTimeoutMs must be a positive finite number');
  const timeoutRatio = roundRatio(durationMs / referenceTimeoutMs);
  if (unfinished || durationMs >= referenceTimeoutMs) {
    return { actualDurationMs: durationMs, referenceTimeoutMs, timeoutRatio, band: 'unfinished-or-timeout', scoreAdjustment: -1 };
  }
  if (durationMs > referenceTimeoutMs * 0.5) {
    return { actualDurationMs: durationMs, referenceTimeoutMs, timeoutRatio, band: 'over-half', scoreAdjustment: -1 };
  }
  if (durationMs > referenceTimeoutMs * 0.25) {
    return { actualDurationMs: durationMs, referenceTimeoutMs, timeoutRatio, band: 'quarter-to-half', scoreAdjustment: -0.5 };
  }
  return { actualDurationMs: durationMs, referenceTimeoutMs, timeoutRatio, band: 'within-quarter', scoreAdjustment: 0 };
}

export function validateDurationAssessment(value, durationMs, referenceTimeoutMs, unfinished = false) {
  const expected = assessDuration(durationMs, referenceTimeoutMs, unfinished);
  const keys = Object.keys(expected);
  if (!value || typeof value !== 'object' || keys.some((key) => value[key] !== expected[key]) || Object.keys(value).some((key) => !keys.includes(key))) {
    return `durationAssessment must equal ${JSON.stringify(expected)}`;
  }
  return null;
}
