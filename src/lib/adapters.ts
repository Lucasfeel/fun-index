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
  indicator_type: z.enum(['fear-greed', 'positioning-heat', 'breadth-stress']).optional(),
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
  if (slug.includes('fear') || slug.includes('greed')) {
    return 'fear-greed';
  }

  if (slug.includes('position')) {
    return 'positioning-heat';
  }

  return 'breadth-stress';
}

function toIndicatorDetailPath(domain: PentagonSignal['domain'] | PsychologySignal['domain'], slug: string) {
  return `/${domain}/${slug}`;
}

function toSocialDetailPath(slug: string) {
  return `/sns/${slug}`;
}

export function mapIndicatorRow(row: unknown): IndexSignal {
  const parsed = indicatorRowSchema.parse(row);
  const base = {
    id: parsed.id,
    slug: parsed.slug,
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
    detailPath: parsed.detail_path ?? toIndicatorDetailPath(parsed.domain, parsed.slug),
    metrics: parsed.metrics,
    drivers: parsed.drivers,
    cadenceHours: parsed.cadence_hours,
  };

  if (parsed.domain === 'pentagon') {
    return {
      ...base,
      domain: 'pentagon',
      indexType: parsed.index_type ?? inferPentagonType(parsed.slug),
      sampleSize: parsed.sample_size,
      coverageLabel: parsed.coverage_label,
    };
  }

  return {
    ...base,
    domain: 'psychology',
    indicatorType: parsed.indicator_type ?? inferPsychologyType(parsed.slug),
  };
}

export function mapSocialRow(row: unknown): SocialSignal {
  const parsed = socialRowSchema.parse(row);

  return {
    id: parsed.id,
    slug: parsed.slug,
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
    detailPath: parsed.detail_path ?? toSocialDetailPath(parsed.slug),
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
