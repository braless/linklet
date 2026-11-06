import {
  createSessionCookie,
  getAdminPassword,
  isSameOrigin,
  jsonResponse,
  methodNotAllowed,
  verifyAdminPassword,
} from '../../_lib/admin-auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') return methodNotAllowed('POST');
  if (!isSameOrigin(request)) return jsonResponse({ message: '请求来源无效。' }, 403);

  if (!getAdminPassword(env)) {
    return jsonResponse(
      { message: '管理员密码尚未配置，请在 Cloudflare 设置 ADMIN_PASSWORD 密钥。' },
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ message: '请求内容格式错误。' }, 400);
  }

  if (!body || typeof body.password !== 'string' || !body.password) {
    return jsonResponse({ message: '请输入管理员密码。' }, 400);
  }

  if (!(await verifyAdminPassword(body.password, env))) {
    return jsonResponse({ message: '密码错误。' }, 401);
  }

  return jsonResponse(
    { ok: true },
    200,
    { 'Set-Cookie': await createSessionCookie(request, env) }
  );
}
