import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const roomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const stylesSource = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

test('stadium places an interactive football on the pitch and hurdle on the track', () => {
  assert.match(roomSource, /football: \{ x: 0\.405, y: 0\.49 \}/);
  assert.match(roomSource, /hurdle: \{ x: 0\.77, y: 0\.70 \}/);
  assert.match(roomSource, /soccer-ball-pixel\.png/);
  assert.match(roomSource, /stadium-hurdle\.png/);
  assert.match(roomSource, /Enter the football game/);
  assert.match(roomSource, /Enter the hurdle game/);
});

test('nearby Space and clicks enter reserved game scenes', () => {
  assert.match(roomSource, /event\.code !== 'Space'/);
  assert.match(roomSource, /isNearStadiumActivity/);
  assert.match(roomSource, /SPACE \/ CLICK TO ENTER/);
  assert.match(roomSource, /football: 'stadium-football'/);
  assert.match(roomSource, /hurdle: 'stadium-hurdles'/);
  assert.match(roomSource, /onNavigateToGame\(STADIUM_ACTIVITY_GAMES\[activity\]\)/);
  assert.doesNotMatch(roomSource, /GREAT KICK!|NICE JUMP!|stadiumFeedback/);
  assert.doesNotMatch(stylesSource, /pet-stadium-football-kick|pet-stadium-hurdle-jump|pet-stadium-success-pop/);
});
