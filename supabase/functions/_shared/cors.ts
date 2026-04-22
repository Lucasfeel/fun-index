import { corsHeaders as sdkCorsHeaders } from 'npm:@supabase/supabase-js@2.49.8/cors';

export const corsHeaders = {
  ...sdkCorsHeaders,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};
