import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('GitHub Pages 输出可直接进入系统并包含离线资源', async () => {
  execFileSync(process.execPath, ['scripts/prepare-github-pages.mjs'], {
    cwd: projectRoot,
    stdio: 'pipe',
  });

  const outputRoot = path.join(projectRoot, 'pages-dist');
  const html = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
  const sw = await readFile(path.join(outputRoot, 'sw.js'), 'utf8');

  assert.match(html, /<button class="mode-button" type="button" data-open-review>复习模式<\/button>/);
  assert.match(html, /<button class="mode-button" type="button" data-open-exam>考试模式<\/button>/);
  assert.match(html, /<script type="module" src="js\/app\.js\?v=16"><\/script>/);
  assert.doesNotMatch(html, /访问密钥|github-pages-access|pages-gate/);
  assert.match(sw, /tcm-exam-v1-pages-20260824-22/);
  assert.doesNotMatch(sw, /pages-gate/);
  assert.match(sw, /\.\/js\/app\.js\?v=16/);
  assert.match(sw, /\.\/js\/questions-2018-2022\.js/);
});
