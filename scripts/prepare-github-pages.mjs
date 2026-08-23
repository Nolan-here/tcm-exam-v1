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

for (const file of ['styles.css', 'manifest.webmanifest', 'sw.js', 'pages-gate.js']) {
  await cp(path.join(projectRoot, file), path.join(outputRoot, file));
}
for (const directory of ['assets', 'js']) {
  await cp(path.join(projectRoot, directory), path.join(outputRoot, directory), { recursive: true });
}

const sourceHtml = await readFile(path.join(projectRoot, 'index.html'), 'utf8');
const bodyMatch = sourceHtml.match(/<body>([\s\S]*?)<\/body>/i);
if (!bodyMatch) throw new Error('无法读取 index.html 的 body');

const appBody = bodyMatch[1].replace(
  /\s*<script type="module" src="js\/app\.js\?v=16"><\/script>\s*/i,
  '\n'
);

const pagesBody = `<body>
  <main id="github-pages-access-main" tabindex="-1">
    <section class="card access-card" aria-labelledby="github-pages-access-heading">
      <h1 id="github-pages-access-heading">中医执业医师刷题系统测试访问</h1>
      <p>请输入访问密钥。验证成功后，本浏览器七天内无需重复输入。</p>
      <form id="github-pages-access-form">
        <label for="github-pages-access-key">访问密钥</label>
        <input id="github-pages-access-key" name="access-key" type="password" required autocomplete="current-password" aria-describedby="github-pages-access-status">
        <button class="primary" type="submit">进入系统</button>
      </form>
      <p id="github-pages-access-status" role="status" aria-live="assertive" aria-atomic="true"></p>
    </section>
  </main>

  <template id="github-pages-app-shell">${appBody}</template>

  <noscript>
    <section class="card noscript">
      <h2>需要启用 JavaScript</h2>
      <p>访问验证和刷题功能需要 JavaScript。</p>
    </section>
  </noscript>
  <script type="module" src="pages-gate.js?v=2"></script>
</body>`;

const pagesHtml = sourceHtml.replace(/<body>[\s\S]*?<\/body>/i, pagesBody);
await writeFile(path.join(outputRoot, 'index.html'), pagesHtml, 'utf8');
await writeFile(path.join(outputRoot, '.nojekyll'), '', 'utf8');

const sourceSw = await readFile(path.join(outputRoot, 'sw.js'), 'utf8');
const pagesSw = sourceSw
  .replace("tcm-exam-v1-20260823-17", "tcm-exam-v1-pages-20260823-18")
  .replace("'./js/app.js?v=16'", "'./pages-gate.js?v=2', './js/app.js?v=16'");
await writeFile(path.join(outputRoot, 'sw.js'), pagesSw, 'utf8');

console.log(`GitHub Pages 静态文件已生成：${outputRoot}`);
