import type {
  CollectionJobRow,
  PipelineRunRow,
  PublishResult,
  RunStatus,
  RunSummary,
} from "./types.ts";

export function buildRunSummary(
  job: CollectionJobRow,
  run: PipelineRunRow,
  result: {
    status: RunStatus;
    publishResult: PublishResult;
    recordCount: number;
    errorReason?: string | null;
    errorCode?: string | null;
    lastSuccessfulRun?: string | null;
    qualityFlags?: string[];
    notes?: string[];
  },
): RunSummary {
  return {
    provider: job.provider_config.provider_code,
    job_code: job.job_code,
    started_at: run.started_at,
    finished_at: new Date().toISOString(),
    status: result.status,
    record_count: result.recordCount,
    publish_result: result.publishResult,
    error_reason: result.errorReason ?? null,
    error_code: result.errorCode ?? null,
    parser_version: job.provider_config.parser_version,
    last_successful_run: result.lastSuccessfulRun ?? run.last_successful_run ?? null,
    run_id: run.id,
    stream_code: job.stream.stream_code,
    quality_flags: result.qualityFlags ?? [],
    notes: result.notes ?? [],
  };
}
