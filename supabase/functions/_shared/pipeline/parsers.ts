import { PipelineError } from "./errors.ts";
import type {
  CollectionJobRow,
  Json,
  JsonObject,
  ParsedObservation,
} from "./types.ts";

function asJsonObject(value: Json | undefined): JsonObject | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return undefined;
}

function asArray(value: Json | undefined): Json[] {
  return Array.isArray(value) ? value : [];
}

function firstString(...values: Array<Json | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function firstNumber(...values: Array<Json | undefined>): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

function latestArrayItem(value: Json | undefined): JsonObject | undefined {
  const items = asArray(value)
    .map((item) => asJsonObject(item))
    .filter((item): item is JsonObject => Boolean(item));

  return items.at(-1);
}

function parsePizzint(job: CollectionJobRow, payload: JsonObject): ParsedObservation {
  const metricKey = typeof job.request_config.metric === "string" ? job.request_config.metric : undefined;
  const metricPayload = metricKey ? asJsonObject(payload[metricKey]) : undefined;
  const dataPayload = asJsonObject(payload.data);

  const numericValue = firstNumber(
    metricPayload?.score,
    metricPayload?.value,
    dataPayload?.score,
    dataPayload?.value,
    payload.score,
    payload.value,
  );

  if (numericValue === undefined) {
    throw new PipelineError("PARSER_ERROR", "PizzINT payload did not contain a numeric score", {
      jobCode: job.job_code,
      metricKey,
    });
  }

  return {
    kind: "numeric",
    observedAt:
      firstString(metricPayload?.observed_at, dataPayload?.observed_at, payload.observed_at) ??
      new Date().toISOString(),
    numericValue,
    label: firstString(metricPayload?.label, dataPayload?.label, payload.label),
    classification: firstString(metricPayload?.classification, dataPayload?.classification, payload.classification),
    meta: {
      sourceMetric: metricKey ?? job.stream.metric_code,
    },
  };
}

function parseCnnFearGreed(payload: JsonObject): ParsedObservation {
  const latest = latestArrayItem(payload.fear_and_greed_historical) ??
    latestArrayItem(asJsonObject(payload.fear_and_greed)?.data) ??
    asJsonObject(payload.fear_and_greed) ??
    asJsonObject(payload.data);

  const numericValue = firstNumber(
    latest?.score,
    latest?.value,
    asJsonObject(payload.fear_and_greed)?.score,
    asJsonObject(payload.data)?.score,
    payload.score,
    payload.value,
  );

  if (numericValue === undefined) {
    throw new PipelineError("PARSER_ERROR", "CNN payload did not contain a numeric score");
  }

  return {
    kind: "numeric",
    observedAt:
      firstString(latest?.timestamp, latest?.observed_at, payload.observed_at) ??
      new Date().toISOString(),
    numericValue,
    classification: firstString(latest?.rating, latest?.classification, payload.classification),
    meta: {
      source: "cnn",
    },
  };
}

function parseCoinMarketCap(payload: JsonObject): ParsedObservation {
  const data = asJsonObject(payload.data);
  const latest = latestArrayItem(data?.points) ?? latestArrayItem(data?.historical) ?? data;

  const numericValue = firstNumber(
    latest?.value,
    latest?.score,
    data?.value,
    payload.value,
    payload.score,
  );

  if (numericValue === undefined) {
    throw new PipelineError("PARSER_ERROR", "CoinMarketCap payload did not contain a numeric score");
  }

  return {
    kind: "numeric",
    observedAt:
      firstString(latest?.timestamp, latest?.observed_at, data?.observed_at, payload.observed_at) ??
      new Date().toISOString(),
    numericValue,
    classification: firstString(latest?.classification, latest?.rating, data?.classification),
    meta: {
      source: "coinmarketcap",
    },
  };
}

function parseSnsRollup(payload: JsonObject): ParsedObservation {
  const items = asArray(payload.items)
    .map((item) => asJsonObject(item))
    .filter((item): item is JsonObject => Boolean(item));

  if (items.length === 0) {
    throw new PipelineError("PARSER_ERROR", "SNS payload did not contain any rollup items");
  }

  return {
    kind: "json",
    observedAt: firstString(payload.observed_at, payload.generated_at) ?? new Date().toISOString(),
    title: firstString(payload.title, payload.rollup_title) ?? "SNS Rollup",
    summary: firstString(payload.summary, payload.rollup_summary) ?? "Approved social rollup",
    items,
    meta: {
      source: "sns_connector",
      providerApprovalSuggested: payload.approved === true,
    },
  };
}

export function parseSnapshot(job: CollectionJobRow, payload: JsonObject): ParsedObservation {
  switch (job.provider_config.provider_family) {
    case "pizzint":
      return parsePizzint(job, payload);
    case "cnn_fear_greed":
      return parseCnnFearGreed(payload);
    case "cmc_fear_greed":
      return parseCoinMarketCap(payload);
    case "sns_rollup":
      return parseSnsRollup(payload);
    default:
      throw new PipelineError("PARSER_ERROR", `Unsupported provider family '${job.provider_config.provider_family}'`);
  }
}
