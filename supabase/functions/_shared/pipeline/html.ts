import type { Json, JsonObject } from "./types.ts";

const entityMap: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

function decodeHtmlEntity(entity: string) {
  if (entity.startsWith("#x")) {
    const codePoint = Number.parseInt(entity.slice(2), 16);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  if (entity.startsWith("#")) {
    const codePoint = Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : `&${entity};`;
  }

  return entityMap[entity] ?? `&${entity};`;
}

export function decodeHtml(value: string) {
  return value.replace(/&([a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/g, (_match, entity: string) =>
    decodeHtmlEntity(entity)
  );
}

export function stripHtmlToText(html: string) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function extractNextDataJson(html: string): JsonObject | undefined {
  const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(decodeHtml(match[1])) as Json;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonObject : undefined;
  } catch {
    return undefined;
  }
}

export function extractDataDataUrl(html: string) {
  const match = html.match(/\bdata-data-url=["']([^"']+)["']/i);
  return match?.[1] ? decodeHtml(match[1]) : undefined;
}

export function extractJsStringConstant(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`\\b(?:const|let|var)\\s+${escapedName}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] ? decodeHtml(match[1]) : undefined;
}

export function resolveUrl(baseUrl: string, candidate: string) {
  return new URL(candidate, baseUrl).toString();
}

export function findJsonObjectWithKey(value: Json | undefined, key: string): JsonObject | undefined {
  if (typeof value === "string" && value.includes(`"${key}"`)) {
    try {
      return findJsonObjectWithKey(JSON.parse(value) as Json, key);
    } catch {
      return undefined;
    }
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonObjectWithKey(item, key);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  const record = value as JsonObject;
  const direct = record[key];
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as JsonObject;
  }

  for (const item of Object.values(record)) {
    const found = findJsonObjectWithKey(item, key);
    if (found) {
      return found;
    }
  }

  return undefined;
}
