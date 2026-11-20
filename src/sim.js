// 模拟层：纯逻辑 + 固定种子。不引用 DOM / Canvas / 音频。
// 每帧通过 state.events 抛出「发生了什么」，渲染与音频只消费事件。

import {
  BASE_MODIFIERS,
  ENEMY_TYPES,
  WAVES,
  UPGRADES,
  UPGRADE_BY_ID,
  WORLD,
  STEP,
} from './data.js';
import {
  TAU,
  angleDelta,
  clamp,
  dist,
  len,
  rand,
  randInt,
  randRange,
  shuffle,
  round1,
} from './util.js';

export { STEP };

const BOSS_ADD_INTERVAL = 9.5;
const PLAYER_START_RADIUS = 92;

export function createGame(seed = 1) {
  const state = {
    seed: seed >>> 0,
    rng: seed >>> 0,
    mode: 'menu',
    time: 0,
    demo: false,

    waveIndex: 0,
    waveElapsed: 0,
    spawnPlan: [],
    spawnCursor: 0,
    pendingUpgrades: [],
    takenUpgrades: [],

    enemies: [],
    warnings: [],
    embers: [],
    events: [],
    nextId: 1,

    mods: { ...BASE_MODIFIERS },
    player: {
      x: WORLD.cx,
      y: WORLD.cy + PLAYER_START_RADIUS,
      vx: 0,
      vy: 0,
      radius: 14,
      hp: 100,
      maxHp: 100,
      aim: -Math.PI / 2,
      oil: 100,
      regenDelay: 0,
      dashCd: 0,
      dashTime: 0,
      dashDirX: 0,
      dashDirY: -1,
      invuln: 0,
      firing: false,
      moving: false,
      step: 0,
      nearFire: false,
    },
    fire: {
      x: WORLD.cx,
      y: WORLD.cy,
      hp: 100,
      maxHp: 100,
      radius: BASE_MODIFIERS.fireRadius,
      pulse: 0,
    },
    stats: {
      kills: 0,
      score: 0,
      wave: 0,
      time: 0,
      embers: 0,
      fireHp: 100,
      playerHp: 100,
      reason: '',
    },
    ui: {
      shake: 0,
      hurt: 0,
      fireFlash: 0,
      dashFlash: 0,
      banner: 0,
      bannerText: '',
      lowOil: 0,
    },
    lastBeamEvent: -1,
    lastBurnEvent: -1,
    bossAddTimer: 0,
  };
  return state;
}

export function resetRun(state, seed = state.seed) {
  const fresh = createGame(seed);
  Object.assign(state, fresh, { mode: 'menu' });
  return state;
}

/** 开一局（也用于开始界的演示局） */
export function startRun(state, { demo = false, seed = state.seed } = {}) {
  resetRun(state, seed);
  state.demo = demo;
  state.mode = 'playing';
  state.stats.wave = 1;
  state.player.x = WORLD.cx;
  state.player.y = WORLD.cy + PLAYER_START_RADIUS;
  beginWave(state, 0);
  return state;
}

function beginWave(state, index) {
  state.waveIndex = index;
  state.waveElapsed = 0;
  state.spawnCursor = 0;
  state.bossAddTimer = 0;
  const wave = WAVES[index];
  state.spawnPlan = buildSpawnPlan(state, wave);
  state.stats.wave = index + 1;
  state.ui.banner = 2.2;
  state.ui.bannerText = wave.name;
  state.events.push({
    type: 'waveStart',
    wave: index + 1,
    name: wave.name,
    boss: wave.groups.some((g) => g.type === 'boss'),
  });
}

function buildSpawnPlan(state, wave) {
  const plan = [];
  for (const g of wave.groups) {
    const span = Math.max(0, g.to - g.from);
    for (let i = 0; i < g.count; i++) {
      const base = g.count === 1 ? g.from : g.from + (span * i) / (g.count - 1);
      plan.push({
        t: Math.max(0, base + randRange(state, -0.35, 0.35)),
        type: g.type,
      });
    }
  }
  plan.sort((a, b) => a.t - b.t);
  return plan;
}

