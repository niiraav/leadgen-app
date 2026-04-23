export const SCORE_THRESHOLDS = {
  RED: 50,
  AMBER: 70,
  GREEN: 85,
} as const;

export type ScoreThresholdKey = keyof typeof SCORE_THRESHOLDS;
