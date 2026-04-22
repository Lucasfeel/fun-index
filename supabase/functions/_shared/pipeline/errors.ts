export type PipelineErrorCode =
  | "PROVIDER_CONFIG_ERROR"
  | "FETCH_HTTP_ERROR"
  | "FETCH_AUTH_ERROR"
  | "PARSER_ERROR"
  | "NORMALIZATION_ERROR"
  | "VALIDATION_ERROR"
  | "PUBLISH_BLOCKED"
  | "REVIEW_REQUIRED"
  | "DATABASE_ERROR"
  | "IDEMPOTENCY_CONFLICT";

export class PipelineError extends Error {
  code: PipelineErrorCode;
  details?: Record<string, unknown>;

  constructor(code: PipelineErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PipelineError";
    this.code = code;
    this.details = details;
  }
}

export function isPipelineError(error: unknown): error is PipelineError {
  return error instanceof PipelineError;
}

export function toPipelineError(error: unknown): PipelineError {
  if (isPipelineError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new PipelineError("DATABASE_ERROR", error.message);
  }

  return new PipelineError("DATABASE_ERROR", "Unknown pipeline error", {
    error,
  });
}
