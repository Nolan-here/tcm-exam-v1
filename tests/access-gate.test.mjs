import test from 'node:test';
import assert from 'node:assert/strict';

import worker from '../worker/index.js';

const TEST_KEY = 'temporary-test-key';
test('未验证访问显示具有明确标签的密钥输入页', async () => {
  const response = await worker.fetch(new Request('https://example.test/'), {
    ACCESS_KEY: TEST_KEY,
  });
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<label for="access-key">访问密钥<\/label>/);
  assert.match(html, /<button type="submit">进入测试<\/button>/);
});

test('正确密钥设置安全 Cookie，随后可以访问题库资源', async () => {
  const form = new URLSearchParams({ access_key: TEST_KEY });
  const loginResponse = await worker.fetch(new Request('https://example.test/__access', {
    method: 'POST',
    body: form,
  }), {
    ACCESS_KEY: TEST_KEY,
  });

  assert.equal(loginResponse.status, 303);
  assert.equal(loginResponse.headers.get('Location'), '/');
  const setCookie = loginResponse.headers.get('Set-Cookie');
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);

  const cookie = setCookie.split(';', 1)[0];
  const protectedResponse = await worker.fetch(new Request('https://example.test/', {
    headers: { Cookie: cookie },
  }), {
    ACCESS_KEY: TEST_KEY,
  });

  assert.equal(protectedResponse.status, 200);
  assert.match(await protectedResponse.text(), /复习模式/);
});

test('错误密钥不设置 Cookie，并以读屏可读警告提示重试', async () => {
  const response = await worker.fetch(new Request('https://example.test/__access', {
    method: 'POST',
    body: new URLSearchParams({ access_key: 'wrong-key' }),
  }), {
    ACCESS_KEY: TEST_KEY,
  });
  const html = await response.text();

  assert.equal(response.status, 401);
  assert.equal(response.headers.has('Set-Cookie'), false);
  assert.match(html, /role="alert"/);
  assert.match(html, /密钥不正确/);
});
