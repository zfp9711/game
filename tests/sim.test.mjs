import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STEP,
  applyUpgrade,
  botInput,
  chooseUpgrade,
  createGame,
  debugJumpToWave,
  getSummary,
  startRun,
  step,
} from '../src/sim.js';
import { BASE_MODIFIERS, ENEMY_TYPES, UPGRADES, WAVES, WORLD } from '../src/data.js';
import { SAVE_VERSION, defaultSave, recordRun, sanitize } from '../src/save.js';

function newRun(seed) {
  const g = createGame(seed);
  startRun(g, { seed });
  return g;
}

/** 让机器人玩一局；返回最终状态 */
function playBot(seed, seconds = 420) {
  const g = newRun(seed);
  const maxSteps = Math.round(seconds / STEP);
  const choices = [];
  for (let i = 0; i < maxSteps; i++) {
    if (g.mode === 'dead' || g.mode === 'won') break;
    if (g.mode === 'intermission') {
      choices.push(g.pendingUpgrades[0]);
      chooseUpgrade(g, 0);
      continue;
    }
    step(g, botInput(g), STEP);
  }
  return { game: g, choices };
}

function assertFiniteState(g) {
  const s = getSummary(g);
  for (const key of ['time', 'wave', 'waveElapsed']) {
    assert.ok(Number.isFinite(s[key]), `summary.${key} 不是有限数`);
  }
  assert.ok(Number.isFinite(g.player.x) && Number.isFinite(g.player.y), '玩家坐标 NaN');
  assert.ok(Number.isFinite(g.player.hp), '玩家血量 NaN');
  assert.ok(g.player.hp >= 0 && g.player.hp <= g.player.maxHp + 1e-6, '玩家血量越界');
  assert.ok(g.player.oil >= 0 && g.player.oil <= g.mods.oilMax + 1e-6, '灯油越界');
  assert.ok(g.fire.hp >= 0 && g.fire.hp <= g.fire.maxHp + 1e-6, '火堆血量越界');
  assert.ok(g.player.hp <= g.player.maxHp, '玩家血量超过上限');

  const fromCenter = Math.hypot(g.player.x - WORLD.cx, g.player.y - WORLD.cy);
  assert.ok(fromCenter <= WORLD.radius + 0.5, '玩家跑出场地');

  for (const e of g.enemies) {
    assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), '影子坐标 NaN');
    assert.ok(Number.isFinite(e.hp), '影子血量 NaN');
    assert.ok(e.hp > 0, '死影仍在数组里');
  }
  assert.ok(g.enemies.length < 400, '影子数量失控');
}

test('固定种子、相同输入 → 相同结果', () => {
  const a = newRun(20261120);
  const b = newRun(20261120);
  for (let i = 0; i < 1800; i++) {
    const inA = botInput(a);
    const inB = botInput(b);
    step(a, inA, STEP);
    step(b, inB, STEP);
    if (a.mode !== 'playing') break;
    if (a.mode === 'intermission') {
      chooseUpgrade(a, 0);
      chooseUpgrade(b, 0);
    }
  }
  assert.equal(JSON.stringify(getSummary(a)), JSON.stringify(getSummary(b)));

  const ea = a.enemies.map((e) => `${e.type}:${e.x.toFixed(4)}:${e.y.toFixed(4)}:${e.hp.toFixed(4)}`);
  const eb = b.enemies.map((e) => `${e.type}:${e.x.toFixed(4)}:${e.y.toFixed(4)}:${e.hp.toFixed(4)}`);
  assert.deepEqual(ea, eb);
});

test('多局机器人对战：状态始终合法', () => {
  for (const seed of [1, 7, 42, 991, 2026]) {
    const { game } = playBot(seed, 420);
    assertFiniteState(game);
    assert.ok(['dead', 'won', 'intermission', 'playing'].includes(game.mode));
  }
});

test('一整局不超过设计上限，并且能正常结束', () => {
  const { game } = playBot(4242, 900);
  assert.ok(game.mode === 'dead' || game.mode === 'won', `对局没有结束：${game.mode}`);
  assert.ok(getSummary(game).time < 900, '对局超时');
  assertFiniteState(game);
});

test('波次配置合法：类型存在、数量为正、影王只在终夜', () => {
  assert.equal(WAVES.length, 8);
  for (const [i, wave] of WAVES.entries()) {
    assert.ok(wave.name && wave.duration > 0, `第 ${i + 1} 夜缺名称或时长`);
    for (const g of wave.groups) {
      assert.ok(ENEMY_TYPES[g.type], `未知敌人类型 ${g.type}`);
      assert.ok(g.count > 0, '数量必须为正');
      assert.ok(g.to >= g.from, '时间区间反转');
      if (g.type === 'boss') assert.equal(i, WAVES.length - 1, '影王只能出现在终夜');
    }
  }
});

