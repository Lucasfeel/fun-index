const defaultHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "content-type": "application/json; charset=utf-8",
};

export function corsHeaders(extra?: HeadersInit): Headers {
  return new Headers({
    ...defaultHeaders,
    ...(extra ?? {}),
  });
}

export function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload, null, 2), {
    status: init?.status ?? 200,
    headers: corsHeaders(init?.headers),
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  const contentLength = request.headers.get("content-length");
  if (contentLength === "0") {
    return {} as T;
  }

  const text = await request.text();
  if (!text.trim()) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}
