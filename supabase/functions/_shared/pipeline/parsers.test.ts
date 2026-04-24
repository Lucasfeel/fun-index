import { parseSnapshot } from "./parsers.ts";
import type { CollectionJobRow, ParsedObservation, ProviderFamily } from "./types.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function job(providerFamily: ProviderFamily, metric: string): CollectionJobRow {
  return {
    id: "job-id",
    job_code: `collect-${metric}`,
    provider_config_id: "provider-id",
    stream_id: "stream-id",
    schedule_cron: "0 * * * *",
    request_config: { metric },
    is_active: true,
    publish_enabled: true,
    locked_until_review: false,
    consecutive_failure_limit: 2,
    last_successful_run_id: null,
    last_published_run_id: null,
    provider_config: {
      id: "provider-id",
      provider_code: providerFamily,
      provider_family: providerFamily,
      display_name: providerFamily,
      adapter_key: providerFamily,
      parser_version: "test",
      normalizer_version: "test",
      validator_profile: {},
      fetch_config: {},
      metric_contract: {},
      is_active: true,
    },
    stream: {
      id: "stream-id",
      stream_code: metric,
      tab_code: metric.includes("pizza") || metric.includes("bar") ? "pentagon" : "psychology",
      metric_code: metric,
      metric_name: metric,
      value_type: "numeric",
      unit: "score",
      min_value: 0,
      max_value: 100,
      publish_mode: "automatic",
      requires_approval: false,
      is_aggregate_only: true,
      config: {},
      is_active: true,
    },
  };
}

function numeric(parsed: ParsedObservation) {
  if (parsed.kind !== "numeric") {
    throw new Error(`Expected numeric observation, received ${parsed.kind}`);
  }
  return parsed;
}

Deno.test("parses PizzINT pizza dashboard payload", () => {
  const parsed = numeric(parseSnapshot(job("pizzint", "pizza_index"), {
    dashboard: {
      overall_index: 42,
      defcon_level: 4,
      active_spikes: 1,
      defcon_details: { at_time: "2026-04-24T08:00:00Z" },
      data: [{ name: "Domino's Pizza" }],
    },
  }));

  assertEquals(parsed.numericValue, 42);
  assertEquals(parsed.classification, "DOUGHCON 4");
});

Deno.test("parses PizzINT gay-bar quietness when venue data exists", () => {
  const parsed = numeric(parseSnapshot(job("pizzint", "gay_bar_index"), {
    dashboard: {
      overall_index: 20,
      defcon_details: { at_time: "2026-04-24T08:00:00Z" },
      data: [
        { name: "Freddie's Beach Bar", percentage_of_usual: 50 },
        { name: "The Little Gay Pub", percentage_of_usual: 25 },
      ],
    },
  }));

  assertEquals(parsed.numericValue, 62.5);
  assertEquals(parsed.classification, "Quiet Watch");
});

Deno.test("parses CNN fear and greed payload", () => {
  const parsed = numeric(parseSnapshot(job("cnn_fear_greed", "us_stock_fear_greed"), {
    fear_and_greed: {
      score: 66.6,
      rating: "greed",
      timestamp: "2026-04-24T08:11:01+00:00",
    },
  }));

  assertEquals(parsed.numericValue, 66.6);
  assertEquals(parsed.classification, "greed");
});

Deno.test("parses CoinMarketCap NEXT_DATA payload", () => {
  const parsed = numeric(parseSnapshot(job("cmc_fear_greed", "crypto_fear_greed"), {
    fearGreedIndexData: {
      currentIndex: {
        score: 58,
        maxScore: 100,
        name: "Neutral",
        updateTime: "2026-04-24T08:08:10.033Z",
      },
    },
  }));

  assertEquals(parsed.numericValue, 58);
  assertEquals(parsed.classification, "Neutral");
});

Deno.test("parses Korean stock fear and greed payload", () => {
  const parsed = numeric(parseSnapshot(job("kr_stock_fear_greed", "kr_stock_fear_greed"), {
    marketData: {
      success: true,
      timestamp: "2026-04-24T08:31:04.546Z",
      kr: {
        score: 60,
        label: "Greed",
        indicators: [{ name: "KOSPI", value: 50 }],
      },
    },
  }));

  assertEquals(parsed.numericValue, 60);
  assertEquals(parsed.classification, "Greed");
});
