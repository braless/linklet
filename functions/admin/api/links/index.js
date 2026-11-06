import {
  isSameOrigin,
  jsonResponse,
  methodNotAllowed,
  requireAdmin,
} from '../../../_lib/admin-auth.js';
import {
  formatCreateTime,
  generateRandomSlug,
  normalizeUrl,
  validateSlug,
} from '../../../_lib/link-utils.js';

function bindAll(statement, values) {
  return values.length ? statement.bind(...values) : statement;
}

async function listLinks(request, env) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 200);
  const status = url.searchParams.get('status');
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page'), 10) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(url.searchParams.get('pageSize'), 10) || 20)
  );

  const clauses = [];
  const bindings = [];

  if (query) {
    clauses.push('(l.slug LIKE ? OR l.url LIKE ?)');
    bindings.push(`%${query}%`, `%${query}%`);
  }

  if (status === '0' || status === '1') {
    clauses.push('l.status = ?');
    bindings.push(Number(status));
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const countRow = await bindAll(
    env.DB.prepare(`SELECT COUNT(*) AS total FROM links l ${where}`),
    bindings
  ).first();

  const rows = await env.DB.prepare(`
    SELECT
      l.id,
      l.url,
      l.slug,
      l.status,
      l.create_time,
      COALESCE((SELECT COUNT(*) FROM logs lg WHERE lg.slug = l.slug), 0) AS clicks
    FROM links l
    ${where}
    ORDER BY l.id DESC
    LIMIT ? OFFSET ?
  `)
    .bind(...bindings, pageSize, (page - 1) * pageSize)
    .all();

  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) AS active,
      COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) AS disabled,
      COALESCE((
        SELECT COUNT(*)
        FROM logs lg
        INNER JOIN links current_links ON current_links.slug = lg.slug
      ), 0) AS clicks
    FROM links
  `).first();

  return jsonResponse({
    items: rows.results || [],
    total: countRow ? countRow.total : 0,
    page,
    pageSize,
    stats: stats || { total: 0, active: 0, disabled: 0, clicks: 0 },
  });
}

async function createLink(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ message: '请求内容格式错误。' }, 400);
  }

  const normalizedUrl = normalizeUrl(body && body.url);
  if (!normalizedUrl) {
    return jsonResponse({ message: '请输入有效的 http 或 https 链接。' }, 400);
  }

  const requestedSlug = body && body.slug !== undefined ? body.slug : '';
  const slugValidation = validateSlug(requestedSlug, { optional: true });
  if (!slugValidation.valid) {
    return jsonResponse({ message: slugValidation.message }, 400);
  }

  const status = body && body.status !== undefined ? Number(body.status) : 1;
  if (status !== 0 && status !== 1) {
    return jsonResponse({ message: '状态值无效。' }, 400);
  }

  const requestHostname = new URL(request.url).hostname;
  if (new URL(normalizedUrl).hostname === requestHostname) {
    return jsonResponse({ message: '不能把短链指向当前站点自身。' }, 400);
  }

  let slug = slugValidation.value;

  if (slug) {
    const existing = await env.DB.prepare(
      'SELECT id FROM links WHERE slug = ? LIMIT 1'
    )
      .bind(slug)
      .first();

    if (existing) {
      return jsonResponse({ message: '该 slug 已存在。' }, 409);
    }
  } else {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const candidate = generateRandomSlug();
      const existing = await env.DB.prepare(
        'SELECT id FROM links WHERE slug = ? LIMIT 1'
      )
        .bind(candidate)
        .first();
      if (!existing) {
        slug = candidate;
        break;
      }
    }

    if (!slug) {
      return jsonResponse({ message: '生成短链失败，请稍后重试。' }, 500);
    }
  }

  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const createTime = formatCreateTime();

  const result = await env.DB.prepare(`
    INSERT INTO links (url, slug, ip, status, ua, create_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
    .bind(normalizedUrl, slug, clientIp, status, userAgent, createTime)
    .run();

  return jsonResponse(
    {
      item: {
        id: result.meta ? result.meta.last_row_id : null,
        url: normalizedUrl,
        slug,
        status,
        create_time: createTime,
        clicks: 0,
      },
    },
    201
  );
}

export async function onRequest(context) {
  const { request, env } = context;
  const authError = await requireAdmin(request, env);
  if (authError) return authError;

  if (!env.DB) {
    return jsonResponse({ message: 'D1 数据库尚未绑定。' }, 503);
  }

  if (request.method === 'GET') {
    try {
      return await listLinks(request, env);
    } catch (error) {
      console.error('Failed to list links:', error);
      return jsonResponse({ message: '读取链接列表失败。' }, 500);
    }
  }

  if (request.method === 'POST') {
    if (!isSameOrigin(request)) return jsonResponse({ message: '请求来源无效。' }, 403);

    try {
      return await createLink(request, env);
    } catch (error) {
      console.error('Failed to create link:', error);
      return jsonResponse({ message: '创建短链失败。' }, 500);
    }
  }

  return methodNotAllowed('GET, POST');
}
