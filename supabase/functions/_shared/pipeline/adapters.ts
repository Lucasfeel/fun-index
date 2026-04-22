import { PipelineError } from "./errors.ts";
import type {
  CollectionJobRow,
  Json,
  JsonObject,
  ProviderFetchResult,
} from "./types.ts";

export interface ProviderAdapter {
  key: string;
  fetch(job: CollectionJobRow, requestWindow?: { start?: string; end?: string }): Promise<ProviderFetchResult>;
}

function asJsonObject(value: Json): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  throw new PipelineError("FETCH_HTTP_ERROR", "Provider returned a non-object payload");
}

function stableStringify(value: Json): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
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

async function fetchJson(
  endpoint: string,
  init: RequestInit,
): Promise<{ payload: JsonObject; status: number }> {
  const response = await fetch(endpoint, init);

  if (response.status === 401 || response.status === 403) {
    throw new PipelineError("FETCH_AUTH_ERROR", `Provider rejected credentials: ${response.status}`, {
      endpoint,
      status: response.status,
    });
  }

  if (!response.ok) {
    throw new PipelineError("FETCH_HTTP_ERROR", `Provider fetch failed with status ${response.status}`, {
      endpoint,
      status: response.status,
    });
  }

  const payload = asJsonObject(await response.json());
  return { payload, status: response.status };
}

function getConfigValue(config: JsonObject, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" ? value : undefined;
}

async function buildFetchResult(
  payload: JsonObject,
  requestFingerprintSource: JsonObject,
  sourceReference: string,
  httpStatus: number,
  observedAt?: string,
): Promise<ProviderFetchResult> {
  return {
    payload,
    requestFingerprint: await sha256Hex(stableStringify(requestFingerprintSource)),
    sourceReference,
    sourceUrl: sourceReference,
    httpStatus,
    observedAt,
  };
}

class PizzintAdapter implements ProviderAdapter {
  key = "pizzint";

  async fetch(job: CollectionJobRow, requestWindow?: { start?: string; end?: string }): Promise<ProviderFetchResult> {
    const baseUrl =
      Deno.env.get("PIZZINT_API_BASE_URL") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint");

    if (!baseUrl) {
      throw new PipelineError("PROVIDER_CONFIG_ERROR", "Missing PizzINT endpoint");
    }

    const url = new URL(baseUrl);
    const metric = getConfigValue(job.request_config, "metric");
    if (metric) {
      url.searchParams.set("metric", metric);
    }
    if (requestWindow?.start) {
      url.searchParams.set("window_start", requestWindow.start);
    }
    if (requestWindow?.end) {
      url.searchParams.set("window_end", requestWindow.end);
    }

    const apiKey = Deno.env.get("PIZZINT_API_KEY");
    const headers = new Headers();
    if (apiKey) {
      headers.set("authorization", `Bearer ${apiKey}`);
    }

    const { payload, status } = await fetchJson(url.toString(), {
      method: "GET",
      headers,
    });

    return buildFetchResult(
      payload,
      {
        endpoint: url.toString(),
        requestConfig: job.request_config,
      },
      url.toString(),
      status,
      typeof payload.observed_at === "string" ? payload.observed_at : undefined,
    );
  }
}

class CnnFearGreedAdapter implements ProviderAdapter {
  key = "cnn_fear_greed";

  async fetch(job: CollectionJobRow): Promise<ProviderFetchResult> {
    const endpoint =
      Deno.env.get("CNN_FNG_ENDPOINT") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint");

    if (!endpoint) {
      throw new PipelineError("PROVIDER_CONFIG_ERROR", "Missing CNN Fear & Greed endpoint");
    }

    const { payload, status } = await fetchJson(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    return buildFetchResult(
      payload,
      {
        endpoint,
        requestConfig: job.request_config,
      },
      endpoint,
      status,
      typeof payload.observed_at === "string" ? payload.observed_at : undefined,
    );
  }
}

class CoinMarketCapAdapter implements ProviderAdapter {
  key = "cmc_fear_greed";

  async fetch(job: CollectionJobRow, requestWindow?: { start?: string; end?: string }): Promise<ProviderFetchResult> {
    const baseUrl =
      Deno.env.get("CMC_API_BASE_URL") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint");

    if (!baseUrl) {
      throw new PipelineError("PROVIDER_CONFIG_ERROR", "Missing CoinMarketCap endpoint");
    }

    const url = new URL(baseUrl);
    if (requestWindow?.start) {
      url.searchParams.set("start", requestWindow.start);
    }
    if (requestWindow?.end) {
      url.searchParams.set("end", requestWindow.end);
    }

    const apiKey = Deno.env.get("CMC_API_KEY");
    const headers = new Headers({
      accept: "application/json",
    });
    if (apiKey) {
      headers.set("X-CMC_PRO_API_KEY", apiKey);
    }

    const { payload, status } = await fetchJson(url.toString(), {
      method: "GET",
      headers,
    });

    return buildFetchResult(
      payload,
      {
        endpoint: url.toString(),
        requestConfig: job.request_config,
      },
      url.toString(),
      status,
      typeof payload.observed_at === "string" ? payload.observed_at : undefined,
    );
  }
}

class SnsRollupAdapter implements ProviderAdapter {
  key = "sns_rollup";

  async fetch(job: CollectionJobRow, requestWindow?: { start?: string; end?: string }): Promise<ProviderFetchResult> {
    const baseUrl =
      Deno.env.get("SNS_CONNECTOR_BASE_URL") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint");

    if (!baseUrl) {
      throw new PipelineError("PROVIDER_CONFIG_ERROR", "Missing SNS connector endpoint");
    }

    const url = new URL(baseUrl);
    const query = getConfigValue(job.request_config, "query");
    if (query) {
      url.searchParams.set("query", query);
    }
    if (requestWindow?.start) {
      url.searchParams.set("window_start", requestWindow.start);
    }
    if (requestWindow?.end) {
      url.searchParams.set("window_end", requestWindow.end);
    }

    const token = Deno.env.get("SNS_CONNECTOR_BEARER_TOKEN");
    const headers = new Headers({
      accept: "application/json",
    });
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
    }

    const { payload, status } = await fetchJson(url.toString(), {
      method: "GET",
      headers,
    });

    return buildFetchResult(
      payload,
      {
        endpoint: url.toString(),
        requestConfig: job.request_config,
      },
      url.toString(),
      status,
      typeof payload.observed_at === "string" ? payload.observed_at : undefined,
    );
  }
}

const adapters = new Map<string, ProviderAdapter>([
  ["pizzint", new PizzintAdapter()],
  ["cnn_fear_greed", new CnnFearGreedAdapter()],
  ["cmc_fear_greed", new CoinMarketCapAdapter()],
  ["sns_rollup", new SnsRollupAdapter()],
]);

export function getAdapter(job: CollectionJobRow): ProviderAdapter {
  const key = job.provider_config.adapter_key || job.provider_config.provider_family;
  const adapter = adapters.get(key);
  if (!adapter) {
    throw new PipelineError("PROVIDER_CONFIG_ERROR", `No adapter registered for key '${key}'`);
  }
  return adapter;
}
