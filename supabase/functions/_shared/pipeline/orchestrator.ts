import { getAdapter } from "./adapters.ts";
import { PipelineError, toPipelineError } from "./errors.ts";
import { normalizeObservation } from "./normalizers.ts";
import { parseSnapshot } from "./parsers.ts";
import { publishCandidate } from "./publisher.ts";
import { evaluateQuality } from "./quality.ts";
import {
  clearJobReviewLock,
  createServiceClient,
  enqueueReviewItem,
  fetchJobs,
  finishRun,
  getConsecutiveParserFailures,
  getCurrentState,
  getLatestAcceptedPoint,
  getLatestSuccessfulRun,
  lockJobForReview,
  markJobSuccess,
  openRun,
  recordRawSnapshot,
  updateRawSnapshotParseOutcome,
  upsertIndicatorPoint,
  type DatabaseClient,
} from "./repository.ts";
import { buildRunSummary } from "./run-summary.ts";
import type {
  CollectionJobRow,
  Json,
  JsonObject,
  RunRequest,
  RunSummary,
} from "./types.ts";

function stableStringify(value: Json): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as JsonObject)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as JsonObject)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function buildIdempotencyKey(job: CollectionJobRow, request: RunRequest): Promise<string> {
  if (request.idempotencyKey) {
    return request.idempotencyKey;
  }

  return sha256Hex(stableStringify({
    jobCode: job.job_code,
    trigger: request.trigger,
    requestedWindowStart: request.requestedWindowStart ?? null,
    requestedWindowEnd: request.requestedWindowEnd ?? null,
    retryOfRunId: request.retryOfRunId ?? null,
    rerunOfRunId: request.rerunOfRunId ?? null,
  }));
}

async function checksumPayload(payload: JsonObject): Promise<string> {
  return sha256Hex(stableStringify(payload));
}

function buildReviewPayload(source: JsonObject): JsonObject {
  return source;
}