export function chooseUpgrade(state, index) {
  if (state.mode !== 'intermission') return false;
  const id = state.pendingUpgrades[index];
  if (!id) return false;
  applyUpgrade(state, id);
  state.pendingUpgrades = [];
  state.mode = 'playing';
  beginWave(state, state.waveIndex + 1);
  return true;
}

export function applyUpgrade(state, id) {
  const upgrade = UPGRADE_BY_ID.get(id);
  if (!upgrade) return false;
  upgrade.apply(state.mods, state.player, state.fire);
  state.takenUpgrades.push(id);
  state.events.push({ type: 'upgrade', id, name: upgrade.name });
  return true;
}

/** 固定步长推进一步。input: {mx,my,firing,aimX,aimY,dash} */
export function step(state, input, dt = STEP) {
  state.events.length = 0;
  if (state.mode !== 'playing') return state;

  const { player: p, fire: f, mods: m, ui } = state;
  state.time += dt;
  state.stats.time = state.time;
  state.waveElapsed += dt;

  decayUi(ui, dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.dashTime = Math.max(0, p.dashTime - dt);
  f.pulse += dt;

  updatePlayer(state, input, dt);
  updateBeam(state, dt);
  updateEnemies(state, dt);
  updateEmbers(state, dt);
  updateWarnings(state, dt);
  spawnFromPlan(state);
  updateBossAdds(state, dt);
  checkWaveClear(state);
  checkLose(state);

  state.stats.fireHp = Math.ceil(f.hp);
  state.stats.playerHp = Math.ceil(p.hp);
  return state;
}

function decayUi(ui, dt) {
  ui.shake = Math.max(0, ui.shake - dt * 26);
  ui.hurt = Math.max(0, ui.hurt - dt * 2.2);
  ui.fireFlash = Math.max(0, ui.fireFlash - dt * 2.4);
  ui.dashFlash = Math.max(0, ui.dashFlash - dt * 5);
  ui.banner = Math.max(0, ui.banner - dt);
  ui.lowOil = Math.max(0, ui.lowOil - dt);
}

function updatePlayer(state, input, dt) {
  const { player: p, mods: m, fire: f } = state;

  let mx = Number(input.mx) || 0;
  let my = Number(input.my) || 0;
  const mlen = len(mx, my);
  if (mlen > 1) {
    mx /= mlen;
    my /= mlen;
  }

  // 瞄准：鼠标位置或自动索敌
  if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
    const dx = input.aimX - p.x;
    const dy = input.aimY - p.y;
    if (dx * dx + dy * dy > 9) p.aim = Math.atan2(dy, dx);
  }
  p.moving = mlen > 0.08;

  // 冲刺
  if (input.dash && p.dashCd <= 0 && p.dashTime <= 0) {
    let dx = mx;
    let dy = my;
    if (len(dx, dy) < 0.1) {
      dx = Math.cos(p.aim);
      dy = Math.sin(p.aim);
    }
    const n = len(dx, dy) || 1;
    p.dashDirX = dx / n;
    p.dashDirY = dy / n;
    p.dashTime = m.dashTime;
    p.dashCd = m.dashCooldown;
    p.invuln = Math.max(p.invuln, m.dashInvuln);
    state.ui.dashFlash = 1;
    state.events.push({ type: 'dash', x: p.x, y: p.y, angle: p.aim });
  }

  if (p.dashTime > 0) {
    p.vx = p.dashDirX * m.dashSpeed;
    p.vy = p.dashDirY * m.dashSpeed;
  } else {
    const rate = p.moving ? 17 : 22;
    p.vx += (mx * m.moveSpeed - p.vx) * (1 - Math.exp(-rate * dt));
    p.vy += (my * m.moveSpeed - p.vy) * (1 - Math.exp(-rate * dt));
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // 冲刺穿过影群时持续灼烧（总量固定，不随帧率变化）
  if (p.dashTime > 0) dashHit(state, dt);

  // 限制在场地圆内
  const ddx = p.x - WORLD.cx;
  const ddy = p.y - WORLD.cy;
  const dd = len(ddx, ddy);
  const maxR = WORLD.radius - p.radius - 6;
  if (dd > maxR) {
    p.x = WORLD.cx + (ddx / dd) * maxR;
    p.y = WORLD.cy + (ddy / dd) * maxR;
    const dot = (p.vx * ddx + p.vy * ddy) / dd;
    if (dot > 0) {
      p.vx -= (dot * ddx) / dd;
      p.vy -= (dot * ddy) / dd;
    }
  }

  p.step += len(p.vx, p.vy) * dt * 0.055;

  // 火堆旁回血
  const df = dist(p.x, p.y, f.x, f.y);
  p.nearFire = df < m.playerRegenRadius;
  if (p.nearFire) p.hp = Math.min(p.maxHp, p.hp + m.playerRegenNearFire * dt);

  // 灯油
  p.firing = false;
  if (input.firing && p.oil > 0.001) {
    p.firing = true;
    p.oil = Math.max(0, p.oil - m.oilCost * dt);
    p.regenDelay = m.oilRegenDelay;
    if (p.oil <= 0.001) {
      state.ui.lowOil = 1;
      state.events.push({ type: 'oilEmpty', x: p.x, y: p.y });
    }
    if (p.oil < 22 && state.time - state.lastBurnEvent > 0.7) {
      state.lastBurnEvent = state.time;
      state.events.push({ type: 'lowOil' });
    }
  } else {
    p.regenDelay = Math.max(0, p.regenDelay - dt);
    if (p.regenDelay <= 0) p.oil = Math.min(m.oilMax, p.oil + m.oilRegen * dt);
  }
}

function dashHit(state, dt) {
  const { player: p, mods: m } = state;
  const share = clamp(dt / Math.max(m.dashTime, 0.01), 0, 1);
  for (const e of state.enemies) {
    if (e.dead) continue;
    if (dist(p.x, p.y, e.x, e.y) < m.dashRadius + e.radius) {
      damageEnemy(state, e, m.dashDamage * share, 'dash');
      e.knockX += p.dashDirX * 900 * dt;
      e.knockY += p.dashDirY * 900 * dt;
      e.burnTimer = Math.max(e.burnTimer, m.burnDuration * 0.6);
      e.burnDps = Math.max(e.burnDps, m.burnDps);
    }
  }
}

function updateBeam(state, dt) {
  const { player: p, mods: m } = state;
  if (!p.firing) return;

  const ox = p.x + Math.cos(p.aim) * 15;
  const oy = p.y + Math.sin(p.aim) * 15 - 4;
  let hitAny = false;

  for (const e of state.enemies) {
    if (e.dead) continue;
    const dx = e.x - ox;
    const dy = e.y - oy;
    const d = len(dx, dy);
    if (d > m.beamRange + e.radius) continue;
    const spread = Math.abs(angleDelta(Math.atan2(dy, dx), p.aim));
    const pad = Math.asin(clamp(e.radius / Math.max(1, d), 0, 0.9));
    if (spread > m.beamHalfAngle + pad) continue;

    const falloff = 1 - 0.42 * clamp((d - 50) / m.beamRange, 0, 1);
    const dmg = m.beamDps * falloff * dt;
    damageEnemy(state, e, dmg, 'beam');
    e.burnTimer = Math.max(e.burnTimer, m.burnDuration);
    e.burnDps = Math.max(e.burnDps, m.burnDps);
    e.slowTimer = 0.14;
    e.slowFactor = Math.max(e.slowFactor, m.beamSlow);
    e.knockX += (dx / (d || 1)) * m.beamKnockback * dt;
    e.knockY += (dy / (d || 1)) * m.beamKnockback * dt;
    hitAny = true;
  }

  if (hitAny && state.time - state.lastBeamEvent > 0.09) {
    state.lastBeamEvent = state.time;
    state.events.push({
      type: 'beamHit',
      x: ox + Math.cos(p.aim) * Math.min(m.beamRange * 0.6, 160),
      y: oy + Math.sin(p.aim) * Math.min(m.beamRange * 0.6, 160),
    });
  }
}

function damageEnemy(state, e, amount, source) {
  if (e.dead) return;
  e.hp -= amount;
  // 持续光束/灼烧不刷白闪，否则 Boss 会一直是一团白光
  if (source === 'dash' || source === 'beamBurst' || amount > 12) {
    e.flash = Math.max(e.flash, 0.12);
  }
  e.lastSource = source;
  if (e.hp <= 0) killEnemy(state, e);
}

function killEnemy(state, e) {
  if (e.dead) return;
  e.dead = true;
  state.stats.kills += 1;
  state.stats.score += e.score;
  state.events.push({
    type: 'kill',
    x: e.x,
    y: e.y,
    boss: !!e.boss,
    kind: e.type,
    radius: e.radius,
  });
  if (e.boss) {
    state.mode = 'won';
    state.stats.score += Math.round(state.fire.hp * 4) + 600;
    state.events.push({ type: 'win', score: state.stats.score });
    return;
  }
  const count = e.embers;
  for (let i = 0; i < count; i++) {
    const a = rand(state) * TAU;
    const sp = randRange(state, 18, 70);
    state.embers.push({
      x: e.x + Math.cos(a) * (e.radius * 0.4),
      y: e.y + Math.sin(a) * (e.radius * 0.4),
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 12,
      value: state.mods.emberOil,
      age: 0,
      life: 24,
      phase: rand(state) * TAU,
      dead: false,
    });
  }
}

function updateEnemies(state, dt) {
  const { player: p, fire: f, mods: m } = state;
  const alive = [];

  for (const e of state.enemies) {
    if (e.dead) continue;
    e.flash = Math.max(0, e.flash - dt * 6);
    e.showHp = Math.max(0, e.showHp - dt);
    e.phase += dt * e.wobble;
    e.knockX *= Math.exp(-7 * dt);
    e.knockY *= Math.exp(-7 * dt);

    // 灼烧
    if (e.burnTimer > 0) {
      e.burnTimer -= dt;
      damageEnemy(state, e, e.burnDps * dt, 'burn');
      if (e.dead) {
        state.events.push({ type: 'burnTick', x: e.x, y: e.y });
        continue;
      }
    }

    // 火堆光晕减速与灼伤
    const dFire = dist(e.x, e.y, f.x, f.y);
    const inFireLight = dFire < f.radius * 0.9;
    let slow = 0;
    if (inFireLight) {
      slow = Math.max(slow, m.fireSlow);
      damageEnemy(state, e, m.fireLightDps * dt, 'firelight');
      if (e.dead) {
        state.events.push({ type: 'burnTick', x: e.x, y: e.y });
        continue;
      }
    }
    if (e.slowTimer > 0) {
      e.slowTimer -= dt;
      slow = Math.max(slow, e.slowFactor);
    }
    e.slowFactor = Math.max(0, e.slowFactor - dt * 0.5);

    // 选目标：离得近的玩家会抢仇恨
    let tx = f.x;
    let ty = f.y;
    const dPlayer = dist(e.x, e.y, p.x, p.y);
    if (!e.boss && dPlayer < 165 && dPlayer < dFire) {
      tx = p.x;
      ty = p.y;
    }

    let dx = tx - e.x;
    let dy = ty - e.y;
    const d = len(dx, dy) || 1;
    dx /= d;
    dy /= d;

    const wob = Math.sin(e.phase) * (e.type === 'runner' ? 26 : 13);
    const speed = e.speed * (1 - slow);
    e.x += (dx * speed - dy * wob) * dt + e.knockX * dt;
    e.y += (dy * speed + dx * wob) * dt + e.knockY * dt;

    // 敌人之间简单分离，避免叠成一坨
    e.x = clamp(e.x, -40, WORLD.w + 40);
    e.y = clamp(e.y, -40, WORLD.h + 40);

    // 扑火
    const fireReach = f.radius * 0.42 + e.radius;
    if (dFire < fireReach) {
      if (e.boss) {
        e.attackCd = (e.attackCd || 0) - dt;
        if (e.attackCd <= 0) {
          e.attackCd = 2.6;
          damageFire(state, e.fireDamage);
          state.events.push({ type: 'bossAttack', x: f.x, y: f.y });
        }
      } else {
        damageFire(state, e.fireDamage);
        e.dead = true;
        state.events.push({ type: 'fireConsume', x: e.x, y: e.y, radius: e.radius, kind: e.type });
        continue;
      }
    }

    // 撞人
    if (p.invuln <= 0 && dPlayer < p.radius + e.radius) {
      damagePlayer(state, e.playerDamage, e);
    }

    alive.push(e);
  }

  state.enemies = alive;
  separateEnemies(state);
}

function separateEnemies(state) {
  const list = state.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.radius + b.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = ((min - d) / d) * 0.5;
        const w = a.boss ? 0.15 : 1;
        const w2 = b.boss ? 0.15 : 1;
        a.x -= dx * push * w;
        a.y -= dy * push * w;
        b.x += dx * push * w2;
        b.y += dy * push * w2;
      }
    }
  }
}

