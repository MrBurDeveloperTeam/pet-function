import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('SNAI owns a single light support card and keeps its existing link', () => {
  const card = read('src/ai/SharedSNAISupportCard.tsx');
  assert.match(card, /support%40snabbb.com&su=Customer%20Inquiry/);
  assert.match(card, /noopener noreferrer/);
  assert.doesNotMatch(card, /dark:|--cp-|inventory-support/);
  assert.match(read('src/ai/SharedMolarAI.tsx'), /footerContent \?\? <SharedSNAISupportCard/);
});
test('All six app wrappers defer support presentation to SharedMolarAI', () => {
  for (const path of ['inventory/InventoryMolarAIFloat.tsx','appointment/AppointmentMolarAIFloat.jsx','image-generator/ContentStudioMolarAIFloat.jsx','calculator/CalculatorMolarAIFloat.jsx','todo/TodoMolarAIFloat.jsx','elearning/ElearningMolarAIFloat.jsx']) {
    const source = read('src/apps/' + path);
    assert.doesNotMatch(source, /footerContent=|function \w*Support\w*\(/);
    assert.match(source, /<SharedMolarAI/);
  }
});
