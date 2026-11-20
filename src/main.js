// 入口：把输入、模拟、渲染、音频、存档接起来。
// 验收钩子：window.render_game_to_text() / window.advanceTime(ms)

import { UPGRADE_BY_ID, WAVES } from './data.js';
import {
  STEP,
  botInput,
  chooseUpgrade,
  createGame,
  debugJumpToWave,
  getSummary,
  startRun,
  step,
} from './sim.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { loadSave, recordRun, writeSave } from './save.js';
import { clamp, dist, formatTime } from './util.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const fx = createRenderer(canvas);
const sfx = createAudio();

let save = loadSave();
const game = createGame(randomSeed());

let paused = false;
let autoBot = false;
let dashRequest = false;
let upgradeShown = false;
let shownEnd = false;
let qaRun = false;
let endDelay = 0;
let demoDelay = 0;
let hintTimer = 0;

const mouse = { x: 0, y: 0, down: false, moved: false };
const keys = Object.create(null);
const touches = new Map();

const screens = ['screen-start', 'screen-upgrade', 'screen-pause', 'screen-end', 'screen-help'];
const hud = $('hud');
const banner = $('banner');
const hint = $('hint');

function randomSeed() {
  return ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) || 1;
}

/* ---------------- 界面切换 ---------------- */

function showScreen(id) {
  for (const s of screens) {
    const el = $(s);
    if (el) el.classList.toggle('is-hidden', s !== id);
  }
}

function showHud(on) {
  hud.classList.toggle('is-hidden', !on);
  hud.setAttribute('aria-hidden', on ? 'false' : 'true');
}

function backToMenu() {
  paused = false;
  autoBot = false;
  upgradeShown = false;
  shownEnd = false;
  endDelay = 0;
  mouse.down = false;
  sfx.setSilent(true);
  sfx.setTension(0);
  startRun(game, { demo: true, seed: randomSeed() });
  fx.clearDecals();
  showHud(false);
  showScreen('screen-start');
  updateBestLine();
}

function startGame() {
  sfx.unlock();
  sfx.setEnabled(save.settings.sound);
  sfx.setSilent(false);
  paused = false;
  autoBot = false;
  qaRun = false;
  upgradeShown = false;
  shownEnd = false;
  endDelay = 0;
  dashRequest = false;
  mouse.down = false;
  startRun(game, { demo: false, seed: randomSeed() });
  fx.clearDecals();
  showScreen(null);
  showHud(true);
  hint.classList.remove('fade');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint.classList.add('fade'), 14000);
}

function togglePause() {
  if (game.demo || shownEnd) return;
  if (game.mode !== 'playing' && !paused) return;
  paused = !paused;
  mouse.down = false;
  if (paused) {
    showScreen('screen-pause');
    syncSettingsUi();
  } else {
    showScreen(null);
  }
}

function showUpgrade() {
  upgradeShown = true;
  const ids = game.pendingUpgrades;
  const wrap = $('cards');
  wrap.innerHTML = '';
  ids.forEach((id, i) => {
    const u = UPGRADE_BY_ID.get(id);
    if (!u) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.innerHTML = `
      <span class="idx">遗物 ${i + 1}</span>
      <span class="name">${u.name}</span>
      <span class="desc">${u.desc}</span>
      <span class="mark">${'一二三'[i] || ''}</span>
    `;
    btn.addEventListener('click', () => pickUpgrade(i));
    wrap.appendChild(btn);
  });
  $('up-wave').textContent = String(game.waveIndex + 1);
  showHud(true);
  showScreen('screen-upgrade');
  sfx.setTension(0);
}

function pickUpgrade(index) {
  if (game.mode !== 'intermission') return;
  if (!chooseUpgrade(game, index)) return;
  fx.onEvents(game.events, game);
  sfx.onEvents(game.events, game);
  upgradeShown = false;
  showScreen(null);
  showHud(true);
  sfx.setTension(1);
}