function damageFire(state, amount) {
  const { fire: f, mods: m, ui } = state;
  const dmg = amount * (1 - m.fireResist);
  f.hp = Math.max(0, f.hp - dmg);
  ui.fireFlash = 1;
  ui.shake = Math.max(ui.shake, Math.min(14, 4 + dmg * 0.35));
  state.events.push({ type: 'fireHit', amount: round1(dmg) });
}

function damagePlayer(state, amount, enemy) {
  const { player: p, ui } = state;
  if (p.invuln > 0) return;
  p.hp = Math.max(0, p.hp - amount);
  p.invuln = state.mods.playerInvuln;
  ui.hurt = 1;
  ui.shake = Math.max(ui.shake, 9);
  const dx = p.x - enemy.x;
  const dy = p.y - enemy.y;
  const d = len(dx, dy) || 1;
  p.vx += (dx / d) * 260;
  p.vy += (dy / d) * 260;
  state.events.push({ type: 'playerHit', x: p.x, y: p.y, amount: round1(amount) });
}

function updateEmbers(state, dt) {
  const { player: p, mods: m } = state;
  const out = [];
  for (const em of state.embers) {
    if (em.dead) continue;
    em.age += dt;
    if (em.age > em.life) continue;

    const dx = p.x - em.x;
    const dy = p.y - em.y;
    const d = len(dx, dy) || 1;
    const pull = d < m.emberRadius;
    if (pull) {
      const force = 900 * (1 - d / m.emberRadius);
      em.vx += (dx / d) * force * dt;
      em.vy += (dy / d) * force * dt;
    }
    em.vx *= Math.exp(-2.4 * dt);
    em.vy *= Math.exp(-2.4 * dt);
    em.x += em.vx * dt;
    em.y += em.vy * dt;
    em.x = clamp(em.x, 24, WORLD.w - 24);
    em.y = clamp(em.y, 24, WORLD.h - 24);

    if (d < 22) {
      em.dead = true;
      p.oil = Math.min(m.oilMax, p.oil + em.value);
      state.stats.embers += 1;
      state.events.push({ type: 'ember', x: em.x, y: em.y, value: em.value });
      continue;
    }
    out.push(em);
  }
  state.embers = out;
}

