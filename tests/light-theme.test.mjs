import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
test('Shared theme is light-only; dark OS cannot change its tokens', () => {
  const source = readFileSync('src/styles/index.css', 'utf8');
  assert.equal(source.includes('prefers-color-scheme: dark'), false);
  assert.equal(source.includes("data-molar-theme='dark'"), false);
  for (const name of ['pet/SharedVirtualPet.tsx','cat/SharedCatMascot.tsx','ai/SharedMolarAI.tsx','games/SharedMeowdokuLauncher.tsx']) assert.ok(readFileSync('src/'+name,'utf8').includes('data-molar-theme="light"'));
});
test('Generated isolation owns existing light paint, not host geometry', () => {
  const root = postcss.parse(readFileSync('dist/styles.css','utf8'));
  const layer = root.nodes.find(node => node.type === 'atrule' && node.name === 'layer' && node.params === 'pet-function-light-lock');
  assert.ok(layer);
  let backgrounds = 0, shadows = 0;
  layer.walkRules(rule => assert.ok(rule.selector.includes('.snabbb-molar-experience'), rule.selector));
  layer.walkDecls(decl => {
    assert.ok(decl.important, decl.toString());
    assert.ok(!['position','width','height','transform','translate','animation','display'].includes(decl.prop));
    if (decl.prop === 'background-color') backgrounds++;
    if (decl.prop === 'box-shadow') shadows++;
  });
  assert.ok(backgrounds > 10);
  assert.ok(shadows > 5);
});
