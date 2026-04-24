import { z } from 'zod';
import type {
  IndexSignal,
  PentagonIndexType,
  PentagonSignal,
  PsychologyIndicatorType,
  PsychologySignal,
  SocialSignal,
} from './types';

function parseArrayLike(value: unknown) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

const metricsSchema = z.preprocess(
  parseArrayLike,
  z.array(
    z.object({
      label: z.string(),
      value: z.union([z.string(), z.number()]).transform((value) => String(value)),
      tone: z.enum(['cool', 'neutral', 'warm']).optional(),
    }),
  ),
);

const stringArraySchema = z.preprocess(parseArrayLike, z.array(z.string()));

const indicatorRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  domain: z.enum(['pentagon', 'psychology']),
  title: z.string(),
  subtitle: z.string().optional().default(''),
  summary: z.string(),
  score: z.coerce.number(),
  classification: z.string(),
  change: z.coerce.number().optional().default(0),
  updated_at: z.string(),
  confidence_band: z.enum(['high', 'medium', 'limited']).optional().default('medium'),
  freshness_note: z.string().optional(),
  uncertainty_note: z.string().optional(),
  detail_path: z.string().optional(),
  metrics: metricsSchema.optional().default([]),
  drivers: stringArraySchema.optional().default([]),
  cadence_hours: z.coerce.number().optional().default(1),
  sample_size: z.coerce.number().optional().default(0),
  coverage_label: z.string().optional().default('Aggregate sample'),
  index_type: z.enum(['pizza', 'gay-bar']).optional(),
  indicator_type: z
    .enum([
      'fear-greed',
      'positioning-heat',
      'breadth-stress',
      'us-stock-fear-greed',
      'crypto-fear-greed',
      'kr-stock-fear-greed',
    ])
    .optional(),
});

const socialRowSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().optional().default(''),
  summary: z.string(),
  score: z.coerce.number(),
  classification: z.string(),
  change: z.coerce.number().optional().default(0),
  updated_at: z.string(),
  confidence_band: z.enum(['high', 'medium', 'limited']).optional().default('medium'),
  freshness_note: z.string().optional(),
  uncertainty_note: z.string().optional(),
  detail_path: z.string().optional(),
  metrics: metricsSchema.optional().default([]),
  drivers: stringArraySchema.optional().default([]),
  cadence_hours: z.coerce.number().optional().default(1),
  source_count: z.coerce.number().optional().default(0),
  categories: stringArraySchema.optional().default([]),
  sources: stringArraySchema.optional().default([]),
  approval_note: z
    .string()
    .optional()
    .default('Only items that passed the approval gate are surfaced in the user-facing feed.'),
});

function inferPentagonType(slug: string): PentagonIndexType {
  return slug.includes('pizza') ? 'pizza' : 'gay-bar';
}

function inferPsychologyType(slug: string): PsychologyIndicatorType {
  if (slug.includes('crypto') || slug.includes('coin') || slug.includes('position')) {
    return 'crypto-fear-greed';
  }

  if (slug.includes('kr-stock') || slug.includes('korean') || slug.includes('breadth')) {
    return 'kr-stock-fear-greed';
  }

  if (slug.includes('us-stock') || slug.includes('fear') || slug.includes('greed')) {
    return 'us-stock-fear-greed';
  }

  return 'kr-stock-fear-greed';
}