function updateWarnings(state, dt) {
  const out = [];
  for (const w of state.warnings) {
    w.timer -= dt;
    if (w.timer <= 0) {
      spawnEnemy(state, w.type, w.x, w.y);
    } else {
      out.push(w);
    }
  }
  state.warnings = out;
}

function spawnFromPlan(state) {
  const plan = state.spawnPlan;
  while (state.spawnCursor < plan.length && plan[state.spawnCursor].t <= state.waveElapsed) {
    const item = plan[state.spawnCursor++];
    const spot = pickSpawnSpot(state, item.type === 'boss' ? 330 : 0);
    state.warnings.push({ x: spot.x, y: spot.y, type: item.type, timer: item.type === 'boss' ? 1.4 : 0.7 });
  }
}

function pickSpawnSpot(state, minRing = 0) {
  const { player: p } = state;
  let best = null;
  for (let i = 0; i < 10; i++) {
    const a = rand(state) * TAU;
    const r = 342 + rand(state) * 46 + minRing * 0.2;
    const x = WORLD.cx + Math.cos(a) * r;
    const y = WORLD.cy + Math.sin(a) * r;
    const d = dist(x, y, p.x, p.y);
    if (d > 150) return { x, y };
    if (!best || d > best.d) best = { x, y, d };
  }
  return best || { x: WORLD.cx, y: WORLD.cy - 300 };
}

