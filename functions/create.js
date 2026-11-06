import {
  formatCreateTime,
  generateRandomSlug,
  normalizeUrl,
  validateSlug,
} from './_lib/link-utils.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ message: 'Method Not Allowed.' }, 405);
  }

  if (!env.DB) {
    return json({ message: 'D1 database is not configured.' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ message: 'Invalid JSON body.' }, 400);
  }

  const url = normalizeUrl(body && body.url);
  if (!url) {
    return json({ message: 'Missing or illegal parameter: url.' }, 400);
  }

  const requestedSlug = body && body.slug !== undefined ? body.slug : '';
  const slugValidation = validateSlug(requestedSlug, { optional: true });
  if (!slugValidation.valid) {
    return json({ message: slugValidation.message }, 400);
  }

  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const destination = new URL(url);

  if (destination.hostname === requestUrl.hostname) {
    return json({ message: 'You cannot shorten a link to the same domain.' }, 400);
  }

  try {
    const customSlug = slugValidation.value;

    if (customSlug) {
      const existing = await env.DB.prepare(
        'SELECT url, status FROM links WHERE slug = ? LIMIT 1'
      )
        .bind(customSlug)
        .first();

      if (existing) {
        if (existing.url === url && Number(existing.status) === 1) {
          return json({ slug: customSlug, link: `${origin}/${customSlug}` });
        }
        return json({ message: 'Slug already exists.' }, 409);
      }
    } else {
      const existing = await env.DB.prepare(
        'SELECT slug FROM links WHERE url = ? AND status = 1 ORDER BY id DESC LIMIT 1'
      )
        .bind(url)
        .first();

      if (existing) {
        return json({ slug: existing.slug, link: `${origin}/${existing.slug}` });
      }
    }

    let slug = customSlug;
    if (!slug) {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = generateRandomSlug(4);
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
    }

    if (!slug) return json({ message: 'Unable to generate a unique slug.' }, 500);

    const clientIp = request.headers.get('CF-Connecting-IP')
      || request.headers.get('X-Forwarded-For')
      || '';
    const userAgent = request.headers.get('User-Agent') || '';

    await env.DB.prepare(`
      INSERT INTO links (url, slug, ip, status, ua, create_time)
      VALUES (?, ?, ?, 1, ?, ?)
    `)
      .bind(url, slug, clientIp, userAgent, formatCreateTime())
      .run();

    return json({ slug, link: `${origin}/${slug}` });
  } catch (error) {
    console.error('Failed to create short link:', error);
    return json({ message: 'Failed to create short link.' }, 500);
  }
}
