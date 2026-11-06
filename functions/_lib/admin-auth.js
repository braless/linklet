const COOKIE_NAME = 'linklet_admin';
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const encoder = new TextEncoder();

export function getAdminPassword(env) {
  const password = env && env.ADMIN_PASSWORD;
  return typeof password === 'string' && password.length > 0 ? password : '';
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function methodNotAllowed(allow) {
  return jsonResponse(
    { message: '请求方法不受支持。' },
    405,
    { Allow: allow }
  );
}

export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true;

  try {
    return origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(left, right) {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function sign(value, password) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return new Uint8Array(signature);
}

export async function verifyAdminPassword(password, env) {
  const configuredPassword = getAdminPassword(env);
  if (!configuredPassword || typeof password !== 'string') return false;

  const [actual, expected] = await Promise.all([
    sha256(password),
    sha256(configuredPassword),
  ]);
  return timingSafeEqual(actual, expected);
}

function readCookie(request, name) {
  const cookieHeader = request.headers.get('Cookie') || '';
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return '';
}

async function createSessionToken(env) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  const signature = await sign(`linklet-admin:${payload}`, getAdminPassword(env));
  return `${payload}.${toBase64Url(signature)}`;
}

export async function verifyAdminSession(request, env) {
  const password = getAdminPassword(env);
  if (!password) return false;

  const token = readCookie(request, COOKIE_NAME);
  const separator = token.indexOf('.');
  if (separator === -1) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!/^\d{10,}$/.test(payload) || !signature) return false;

  const expiresAt = Number(payload);
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt <= now || expiresAt > now + SESSION_TTL_SECONDS + 60) return false;

  try {
    const expected = await sign(`linklet-admin:${payload}`, password);
    return timingSafeEqual(fromBase64Url(signature), expected);
  } catch {
    return false;
  }
}

export async function createSessionCookie(request, env) {
  const token = await createSessionToken(env);
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function clearSessionCookie(request) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}

export async function requireAdmin(request, env) {
  if (!getAdminPassword(env)) {
    return jsonResponse(
      { message: '管理员密码尚未配置，请在 Cloudflare 设置 ADMIN_PASSWORD 密钥。' },
      503
    );
  }

  if (!(await verifyAdminSession(request, env))) {
    return jsonResponse({ message: '登录已过期，请重新登录。' }, 401);
  }

  return null;
}
