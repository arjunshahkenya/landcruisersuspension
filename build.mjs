import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'vendor'), { recursive: true });

for (const entry of await readdir(root)) {
  if (/\.(html|css|js|svg|woff2|ico)$/.test(entry) || ['model', 'fonts'].includes(entry)) {
    await cp(join(root, entry), join(out, entry), { recursive: true });
  }
}
const three = join(root, 'node_modules/three');
await cp(join(three, 'build/three.module.min.js'), join(out, 'vendor/three.module.js'));
await cp(join(three, 'LICENSE'), join(out, 'vendor/THREE-LICENSE.txt'));
for (const path of ['controls/OrbitControls.js', 'utils/BufferGeometryUtils.js']) {
  const source = await readFile(join(three, 'examples/jsm', path), 'utf8');
  await writeFile(join(out, 'vendor', path.split('/').pop()), source.replaceAll("from 'three'", "from './three.module.js'"));
}
