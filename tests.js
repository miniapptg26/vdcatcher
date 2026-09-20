'use strict';
const assert = require('assert');
const { CONFIG, GameCore } = require('./game.js');

let passed = 0;
function t(name, fn) { fn(); passed++; console.log('  ✓ ' + name); }

console.log('Тесты GameCore · ВЕЙП ДЕД ЖИЖА');
t('calculateLevel: 0 → 1', () => assert.strictEqual(GameCore.calculateLevel(0), 1));
t('calculateLevel: ровный шаг', () => assert.strictEqual(GameCore.calculateLevel(CONFIG.LEVEL_STEP), 2));
t('calculateLevel: высокая граница', () => assert.strictEqual(GameCore.calculateLevel(99999), 1 + Math.floor(99999 / CONFIG.LEVEL_STEP)));
t('spawnIntervalMs убывает и не ниже минимума', () => {
  assert.ok(GameCore.spawnIntervalMs(1) === CONFIG.START_SPAWN_MS);
  assert.ok(GameCore.spawnIntervalMs(50) >= CONFIG.MIN_SPAWN_MS);
  assert.ok(GameCore.spawnIntervalMs(50) <= CONFIG.START_SPAWN_MS);
});
t('fallSpeed растёт и ограничена', () => {
  assert.ok(GameCore.fallSpeed(1) === CONFIG.START_SPEED);
  assert.ok(GameCore.fallSpeed(99) <= CONFIG.MAX_SPEED);
  assert.ok(GameCore.fallSpeed(5) > GameCore.fallSpeed(2));
});
t('comboMultiplier: 0→1, рост, кап', () => {
  assert.strictEqual(GameCore.comboMultiplier(0), 1);
  assert.strictEqual(GameCore.comboMultiplier(4), 1);
  assert.strictEqual(GameCore.comboMultiplier(5), 1.5);
  assert.strictEqual(GameCore.comboMultiplier(100), CONFIG.COMBO_MAX_MULT);
});
t('roundScore не меньше 1 и округляет', () => {
  assert.strictEqual(GameCore.roundScore(0), 1);
  assert.strictEqual(GameCore.roundScore(10.4), 10);
  assert.strictEqual(GameCore.roundScore(10.6), 11);
});
t('collidesRectCircle: попадание и промах', () => {
  assert.ok(GameCore.collidesRectCircle(0, 0, 100, 80, 50, 40, 10));
  assert.ok(!GameCore.collidesRectCircle(0, 0, 100, 80, 200, 200, 10));
  assert.ok(GameCore.collidesRectCircle(0, 0, 100, 80, -9, 40, 10));
});
t('pickDrop на 1 уровне не даёт опасность', () => {
  let idx = 0;
  const seq = [0.001, 0.2, 0.5, 0.86, 0.95, 0.999];
  const rnd = () => seq[idx++ % seq.length];
  let sawDanger = false;
  for (let i = 0; i < 200; i++) {
    if (GameCore.pickDrop(rnd, 1).type === 'danger') sawDanger = true;
  }
  assert.ok(!sawDanger);
});
t('pickDrop на 5 уровне может дать опасность', () => {
  const drop = GameCore.pickDrop(() => 0.9, 5);
  assert.strictEqual(drop.type, 'danger');
});
t('pickDrop всегда возвращает валидный тип', () => {
  for (let i = 0; i < 500; i++) {
    const d = GameCore.pickDrop(Math.random, 3);
    assert.ok(['flavor', 'golden', 'danger', 'bonus'].includes(d.type));
    if (d.type === 'flavor') assert.ok(CONFIG.FLAVORS.includes(d.flavor));
    if (d.type === 'bonus') assert.ok(CONFIG.BONUSES.includes(d.bonus));
  }
});
t('сумма весов вкусов = flavor weight', () => {
  const sum = CONFIG.FLAVORS.reduce((a, f) => a + f.weight, 0);
  assert.strictEqual(sum, CONFIG.WEIGHTS.flavor);
});
console.log('ALL TESTS PASS (' + passed + ')');