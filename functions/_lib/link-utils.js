const RESERVED_SLUGS = new Set([
  'admin',
  'api',
  'asset',
  'assets',
  'create',
  'functions',
  'favicon',
]);

const SLUG_PATTERN = /^[a-zA-Z0-9_-]{2,32}$/;
const SLUG_CHARACTERS = '23456789abcdefghjkmnpqrstuvwxyz';

export function normalizeUrl(value) {
  if (typeof value !== 'string') return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function validateSlug(value, { optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return optional
      ? { valid: true, value: '' }
      : { valid: false, message: '请输入 slug。' };
  }

  if (typeof value !== 'string' || !SLUG_PATTERN.test(value)) {
    return {
      valid: false,
      message: 'slug 只能包含字母、数字、下划线和连字符，长度为 2-32 个字符。',
    };
  }

  if (RESERVED_SLUGS.has(value.toLowerCase())) {
    return { valid: false, message: '该 slug 为系统保留地址，请更换。' };
  }

  return { valid: true, value };
}

export function generateRandomSlug(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let result = '';
  for (const byte of bytes) {
    result += SLUG_CHARACTERS[byte % SLUG_CHARACTERS.length];
  }
  return result;
}

export function formatCreateTime(date = new Date()) {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date);
}