function showEnd() {
  shownEnd = true;
  const s = getSummary(game);
  if (!qaRun) {
    save = recordRun(save, s);
    writeSave(save);
  }

  const won = s.mode === 'won';
  $('end-eyebrow').textContent = won ? '守到了天亮' : `倒在第 ${s.stats.wave} 夜`;
  $('end-title').textContent = won ? '天亮了' : s.stats.reason === 'player' ? '灯灭了' : '火熄了';
  $('end-sub').textContent = won
    ? '火还在烧。影子退回林子里，今晚没有人再失去光。'
    : s.stats.reason === 'player'
      ? '你倒在自己的光里。火堆还在，但没有人替它挡风了。'
      : '影子漫过了最后一点光。下次，别让它们靠得这么近。';

  $('end-wave').textContent = `第 ${s.stats.wave} 夜`;
  $('end-kills').textContent = String(s.stats.kills);
  $('end-time').textContent = formatTime(s.stats.time);
  $('end-score').textContent = String(s.stats.score);
  updateBestLine();
  $('end-best').textContent = bestText();
  showHud(false);
  showScreen('screen-end');
  sfx.setTension(0);
  mouse.down = false;
}

function bestText() {
  const b = save.best;
  if (!b || b.wave <= 0) return '最佳记录：尚无';
  const win = b.win ? ' · 通关' : '';
  return `最佳记录：第 ${b.wave} 夜 · ${formatTime(b.time)} · ${b.score} 分${win}`;
}

function updateBestLine() {
  $('best-line').textContent = bestText();
}

function syncSettingsUi() {
  for (const [id, key] of [
    ['set-sound', 'sound'],
    ['set-sound-2', 'sound'],
    ['set-shake', 'shake'],
    ['set-shake-2', 'shake'],
    ['set-motion', 'reducedMotion'],
  ]) {
    const el = $(id);
    if (el) el.checked = !!save.settings[key];
  }
}

function bindSetting(id, key) {
  const el = $(id);
  if (!el) return;
  el.checked = !!save.settings[key];
  el.addEventListener('change', () => {
    save.settings[key] = el.checked;
    if (key === 'sound') {
      sfx.setEnabled(el.checked);
      if (el.checked) sfx.unlock();
    }
    writeSave(save);
    syncSettingsUi();
  });
}

/* ---------------- 主循环 ---------------- */

function tick(dt) {
  if (game.demo) {
    if (game.mode === 'playing') {
      step(game, botInput(game), dt);
      fx.onEvents(game.events, game);
      sfx.setFiring(false);
    } else if (game.mode === 'intermission') {
      demoDelay += dt;
      if (demoDelay > 1.1) {
        demoDelay = 0;
        chooseUpgrade(game, 0);
      }
    } else {
      demoDelay += dt;
      if (demoDelay > 2.6) {
        demoDelay = 0;
        startRun(game, { demo: true, seed: randomSeed() });
        fx.clearDecals();
      }
    }
    return;
  }

  if (paused) return;

  step(game, autoBot ? botInput(game) : readInput(), dt);
  fx.onEvents(game.events, game);
  sfx.onEvents(game.events, game);
  sfx.setFiring(game.player.firing);

  if (game.mode === 'intermission' && !upgradeShown) {
    showUpgrade();
    sfx.setFiring(false);
  }

  if ((game.mode === 'dead' || game.mode === 'won') && !shownEnd) {
    endDelay += dt;
    if (endDelay > 0.9) showEnd();
  }
}

let last = performance.now();
let acc = 0;
let hudClock = 0;

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;

  if (!paused && !shownEnd) {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      tick(STEP);
      acc -= STEP;
    }
    if (guard >= 8) acc = 0;
  }

  sfx.update();
  fx.render(game, dt, {
    reducedMotion: save.settings.reducedMotion,
    shake: save.settings.shake,
  });

  hudClock += dt;
  if (hudClock > 0.08) {
    hudClock = 0;
    updateHud();
    updateTension();
  }

  requestAnimationFrame(frame);
}

/* ---------------- HUD ---------------- */

const waveDots = [];
(function buildDots() {
  const wrap = $('wave-dots');
  for (let i = 0; i < WAVES.length; i++) {
    const d = document.createElement('i');
    wrap.appendChild(d);
    waveDots.push(d);
  }
})();

let lastBanner = '';

