import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.resolve(projectRoot, 'pages-dist');

if (path.dirname(outputRoot) !== projectRoot || path.basename(outputRoot) !== 'pages-dist') {
  throw new Error(`拒绝清理意外的输出目录：${outputRoot}`);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const file of ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js']) {
  await cp(path.join(projectRoot, file), path.join(outputRoot, file));
}
for (const directory of ['assets', 'js']) {
  await cp(path.join(projectRoot, directory), path.join(outputRoot, directory), { recursive: true });
}

await writeFile(path.join(outputRoot, '.nojekyll'), '', 'utf8');

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

const versionedFiles = (await listPublishedFiles(outputRoot))
  .filter(relativePath => relativePath.replaceAll('\\', '/') !== '.nojekyll')
  .sort();
const fingerprint = createHash('sha256');
for (const relativePath of versionedFiles) {
  fingerprint.update(relativePath.replaceAll('\\', '/'));
  fingerprint.update('\0');
  fingerprint.update(await readFile(path.join(outputRoot, relativePath)));
  fingerprint.update('\0');
}
const pagesCacheName = `tcm-exam-v1-pages-${fingerprint.digest('hex').slice(0, 16)}`;
const sourceSw = await readFile(path.join(outputRoot, 'sw.js'), 'utf8');
const pagesSw = sourceSw
  .replace(/^const CACHE_NAME = '[^']+';/m, `const CACHE_NAME = '${pagesCacheName}';`);
if (pagesSw === sourceSw) throw new Error('无法替换 GitHub Pages Service Worker 缓存名称');
await writeFile(path.join(outputRoot, 'sw.js'), pagesSw, 'utf8');

console.log(`GitHub Pages 静态文件已生成：${outputRoot}（缓存 ${pagesCacheName}）`);
