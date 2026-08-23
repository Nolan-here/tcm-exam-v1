import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('GitHub Pages 输出包含无障碍访问页和离线资源', async () => {
  execFileSync(process.execPath, ['scripts/prepare-github-pages.mjs'], {
    cwd: projectRoot,
    stdio: 'pipe',
  });

  const outputRoot = path.join(projectRoot, 'pages-dist');
  const html = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
  const gate = await readFile(path.join(outputRoot, 'pages-gate.js'), 'utf8');
  const sw = await readFile(path.join(outputRoot, 'sw.js'), 'utf8');

  assert.match(html, /<label for="github-pages-access-key">访问密钥<\/label>/);
  assert.match(html, /role="status" aria-live="assertive"/);
  assert.match(html, /<template id="github-pages-app-shell">/);
  assert.doesNotMatch(html, /<script type="module" src="js\/app\.js\?v=16"><\/script>/);
  assert.match(html, /<script type="module" src="pages-gate\.js\?v=3"><\/script>/);
  assert.match(gate, /f0b12c406cbbaaccafb20542f2ee88922997e8c67bd8f8d7f983115de6c63bf8/);
  assert.doesNotMatch(gate, /5201314xwz/);
  assert.match(gate, /\.\/js\/app\.js\?v=16/);
  assert.match(sw, /tcm-exam-v1-pages-20260823-19/);
  assert.match(sw, /\.\/pages-gate\.js\?v=3/);
  assert.match(sw, /\.\/js\/questions-2018-2022\.js/);
});
