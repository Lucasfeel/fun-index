import { PipelineError } from "./errors.ts";
import type {
  CollectionJobRow,
  Json,
  JsonObject,
  NormalizedCandidate,
  ParsedObservation,
} from "./types.ts";

function asJsonObject(value: Json | undefined): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return {};
}

function asJsonArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function stringFromMeta(meta: JsonObject, key: string): string | undefined {
  const value = meta[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function numberFromMeta(meta: JsonObject, key: string): number | undefined {
  const value = meta[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function normalizeObservation(job: CollectionJobRow, parsed: ParsedObservation): NormalizedCandidate {
  if (parsed.kind === "numeric") {
    const meta = asJsonObject(parsed.meta);
    const title = stringFromMeta(meta, "title") ?? job.stream.metric_name;
    const summaryText =
      stringFromMeta(meta, "summary") ??
      `${job.provider_config.display_name} published ${job.stream.metric_name}`;
    const subtitle = stringFromMeta(meta, "subtitle") ?? parsed.classification ?? `${job.provider_config.display_name} signal`;
    const confidence = numberFromMeta(meta, "confidence") ?? 0.72;
    const sampleSize = numberFromMeta(meta, "sampleSize") ?? 0;
    const coverageLabel = stringFromMeta(meta, "coverageLabel") ?? "Aggregate sample";
    const metrics = asJsonArray(meta.metrics);
    const drivers = asJsonArray(meta.drivers);
    const historicalComparisons = asJsonArray(meta.historicalComparisons);
    const venueDataMissing = meta.venueDataMissing === true;

    return {
      observedAt: new Date(parsed.observedAt).toISOString(),
      numericValue: parsed.numericValue,
      reviewRequired: job.stream.requires_approval || job.stream.publish_mode === "review_required",
      summary: {
        title,
        subtitle,
        summary: summaryText,
        description: summaryText,
        score: parsed.numericValue,
        valueNumeric: parsed.numericValue,
        classification: parsed.classification ?? null,
        confidence,
        metrics,
        drivers,
        change: 0,
        freshnessNote: stringFromMeta(meta, "freshnessNote") ?? null,
        uncertaintyNote: stringFromMeta(meta, "uncertaintyNote") ?? null,
        cadenceHours: numberFromMeta(meta, "cadenceHours") ?? 1,
        sampleSize,
        coverageLabel,
        historicalComparisons,
        venueDataMissing,
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
        meta,
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