function spawnEnemy(state, type, x, y) {
  const def = ENEMY_TYPES[type];
  // 波次成长：普通影子随夜晚变强，影王用固定值
  const ramp = def.boss ? 1 : 1 + state.waveIndex * 0.11;
  state.enemies.push({
    id: state.nextId++,
    type,
    boss: !!def.boss,
    x,
    y,
    radius: def.radius,
    hp: def.hp * ramp,
    maxHp: def.hp * ramp,
    speed: def.speed * (def.boss ? 1 : 1 + state.waveIndex * 0.025),
    fireDamage: def.fireDamage * (def.boss ? 1 : 1 + state.waveIndex * 0.03),
    playerDamage: def.playerDamage,
    score: def.score,
    embers: def.embers,
    body: def.body,
    rim: def.rim,
    eye: def.eye,
    wobble: def.wobble,
    phase: rand(state) * TAU,
    burnTimer: 0,
    burnDps: 0,
    slowTimer: 0,
    slowFactor: 0,
    knockX: 0,
    knockY: 0,
    flash: 0,
    showHp: 0,
    attackCd: 1,
    dead: false,
  });
  state.events.push({ type: 'spawn', x, y, boss: !!def.boss });
}

function updateBossAdds(state, dt) {
  const boss = state.enemies.find((e) => e.boss);
  if (!boss) return;
  state.bossAddTimer -= dt;
  if (state.bossAddTimer > 0) return;
  state.bossAddTimer = BOSS_ADD_INTERVAL;
  for (let i = 0; i < 2; i++) {
    const type = rand(state) < 0.6 ? 'crawler' : 'runner';
    const a = rand(state) * TAU;
    const r = 120 + rand(state) * 60;
    const x = clamp(boss.x + Math.cos(a) * r, 40, WORLD.w - 40);
    const y = clamp(boss.y + Math.sin(a) * r, 40, WORLD.h - 40);
    spawnEnemy(state, type, x, y);
  }
  state.events.push({ type: 'bossSummon', x: boss.x, y: boss.y });
}