function updateHud() {
  const s = getSummary(game);
  const p = s.player;
  const f = s.fire;

  setBar($('fire-bar'), f.hp / f.maxHp, f.hp / f.maxHp < 0.35);
  setBar($('hp-bar'), p.hp / p.maxHp, p.hp / p.maxHp < 0.3);
  setBar($('oil-bar'), p.oil / p.maxOil, p.oil / p.maxOil < 0.18);
  $('fire-num').textContent = String(f.hp);
  $('hp-num').textContent = String(p.hp);
  $('oil-num').textContent = String(p.oil);

  $('wave-name').textContent = s.waveName;
  $('wave-count').textContent = `${s.wave} / ${s.waveTotal}`;
  $('score').textContent = String(s.score);
  $('kills').textContent = String(s.kills);
  $('timer').textContent = formatTime(s.time);

  for (let i = 0; i < waveDots.length; i++) {
    waveDots[i].classList.toggle('on', i < s.wave - 1);
    waveDots[i].classList.toggle('now', i === s.wave - 1);
  }

  const wantBanner = game.ui.banner > 0 ? game.ui.bannerText : '';
  if (wantBanner !== lastBanner) {
    lastBanner = wantBanner;
    banner.textContent = wantBanner;
    banner.classList.toggle('show', !!wantBanner);
    banner.classList.toggle('boss', wantBanner === '终夜');
  } else if (wantBanner) {
    banner.classList.add('show');
  }
  if (!wantBanner) banner.classList.remove('show');
}

function setBar(el, ratio, low) {
  const w = `${clamp(ratio, 0, 1) * 100}%`;
  if (el.style.width !== w) el.style.width = w;
  el.classList.toggle('low', !!low);
}

function updateTension() {
  if (game.demo || game.mode !== 'playing') {
    sfx.setTension(0);
    return;
  }
  const low = game.fire.hp / game.fire.maxHp < 0.42;
  const boss = game.enemies.some((e) => e.boss);
  sfx.setTension(boss || low ? 2 : 1);
}

/* ---------------- 输入 ---------------- */

function readInput() {
  let mx = 0;
  let my = 0;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (keys.KeyW || keys.ArrowUp) my -= 1;
  if (keys.KeyS || keys.ArrowDown) my += 1;

  let firing = mouse.down || keys.KeyJ;
  let aimX = mouse.moved ? mouse.x : NaN;
  let aimY = mouse.moved ? mouse.y : NaN;
  const p = game.player;

  // 触屏：左半屏摇杆移动，右半屏拖拽瞄准；没有瞄准时自动索敌
  const move = [...touches.values()].find((t) => t.kind === 'move');
  const aim = [...touches.values()].find((t) => t.kind === 'aim');
  if (move) {
    const dx = move.x - move.startX;
    const dy = move.y - move.startY;
    const l = Math.hypot(dx, dy);
    if (l > 4) {
      mx = clamp(dx / 62, -1, 1);
      my = clamp(dy / 62, -1, 1);
    }
  }
  if (aim) {
    const dx = aim.x - aim.startX;
    const dy = aim.y - aim.startY;
    if (Math.hypot(dx, dy) > 8) {
      aimX = p.x + dx * 4;
      aimY = p.y + dy * 4;
    }
    firing = true;
  } else if (move) {
    const target = nearestEnemy(p.x, p.y);
    if (target) {
      aimX = target.x;
      aimY = target.y;
      const near = dist(p.x, p.y, target.x, target.y) < 340;
      firing = near;
    }
  }

  const dash = dashRequest;
  dashRequest = false;
  return { mx, my, firing, aimX, aimY, dash };
}

function nearestEnemy(x, y) {
  let best = null;
  let bd = Infinity;
  for (const e of game.enemies) {
    const d = dist(x, y, e.x, e.y);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  keys[e.code] = true;

  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!game.demo && !$('screen-help').classList.contains('is-hidden')) {
      showScreen('screen-start');
      return;
    }
    togglePause();
    return;
  }

  if (game.mode === 'intermission' && !game.demo) {
    if (e.code === 'Digit1') pickUpgrade(0);
    if (e.code === 'Digit2') pickUpgrade(1);
    if (e.code === 'Digit3') pickUpgrade(2);
    return;
  }

  if (e.code === 'Space' && !e.repeat) dashRequest = true;

  if (e.code === 'Enter') {
    if (game.demo) startGame();
    else if (shownEnd) startGame();
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') {
    const t = touches.get(e.pointerId);
    if (t) {
      t.x = e.clientX;
      t.y = e.clientY;
    }
    return;
  }
  const w = fx.toWorld(e.clientX, e.clientY);
  mouse.x = w.x;
  mouse.y = w.y;
  mouse.moved = true;
});

canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (e.pointerType === 'touch') {
    document.body.classList.add('touch');
    const hasMove = [...touches.values()].some((t) => t.kind === 'move');
    const kind = !hasMove && e.clientX < window.innerWidth * 0.55 ? 'move' : 'aim';
    touches.set(e.pointerId, {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
    });
    return;
  }
  if (e.button === 2) {
    dashRequest = true;
    return;
  }
  const w = fx.toWorld(e.clientX, e.clientY);
  mouse.x = w.x;
  mouse.y = w.y;
  mouse.moved = true;
  mouse.down = true;
});

function releasePointer(e) {
  if (e.pointerType === 'touch') {
    touches.delete(e.pointerId);
    return;
  }
  if (e.button === 0 || e.button == null) mouse.down = false;
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);
window.addEventListener('blur', () => {
  mouse.down = false;
  keys && Object.keys(keys).forEach((k) => (keys[k] = false));
  if (!game.demo && game.mode === 'playing' && !paused) togglePause();
});

$('dash-btn').addEventListener('pointerdown', (e) => {
  e.preventDefault();
  dashRequest = true;
  sfx.unlock();
});

/* ---------------- 按钮 ---------------- */

$('btn-start').addEventListener('click', startGame);
$('btn-help').addEventListener('click', () => showScreen('screen-help'));
$('btn-help-back').addEventListener('click', () => showScreen('screen-start'));
$('btn-resume').addEventListener('click', () => togglePause());
$('btn-restart').addEventListener('click', startGame);
$('btn-menu').addEventListener('click', backToMenu);
$('btn-again').addEventListener('click', startGame);
$('btn-end-menu').addEventListener('click', backToMenu);

bindSetting('set-sound', 'sound');
bindSetting('set-sound-2', 'sound');
bindSetting('set-shake', 'shake');
bindSetting('set-shake-2', 'shake');
bindSetting('set-motion', 'reducedMotion');

window.addEventListener('resize', () => fx.resize());

/* ---------------- 验收钩子 ---------------- */

function advanceTime(ms) {
  const n = Math.max(1, Math.round(Number(ms) / (STEP * 1000)));
  for (let i = 0; i < n; i++) {
    if (shownEnd) break;
    tick(STEP);
    // 每 5 步补一次渲染，让粒子/飘字按真实时间衰老，截图才不是一帧堆满
    if (i % 5 === 4) {
      fx.render(game, STEP * 5, {
        reducedMotion: save.settings.reducedMotion,
        shake: save.settings.shake,
      });
    }
  }
  fx.render(game, STEP * Math.min(5, n), {
    reducedMotion: save.settings.reducedMotion,
    shake: save.settings.shake,
  });
  updateHud();
  return getSummary(game);
}

window.render_game_to_text = () => JSON.stringify(getSummary(game));
window.advanceTime = advanceTime;

window.__lantern = {
  game,
  start: startGame,
  menu: backToMenu,
  choose: pickUpgrade,
  jump: (n) => debugJumpToWave(game, n),
  startAt: (n) => {
    const wasBot = autoBot;
    startGame();
    autoBot = wasBot;
    qaRun = true;
    debugJumpToWave(game, n);
    showScreen(null);
    showHud(true);
    return getSummary(game);
  },
  bot: (on = true) => {
    autoBot = !!on;
  },
  summary: () => getSummary(game),
  renderer: fx,
  audio: sfx,
  save: () => save,
  snapshot: () => {
    fx.render(game, 0.016, {
      reducedMotion: save.settings.reducedMotion,
      shake: save.settings.shake,
    });
    return canvas.toDataURL('image/png');
  },
  crop: (x, y, w, h, zoom = 3) => {
    fx.render(game, 0.016, {
      reducedMotion: save.settings.reducedMotion,
      shake: save.settings.shake,
    });
    return fx.crop(x, y, w, h, zoom);
  },
  get paused() {
    return paused;
  },
};

/* ---------------- 启动 ---------------- */

fx.resize();
syncSettingsUi();
sfx.setEnabled(save.settings.sound);
updateBestLine();
startRun(game, { demo: true, seed: randomSeed() });
fx.clearDecals();
showHud(false);
showScreen('screen-start');
requestAnimationFrame((t) => {
  last = t;
  frame(t);
});
