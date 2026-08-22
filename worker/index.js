import { EMBEDDED_ASSETS } from './embedded-assets.generated.js';

const ACCESS_COOKIE = 'tcm_exam_access';
const COOKIE_MESSAGE = 'tcm-exam-v1-authorized';

const encoder = new TextEncoder();

async function createAccessToken(secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(COOKIE_MESSAGE));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const cookies = request.headers.get('Cookie') ?? '';
  for (const item of cookies.split(';')) {
    const [cookieName, ...valueParts] = item.trim().split('=');
    if (cookieName === name) return valueParts.join('=');
  }
  return '';
}

function loginPage(showError = false) {
  const error = showError
    ? '<p id="access-error" role="alert" tabindex="-1">密钥不正确，请重新输入。</p>'
    : '<p id="access-help">请输入测试密钥后继续。</p>';
  const describedBy = showError ? 'access-error' : 'access-help';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#f5f7f5">
  <title>输入访问密钥 - 中医执业医师刷题系统</title>
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
    body { margin: 0; color: #17221a; background: #f5f7f5; }
    main { max-width: 34rem; margin: 0 auto; padding: max(2rem, env(safe-area-inset-top)) 1rem 2rem; }
    form { display: grid; gap: 1rem; padding: 1.25rem; background: #fff; border: 2px solid #315f3b; border-radius: .75rem; }
    h1 { font-size: 1.6rem; line-height: 1.3; }
    label { font-weight: 700; }
    input, button { min-height: 3rem; box-sizing: border-box; font: inherit; }
    input { width: 100%; padding: .65rem; border: 2px solid #56645a; border-radius: .35rem; }
    button { padding: .65rem 1rem; color: #fff; background: #245c32; border: 0; border-radius: .35rem; font-weight: 700; }
    input:focus, button:focus { outline: 3px solid #0b65c2; outline-offset: 3px; }
    [role="alert"] { color: #a01818; font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <h1>中医执业医师刷题系统</h1>
    <form method="post" action="/__access">
      ${error}
      <label for="access-key">访问密钥</label>
      <input id="access-key" name="access_key" type="password" required autocomplete="current-password" aria-describedby="${describedBy}" autofocus>
      <button type="submit">进入测试</button>
    </form>
  </main>
</body>
</html>`;
}

function htmlResponse(html, status = 200, extraHeaders = {}) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...extraHeaders,
    },
  });
}

function serveAsset(request) {
  const url = new URL(request.url);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const asset = EMBEDDED_ASSETS[pathname];

  if (!asset) {
    return new Response('Not Found', { status: 404 });
  }

  const headers = {
    'Content-Type': asset.contentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/';

  return new Response(request.method === 'HEAD' ? null : asset.body, {
    status: 200,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const secret = env.ACCESS_KEY;
    if (!secret) {
      return htmlResponse('<!doctype html><html lang="zh-CN"><title>暂时无法访问</title><h1>暂时无法访问</h1><p>测试密钥尚未配置。</p></html>', 503);
    }

    const expectedToken = await createAccessToken(secret);
    const presentedToken = readCookie(request, ACCESS_COOKIE);
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/__access') {
      const form = await request.formData();
      if (form.get('access_key') === secret) {
        return new Response(null, {
          status: 303,
          headers: {
            Location: '/',
            'Cache-Control': 'no-store',
            'Set-Cookie': `${ACCESS_COOKIE}=${expectedToken}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
          },
        });
      }
      return htmlResponse(loginPage(true), 401);
    }

    if (presentedToken === expectedToken && (request.method === 'GET' || request.method === 'HEAD')) {
      return serveAsset(request);
    }

    return htmlResponse(loginPage(false));
  },
};
