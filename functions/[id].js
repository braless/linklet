import page404 from './404.html';
import { formatCreateTime, normalizeUrl } from './_lib/link-utils.js';

function notFound() {
  return new Response(page404, {
    status: 404,
    headers: { 'Content-Type': 'text/html;charset=UTF-8' },
  });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;

  if (!env.DB) return notFound();

  const slug = params.id;
  const link = await env.DB.prepare(`
    SELECT url
    FROM links
    WHERE slug = ? AND COALESCE(status, 1) = 1
    LIMIT 1
  `)
    .bind(slug)
    .first();

  if (!link) return notFound();

  const destination = normalizeUrl(link.url);
  if (!destination) return notFound();

  const clientIp = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')
    || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const referer = request.headers.get('Referer') || '';

  try {
    await env.DB.prepare(`
      INSERT INTO logs (url, slug, ip, referer, ua, create_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
      .bind(destination, slug, clientIp, referer, userAgent, formatCreateTime())
      .run();
  } catch (error) {
    console.error('Failed to record visit:', error);
  }

  return Response.redirect(destination, 302);
}
