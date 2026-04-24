import assert from 'node:assert/strict';
import test from 'node:test';

import {
  hasCrossedAlertThreshold,
  scoreToAlertStage,
  type AlertStage,
} from '../src/lib/alertStages.ts';

test('scoreToAlertStage maps score ranges to the five alert stages', () => {
  const cases: Array<[number, AlertStage]> = [
    [0, 1],
    [19, 1],
    [20, 2],
    [39, 2],
    [40, 3],
    [59, 3],
    [60, 4],
    [79, 4],
    [80, 5],
    [100, 5],
    [101, 5],
    [-1, 1],
  ];

  for (const [score, expected] of cases) {
    assert.equal(scoreToAlertStage(score), expected, `score ${score}`);
  }
});

test('hasCrossedAlertThreshold only fires when moving from below to threshold or above', () => {
  assert.equal(hasCrossedAlertThreshold(3, 4, 4), true);
  assert.equal(hasCrossedAlertThreshold(3, 5, 4), true);
  assert.equal(hasCrossedAlertThreshold(4, 5, 4), false);
  assert.equal(hasCrossedAlertThreshold(5, 4, 4), false);
  assert.equal(hasCrossedAlertThreshold(null, 4, 4), false);
  assert.equal(hasCrossedAlertThreshold(2, 3, 4), false);
});
