import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule } from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
async function scripts(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await scripts(path));
    else if (/\.(m?js)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const files = [...await scripts(resolve(root, 'js')), ...await scripts(resolve(root, 'scripts'))];
for (const file of files) {
  // Parse without evaluating browser code, downloading libraries, or spawning processes.
  new SourceTextModule(await readFile(file, 'utf8'), { identifier: file });
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const imports = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
if (!imports.imports.three || !imports.imports['cannon-es']) throw new Error('Missing engine import mappings.');
console.log(`Checked ${files.length} JavaScript modules and the dependency import map.`);
