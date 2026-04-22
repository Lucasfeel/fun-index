import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

import { errorResponse } from './http.ts';

export interface AdminContext {
  userId: string;
  email: string | null;
  roles: string[];
}

function extractBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw errorResponse(401, 'MISSING_AUTH', 'Authorization bearer token is required.');
  }

  return authHeader.slice('Bearer '.length).trim();
}

export async function requireAdminContext(
  req: Request,
  client: SupabaseClient,
  allowedRoles: string[],
): Promise<AdminContext> {
  const token = extractBearerToken(req);
  const { data: authData, error: authError } = await client.auth.getUser(token);

  if (authError || !authData.user) {
    throw errorResponse(401, 'INVALID_AUTH', 'Failed to verify the authenticated user.');
  }

  const { data: adminUser, error: adminError } = await client
    .from('admin_users')
    .select('user_id, email, roles, is_active')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (adminError) {
    throw errorResponse(500, 'ADMIN_LOOKUP_FAILED', 'Could not load admin role state.', {
      supabaseError: adminError.message,
    });
  }

  if (!adminUser || !adminUser.is_active) {
    throw errorResponse(403, 'ADMIN_NOT_ALLOWED', 'This user is not allowed to access admin operations.');
  }

  const roles = Array.isArray(adminUser.roles) ? adminUser.roles : [];
  const isAllowed = allowedRoles.some((role) => roles.includes(role));

  if (!isAllowed) {
    throw errorResponse(403, 'ROLE_NOT_ALLOWED', 'The current admin role cannot perform this action.', {
      requiredRoles: allowedRoles,
      currentRoles: roles,
    });
  }

  return {
    userId: authData.user.id,
    email: adminUser.email,
    roles,
  };
}
