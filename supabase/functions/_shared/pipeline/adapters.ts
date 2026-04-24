import { PipelineError } from "./errors.ts";
import {
  extractDataDataUrl,
  extractJsStringConstant,
  extractNextDataJson,
  findJsonObjectWithKey,
  resolveUrl,
  stripHtmlToText,
} from "./html.ts";
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

async function fetchText(
  endpoint: string,
  init: RequestInit,
): Promise<{ body: string; status: number }> {
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

  return {
    body: await response.text(),
    status: response.status,
  };
}

function getConfigValue(config: JsonObject, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" ? value : undefined;
}

function browserHeaders(referer?: string, accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8") {
  const headers = new Headers({
    accept,
    "accept-language": "en-US,en;q=0.9,ko;q=0.8",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });

  if (referer) {
    headers.set("referer", referer);
  }

  return headers;
}

function compactText(value: string, maxLength = 20_000) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function tryParseJsonObject(value: string): JsonObject | undefined {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) {
    return undefined;
  }

  try {
    return asJsonObject(JSON.parse(trimmed) as Json);
  } catch {
    return undefined;
  }
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
  key = "pizzint_text";

  async fetch(job: CollectionJobRow): Promise<ProviderFetchResult> {
    const pageUrl =
      Deno.env.get("PIZZINT_PAGE_URL") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint") ??
      "https://www.pizzint.watch/";

    const page = await fetchText(pageUrl, {
      method: "GET",
      headers: browserHeaders(),
    });
    const pageText = stripHtmlToText(page.body);
    const jsonPayload = tryParseJsonObject(page.body);
    if (jsonPayload) {
      return buildFetchResult(
        jsonPayload,
        {
          endpoint: pageUrl,
          requestConfig: job.request_config,
        },
        pageUrl,
        page.status,
        typeof jsonPayload.observed_at === "string" ? jsonPayload.observed_at : undefined,
      );
    }

    const dashboardEndpoint =
      Deno.env.get("PIZZINT_DASHBOARD_ENDPOINT") ??
      getConfigValue(job.provider_config.fetch_config, "dashboardEndpoint") ??
      resolveUrl(pageUrl, "/api/dashboard-data");

    const { payload: dashboard, status: dashboardStatus } = await fetchJson(dashboardEndpoint, {
      method: "GET",
      headers: browserHeaders(pageUrl, "application/json,text/plain,*/*"),
    });

    const defconDetails = dashboard.defcon_details && typeof dashboard.defcon_details === "object" &&
        !Array.isArray(dashboard.defcon_details)
      ? dashboard.defcon_details as JsonObject
      : undefined;

    return buildFetchResult(
      {
        sourceKind: "pizzint_text",
        pageUrl,
        dashboardEndpoint,
        pageText: compactText(pageText),
        htmlDoughcon: pageText.match(/DOUGHCON\s+([1-5])/i)?.[1] ?? null,
        dashboard,
      },
      {
        pageUrl,
        dashboardEndpoint,
        requestConfig: job.request_config,
      },
      dashboardEndpoint,
      dashboardStatus || page.status,
      typeof defconDetails?.at_time === "string"
        ? defconDetails.at_time
        : typeof dashboard.observed_at === "string"
        ? dashboard.observed_at
        : undefined,
    );
  }
}

class CnnFearGreedAdapter implements ProviderAdapter {
  key = "cnn_fear_greed_text";

  async fetch(job: CollectionJobRow): Promise<ProviderFetchResult> {
    const pageUrl =
      Deno.env.get("CNN_FNG_PAGE_URL") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint") ??
      "https://edition.cnn.com/markets/fear-and-greed";

    const page = await fetchText(pageUrl, {
      method: "GET",
      headers: browserHeaders(),
    });
    const pageText = stripHtmlToText(page.body);
    const jsonPayload = tryParseJsonObject(page.body);
    if (jsonPayload) {
      return buildFetchResult(
        jsonPayload,
        {
          endpoint: pageUrl,
          requestConfig: job.request_config,
        },
        pageUrl,
        page.status,
        typeof jsonPayload.observed_at === "string" ? jsonPayload.observed_at : undefined,
      );
    }
    const dataUrl =
      Deno.env.get("CNN_FNG_DATA_ENDPOINT") ??
      getConfigValue(job.provider_config.fetch_config, "dataEndpoint") ??
      extractDataDataUrl(page.body);

    if (!dataUrl) {
      throw new PipelineError("PARSER_ERROR", "CNN page did not expose a Fear & Greed data URL", {
        pageUrl,
      });
    }

    const { payload, status } = await fetchJson(dataUrl, {
      method: "GET",
      headers: browserHeaders(pageUrl, "application/json,text/plain,*/*"),
    });

    return buildFetchResult(
      {
        ...payload,
        sourceKind: "cnn_fear_greed_text",
        pageUrl,
        dataUrl,
        pageText: compactText(pageText),
      },
      {
        pageUrl,
        dataUrl,
        requestConfig: job.request_config,
      },
      dataUrl,
      status,
      typeof payload.observed_at === "string" ? payload.observed_at : undefined,
    );
  }
}

