import {
  clearSessionCookie,
  isSameOrigin,
  jsonResponse,
  methodNotAllowed,
} from '../../_lib/admin-auth.js';

export async function onRequest(context) {
  const { request } = context;

  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!isSameOrigin(request)) return jsonResponse({ message: '请求来源无效。' }, 403);

  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': clearSessionCookie(request) }
  );
}
