const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

function eventTarget(properties = {}) {
  const events = new Map();
  return {
    ...properties,
    addEventListener(name, handler) {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(handler);
    },
    emit(name, properties = {}) {
      const event = {
        target: this, currentTarget: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...properties,
      };
      for (const handler of events.get(name) || []) handler(event);
      return event;
    },
  };
}

function loadGame() {
  const drawing = new Proxy({}, { get: (ctx, method) => ctx[method] || (() => {}) });
  const elements = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) {
    elements.set(id, eventTarget({
      hidden: false,
      textContent: '',
      tagName: ['start', 'restart', 'pause', 'sound', 'touch-fire'].includes(id) ? 'BUTTON' : '',
      setAttribute() {},
      setPointerCapture() {},
      focus() {},
    }));
  }
  Object.assign(elements.get('game'), { width: 960, height: 560, getContext: () => drawing });
  const pad = [...html.matchAll(/\bdata-dir="([^"]+)"/g)].map(([, dir]) =>
    eventTarget({ dataset: { dir }, setPointerCapture() {} }));
  const document = eventTarget({
    hidden: false,
    querySelector: (selector) => elements.get(selector.slice(1)) || null,
    querySelectorAll: () => pad,
  });
  const window = eventTarget();
  const math = Object.create(Math);
  let seed = 42;
  math.random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 2 ** 32);
  const frames = [];
  let now = 0;
  const storage = new Map([['tankBattleBest', '450']]);
  const context = vm.createContext({
    document, window, Math: math,
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    performance: { now: () => now },
    requestAnimationFrame: (callback) => frames.push(callback),
  });
  // Observe internal state without a debug API in the page or modifying its game logic.
  const probe = [
    'globalThis.game = {',
    '  update, startWave, overlap, moveTank, loseLife,',
    '  get player(){return player}, get enemies(){return enemies}, get walls(){return walls},',
    '  get score(){return score}, get wave(){return wave}, set wave(n){wave=n},',
    '  get lives(){return lives}, set lives(n){lives=n},',
    '  get bullets(){return bullets}, set bullets(items){bullets=items},',
    '  set pickups(items){pickups=items}',
    '};',
  ].join('\n');
  vm.runInContext(script.replace(/\}\)\(\);\s*$/, probe + '\n})();'), context, { filename: 'index.html' });
  return {
    game: context.game, elements, document, window, pad, storage,
    click: (id) => elements.get(id).emit('click'),
    key: (type, key, properties = {}) => window.emit(type, { key, ...properties }),
    tick(ms = 16) {
      now += ms;
      assert.equal(frames.length, 1);
      frames.shift()(now);
    },
  };
}

function started() {
  const fixture = loadGame();
  fixture.click('start');
  return fixture;
}

function pickup(game, type) {
  game.pickups = [{ x: game.player.x, y: game.player.y, w: 16, h: 16, type }];
  game.update(0);
}

function aimedBullet(tank, owner = 'enemy') {
  return { x: tank.x, y: tank.y, w: 8, h: 8, dx: 0, dy: 1, speed: 220, life: 2.4, owner };
}

test('start button initializes the first wave and keeps one animation loop across restarts', () => {
  const f = loadGame();
  f.tick();
  assert.equal(Number(f.elements.get('best').textContent), 450);
  f.click('start');
  assert.equal(f.game.enemies.length, 7);
  assert.equal(f.game.wave, 1);
  assert.equal(f.game.lives, 3);
  assert.equal(f.elements.get('overlay').hidden, true);
  assert.match(f.elements.get('status').textContent, /第 1 关/);
  for (let i = 0; i < 3; i++) {
    f.click('restart');
    f.tick();
  }
  assert.equal(f.game.enemies.length, 7);
});

test('the pause dialog resumes the current wave and repeated P is ignored', () => {
  const f = started();
  f.game.wave = 3;
  f.game.startWave();
  f.key('keydown', 'p');
  f.key('keydown', 'p', { repeat: true });
  assert.equal(f.elements.get('overlay-title').textContent, '暂停');
  assert.equal(f.elements.get('overlay').hidden, false);
  assert.equal(f.elements.get('start').textContent, '继续战斗');
  f.click('start');
  assert.equal(f.elements.get('overlay').hidden, true);
  assert.equal(f.game.wave, 3);
});

