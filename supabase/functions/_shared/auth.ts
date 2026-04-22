import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.8';

import { errorResponse } from './http.ts';

export interface AdminContext {
  userId: string;
  email: string | null;
  roles: string[];
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

function getPasswordAdminContext(req: Request): AdminContext | null {
  const expectedPassword = Deno.env.get('ADMIN_PASSWORD');
  if (!expectedPassword) {
    return null;
  }

  const suppliedPassword = req.headers.get('x-admin-password')?.trim();
  if (!suppliedPassword) {
    return null;
  }

  if (!constantTimeEqual(suppliedPassword, expectedPassword)) {
    throw errorResponse(401, 'INVALID_PASSWORD', '관리자 비밀번호가 올바르지 않습니다.');
  }

  return {
    userId: 'password-admin',
    email: null,
    roles: ['viewer', 'ops', 'reviewer', 'publisher', 'admin'],
  };
}

function extractBearerToken(req: Request) {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw errorResponse(401, 'MISSING_AUTH', '관리자 비밀번호 또는 인증 토큰이 필요합니다.');
  }

  return authHeader.slice('Bearer '.length).trim();
}

export async function requireAdminContext(
  req: Request,
  client: SupabaseClient,
  allowedRoles: string[],
): Promise<AdminContext> {
  const passwordAdmin = getPasswordAdminContext(req);
  if (passwordAdmin) {
    return passwordAdmin;
  }

  const token = extractBearerToken(req);
  const { data: authData, error: authError } = await client.auth.getUser(token);

  if (authError || !authData.user) {
    throw errorResponse(401, 'INVALID_AUTH', '인증된 사용자를 확인하지 못했습니다.');
  }

  const { data: adminUser, error: adminError } = await client
    .from('admin_users')
    .select('user_id, email, roles, is_active')
    .eq('user_id', authData.user.id)
    .maybeSingle();

  if (adminError) {
    throw errorResponse(500, 'ADMIN_LOOKUP_FAILED', '관리자 권한 정보를 불러오지 못했습니다.', {
      supabaseError: adminError.message,
    });
  }

  if (!adminUser || !adminUser.is_active) {
    throw errorResponse(403, 'ADMIN_NOT_ALLOWED', '이 사용자는 관리자 화면에 접근할 수 없습니다.');
  }

  const roles = Array.isArray(adminUser.roles) ? adminUser.roles : [];
  const isAllowed = allowedRoles.some((role) => roles.includes(role));

  if (!isAllowed) {
    throw errorResponse(403, 'ROLE_NOT_ALLOWED', '현재 관리자 권한으로는 이 작업을 수행할 수 없습니다.', {
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
