import { PipelineError, toPipelineError } from "../_shared/pipeline/errors.ts";
import { jsonResponse, readJson } from "../_shared/pipeline/http.ts";
import {
  clearJobReviewLock,
  createServiceClient,
  getReviewItem,
  recordReviewAction,
  updateReviewQueue,
  upsertCurrentState,
  upsertIndicatorPoint,
} from "../_shared/pipeline/repository.ts";
import type {
  JsonObject,
  NormalizedCandidate,
  ReviewDecisionRequest,
} from "../_shared/pipeline/types.ts";

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function buildCandidateFromReview(
  review: Awaited<ReturnType<typeof getReviewItem>>,
  request: ReviewDecisionRequest,
): NormalizedCandidate {
  const candidatePayload = asJsonObject(review.candidate_payload);
  const normalized = asJsonObject(candidatePayload.normalized);
  const normalizedPayload = asJsonObject(
    request.correctedSummary?.normalizedPayload ??
      normalized.normalizedPayload ??
      review.point?.normalized_payload ??
      {},
  );
  const summary = asJsonObject(
    request.correctedSummary?.summary ??
      candidatePayload.summary ??
      {},
  );

  const observedAt =
    typeof request.correctedSummary?.observedAt === "string"
      ? request.correctedSummary.observedAt
      : typeof normalized.observedAt === "string"
      ? normalized.observedAt
      : review.point?.observed_at ?? new Date().toISOString();

  const numericValue = request.correctedValue ??
    (typeof normalized.value === "number"
      ? normalized.value
      : review.point?.numeric_value ?? null);

  return {
    observedAt: new Date(observedAt).toISOString(),
    numericValue,
    normalizedPayload: {
      ...normalizedPayload,
      observedAt: new Date(observedAt).toISOString(),
      value: numericValue,
    },
    summary: {
      title: review.job.stream.metric_name,
      subtitle: request.action === "correct" ? "Corrected by admin review" : review.job.stream.metric_name,
      ...summary,
    },
    reviewRequired: false,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await readJson<ReviewDecisionRequest>(request);
    if (!body.reviewQueueId || !body.action) {
      return jsonResponse({
        ok: false,
        error: "reviewQueueId and action are required",
      }, { status: 400 });
    }

    const client = createServiceClient();
    const review = await getReviewItem(client, body.reviewQueueId);

    const shouldPublish = body.publish ?? body.action !== "reject";
    const resumeAutomaticPublishing = body.resumeAutomaticPublishing ?? body.action !== "reject";
    let pointId = review.point?.id ?? null;

    if (body.action === "approve" || body.action === "correct") {
      if (!review.snapshot_id && !review.point?.snapshot_id) {
        throw new PipelineError(
          "VALIDATION_ERROR",
          "Review item cannot be published because it is not tied to a stored snapshot",
        );
      }

      const candidate = buildCandidateFromReview(review, body);
      const point = await upsertIndicatorPoint(client, review.job, {
        runId: review.run_id,
        snapshotId: review.snapshot_id ?? review.point?.snapshot_id ?? "",
        observedAt: candidate.observedAt,
        numericValue: candidate.numericValue,
        normalizedPayload: candidate.normalizedPayload,
        qualityState: "accepted",
        qualityFlags: ["ADMIN_REVIEWED"],
      });
      pointId = point.id;

      if (shouldPublish) {
        await upsertCurrentState(client, {
          streamId: review.stream_id,
          pointId: point.id,
          jobId: review.job_id,
          providerConfigId: review.job.provider_config_id,
          currentValue: point.numeric_value,
          observedAt: point.observed_at,
          summary: candidate.summary,
          publishState: "published",
          lastRunId: review.run_id,
          publishedRunId: review.run_id,
          blockedUntilReview: false,
        });
      }
    }

    const status = body.action === "approve"
      ? "approved"
      : body.action === "correct"
      ? "corrected"
      : body.action === "reject"
      ? "rejected"
      : "ignored";

    await updateReviewQueue(client, body.reviewQueueId, {
      status,
      correctedPayload: body.correctedSummary ?? null,
      notes: body.notes,
      resolutionAction: body.action,
      reviewedBy: body.reviewedBy,
    });

    await recordReviewAction(client, body.reviewQueueId, body.action, {
      publish: shouldPublish,
      correctedValue: body.correctedValue ?? null,
      correctedSummary: body.correctedSummary ?? null,
      notes: body.notes ?? null,
    }, body.reviewedBy);

    if (resumeAutomaticPublishing) {
      await clearJobReviewLock(client, review.job_id, review.stream_id);
    }

    return jsonResponse({
      ok: true,
      reviewQueueId: body.reviewQueueId,
      status,
      published: shouldPublish && pointId !== null,
      pointId,
      resumedAutomaticPublishing: resumeAutomaticPublishing,
    });
  } catch (error) {
    const pipelineError = toPipelineError(error);
    return jsonResponse({
      ok: false,
      error: pipelineError.message,
      code: pipelineError.code,
      details: pipelineError.details ?? {},
    }, {
      status: 500,
    });
  }
});
