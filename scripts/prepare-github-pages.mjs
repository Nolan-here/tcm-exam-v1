import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

const sourceSw = await readFile(path.join(outputRoot, 'sw.js'), 'utf8');
const pagesSw = sourceSw
  .replace("tcm-exam-v1-20260824-21", "tcm-exam-v1-pages-20260824-24");
await writeFile(path.join(outputRoot, 'sw.js'), pagesSw, 'utf8');

console.log(`GitHub Pages 静态文件已生成：${outputRoot}`);