function checkWaveClear(state) {
  if (state.mode !== 'playing') return;
  if (state.spawnCursor < state.spawnPlan.length) return;
  if (state.warnings.length > 0) return;
  if (state.enemies.length > 0) return;
  if (state.waveElapsed < 1.2) return;

  const isLast = state.waveIndex >= WAVES.length - 1;
  if (isLast) {
    state.mode = 'won';
    state.stats.score += 400;
    state.events.push({ type: 'win', score: state.stats.score });
    return;
  }

  state.stats.score += 80 + state.waveIndex * 60;
  state.mode = 'intermission';
  state.pendingUpgrades = rollUpgrades(state);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 14);
  state.fire.hp = Math.min(state.fire.maxHp, state.fire.hp + 10);
  state.player.oil = state.mods.oilMax;
  state.events.push({
    type: 'waveClear',
    wave: state.waveIndex + 1,
    score: state.stats.score,
  });
}

function rollUpgrades(state) {
  const pool = shuffle(state, UPGRADES);
  // 尽量不重复提供最近拿过的
  const fresh = pool.filter((u) => !state.takenUpgrades.includes(u.id));
  const source = fresh.length >= 3 ? fresh : pool;
  return source.slice(0, 3).map((u) => u.id);
}

function checkLose(state) {
  if (state.mode !== 'playing') return;
  if (state.fire.hp <= 0) {
    state.stats.reason = 'fire';
    state.mode = 'dead';
    state.events.push({ type: 'lose', reason: 'fire' });
  } else if (state.player.hp <= 0) {
    state.stats.reason = 'player';
    state.mode = 'dead';
    state.events.push({ type: 'lose', reason: 'player' });
  }
}

