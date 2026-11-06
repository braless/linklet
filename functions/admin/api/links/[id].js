import {
  isSameOrigin,
  jsonResponse,
  methodNotAllowed,
  requireAdmin,
} from '../../../_lib/admin-auth.js';
import { normalizeUrl, validateSlug } from '../../../_lib/link-utils.js';

async function getLink(env, id) {
  return env.DB.prepare(`
    SELECT
      l.id,
      l.url,
      l.slug,
      l.status,
      l.create_time,
      COALESCE((SELECT COUNT(*) FROM logs lg WHERE lg.slug = l.slug), 0) AS clicks
    FROM links l
    WHERE l.id = ?
    LIMIT 1
  `)
    .bind(id)
    .first();
}

async function updateLink(request, env, id) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ message: '请求内容格式错误。' }, 400);
  }

  const current = await getLink(env, id);
  if (!current) return jsonResponse({ message: '链接不存在。' }, 404);

  const fields = [];
  const values = [];

  if (Object.prototype.hasOwnProperty.call(body, 'url')) {
    const normalizedUrl = normalizeUrl(body.url);
    if (!normalizedUrl) {
      return jsonResponse({ message: '请输入有效的 http 或 https 链接。' }, 400);
    }
    if (new URL(normalizedUrl).hostname === new URL(request.url).hostname) {
      return jsonResponse({ message: '不能把短链指向当前站点自身。' }, 400);
    }
    fields.push('url = ?');
    values.push(normalizedUrl);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'slug')) {
    const slugValidation = validateSlug(body.slug);
    if (!slugValidation.valid) {
      return jsonResponse({ message: slugValidation.message }, 400);
    }

    const duplicate = await env.DB.prepare(
      'SELECT id FROM links WHERE slug = ? AND id <> ? LIMIT 1'
    )
      .bind(slugValidation.value, id)
      .first();

    if (duplicate) return jsonResponse({ message: '该 slug 已被其他链接使用。' }, 409);

    fields.push('slug = ?');
    values.push(slugValidation.value);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = Number(body.status);
    if (status !== 0 && status !== 1) {
      return jsonResponse({ message: '状态值无效。' }, 400);
    }
    fields.push('status = ?');
    values.push(status);
  }

  if (!fields.length) {
    return jsonResponse({ message: '没有需要更新的字段。' }, 400);
  }

  values.push(id);
  await env.DB.prepare(`UPDATE links SET ${fields.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  return jsonResponse({ item: await getLink(env, id) });
}

async function deleteLink(env, id) {
  const current = await getLink(env, id);
  if (!current) return jsonResponse({ message: '链接不存在。' }, 404);

  await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
  return jsonResponse({ ok: true });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  if (!env.DB) {
    return jsonResponse({ message: 'D1 数据库尚未绑定。' }, 503);
  }

  const id = String(params.id || '');
  if (!/^\d+$/.test(id)) return jsonResponse({ message: '链接 ID 无效。' }, 400);

  if (request.method === 'GET') {
    try {
      const item = await getLink(env, id);
      if (!item) return jsonResponse({ message: '链接不存在。' }, 404);
      return jsonResponse({ item });
    } catch (error) {
      console.error('Failed to get link:', error);
      return jsonResponse({ message: '读取链接失败。' }, 500);
    }
  }

  if (request.method === 'PATCH' || request.method === 'PUT') {
    if (!isSameOrigin(request)) return jsonResponse({ message: '请求来源无效。' }, 403);

    try {
      return await updateLink(request, env, id);
    } catch (error) {
      console.error('Failed to update link:', error);
      return jsonResponse({ message: '更新链接失败。' }, 500);
    }
  }

  if (request.method === 'DELETE') {
    if (!isSameOrigin(request)) return jsonResponse({ message: '请求来源无效。' }, 403);

    try {
      return await deleteLink(env, id);
    } catch (error) {
      console.error('Failed to delete link:', error);
      return jsonResponse({ message: '删除链接失败。' }, 500);
    }
  }

  return methodNotAllowed('GET, PATCH, PUT, DELETE');
}