test('hiding the document pauses play, and returning requires an explicit resume', () => {
  const f = started();
  f.key('keydown', 'ArrowLeft');
  const x = f.game.player.x;
  f.document.hidden = true;
  f.document.emit('visibilitychange');
  f.tick(500);
  assert.equal(f.game.player.x, x);
  f.document.hidden = false;
  f.document.emit('visibilitychange');
  assert.equal(f.elements.get('overlay-title').textContent, '暂停');
  f.click('pause');
  f.tick();
  assert.equal(f.game.player.x, x);
});

test('restart and blur discard previous movement input', () => {
  const f = started();
  f.key('keydown', 'ArrowLeft');
  f.click('restart');
  const x = f.game.player.x;
  f.key('keydown', 'ArrowLeft', { repeat: true });
  f.tick();
  assert.equal(f.game.player.x, x);
  f.key('keydown', 'a');
  f.tick();
  assert.ok(f.game.player.x < x);
  const beforeBlur = f.game.player.x;
  f.window.emit('blur');
  f.tick();
  assert.equal(f.game.player.x, beforeBlur);
});

test('keyboard aliases and pointer IDs can hold the same movement independently', () => {
  const f = started();
  const left = f.pad.find((button) => button.dataset.dir === 'left');
  f.key('keydown', 'ArrowLeft');
  f.key('keydown', 'a');
  left.emit('pointerdown', { pointerId: 1 });
  left.emit('pointerdown', { pointerId: 2 });
  f.key('keyup', 'ArrowLeft');
  left.emit('pointercancel', { pointerId: 1 });
  const first = f.game.player.x;
  f.tick();
  assert.ok(f.game.player.x < first);
  f.key('keyup', 'a');
  const second = f.game.player.x;
  f.tick();
  assert.ok(f.game.player.x < second);
  left.emit('lostpointercapture', { pointerId: 2 });
  const third = f.game.player.x;
  f.tick();
  assert.equal(f.game.player.x, third);
});

test('touch can move and fire together, and Space on a button retains its native action', () => {
  const f = started();
  const x = f.game.player.x;
  f.pad.find((button) => button.dataset.dir === 'left').emit('pointerdown', { pointerId: 1 });
  f.elements.get('touch-fire').emit('pointerdown', { pointerId: 2 });
  f.tick();
  assert.ok(f.game.player.x < x);
  assert.equal(f.game.bullets.filter((bullet) => bullet.owner === 'player').length, 1);
  const space = f.key('keydown', ' ', { target: f.elements.get('pause') });
  assert.equal(space.defaultPrevented, false);
});

test('boost counts only active play, refreshes when picked up again and clears on restart', () => {
  const f = started();
  const { game } = f;
  game.enemies.splice(0);
  f.click('pause');
  pickup(game, 'rapid');
  assert.equal(game.player.boost, 0);
  f.click('pause');
  pickup(game, 'rapid');
  assert.equal(game.player.boost, 5);
  game.update(0.5);
  f.click('pause');
  f.tick(6000);
  assert.equal(game.player.boost, 4.5);
  f.click('pause');
  pickup(game, 'rapid');
  assert.equal(game.player.boost, 5);
  const x = game.player.x;
  f.key('keydown', 'ArrowLeft');
  game.update(0.1);
  assert.equal(x - game.player.x, 24);
  f.click('restart');
  assert.equal(game.player.boost, 0);
  const normalX = game.player.x;
  f.key('keydown', 'ArrowLeft');
  game.update(0.1);
  assert.equal(normalX - game.player.x, 19.5);
});

test('boost expires after five seconds of active play', () => {
  const f = started();
  pickup(f.game, 'rapid');
  for (const enemy of f.game.enemies) enemy.fire = 10;
  for (let step = 0; step < 101; step++) f.game.update(0.05);
  assert.equal(f.game.player.boost, 0);
});

test('each wave spawns its full roster clear of walls, the player and other tanks', () => {
  const { game } = started();
  for (let wave = 1; wave <= 9; wave++) {
    // A player who reaches the spawn area during the wave break also blocks that spot.
    Object.assign(game.player, { x: 75, y: 35 });
    game.wave = wave;
    game.startWave();
    const isBossWave = wave % 3 === 0;
    assert.equal(game.enemies.length, Math.min(5 + wave * 2, 16) + Number(isBossWave));
    assert.equal(game.enemies.filter((enemy) => enemy.boss).length, Number(isBossWave));
    for (const [i, enemy] of game.enemies.entries()) {
      const obstacles = [game.player, ...game.walls, ...game.enemies.slice(0, i)];
      assert.ok(enemy.x >= 0 && enemy.x + enemy.w <= 960);
      assert.ok(enemy.y >= 0 && enemy.y + enemy.h <= 560);
      assert.ok(obstacles.every((other) => !game.overlap(enemy, other)), 'wave ' + wave);
    }
  }
});

