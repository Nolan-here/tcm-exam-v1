const ACCESS_DIGEST = 'f0b12c406cbbaaccafb20542f2ee88922997e8c67bd8f8d7f983115de6c63bf8';
const ACCESS_EXPIRY_KEY = 'tcm-exam-pages-access-expires';
const ACCESS_DURATION = 7 * 24 * 60 * 60 * 1000;

async function digest(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function hasAccess() {
  try {
    return Number(localStorage.getItem(ACCESS_EXPIRY_KEY)) > Date.now();
  } catch {
    return false;
  }
}

function rememberAccess() {
  try {
    localStorage.setItem(ACCESS_EXPIRY_KEY, String(Date.now() + ACCESS_DURATION));
  } catch {
    // Safari 私密浏览等环境可能拒绝持久化；本次访问仍然继续。
  }
}

async function openApp() {
  const template = document.querySelector('#github-pages-app-shell');
  if (!template) throw new Error('未找到应用页面');
  document.body.replaceChildren(template.content.cloneNode(true));
  await import('./js/app.js?v=15');
}

const form = document.querySelector('#github-pages-access-form');
const input = document.querySelector('#github-pages-access-key');
const status = document.querySelector('#github-pages-access-status');

if (hasAccess()) {
  await openApp();
} else {
  input?.focus();
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.textContent = '正在验证访问密钥。';

    try {
      if (await digest(input.value) === ACCESS_DIGEST) {
        rememberAccess();
        await openApp();
        return;
      }
      input.value = '';
      status.textContent = '密钥不正确，请重新输入。';
      input.focus();
    } catch {
      status.textContent = '当前浏览器无法完成验证，请确认使用 HTTPS 地址后重试。';
      input.focus();
    } finally {
      submit.disabled = false;
    }
  });
}
