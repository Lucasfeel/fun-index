import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().optional(),
  VITE_SUPABASE_INDICATOR_VIEW: z.string().optional().default('public_indicator_signal_snapshots'),
  VITE_SUPABASE_SOCIAL_VIEW: z.string().optional().default('public_social_signal_feed'),
  VITE_ENABLE_DEMO_DATA: z.string().optional().default('false'),
});

const env = envSchema.parse(import.meta.env);

let supabaseClient: SupabaseClient | null = null;

export const useDemoData =
  env.VITE_ENABLE_DEMO_DATA === 'true' ||
  !env.VITE_SUPABASE_URL ||
  !env.VITE_SUPABASE_ANON_KEY;

export const supabaseViews = {
  indicators: env.VITE_SUPABASE_INDICATOR_VIEW,
  social: env.VITE_SUPABASE_SOCIAL_VIEW,
};

export function getSupabaseClient() {
  if (useDemoData) {
    throw new Error('Supabase client requested while demo mode is enabled.');
  }

  if (supabaseClient !== null) {
    return supabaseClient;
  }

  supabaseClient = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_ANON_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}