test('enemy AI updates and tank movement rejects occupied space', () => {
  const { game } = started();
  const enemy = game.enemies[0];
  const y = enemy.y;
  enemy.turn = 10;
  game.update(0.02);
  assert.ok(enemy.y > y);
  const { player } = game;
  assert.equal(game.moveTank(player, 0, -30), false);
  Object.assign(enemy, { x: player.x - 30, y: player.y });
  assert.equal(game.moveTank(player, -10, 0), false);
  assert.equal(game.moveTank(player, 10, 0), true);
});

test('respawn avoids a tank at the usual player start', () => {
  const { game } = started();
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: game.player.x, y: game.player.y });
  game.player.x -= 50;
  game.loseLife();
  assert.equal(game.lives, 2);
  assert.equal(game.overlap(game.player, enemy), false);
  assert.equal(game.walls.some((wall) => game.overlap(game.player, wall)), false);
});

test('walls absorb shots and one bullet cannot hit multiple enemies', () => {
  const { game } = started();
  const wall = game.walls[0];
  const enemy = game.enemies[0];
  Object.assign(enemy, { x: wall.x + wall.w / 2, y: wall.y + 2 });
  game.bullets = [aimedBullet(enemy, 'player')];
  game.update(0);
  assert.equal(enemy.hp, 1);
  assert.equal(game.bullets.length, 0);
  Object.assign(enemy, { x: 300, y: 40 });
  const secondEnemy = game.enemies[1];
  Object.assign(secondEnemy, { x: 300, y: 40 });
  game.bullets = [aimedBullet(enemy, 'player')];
  game.update(0);
  assert.equal(game.enemies.length, 6);
  assert.equal(secondEnemy.hp, 1);
  assert.equal(game.score, 100);
  assert.equal(game.bullets.length, 0);
});

test('a fatal bullet stops repair, scoring and victory during the same update', () => {
  const f = started();
  const { game } = f;
  game.wave = 9;
  game.startWave();
  game.enemies.splice(0);
  game.update(0.02);
  game.update(1.59);
  game.lives = 1;
  const { x, y } = game.player;
  game.bullets = [aimedBullet(game.player)];
  game.pickups = [{ x, y, w: 16, h: 16, type: 'repair' }];
  game.update(0.02);
  assert.equal(game.lives, 0);
  assert.equal(game.score, 250);
  assert.equal(f.elements.get('overlay-title').textContent, '任务失败');
  game.update(2);
  assert.equal(f.elements.get('overlay-title').textContent, '任务失败');
});

test('a Boss takes multiple hits, earns points once, and the final wave can be won', () => {
  const f = started();
  const { game } = f;
  game.wave = 9;
  game.startWave();
  const boss = game.enemies.find((enemy) => enemy.boss);
  game.enemies.splice(0, game.enemies.length, boss);
  boss.turn = boss.fire = 10;
  const hit = aimedBullet(boss, 'player');
  game.bullets = [hit];
  game.update(0);
  assert.equal(boss.hp, boss.maxHp - 1);
  assert.equal(game.score, 0);
  game.bullets = Array.from({ length: boss.maxHp }, () => ({ ...hit }));
  game.update(0);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.score, 1250);
  assert.equal(f.storage.get('tankBattleBest'), '1250');
  game.update(1.61);
  assert.equal(f.elements.get('overlay-title').textContent, '战役胜利');
  assert.equal(game.score, 1250);
});

test('shield absorbs one hit and invulnerability expires in active play', () => {
  const { game } = started();
  pickup(game, 'shield');
  game.loseLife();
  assert.equal(game.player.shield, 0);
  game.loseLife();
  assert.equal(game.lives, 3);
  game.update(0.81);
  game.loseLife();
  assert.equal(game.lives, 2);
});

test('clearing a wave awards one bonus and discards leftover projectiles on transition', () => {
  const { game } = started();
  game.enemies.splice(0);
  game.update(0.02);
  assert.equal(game.score, 250);
  game.update(0.5);
  assert.equal(game.score, 250);
  game.bullets = [{ ...aimedBullet({ x: 0, y: 0 }), speed: 0 }];
  game.update(1.2);
  assert.equal(game.wave, 2);
  assert.equal(game.score, 250);
  assert.equal(game.bullets.length, 0);
});
