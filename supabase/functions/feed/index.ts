import { createServiceClient } from "../_shared/pipeline/repository.ts";
import { jsonResponse } from "../_shared/pipeline/http.ts";
import { toPipelineError } from "../_shared/pipeline/errors.ts";

const validTabs = new Set(["home", "pentagon", "psychology", "sns_feed"]);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const url = new URL(request.url);
    const tab = url.searchParams.get("tab") ?? "home";
    if (!validTabs.has(tab)) {
      return jsonResponse({ ok: false, error: `Unsupported tab '${tab}'` }, { status: 400 });
    }

    const client = createServiceClient();
    const { data, error } = await client.rpc("get_tab_feed", { p_tab_code: tab });

    if (error) {
      throw error;
    }

    return jsonResponse({
      ok: true,
      tab,
      feed: data ?? [],
    });
  } catch (error) {
    const pipelineError = toPipelineError(error);
    return jsonResponse({
      ok: false,
      error: pipelineError.message,
      code: pipelineError.code,
    }, {
      status: 500,
    });
  }
});
