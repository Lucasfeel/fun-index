import { requireAdminContext } from '../_shared/auth.ts';
import { ensureMethod, handleCors, jsonResponse, errorResponse } from '../_shared/http.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    ensureMethod(req, ['GET', 'POST']);
    const client = getServiceClient();
    const admin = await requireAdminContext(req, client, ['viewer', 'ops', 'reviewer', 'publisher', 'admin']);

    return jsonResponse({
      ok: true,
      userId: admin.userId,
      roles: admin.roles,
    });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error(error);
    return errorResponse(500, 'UNEXPECTED_ERROR', '관리자 비밀번호 검증 중 예기치 못한 오류가 발생했습니다.');
  }
});
