import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = resolve(root, '..');
const apps = ['snabb-superapp', 'inventory', 'appointment', 'Image-generator', 'calculator', 'todo', 'E-learning'];
const walk = dir => readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(join(dir,e.name)) : [join(dir,e.name)]);
const media = /\.(?:png|jpe?g|webp|gif|svg|ico|mp3|wav|ogg|m4a|mp4|webm|ttf|woff2?)$/i;
let failures = 0;
for (const app of apps) {
  const host = join(workspace, app);
  const pkg = join(host, 'node_modules/@mrburdeveloperteam/pet-function');
  let checked = 0, missing = 0, different = 0;
  for (const source of walk(join(pkg, 'public/pet-function'))) {
    const name = relative(join(pkg, 'public'), source);
    const target = join(host, 'public', name);
    checked++;
    if (!existsSync(target)) { console.log('MISSING', app, name); missing++; }
    else if (!readFileSync(source).equals(readFileSync(target))) { console.log('DIFFERENT', app, name); different++; }
  }
  console.log(JSON.stringify({app, sharedFiles:checked, missing, different}));
  failures += missing + different;
}
// Scan quoted local media paths, including HTML src/href and CSS url().
for (const base of ['src', 'public/games']) {
  let checked = 0;
  for (const file of walk(join(root, base))) {
    if (!/\.(?:tsx?|jsx?|html|css|json|mjs)$/i.test(file)) continue;
    if (file.endsWith('.d.ts')) continue;
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const pattern = /["'`](\/?[^"'`\s<>]+\.(?:png|jpe?g|webp|gif|svg|ico|mp3|wav|ogg|m4a|mp4|webm|ttf|woff2?)(?:\?[^"'`\s]*)?)["'`]/gi;
    for (const match of text.matchAll(pattern)) {
      const name = match[1].split('?')[0];
      if (/^(?:https?:|data:|#)/i.test(name) || name.includes('${') || name.includes('*')) continue;
      if (!media.test(name)) continue;
      let context = dirname(file);
      if (base === 'public/games' && extname(file) === '.js') {
        while (!existsSync(join(context, 'index.html')) && context !== join(root, 'public/games')) context = dirname(context);
      }
      const target = name.startsWith('/') ? join(root, 'public', name) : resolve(context, name);
      checked++;
      if (!existsSync(target)) console.log('REFERENCE_MISSING_OR_LEGACY', relative(root,file), name);
    }
  }
  console.log('Reference checks', base, checked);
}
for (const app of apps) {
  const host = join(workspace, app);
  const pkg = join(host, 'node_modules/@mrburdeveloperteam/pet-function/public/games');
  const output = join(host, app === 'Image-generator' ? 'public/pet-function-games' : 'dist/games');
  let missing = 0, different = 0;
  for (const source of walk(pkg)) {
    const name = relative(pkg,source), target = join(output,name);
    if (!existsSync(target)) missing++;
    else if (!readFileSync(source).equals(readFileSync(target))) different++;
  }
  console.log(JSON.stringify({app, gameFiles:walk(pkg).length, existingGameOutputMissing:missing, existingGameOutputDifferent:different}));
}
process.exitCode = failures ? 1 : 0;
