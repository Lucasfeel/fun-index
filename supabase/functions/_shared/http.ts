import { corsHeaders } from './cors.ts';

export function jsonResponse(payload: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return jsonResponse(
    {
      error: {
        code,
        message,
        details: details ?? {},
      },
    },
    status,
  );
}

export async function parseJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON.');
  }
}

export function ensureMethod(req: Request, allowed: string[]) {
  if (!allowed.includes(req.method)) {
    throw errorResponse(405, 'METHOD_NOT_ALLOWED', `Allowed methods: ${allowed.join(', ')}`);
  }
}

export function handleCors(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
