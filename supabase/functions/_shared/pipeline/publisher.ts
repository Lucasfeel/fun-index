import { PipelineError } from "./errors.ts";
import {
  getCurrentState,
  upsertCurrentState,
  type DatabaseClient,
} from "./repository.ts";
import type {
  CollectionJobRow,
  IndicatorPointRow,
  NormalizedCandidate,
  PublishResult,
  QualityEvaluation,
} from "./types.ts";

export async function publishCandidate(
  client: DatabaseClient,
  job: CollectionJobRow,
  point: IndicatorPointRow,
  candidate: NormalizedCandidate,
  quality: QualityEvaluation,
): Promise<PublishResult> {
  if (!job.publish_enabled || job.stream.publish_mode === "suspended") {
    return "blocked";
  }

  if (job.locked_until_review || quality.requiresReview || quality.state !== "accepted") {
    return quality.requiresReview ? "withheld" : "blocked";
  }

  const current = await getCurrentState(client, job.stream_id);
  if (current && new Date(current.observed_at).getTime() > new Date(candidate.observedAt).getTime()) {
    return "skipped";
  }

  if (current?.blocked_until_review) {
    throw new PipelineError("PUBLISH_BLOCKED", "Current stream state is blocked pending review");
  }

  await upsertCurrentState(client, {
    streamId: job.stream_id,
    pointId: point.id,
    jobId: job.id,
    providerConfigId: job.provider_config_id,
    currentValue: point.numeric_value,
    observedAt: point.observed_at,
    summary: candidate.summary,
    publishState: "published",
    lastRunId: point.run_id,
    publishedRunId: point.run_id,
    blockedUntilReview: false,
  });

  return "published";
}
