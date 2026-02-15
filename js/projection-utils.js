/*
  ThinkRight Projection Utilities
  Single source of truth for projected JAMB score math.

  Sanity example:
  - weightedAvgPercent = 88
  - rawProjected = round((88 / 100) * 400) = 352
  - calibrated = round(352 * 0.85) = 299
*/
(function () {
  "use strict";

  const WEIGHTS = [0.35, 0.25, 0.2, 0.12, 0.08];
  const MIN_TESTS = 3;
  const MAX_SCORE = 400;
  const RANGE_DELTA = 12;
  const CALIBRATION_MULTIPLIER = 0.85;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function toScorePercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const scaled = n >= 0 && n <= 1 ? n * 100 : n;
    return clamp(scaled, 0, 100);
  }

  function calibrateProjectedScore(rawProjected) {
    const safeRaw = Number.isFinite(Number(rawProjected)) ? Number(rawProjected) : 0;
    const calibratedProjected = Math.round(safeRaw * CALIBRATION_MULTIPLIER);
    return clamp(calibratedProjected, 0, MAX_SCORE);
  }

  function computeProjectedJambScore(recentTests) {
    const scores = Array.isArray(recentTests)
      ? recentTests
          .map((test) => toScorePercent(test?.score_percentage))
          .filter((value) => Number.isFinite(value))
          .slice(0, 5)
      : [];

    if (scores.length < MIN_TESTS) {
      return null;
    }

    const usedWeights = WEIGHTS.slice(0, scores.length);
    const weightSum = usedWeights.reduce((sum, weight) => sum + weight, 0);
    if (!Number.isFinite(weightSum) || weightSum <= 0) {
      return null;
    }

    const weightedAvgPercent = scores.reduce((sum, score, index) => {
      return sum + score * usedWeights[index];
    }, 0) / weightSum;

    if (!Number.isFinite(weightedAvgPercent)) {
      return null;
    }

    const rawProjected = Math.round((weightedAvgPercent / 100) * MAX_SCORE);
    const calibratedProjected = calibrateProjectedScore(rawProjected);
    const rangeLow = clamp(calibratedProjected - RANGE_DELTA, 0, MAX_SCORE);
    const rangeHigh = clamp(calibratedProjected + RANGE_DELTA, 0, MAX_SCORE);

    return {
      weightedAvgPercent,
      rawProjected,
      calibratedProjected,
      projected: calibratedProjected,
      rangeLow,
      rangeHigh,
      testsUsed: scores.length,
    };
  }

  window.ThinkRightProjection = {
    WEIGHTS,
    MIN_TESTS,
    MAX_SCORE,
    RANGE_DELTA,
    CALIBRATION_MULTIPLIER,
    calibrateProjectedScore,
    computeProjectedJambScore,
  };
})();
