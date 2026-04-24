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
      return value.trim();
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

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function roundScore(value: number) {
  return Math.round(clampScore(value) * 10) / 10;
}

function metricTone(value: number) {
  if (value >= 60) {
    return "warm";
  }
  if (value <= 40) {
    return "cool";
  }
  return "neutral";
}

function classifyFearGreed(value: number) {
  if (value < 25) {
    return "Extreme Fear";
  }
  if (value < 45) {
    return "Fear";
  }
  if (value < 55) {
    return "Neutral";
  }
  if (value < 75) {
    return "Greed";
  }
  return "Extreme Greed";
}

function classifyPizzint(value: number, defconLevel?: number) {
  if (defconLevel) {
    return `DOUGHCON ${defconLevel}`;
  }
  if (value >= 75) {
    return "High Alert";
  }
  if (value >= 55) {
    return "Elevated Watch";
  }
  if (value >= 35) {
    return "Double Take";
  }
  return "Nominal";
}

function classifyQuietness(value: number) {
  if (value >= 75) {
    return "Extreme Quiet";
  }
  if (value >= 55) {
    return "Quiet Watch";
  }
  if (value >= 35) {
    return "Mixed Activity";
  }
  return "Normal Activity";
}

function toObservedAt(...values: Array<Json | undefined>) {
  const candidate = firstString(...values);
  if (!candidate) {
    return new Date().toISOString();
  }

  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function toJsonMetrics(items: Array<{ label: string; value: string | number; tone?: "cool" | "neutral" | "warm" }>) {
  return items.map((item) => {
    const metric: JsonObject = {
      label: item.label,
      value: String(item.value),
    };
    if (item.tone) {
      metric.tone = item.tone;
    }
    return metric;
  });
}

function parseIndicatorItems(value: Json | undefined, fallbackScore: number) {
  const sourceItems = asArray(value)
    .map((item) => asJsonObject(item))
    .filter((item): item is JsonObject => Boolean(item));

  return sourceItems
    .map((item) => {
      const name = firstString(item.name, item.label);
      const numeric = firstNumber(item.value, item.raw);
      if (!name || numeric === undefined) {
        return null;
      }
      return {
        label: name,
        value: firstString(item.raw, item.value) ?? String(Math.round(numeric)),
        tone: metricTone(firstNumber(item.value) ?? fallbackScore),
      };
    })
    .filter((item): item is { label: string; value: string; tone: "cool" | "neutral" | "warm" } => item !== null);
}

function parsePizzint(job: CollectionJobRow, payload: JsonObject): ParsedObservation {
  const metricKey = typeof job.request_config.metric === "string" ? job.request_config.metric : job.stream.metric_code;
  const dashboard = asJsonObject(payload.dashboard) ?? payload;
  const defconDetails = asJsonObject(dashboard.defcon_details);
  const dataItems = asArray(dashboard.data)
    .map((item) => asJsonObject(item))
    .filter((item): item is JsonObject => Boolean(item));
  const overallIndex = firstNumber(dashboard.overall_index, defconDetails?.raw_index, defconDetails?.smoothed_index);
  const defconLevel = firstNumber(dashboard.defcon_level, payload.htmlDoughcon);
  const observedAt = toObservedAt(defconDetails?.at_time, dashboard.observed_at);
  const activeSpikes = firstNumber(dashboard.active_spikes, defconDetails?.places_above_150) ?? 0;

  if (metricKey.includes("gay") || metricKey.includes("bar")) {
    const venues = dataItems.filter((item) => {
      const name = firstString(item.name)?.toLowerCase() ?? "";
      return name.includes("freddie") || name.includes("little gay pub");
    });
    const venuePercentages = venues
      .map((item) => firstNumber(item.percentage_of_usual))
      .filter((value): value is number => value !== undefined);

    if (venuePercentages.length > 0) {
      const quietness = roundScore(
        venuePercentages.reduce((sum, value) => sum + (100 - Math.min(100, Math.max(0, value))), 0) /
          venuePercentages.length,
      );

      return {
        kind: "numeric",
        observedAt,
        numericValue: quietness,
        classification: classifyQuietness(quietness),
        meta: {
          title: "Gay Bar Index",
          subtitle: "Inverse nightlife activity",
          summary: "Tracks unusual quietness at selected DC nightlife venues surfaced by PizzINT.",
          sourceMetric: metricKey,
          source: "pizzint",
          confidence: 0.72,
          venueDataMissing: false,
          metrics: toJsonMetrics([
            { label: "Quietness", value: `${Math.round(quietness)}%`, tone: metricTone(quietness) },
            { label: "Tracked venues", value: venues.length },
            { label: "Active spikes", value: activeSpikes },
          ]),
          drivers: [
            "Computed from PizzINT venue percentage-of-usual values.",
            "Lower venue activity raises this inverse signal.",
            "Read alongside pizza activity and market sentiment indicators.",
          ],
          sampleSize: venues.length,
          coverageLabel: `${venues.length} nightlife venues`,
        },
      };
    }

    if (overallIndex === undefined) {
      throw new PipelineError("PARSER_ERROR", "PizzINT gay-bar payload did not contain venue data or fallback score", {
        jobCode: job.job_code,
        metricKey,
      });
    }

    const fallbackScore = roundScore(overallIndex);
    return {
      kind: "numeric",
      observedAt,
      numericValue: fallbackScore,
      classification: "Limited venue data",
      meta: {
        title: "Gay Bar Index",
        subtitle: "Fallback to PizzINT composite",
        summary: "Gay-bar venue values were missing, so the card is using the PizzINT composite score as a limited fallback.",
        sourceMetric: metricKey,
        source: "pizzint",
        confidence: 0.45,
        venueDataMissing: true,
        metrics: toJsonMetrics([
          { label: "Fallback score", value: Math.round(fallbackScore), tone: metricTone(fallbackScore) },
          { label: "Tracked venues", value: venues.length },
          { label: "DOUGHCON", value: defconLevel ?? "N/A" },
        ]),
        drivers: [
          "PizzINT did not expose current nightlife venue percentages.",
          "Composite Pentagon activity is displayed until venue data returns.",
          "Repeated missing venue data is routed to review.",
        ],
        sampleSize: venues.length,
        coverageLabel: "Venue data unavailable",
      },
    };
  }

  const scoreFromDoughcon = defconLevel ? 100 - Math.max(0, defconLevel - 1) * 20 : undefined;
  const numericValue = firstNumber(overallIndex, scoreFromDoughcon);

  if (numericValue === undefined) {
    throw new PipelineError("PARSER_ERROR", "PizzINT payload did not contain a numeric score", {
      jobCode: job.job_code,
      metricKey,
    });
  }

  const score = roundScore(numericValue);

  return {
    kind: "numeric",
    observedAt,
    numericValue: score,
    classification: classifyPizzint(score, defconLevel ? Math.round(defconLevel) : undefined),
    meta: {
      title: "Pizza Index",
      subtitle: "Pentagon-area pizza activity",
      summary: "Tracks PizzINT's live Pentagon pizza activity composite and DOUGHCON status.",
      sourceMetric: metricKey,
      source: "pizzint",
      confidence: 0.82,
      metrics: toJsonMetrics([
        { label: "Composite", value: Math.round(score), tone: metricTone(score) },
        { label: "DOUGHCON", value: defconLevel ?? "N/A" },
        { label: "Active spikes", value: activeSpikes },
      ]),
      drivers: [
        "Pulled from the PizzINT page-owned dashboard payload.",
        "Score reflects the latest PizzINT overall index.",
        "DOUGHCON status is retained as the primary classification label.",
      ],
      sampleSize: dataItems.length,
      coverageLabel: `${dataItems.length} monitored locations`,
    },
  };
}

function parseCnnFearGreed(payload: JsonObject): ParsedObservation {
  const history = asJsonObject(payload.fear_and_greed_historical);
  const latest = latestArrayItem(history?.data) ??
    latestArrayItem(asJsonObject(payload.fear_and_greed)?.data) ??
    asJsonObject(payload.fear_and_greed) ??
    asJsonObject(payload.data);

  const root = asJsonObject(payload.fear_and_greed);
  const numericValue = firstNumber(
    latest?.score,
    latest?.value,
    root?.score,
    asJsonObject(payload.data)?.score,
    payload.score,
    payload.value,
  );

  if (numericValue === undefined) {
    throw new PipelineError("PARSER_ERROR", "CNN payload did not contain a numeric score");
  }

  const score = roundScore(numericValue);
  const classification = firstString(latest?.rating, root?.rating, latest?.classification, payload.classification) ??
    classifyFearGreed(score);

  return {
    kind: "numeric",
    observedAt: toObservedAt(latest?.timestamp, root?.timestamp, payload.observed_at),
    numericValue: score,
    classification,
    meta: {
      title: "US Stock Fear & Greed",
      subtitle: "CNN market sentiment",
      summary: "Tracks CNN's US stock Fear & Greed composite from the page-owned data payload.",
      source: "cnn",
      confidence: 0.86,
      metrics: toJsonMetrics([
        { label: "Current", value: Math.round(score), tone: metricTone(score) },
        { label: "Previous close", value: firstNumber(root?.previous_close) ?? "N/A" },
        { label: "1 week ago", value: firstNumber(root?.previous_1_week) ?? "N/A" },
      ]),
      drivers: [
        "CNN composite value is parsed from the public market data endpoint referenced in the page HTML.",
        "Classification follows CNN's rating when present.",
        "Historical comparison values are retained as context metrics.",
      ],
    },
  };
}

function parseCoinMarketCap(payload: JsonObject): ParsedObservation {
  const fearGreedIndexData = asJsonObject(payload.fearGreedIndexData);
  const currentIndex = asJsonObject(fearGreedIndexData?.currentIndex) ?? asJsonObject(payload.currentIndex);
  const data = asJsonObject(payload.data);
  const latest = latestArrayItem(data?.points) ?? latestArrayItem(data?.historical) ?? data;

  const numericValue = firstNumber(
    currentIndex?.score,
    latest?.value,
    latest?.score,
    data?.value,
    payload.footerScore,
    payload.value,
    payload.score,
  );

  if (numericValue === undefined) {
    throw new PipelineError("PARSER_ERROR", "CoinMarketCap payload did not contain a numeric score");
  }

  const score = roundScore(numericValue);
  const classification = firstString(currentIndex?.name, latest?.classification, latest?.rating, data?.classification) ??
    classifyFearGreed(score);

  return {
    kind: "numeric",
    observedAt: toObservedAt(currentIndex?.updateTime, latest?.timestamp, latest?.observed_at, data?.observed_at),
    numericValue: score,
    classification,
    meta: {
      title: "Crypto Fear & Greed",
      subtitle: "CoinMarketCap crypto sentiment",
      summary: "Tracks CoinMarketCap's crypto Fear & Greed value from embedded page data.",
      source: "coinmarketcap",
      confidence: currentIndex ? 0.84 : 0.62,
      metrics: toJsonMetrics([
        { label: "Current", value: Math.round(score), tone: metricTone(score) },
        { label: "Max", value: firstNumber(currentIndex?.maxScore) ?? 100 },
        { label: "Source", value: currentIndex ? "NEXT_DATA" : "footer text" },
      ]),
      drivers: [
        "Primary parse reads CoinMarketCap's embedded NEXT_DATA payload.",
        "Footer text is used only when embedded structured data is absent.",
        "The value is normalized to the standard 0-100 fear-greed scale.",
      ],
    },
  };
}

function parseKrStockFearGreed(payload: JsonObject): ParsedObservation {
  const marketData = asJsonObject(payload.marketData) ?? payload;
  const kr = asJsonObject(marketData.kr);
  const numericValue = firstNumber(kr?.score, payload.score);

  if (numericValue === undefined) {
    throw new PipelineError("PARSER_ERROR", "Korean Fear & Greed payload did not contain kr.score");
  }

  const score = roundScore(numericValue);
  const indicators = parseIndicatorItems(kr?.indicators, score);

  return {
    kind: "numeric",
    observedAt: toObservedAt(marketData.timestamp, kr?.observed_at, payload.observed_at),
    numericValue: score,
    classification: firstString(kr?.label, payload.classification) ?? classifyFearGreed(score),
    meta: {
      title: "Korean Stock Fear & Greed",
      subtitle: "KOSPI/KOSDAQ sentiment",
      summary: "Tracks the Korean stock Fear & Greed score from the page-exposed market data payload.",
      source: "feargreed.co.kr",
      confidence: 0.78,
      metrics: toJsonMetrics([
        { label: "Current", value: Math.round(score), tone: metricTone(score) },
        { label: "KOSPI", value: firstString(kr?.kospi_price) ?? "N/A" },
        { label: "VKOSPI", value: firstString(kr?.vkospi) ?? "N/A" },
        ...indicators.slice(0, 3),
      ]),
      drivers: [
        "The page HTML exposes the JSON endpoint used by the dashboard.",
        "Korean market component indicators are retained in the card metrics.",
        "The score is normalized to the standard 0-100 fear-greed scale.",
      ],
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
    case "kr_stock_fear_greed":
      return parseKrStockFearGreed(payload);
    case "sns_rollup":
      return parseSnsRollup(payload);
    default:
      throw new PipelineError("PARSER_ERROR", `Unsupported provider family '${job.provider_config.provider_family}'`);
  }
}