function stripPrefix(value: string, prefix: string) {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function normalizeIndicatorSlug(domain: PentagonSignal['domain'] | PsychologySignal['domain'], slug: string) {
  const baseSlug = domain === 'pentagon' ? stripPrefix(slug, 'pentagon-') : stripPrefix(slug, 'psychology-');

  if (domain !== 'psychology') {
    return baseSlug;
  }

  if (baseSlug === 'fear-greed') {
    return 'us-stock-fear-greed';
  }

  if (baseSlug === 'positioning-heat') {
    return 'crypto-fear-greed';
  }

  if (baseSlug === 'market-breadth' || baseSlug === 'breadth-stress') {
    return 'kr-stock-fear-greed';
  }

  return baseSlug;
}

function normalizeSocialSlug(slug: string) {
  return stripPrefix(slug, 'sns-');
}

function normalizePsychologyType(
  value:
    | 'fear-greed'
    | 'positioning-heat'
    | 'breadth-stress'
    | 'us-stock-fear-greed'
    | 'crypto-fear-greed'
    | 'kr-stock-fear-greed'
    | undefined,
) {
  if (value === 'fear-greed') {
    return 'us-stock-fear-greed' satisfies PsychologyIndicatorType;
  }

  if (value === 'positioning-heat') {
    return 'crypto-fear-greed' satisfies PsychologyIndicatorType;
  }

  if (value === 'breadth-stress') {
    return 'kr-stock-fear-greed' satisfies PsychologyIndicatorType;
  }

  return value;
}

function toIndicatorDetailPath(domain: PentagonSignal['domain'] | PsychologySignal['domain'], slug: string) {
  return `/${domain}/${slug}`;
}

function toSocialDetailPath(slug: string) {
  return `/sns/${slug}`;
}

export function mapIndicatorRow(row: unknown): IndexSignal {
  const parsed = indicatorRowSchema.parse(row);
  const normalizedSlug = normalizeIndicatorSlug(parsed.domain, parsed.slug);
  const base = {
    id: parsed.id,
    slug: normalizedSlug,
    domain: parsed.domain,
    title: parsed.title,
    subtitle: parsed.subtitle,
    summary: parsed.summary,
    score: parsed.score,
    classification: parsed.classification,
    change: parsed.change,
    updatedAt: parsed.updated_at,
    confidenceBand: parsed.confidence_band,
    freshnessNote: parsed.freshness_note,
    uncertaintyNote: parsed.uncertainty_note,
    detailPath: toIndicatorDetailPath(parsed.domain, normalizedSlug),
    metrics: parsed.metrics,
    drivers: parsed.drivers,
    cadenceHours: parsed.cadence_hours,
  };

  if (parsed.domain === 'pentagon') {
    return {
      ...base,
      domain: 'pentagon',
      indexType: parsed.index_type ?? inferPentagonType(normalizedSlug),
      sampleSize: parsed.sample_size,
      coverageLabel: parsed.coverage_label,
    };
  }

  return {
    ...base,
    domain: 'psychology',
    indicatorType: normalizePsychologyType(parsed.indicator_type) ?? inferPsychologyType(normalizedSlug),
  };
}

export function mapSocialRow(row: unknown): SocialSignal {
  const parsed = socialRowSchema.parse(row);
  const normalizedSlug = normalizeSocialSlug(parsed.slug);

  return {
    id: parsed.id,
    slug: normalizedSlug,
    domain: 'social',
    title: parsed.title,
    subtitle: parsed.subtitle,
    summary: parsed.summary,
    score: parsed.score,
    classification: parsed.classification,
    change: parsed.change,
    updatedAt: parsed.updated_at,
    confidenceBand: parsed.confidence_band,
    freshnessNote: parsed.freshness_note,
    uncertaintyNote: parsed.uncertainty_note,
    detailPath: toSocialDetailPath(normalizedSlug),
    metrics: parsed.metrics,
    drivers: parsed.drivers,
    cadenceHours: parsed.cadence_hours,
    sourceCount: parsed.source_count,
    categories: parsed.categories,
    sources: parsed.sources,
    approvalNote: parsed.approval_note,
  };
}

export function parseIndicatorRows(rows: unknown[] | null | undefined) {
  return (rows ?? [])
    .map((row) => {
      try {
        return mapIndicatorRow(row);
      } catch (error) {
        console.warn('Skipping invalid indicator row', error);
        return null;
      }
    })
    .filter((row): row is IndexSignal => row !== null);
}

export function parseSocialRows(rows: unknown[] | null | undefined) {
  return (rows ?? [])
    .map((row) => {
      try {
        return mapSocialRow(row);
      } catch (error) {
        console.warn('Skipping invalid social row', error);
        return null;
      }
    })
    .filter((row): row is SocialSignal => row !== null);
}