test('每一夜的生成计划与配置一致', () => {
  for (let i = 0; i < WAVES.length; i++) {
    const g = newRun(100 + i);
    debugJumpToWave(g, i);
    const expected = WAVES[i].groups.reduce((n, x) => n + x.count, 0);
    assert.equal(g.spawnPlan.length, expected, `第 ${i + 1} 夜生成数量不符`);
    assert.equal(g.waveIndex, i);
    assert.equal(g.mode, 'playing');
  }
});

test('影王会在终夜登场', () => {
  const g = newRun(9);
  debugJumpToWave(g, WAVES.length - 1);
  for (let i = 0; i < 180; i++) step(g, botInput(g), STEP);
  assert.ok(g.enemies.some((e) => e.boss) || g.warnings.some((w) => w.type === 'boss'), '影王没有出现');
});

test('所有遗物都能安全应用', () => {
  const ids = new Set();
  for (const u of UPGRADES) {
    assert.ok(!ids.has(u.id), `遗物 id 重复：${u.id}`);
    ids.add(u.id);
    assert.ok(u.name && u.desc, `${u.id} 缺文案`);

    const g = newRun(3);
    assert.equal(applyUpgrade(g, u.id), true);
    for (const [k, v] of Object.entries(g.mods)) {
      assert.ok(Number.isFinite(v), `${u.id} 让 ${k} 变成 ${v}`);
    }
    assert.ok(g.player.maxHp > 0 && g.fire.maxHp > 0);
    assert.ok(g.player.oil <= g.mods.oilMax + 1e-6);
  }
  assert.equal(applyUpgrade(newRun(1), 'not-a-real-upgrade'), false);
});

test('灯油耗尽后不能继续照射，并会被动回复', () => {
  const g = newRun(11);
  g.player.oil = 2;
  const input = { mx: 0, my: 0, firing: true, aimX: g.player.x + 100, aimY: g.player.y };
  let emptyAt = -1;
  for (let i = 0; i < 40; i++) {
    step(g, input, STEP);
    assert.ok(g.player.oil >= 0, '灯油变成负数');
    if (g.player.oil <= 0.001 && emptyAt < 0) emptyAt = i;
  }
  assert.ok(emptyAt >= 0, '灯油没有耗尽');
  step(g, input, STEP);
  assert.equal(g.player.firing, false, '没油了还在照射');
  const before = g.player.oil;
  for (let i = 0; i < 240; i++) step(g, { ...input, firing: false }, STEP);
  assert.ok(g.player.oil > before, '停止照射后灯油没有回复');
  assert.ok(g.player.oil <= g.mods.oilMax + 1e-6, '灯油超过上限');
});

test('存档：旧版本迁移、脏数据兜底、最佳记录只在更好时覆盖', () => {
  const v1 = { version: 1, best: { score: 120, wave: 3, time: 61, kills: 20, win: false } };
  const migrated = sanitize(v1);
  assert.equal(migrated.version, SAVE_VERSION);
  assert.equal(migrated.best.score, 120);
  assert.equal(migrated.settings.sound, true);

  const junk = sanitize({ version: 'wat', best: { score: -5, wave: 99 }, settings: null });
  assert.equal(junk.version, SAVE_VERSION);
  assert.equal(junk.best.score, 0);
  assert.equal(junk.best.wave, 8);

  assert.deepEqual(sanitize(null), defaultSave());

  const base = defaultSave();
  base.best.score = 300;
  const better = recordRun(base, { mode: 'won', stats: { score: 500, wave: 8, time: 320.4, kills: 100 } });
  assert.equal(better.best.score, 500);
  assert.equal(better.best.win, true);

  const worse = recordRun(better, { mode: 'dead', stats: { score: 100, wave: 2, time: 40, kills: 10 } });
  assert.equal(worse.best.score, 500);
});

test('通关记录优先于更高分的失败记录，失败不能覆盖通关', () => {
  const s = defaultSave();
  s.best = { score: 9000, wave: 8, time: 200, kills: 200, win: false };
  const won = recordRun(s, { mode: 'won', stats: { score: 1000, wave: 8, time: 230, kills: 150 } });
  assert.equal(won.best.win, true);
  assert.equal(won.best.score, 1000);

  const loss = recordRun(won, { mode: 'dead', stats: { score: 5000, wave: 8, time: 240, kills: 180 } });
  assert.equal(loss.best.score, 1000);
  assert.equal(loss.best.win, true);
});

test('默认数值可用，且场地半径与出生点自洽', () => {
  assert.ok(BASE_MODIFIERS.oilMax > 0);
  assert.ok(BASE_MODIFIERS.beamRange < WORLD.radius * 1.2);
  const g = newRun(5);
  const d = Math.hypot(g.player.x - WORLD.cx, g.player.y - WORLD.cy);
  assert.ok(d < WORLD.radius, '出生点在场地外');
  assert.equal(g.player.hp, g.player.maxHp);
  assert.equal(g.fire.hp, g.fire.maxHp);
});
