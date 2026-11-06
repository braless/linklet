import {
  getAdminPassword,
  jsonResponse,
  methodNotAllowed,
  verifyAdminSession,
} from '../../_lib/admin-auth.js';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'GET') return methodNotAllowed('GET');

  return jsonResponse({
    configured: Boolean(getAdminPassword(env)),
    authenticated: await verifyAdminSession(request, env),
  });
}
