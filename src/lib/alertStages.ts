export type AlertStage = 1 | 2 | 3 | 4 | 5;

export interface AlertStageBand {
  stage: AlertStage;
  label: string;
  color: string;
  min: number;
  max: number;
}

export const alertStageBands: AlertStageBand[] = [
  { stage: 1, label: '매우 낮음', color: '#D73C38', min: 0, max: 19 },
  { stage: 2, label: '낮음', color: '#EC891C', min: 20, max: 39 },
  { stage: 3, label: '보통', color: '#FDD52C', min: 40, max: 59 },
  { stage: 4, label: '높음', color: '#A1CE2D', min: 60, max: 79 },
  { stage: 5, label: '매우 높음', color: '#56B678', min: 80, max: 100 },
];

export function scoreToAlertStage(score: number): AlertStage {
  const clamped = Math.max(0, Math.min(100, score));
  return (clamped === 100 ? 5 : Math.floor(clamped / 20) + 1) as AlertStage;
}

export function getAlertStageBand(stage: AlertStage) {
  return alertStageBands.find((item) => item.stage === stage) ?? alertStageBands[2]!;
}

export function hasCrossedAlertThreshold(
  previousStage: AlertStage | null | undefined,
  currentStage: AlertStage,
  thresholdStage: AlertStage,
) {
  return currentStage >= thresholdStage && (previousStage ?? currentStage) < thresholdStage;
}