async function runSingleJob(
  client: DatabaseClient,
  job: CollectionJobRow,
  request: RunRequest,
): Promise<RunSummary> {
  const latestSuccessfulRun = await getLatestSuccessfulRun(client, job.id);
  const lastSuccessfulAt = latestSuccessfulRun?.finished_at ?? latestSuccessfulRun?.started_at ?? null;
  const idempotencyKey = await buildIdempotencyKey(job, request);

  if (job.locked_until_review && request.trigger === "scheduled" && !request.force) {
    const { run: blockedRun } = await openRun(client, job, request, idempotencyKey, lastSuccessfulAt);
    const summary = buildRunSummary(job, blockedRun, {
      status: "blocked",
      publishResult: "blocked",
      recordCount: 0,
      errorReason: "Automatic publishing is locked pending admin review",
      errorCode: "PUBLISH_BLOCKED",
      lastSuccessfulRun: lastSuccessfulAt,
      notes: ["Stream remains locked until the review queue is resolved."],
    });

    await finishRun(client, blockedRun.id, {
      status: "blocked",
      publish_result: "blocked",
      record_count: 0,
      error_reason: summary.error_reason,
      error_code: summary.error_code,
      summary,
    });

    return summary;
  }

  const { run, reused } = await openRun(client, job, request, idempotencyKey, lastSuccessfulAt);

  if (reused) {
    if (run.summary && Object.keys(run.summary).length > 0) {
      return run.summary as unknown as RunSummary;
    }

    return buildRunSummary(job, run, {
      status: run.status,
      publishResult: run.publish_result,
      recordCount: run.record_count,
      errorReason: run.error_reason,
      errorCode: run.error_code,
      lastSuccessfulRun: run.last_successful_run,
      notes: ["Duplicate idempotent invocation reused an existing run."],
    });
  }

  const adapter = getAdapter(job);

  try {
    const fetched = await adapter.fetch(job, {
      start: request.requestedWindowStart,
      end: request.requestedWindowEnd,
    });

    const snapshot = await recordRawSnapshot(client, job, run.id, {
      requestFingerprint: fetched.requestFingerprint,
      checksum: await checksumPayload(fetched.payload),
      sourceReference: fetched.sourceReference,
      sourceUrl: fetched.sourceUrl,
      httpStatus: fetched.httpStatus,
      observedAt: fetched.observedAt,
      rawPayload: fetched.payload,
      meta: fetched.meta,
    });

    const parsed = parseSnapshot(job, fetched.payload);
    await updateRawSnapshotParseOutcome(client, snapshot.id, {
      parseStatus: "parsed",
      observedAt: parsed.observedAt,
    });

    const normalized = normalizeObservation(job, parsed);
    const lastAcceptedPoint = await getLatestAcceptedPoint(client, job.stream_id);
    const currentState = await getCurrentState(client, job.stream_id);
    const quality = evaluateQuality(job, normalized, lastAcceptedPoint, currentState);

    const point = await upsertIndicatorPoint(client, job, {
      runId: run.id,
      snapshotId: snapshot.id,
      observedAt: normalized.observedAt,
      numericValue: normalized.numericValue,
      normalizedPayload: normalized.normalizedPayload,
      qualityState: quality.state,
      qualityFlags: quality.flags,
    });

    if (quality.state !== "accepted" || quality.requiresReview) {
      await enqueueReviewItem(client, {
        runId: run.id,
        jobId: job.id,
        streamId: job.stream_id,
        snapshotId: snapshot.id,
        pointId: point.id,
        reasonCode: quality.flags[0] ?? "REVIEW_REQUIRED",
        severity: quality.severity,
        candidatePayload: buildReviewPayload({
          normalized,
          quality,
          summary: normalized.summary,
        }),
        notes: quality.reasons.join(" "),
        publishAfterReview: quality.state === "flagged",
      });
    }

    const publishResult = await publishCandidate(client, job, point, normalized, quality);
    const succeeded = quality.state === "accepted";
    if (succeeded) {
      await markJobSuccess(client, job.id, run.id, publishResult === "published");
      if (job.locked_until_review && request.force) {
        await clearJobReviewLock(client, job.id, job.stream_id);
      }
    }

    const status = quality.state === "accepted" ? "succeeded" : quality.state === "flagged" ? "flagged" : "failed";
    const summary = buildRunSummary(job, run, {
      status,
      publishResult,
      recordCount: 1,
      lastSuccessfulRun: succeeded ? new Date().toISOString() : lastSuccessfulAt,
      qualityFlags: quality.flags,
      notes: quality.reasons,
    });

    await finishRun(client, run.id, {
      status,
      publish_result: publishResult,
      record_count: 1,
      summary,
    });

    return summary;
  } catch (error) {
    const pipelineError = toPipelineError(error);

    const reviewFailureStreak = pipelineError.code === "PARSER_ERROR"
      ? await getConsecutiveParserFailures(client, job.id) + 1
      : 0;

    if (pipelineError.code === "PARSER_ERROR" && reviewFailureStreak >= job.consecutive_failure_limit) {
      await lockJobForReview(client, job.id, job.stream_id);
    }

    await enqueueReviewItem(client, {
      runId: run.id,
      jobId: job.id,
      streamId: job.stream_id,
      reasonCode: pipelineError.code,
      severity: pipelineError.code === "PARSER_ERROR" ? "critical" : "warning",
      failureStreak: reviewFailureStreak,
      candidatePayload: buildReviewPayload({
        error: pipelineError.message,
        details: pipelineError.details ?? {},
        parserVersion: job.provider_config.parser_version,
      }),
      notes: pipelineError.message,
      publishAfterReview: false,
    });

    const summary = buildRunSummary(job, run, {
      status: pipelineError.code === "PARSER_ERROR" && reviewFailureStreak >= job.consecutive_failure_limit
        ? "blocked"
        : "failed",
      publishResult: pipelineError.code === "PARSER_ERROR" && reviewFailureStreak >= job.consecutive_failure_limit
        ? "blocked"
        : "withheld",
      recordCount: 0,
      errorReason: pipelineError.message,
      errorCode: pipelineError.code,
      lastSuccessfulRun: lastSuccessfulAt,
      notes: reviewFailureStreak > 0
        ? [`Parser failure streak is now ${reviewFailureStreak}.`]
        : [],
    });

    await finishRun(client, run.id, {
      status: summary.status,
      publish_result: summary.publish_result,
      record_count: 0,
      error_reason: summary.error_reason,
      error_code: summary.error_code,
      summary,
    });

    return summary;
  }
}

export async function runPipeline(request: RunRequest): Promise<RunSummary[]> {
  const client = createServiceClient();
  const jobs = await fetchJobs(client, request.jobCode);

  if (jobs.length === 0) {
    throw new PipelineError("PROVIDER_CONFIG_ERROR", request.jobCode
      ? `No active job found for '${request.jobCode}'`
      : "No active jobs found");
  }

  const results: RunSummary[] = [];
  for (const job of jobs) {
    results.push(await runSingleJob(client, job, request));
  }
  return results;
}
