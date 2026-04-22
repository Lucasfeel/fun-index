import { jsonResponse, readJson } from "../_shared/pipeline/http.ts";
import { runPipeline } from "../_shared/pipeline/orchestrator.ts";
import { toPipelineError } from "../_shared/pipeline/errors.ts";
import type { RunRequest } from "../_shared/pipeline/types.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await readJson<Partial<RunRequest>>(request);
    const runRequest: RunRequest = {
      trigger: body.trigger ?? "scheduled",
      jobCode: body.jobCode,
      idempotencyKey: body.idempotencyKey,
      requestedWindowStart: body.requestedWindowStart,
      requestedWindowEnd: body.requestedWindowEnd,
      retryOfRunId: body.retryOfRunId,
      rerunOfRunId: body.rerunOfRunId,
      force: body.force ?? false,
    };

    const summaries = await runPipeline(runRequest);
    return jsonResponse({
      ok: true,
      count: summaries.length,
      summaries,
    });
  } catch (error) {
    const pipelineError = toPipelineError(error);
    return jsonResponse({
      ok: false,
      error: pipelineError.message,
      code: pipelineError.code,
      details: pipelineError.details ?? {},
    }, {
      status: 500,
    });
  }
});
