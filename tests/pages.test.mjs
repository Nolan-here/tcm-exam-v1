import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function listPublishedFiles(directory, relativeDirectory = '') {
  const entries = await readdir(path.join(directory, relativeDirectory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await listPublishedFiles(directory, relativePath));
    else files.push(relativePath);
  }
  return files;
}

test('GitHub Pages 输出可直接进入系统并包含离线资源', async () => {
  execFileSync(process.execPath, ['scripts/prepare-github-pages.mjs'], {
    cwd: projectRoot,
    stdio: 'pipe',
  });

  const outputRoot = path.join(projectRoot, 'pages-dist');
  const html = await readFile(path.join(outputRoot, 'index.html'), 'utf8');
  const sw = await readFile(path.join(outputRoot, 'sw.js'), 'utf8');

  assert.match(html, /<summary class="mode-summary" data-review-summary>复习模式<\/summary>/);
  assert.match(html, /<button class="mode-button" type="button" data-open-review>随机出题<\/button>/);
  assert.match(html, /<button class="mode-button" type="button" data-open-exam>考试模式<\/button>/);
  assert.match(html, /<script type="module" src="js\/app\.js\?v=17"><\/script>/);
  assert.doesNotMatch(html, /访问密钥|github-pages-access|pages-gate/);
  const versionedFiles = (await listPublishedFiles(outputRoot))
    .filter(relativePath => relativePath.replaceAll('\\', '/') !== '.nojekyll')
    .sort();
  const fingerprint = createHash('sha256');
  for (const relativePath of versionedFiles) {
    fingerprint.update(relativePath.replaceAll('\\', '/'));
    fingerprint.update('\0');
    fingerprint.update(await readFile(
      relativePath.replaceAll('\\', '/') === 'sw.js'
        ? path.join(projectRoot, 'sw.js')
        : path.join(outputRoot, relativePath)
    ));
    fingerprint.update('\0');
  }
  const expectedCacheName = `tcm-exam-v1-pages-${fingerprint.digest('hex').slice(0, 16)}`;
  assert.match(sw, new RegExp(`const CACHE_NAME = '${expectedCacheName}';`));
  assert.doesNotMatch(sw, /tcm-exam-v1-pages-20260824-24/);
  assert.doesNotMatch(sw, /pages-gate/);
  assert.match(sw, /\.\/js\/app\.js\?v=17/);
  assert.match(sw, /\.\/js\/questions-subjects\.js/);
  assert.match(sw, /\.\/js\/questions-2018-2022\.js/);
  assert.match(sw, /\.\/js\/authority-researched-explanation-backfills\.js/);
});