/** 供自动演示 / 自动化测试使用的机器人输入（不参与纯模拟） */
export function botInput(state) {
  const { player: p, fire: f } = state;
  let best = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (e.dead) continue;
    const d = dist(p.x, p.y, e.x, e.y);
    const toFire = dist(e.x, e.y, f.x, f.y);
    const weight = (d * 0.7 + toFire * 0.9) * (e.boss ? 0.55 : 1);
    if (weight < bestD) {
      bestD = weight;
      best = e;
    }
  }
  if (!best) {
    return { mx: 0, my: 0, firing: false, aimX: p.x, aimY: p.y - 100, dash: false };
  }

  // 站在火与敌人之间，保持中距离
  const ex = best.x - f.x;
  const ey = best.y - f.y;
  const el = len(ex, ey) || 1;
  const holdX = f.x + (ex / el) * Math.min(150, el * 0.55);
  const holdY = f.y + (ey / el) * Math.min(150, el * 0.55);
  let mx = holdX - p.x;
  let my = holdY - p.y;
  const ml = len(mx, my);
  if (ml > 12) {
    mx /= ml;
    my /= ml;
  } else {
    mx = 0;
    my = 0;
  }

  const near = bestD < 74;
  return {
    mx,
    my,
    firing: p.oil > 12 || bestD < 90,
    aimX: best.x,
    aimY: best.y,
    dash: near && p.dashCd <= 0,
  };
}

/** 调试 / 演示用：直接跳到第 n 夜，并按进度补上随机遗物 */
export function debugJumpToWave(state, index) {
  state.mode = 'playing';
  state.enemies.length = 0;
  state.warnings.length = 0;
  state.embers.length = 0;
  state.pendingUpgrades = [];
  state.mods = { ...BASE_MODIFIERS };
  state.takenUpgrades = [];
  state.player.maxHp = state.mods.playerMaxHp;
  state.fire.maxHp = state.mods.fireMaxHp;

  const idx = clamp(Math.round(index), 0, WAVES.length - 1);
  const pool = shuffle(state, UPGRADES);
  for (let i = 0; i < idx; i++) {
    applyUpgrade(state, pool[i % pool.length].id);
  }

  state.player.hp = state.player.maxHp;
  state.player.oil = state.mods.oilMax;
  state.fire.hp = state.fire.maxHp;
  state.fire.radius = state.mods.fireRadius;
  state.stats.kills = 0;
  state.stats.score = 0;
  state.stats.embers = 0;
  state.time = 0;
  state.lastBeamEvent = -1;
  beginWave(state, idx);
  return state;
}

/** 状态摘要：给 render_game_to_text / 自动化验收用 */export function getSummary(state) {
  const p = state.player;
  const f = state.fire;
  return {
    mode: state.mode,
    demo: state.demo,
    time: round1(state.time),
    wave: state.waveIndex + 1,
    waveTotal: WAVES.length,
    waveName: WAVES[Math.min(state.waveIndex, WAVES.length - 1)].name,
    waveElapsed: round1(state.waveElapsed),
    player: {
      x: Math.round(p.x),
      y: Math.round(p.y),
      hp: Math.round(p.hp),
      maxHp: Math.round(p.maxHp),
      oil: Math.round(p.oil),
      maxOil: Math.round(state.mods.oilMax),
      firing: p.firing,
      dashing: p.dashTime > 0,
      dashCd: round1(p.dashCd),
    },
    fire: { hp: Math.round(f.hp), maxHp: Math.round(f.maxHp) },
    enemies: state.enemies.length,
    warnings: state.warnings.length,
    embers: state.embers.length,
    kills: state.stats.kills,
    score: state.stats.score,
    takenUpgrades: state.takenUpgrades.slice(),
    pendingUpgrades: state.pendingUpgrades.slice(),
    stats: { ...state.stats },
    note: 'origin top-left, +y down; world 1280x800',
  };
}
