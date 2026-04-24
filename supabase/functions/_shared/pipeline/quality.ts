import type {
  CollectionJobRow,
  CurrentStateRow,
  JsonObject,
  NormalizedCandidate,
  QualityEvaluation,
} from "./types.ts";

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function hasVenueDataMissing(value: unknown) {
  return asJsonObject(value).venueDataMissing === true;
}

function contractBounds(job: CollectionJobRow): { min: number | null; max: number | null } {
  const contract = asJsonObject(job.provider_config.metric_contract);
  const bounds = asJsonObject(contract.bounds);

  const min = typeof bounds.min === "number"
    ? bounds.min
    : typeof job.stream.min_value === "number"
    ? job.stream.min_value
    : job.stream.value_type === "numeric"
    ? 0
    : null;

  const max = typeof bounds.max === "number"
    ? bounds.max
    : typeof job.stream.max_value === "number"
    ? job.stream.max_value
    : job.stream.value_type === "numeric"
    ? 100
    : null;

  return { min, max };
}

export function evaluateQuality(
  job: CollectionJobRow,
  candidate: NormalizedCandidate,
  lastAcceptedPoint?: { observed_at: string } | null,
  currentState?: CurrentStateRow | null,
): QualityEvaluation {
  const flags: string[] = [];
  const reasons: string[] = [];
  let state: QualityEvaluation["state"] = "accepted";
  let severity: QualityEvaluation["severity"] = "info";
  let requiresReview = false;

  if (job.stream.value_type === "numeric") {
    const { min, max } = contractBounds(job);
    if (candidate.numericValue === null || !Number.isFinite(candidate.numericValue)) {
      flags.push("MISSING_NUMERIC_VALUE");
      reasons.push("Numeric stream did not produce a numeric value");
      state = "rejected";
      severity = "critical";
    } else if (
      (typeof min === "number" && candidate.numericValue < min) ||
      (typeof max === "number" && candidate.numericValue > max)
    ) {
      flags.push("OUT_OF_RANGE");
      reasons.push(`Numeric value ${candidate.numericValue} is outside the expected range`);
      state = "rejected";
      severity = "critical";
    }
  } else {
    const items = Array.isArray(candidate.normalizedPayload.items) ? candidate.normalizedPayload.items : [];
    if (items.length === 0) {
      flags.push("EMPTY_ROLLUP");
      reasons.push("SNS rollup did not contain any items");
      state = "rejected";
      severity = "critical";
    }
  }

  if (lastAcceptedPoint && new Date(candidate.observedAt).getTime() < new Date(lastAcceptedPoint.observed_at).getTime()) {
    flags.push("TIMESTAMP_REGRESSION");
    reasons.push("Observed timestamp moved backward compared with the last accepted point");
    if (state === "accepted") {
      state = "flagged";
    }
    severity = severity === "critical" ? "critical" : "warning";
    requiresReview = true;
  }

  if (currentState && currentState.blocked_until_review) {
    flags.push("STREAM_LOCKED");
    reasons.push("Stream is currently blocked pending review");
    if (state === "accepted") {
      state = "flagged";
    }
    severity = severity === "critical" ? "critical" : "warning";
    requiresReview = true;
  }

  const candidateMeta = asJsonObject(candidate.normalizedPayload.meta);
  if (hasVenueDataMissing(candidateMeta) && hasVenueDataMissing(currentState?.summary)) {
    flags.push("VENUE_DATA_MISSING_REPEATED");
    reasons.push("PizzINT nightlife venue data has been missing for consecutive accepted observations");
    if (state === "accepted") {
      state = "flagged";
    }
    severity = severity === "critical" ? "critical" : "warning";
    requiresReview = true;
  }

  if (candidate.reviewRequired || job.stream.requires_approval || job.stream.publish_mode === "review_required") {
    flags.push("REVIEW_REQUIRED");
    reasons.push("Stream requires explicit review before publishing");
    if (state === "accepted") {
      state = "flagged";
    }
    severity = severity === "critical" ? "critical" : "warning";
    requiresReview = true;
  }

  return {
    state,
    flags,
    reasons,
    severity,
    requiresReview,
  };
}
