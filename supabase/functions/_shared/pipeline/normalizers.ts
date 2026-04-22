import { PipelineError } from "./errors.ts";
import type {
  CollectionJobRow,
  JsonObject,
  NormalizedCandidate,
  ParsedObservation,
} from "./types.ts";

export function normalizeObservation(job: CollectionJobRow, parsed: ParsedObservation): NormalizedCandidate {
  if (parsed.kind === "numeric") {
    return {
      observedAt: new Date(parsed.observedAt).toISOString(),
      numericValue: parsed.numericValue,
      reviewRequired: job.stream.requires_approval || job.stream.publish_mode === "review_required",
      summary: {
        title: job.stream.metric_name,
        subtitle: parsed.classification ?? `${job.provider_config.display_name} signal`,
        description: `${job.provider_config.display_name} published ${job.stream.metric_name}`,
        classification: parsed.classification ?? null,
        source: job.provider_config.provider_code,
      },
      normalizedPayload: {
        streamCode: job.stream.stream_code,
        metricCode: job.stream.metric_code,
        provider: job.provider_config.provider_code,
        observedAt: new Date(parsed.observedAt).toISOString(),
        value: parsed.numericValue,
        unit: job.stream.unit,
        classification: parsed.classification ?? null,
        meta: (parsed.meta ?? {}) as JsonObject,
      },
    };
  }

  if (parsed.kind === "json") {
    return {
      observedAt: new Date(parsed.observedAt).toISOString(),
      numericValue: null,
      reviewRequired: true,
      summary: {
        title: parsed.title,
        subtitle: job.stream.metric_name,
        description: parsed.summary,
        items: parsed.items,
        source: job.provider_config.provider_code,
      },
      normalizedPayload: {
        streamCode: job.stream.stream_code,
        metricCode: job.stream.metric_code,
        provider: job.provider_config.provider_code,
        observedAt: new Date(parsed.observedAt).toISOString(),
        rollupTitle: parsed.title,
        rollupSummary: parsed.summary,
        items: parsed.items,
        meta: (parsed.meta ?? {}) as JsonObject,
      },
    };
  }

  throw new PipelineError("NORMALIZATION_ERROR", "Unsupported parsed observation");
}
