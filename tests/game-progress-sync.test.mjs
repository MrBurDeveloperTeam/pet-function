import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, value => value.slice(1));
const read = path => readFileSync(join(root, path), 'utf8');

test('all built-in games use the shared authenticated progress bridge', () => {
  for (const path of [
    'public/games/flappy-cat/flappybird.js',
    'public/games/pac-cat/js/game.js',
    'public/games/tetris/game.js',
  ]) {
    const source = read(path);
    assert.match(source, /SHARED_GAME_PROGRESS_READY/);
    assert.match(source, /SHARED_GAME_PROGRESS_SAVE/);
    assert.match(source, /SHARED_GAME_PROGRESS/);
  }
});

test('Meowdoku treats authenticated cloud progress as authoritative', () => {
  const source = read('public/games/meowdoku/game.js');
  assert.match(source, /unlocked:cloud\.unlocked/);
  assert.match(source, /completed:cloud\.completed/);
  assert.doesNotMatch(source, /completed:\{\.\.\.cloud\.completed,\.\.\.local\.completed\}/);
});

test('shared game progress migration is account scoped and RPC-only for writes', () => {
  const sql = read('database/pet_game_progress.sql');
  assert.match(sql, /primary key \(user_id, game_id\)/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on table public\.pet_game_progress from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.pet_game_progress_sync/i);
});

test('Pac-Cat help has an outside-click backdrop and Tetris game over is intrinsically centered', () => {
  const pacCatMarkup = read('public/games/pac-cat/index.html');
  const pacCatStyles = read('public/games/pac-cat/css/pacman.css');
  const tetrisStyles = read('public/games/tetris/style.css');
  assert.match(pacCatMarkup, /id="help-backdrop"/);
  assert.match(pacCatMarkup, /#help, #help-backdrop/);
  assert.match(pacCatStyles, /#help-backdrop\s*\{[\s\S]*?position:\s*fixed/);
  assert.match(tetrisStyles, /\.overlay h2\.huge-title\s*\{[\s\S]*?width:\s*max-content/);
  assert.match(tetrisStyles, /\.overlay h2\.huge-title\s*\{[\s\S]*?align-self:\s*center/);
});
