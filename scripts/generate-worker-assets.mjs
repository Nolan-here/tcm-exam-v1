import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = path.join(projectRoot, 'worker', 'embedded-assets.generated.js');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
]);

const sourceFiles = [
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'sw.js',
  'assets/icon.svg',
  'js/app.js',
  'js/subject-panel-focus.js',
  'js/db.js',
  'js/wrong-book.js',
  'js/questions-2023.js',
  'js/questions-2024.js',
  'js/questions-2018-2022.js',
  'js/questions-2018.js',
  'js/questions-2019.js',
  'js/questions-2020.js',
  'js/questions-2021.js',
  'js/questions-2022.js',
  'js/questions-bank.js',
  'js/questions-subjects.js',
  'js/source-confirmed-question-repairs.js',
  'js/authority-researched-explanation-backfills.js',
  'js/questions.js',
  'js/sync.js',
];

const assets = {};
for (const relativePath of sourceFiles) {
  const extension = path.extname(relativePath);
  const contentType = contentTypes.get(extension);
  if (!contentType) throw new Error(`未配置资源类型：${relativePath}`);

  assets[`/${relativePath.replaceAll('\\', '/')}`] = {
    contentType,
    body: await readFile(path.join(projectRoot, relativePath), 'utf8'),
  };
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `// 此文件由 scripts/generate-worker-assets.mjs 自动生成，请勿手工修改。\nexport const EMBEDDED_ASSETS = Object.freeze(${JSON.stringify(assets)});\n`,
);
