import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const clientRoot = path.join(distRoot, 'client');
const cloudflareRoot = path.join(distRoot, 'tcm_exam_v1_test');
const serverRoot = path.join(distRoot, 'server');

if (!clientRoot.startsWith(`${distRoot}${path.sep}`)) {
  throw new Error('拒绝清理项目 dist 目录之外的路径。');
}

await stat(path.join(cloudflareRoot, 'index.js'));
await mkdir(serverRoot, { recursive: true });
await cp(path.join(cloudflareRoot, 'index.js'), path.join(serverRoot, 'index.js'));

const wrangler = JSON.parse(await readFile(path.join(cloudflareRoot, 'wrangler.json'), 'utf8'));
wrangler.main = 'server/index.js';
delete wrangler.assets;
await writeFile(path.join(distRoot, 'wrangler.json'), `${JSON.stringify(wrangler)}\n`);

await rm(clientRoot, { recursive: true, force: true });
await rm(cloudflareRoot, { recursive: true, force: true });