class CoinMarketCapAdapter implements ProviderAdapter {
  key = "cmc_fear_greed_text";

  async fetch(job: CollectionJobRow): Promise<ProviderFetchResult> {
    const pageUrl =
      Deno.env.get("CMC_FNG_PAGE_URL") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint") ??
      "https://coinmarketcap.com/ko/charts/fear-and-greed-index/";

    const page = await fetchText(pageUrl, {
      method: "GET",
      headers: browserHeaders(),
    });
    const pageText = stripHtmlToText(page.body);
    const jsonPayload = tryParseJsonObject(page.body);
    if (jsonPayload) {
      return buildFetchResult(
        jsonPayload,
        {
          endpoint: pageUrl,
          requestConfig: job.request_config,
        },
        pageUrl,
        page.status,
        typeof jsonPayload.observed_at === "string" ? jsonPayload.observed_at : undefined,
      );
    }
    const nextData = extractNextDataJson(page.body);
    const fearGreedIndexData = findJsonObjectWithKey(nextData, "fearGreedIndexData");
    const footerScoreMatch =
      pageText.match(/공포와\s*탐욕\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*100/i) ??
      pageText.match(/Fear\s*&\s*Greed\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*100/i);

    return buildFetchResult(
      {
        sourceKind: "cmc_fear_greed_text",
        pageUrl,
        pageText: compactText(pageText),
        fearGreedIndexData: fearGreedIndexData ?? {},
        footerScore: footerScoreMatch?.[1] ?? null,
      },
      {
        pageUrl,
        requestConfig: job.request_config,
      },
      pageUrl,
      page.status,
      undefined,
    );
  }
}

class KrStockFearGreedAdapter implements ProviderAdapter {
  key = "kr_stock_fear_greed_text";

  async fetch(job: CollectionJobRow): Promise<ProviderFetchResult> {
    const pageUrl =
      Deno.env.get("KR_FNG_PAGE_URL") ??
      getConfigValue(job.provider_config.fetch_config, "endpoint") ??
      "https://feargreed.co.kr/";

    const page = await fetchText(pageUrl, {
      method: "GET",
      headers: browserHeaders(),
    });
    const pageText = stripHtmlToText(page.body);
    const apiEndpoint =
      Deno.env.get("KR_FNG_DATA_ENDPOINT") ??
      getConfigValue(job.provider_config.fetch_config, "apiEndpoint") ??
      extractJsStringConstant(page.body, "API_URL");

    if (!apiEndpoint) {
      throw new PipelineError("PARSER_ERROR", "Korean Fear & Greed page did not expose API_URL", {
        pageUrl,
      });
    }

    const { payload, status } = await fetchJson(apiEndpoint, {
      method: "GET",
      headers: browserHeaders(pageUrl, "application/json,text/plain,*/*"),
    });

    return buildFetchResult(
      {
        sourceKind: "kr_stock_fear_greed_text",
        pageUrl,
        apiEndpoint,
        pageText: compactText(pageText),
        marketData: payload,
      },
      {
        pageUrl,
        apiEndpoint,
        requestConfig: job.request_config,
      },
      apiEndpoint,
      status,
      typeof payload.timestamp === "string" ? payload.timestamp : undefined,
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
  ["pizzint_text", new PizzintAdapter()],
  ["cnn_fear_greed", new CnnFearGreedAdapter()],
  ["cnn_fear_greed_text", new CnnFearGreedAdapter()],
  ["cmc_fear_greed", new CoinMarketCapAdapter()],
  ["cmc_fear_greed_text", new CoinMarketCapAdapter()],
  ["kr_stock_fear_greed", new KrStockFearGreedAdapter()],
  ["kr_stock_fear_greed_text", new KrStockFearGreedAdapter()],
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
