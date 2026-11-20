// 渲染层：只读模拟状态，负责画面、粒子与后处理。
// 所有随机只用于视觉抖动，绝不影响模拟。

import { WORLD } from './data.js';
import { TAU, clamp, lerp } from './util.js';

const MAX_PARTICLES = 420;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  let dpr = 1;
  let cw = 0;
  let ch = 0;
  let scale = 1;
  let ox = 0;
  let oy = 0;

  const particles = [];
  const motes = [];
  const afterimages = [];
  const labels = [];
  let labelClock = 0;

  const bg = document.createElement('canvas');
  bg.width = WORLD.w;
  bg.height = WORLD.h;
  const bgx = bg.getContext('2d');

  const floor = document.createElement('canvas');
  floor.width = WORLD.w;
  floor.height = WORLD.h;
  const floorx = floor.getContext('2d');

  const grain = makeGrain(180);

  // 击杀留下的墨渍（只增不改，开局清空）
  const decals = document.createElement('canvas');
  decals.width = WORLD.w;
  decals.height = WORLD.h;
  const decalx = decals.getContext('2d');

  function clearDecals() {
    decalx.clearRect(0, 0, WORLD.w, WORLD.h);
  }

  function addDecal(x, y, radius, color = '5,7,11') {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * TAU;
      const d = Math.random() * radius * 0.7;
      const rr = radius * (0.35 + Math.random() * 0.5);
      const bx = x + Math.cos(a) * d;
      const by = y + Math.sin(a) * d;
      const g = decalx.createRadialGradient(bx, by, 0, bx, by, rr);
      g.addColorStop(0, `rgba(${color},0.32)`);
      g.addColorStop(0.6, `rgba(${color},0.18)`);
      g.addColorStop(1, `rgba(${color},0)`);
      decalx.fillStyle = g;
      decalx.beginPath();
      decalx.arc(bx, by, rr, 0, TAU);
      decalx.fill();
    }
  }

  for (let i = 0; i < 46; i++) {
    motes.push({
      x: Math.random() * WORLD.w,
      y: Math.random() * WORLD.h,
      r: 0.7 + Math.random() * 1.9,
      sp: 3 + Math.random() * 12,
      ph: Math.random() * TAU,
      a: 0.06 + Math.random() * 0.18,
    });
  }

  buildBackground();
  buildFloor();

  function buildBackground() {
    const g = bgx.createRadialGradient(WORLD.cx, WORLD.cy + 30, 40, WORLD.cx, WORLD.cy, 820);
    g.addColorStop(0, '#1a2833');
    g.addColorStop(0.35, '#121d27');
    g.addColorStop(0.7, '#0a1119');
    g.addColorStop(1, '#05080d');
    bgx.fillStyle = g;
    bgx.fillRect(0, 0, WORLD.w, WORLD.h);

    // 远处雾气
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.6;
      const x = WORLD.cx + Math.cos(a) * (380 + i * 40);
      const y = WORLD.cy + Math.sin(a) * (300 + i * 30);
      const haze = bgx.createRadialGradient(x, y, 10, x, y, 300);
      haze.addColorStop(0, 'rgba(48,74,92,0.10)');
      haze.addColorStop(1, 'rgba(20,34,44,0)');
      bgx.fillStyle = haze;
      bgx.fillRect(0, 0, WORLD.w, WORLD.h);
    }

    // 远处的树影 / 柱影，纯装饰
    bgx.save();
    bgx.globalAlpha = 0.9;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU + 0.1;
      const r = 430 + (i % 5) * 26;
      const x = WORLD.cx + Math.cos(a) * r;
      const y = WORLD.cy + Math.sin(a) * r;
      const h = 90 + ((i * 37) % 150);
      const w = 12 + ((i * 17) % 22);
      const grad = bgx.createLinearGradient(x, y - h, x, y + 20);
      grad.addColorStop(0, 'rgba(10,16,22,0)');
      grad.addColorStop(0.35, 'rgba(8,13,18,0.9)');
      grad.addColorStop(1, 'rgba(5,8,12,0.95)');
      bgx.fillStyle = grad;
      bgx.beginPath();
      bgx.moveTo(x - w / 2, y + 30);
      bgx.quadraticCurveTo(x - w * 0.7, y - h * 0.5, x - 3, y - h);
      bgx.quadraticCurveTo(x + w * 0.7, y - h * 0.5, x + w / 2, y + 30);
      bgx.closePath();
      bgx.fill();

      // 树影的冷色轮廓光
      bgx.strokeStyle = 'rgba(90,130,155,0.12)';
      bgx.lineWidth = 1.2;
      bgx.stroke();
    }
    bgx.restore();

    // 场地外圈暗环
    const ring = bgx.createRadialGradient(WORLD.cx, WORLD.cy, WORLD.radius * 0.7, WORLD.cx, WORLD.cy, WORLD.radius + 150);
    ring.addColorStop(0, 'rgba(0,0,0,0)');
    ring.addColorStop(0.6, 'rgba(0,0,0,0.28)');
    ring.addColorStop(1, 'rgba(0,0,0,0.66)');
    bgx.fillStyle = ring;
    bgx.fillRect(0, 0, WORLD.w, WORLD.h);
  }

  function buildFloor() {
    floorx.clearRect(0, 0, WORLD.w, WORLD.h);

    // 石板地面底色，让影子有东西可站
    const base = floorx.createRadialGradient(WORLD.cx, WORLD.cy, 30, WORLD.cx, WORLD.cy, WORLD.radius);
    base.addColorStop(0, 'rgba(96,74,54,0.62)');
    base.addColorStop(0.45, 'rgba(56,60,66,0.5)');
    base.addColorStop(0.85, 'rgba(32,40,50,0.42)');
    base.addColorStop(1, 'rgba(18,26,34,0.18)');
    floorx.fillStyle = base;
    floorx.beginPath();
    floorx.arc(WORLD.cx, WORLD.cy, WORLD.radius, 0, TAU);
    floorx.fill();

    const g = floorx.createRadialGradient(WORLD.cx, WORLD.cy, 20, WORLD.cx, WORLD.cy, WORLD.radius);
    g.addColorStop(0, 'rgba(120,84,54,0.35)');
    g.addColorStop(0.35, 'rgba(52,50,52,0.16)');
    g.addColorStop(0.8, 'rgba(20,26,34,0.1)');
    g.addColorStop(1, 'rgba(8,12,18,0.02)');
    floorx.fillStyle = g;
    floorx.beginPath();
    floorx.arc(WORLD.cx, WORLD.cy, WORLD.radius, 0, TAU);
    floorx.fill();

    // 石板缝
    floorx.save();
    floorx.beginPath();
    floorx.arc(WORLD.cx, WORLD.cy, WORLD.radius, 0, TAU);
    floorx.clip();
    floorx.strokeStyle = 'rgba(150,170,190,0.045)';
    floorx.lineWidth = 1.2;
    for (let r = 60; r < WORLD.radius; r += 52) {
      floorx.beginPath();
      floorx.arc(WORLD.cx, WORLD.cy, r, 0, TAU);
      floorx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      floorx.beginPath();
      floorx.moveTo(WORLD.cx + Math.cos(a) * 40, WORLD.cy + Math.sin(a) * 40);
      floorx.lineTo(WORLD.cx + Math.cos(a) * WORLD.radius, WORLD.cy + Math.sin(a) * WORLD.radius);
      floorx.stroke();
    }
    // 墨点
    for (let i = 0; i < 260; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * WORLD.radius;
      const x = WORLD.cx + Math.cos(a) * r;
      const y = WORLD.cy + Math.sin(a) * r;
      floorx.fillStyle = `rgba(120,140,160,${0.02 + Math.random() * 0.05})`;
      floorx.beginPath();
      floorx.arc(x, y, 0.6 + Math.random() * 2.4, 0, TAU);
      floorx.fill();
    }
    floorx.restore();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    cw = rect.width;
    ch = rect.height;
    scale = Math.min(cw / WORLD.w, ch / WORLD.h);
    ox = (cw - WORLD.w * scale) / 2;
    oy = (ch - WORLD.h * scale) / 2;
  }

  function push(p) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push(p);
  }

  function burst(x, y, count, opts = {}) {
    const { color = '#ffc46b', speed = 120, size = 2.4, life = 0.5, kind = 'spark', grav = 0 } = opts;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random());
      push({
        kind,
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        size: size * (0.5 + Math.random()),
        life: life * (0.6 + Math.random() * 0.8),
        max: life,
        color,
        grav,
      });
    }
  }

  function ring(x, y, r0, r1, color, life = 0.5, width = 3) {
    push({ kind: 'ring', x, y, r0, r1, life, max: life, color, width });
  }

  function label(x, y, text, color = '#ffe6b0') {
    if (labelClock > 0) return;
    labelClock = 0.16;
    if (labels.length > 6) labels.shift();
    labels.push({
      x: x + (Math.random() - 0.5) * 14,
      y: y - (labels.length % 3) * 5,
      text,
      color,
      life: 0.9,
      max: 0.9,
    });
  }

  function onEvents(events, state) {
    for (const ev of events) {
      switch (ev.type) {
        case 'kill':
          addDecal(ev.x, ev.y, ev.radius * 1.15);
          burst(ev.x, ev.y, ev.boss ? 90 : 16, {
            color: ev.boss ? '#ffb066' : '#ffc978',
            speed: ev.boss ? 300 : 150,
            size: ev.boss ? 4 : 2.4,
            life: ev.boss ? 1.4 : 0.6,
          });
          burst(ev.x, ev.y, ev.boss ? 40 : 8, {
            color: '#2a3150',
            speed: 90,
            size: 4,
            life: 0.8,
            kind: 'ink',
            grav: 160,
          });
          ring(ev.x, ev.y, 12, ev.boss ? 220 : 54, 'rgba(255,200,120,0.75)', ev.boss ? 1 : 0.45, ev.boss ? 8 : 2);
          if (ev.boss) {
            state.ui.shake = Math.max(state.ui.shake, 18);
            label(ev.x, ev.y - 40, '影王消散', '#ffd9a0');
          }
          break;
        case 'fireConsume':
          addDecal(ev.x, ev.y, ev.radius * 1.1, '26,14,8');
          burst(ev.x, ev.y, 14, { color: '#ffb15c', speed: 140, size: 2.8, life: 0.7 });
          ring(ev.x, ev.y, 8, 70, 'rgba(255,120,80,0.6)', 0.4, 3);
          break;
        case 'fireHit':
          state.ui.shake = Math.max(state.ui.shake, 10);
          burst(WORLD.cx, WORLD.cy, 26, {
            color: '#ff9a5a',
            speed: 240,
            size: 3,
            life: 0.75,
            grav: 30,
          });
          ring(WORLD.cx, WORLD.cy, 30, 180, 'rgba(255,90,60,0.55)', 0.5, 5);
          break;
        case 'playerHit':
          burst(ev.x, ev.y, 14, { color: '#ff7d6b', speed: 170, size: 2.6, life: 0.5 });
          break;
        case 'dash':
          afterimages.push({ x: ev.x, y: ev.y, life: 0.32, max: 0.32 });
          burst(ev.x, ev.y, 10, { color: '#8be6e0', speed: 90, size: 2, life: 0.4 });
          break;
        case 'ember':
          burst(ev.x, ev.y, 8, { color: '#ffe3a3', speed: 80, size: 1.8, life: 0.45 });
          label(ev.x, ev.y - 16, `+${ev.value} 灯油`, '#ffe6b0');
          break;
        case 'beamHit':
          burst(ev.x, ev.y, 2, { color: '#ffe0a8', speed: 70, size: 1.6, life: 0.22 });
          break;
        case 'spawn':
          ring(ev.x, ev.y, 4, ev.boss ? 90 : 34, ev.boss ? 'rgba(255,120,150,0.7)' : 'rgba(160,190,220,0.4)', ev.boss ? 0.9 : 0.4, 2);
          if (ev.boss) {
            state.ui.shake = Math.max(state.ui.shake, 14);
            label(ev.x, ev.y - 60, '影王', '#ffb2c8');
          }
          break;
        case 'bossAttack':
          ring(ev.x, ev.y, 40, 210, 'rgba(255,90,90,0.7)', 0.55, 6);
          state.ui.shake = Math.max(state.ui.shake, 15);
          break;
        case 'bossSummon':
          ring(ev.x, ev.y, 20, 130, 'rgba(190,120,255,0.6)', 0.7, 4);
          break;
        case 'waveStart':
          if (ev.boss) {
            state.ui.shake = Math.max(state.ui.shake, 12);
            for (let i = 0; i < 3; i++) ring(WORLD.cx, WORLD.cy, 30, 300 + i * 40, 'rgba(255,120,140,0.35)', 1.1 + i * 0.2, 3);
          }
          break;
        case 'win':
          for (let i = 0; i < 8; i++) {
            ring(WORLD.cx, WORLD.cy, 20 + i * 10, 340 + i * 20, 'rgba(255,210,140,0.35)', 1.2 + i * 0.12, 3);
          }
          burst(WORLD.cx, WORLD.cy, 120, { color: '#ffe0a0', speed: 320, size: 3.4, life: 1.6 });
          break;
        case 'lose':
          burst(WORLD.cx, WORLD.cy, 50, { color: '#b3544a', speed: 200, size: 3, life: 1.2, kind: 'ink', grav: 60 });
          break;
        default:
          break;
      }
    }
  }

  function updateParticles(dt, reduced) {
    labelClock = Math.max(0, labelClock - dt);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      if (p.kind === 'ring') continue;
      p.vy += (p.grav || 0) * dt;
      p.vx *= Math.exp(-1.6 * dt);
      p.vy *= Math.exp(-1.2 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    for (let i = afterimages.length - 1; i >= 0; i--) {
      afterimages[i].life -= dt;
      if (afterimages[i].life <= 0) afterimages.splice(i, 1);
    }
    for (let i = labels.length - 1; i >= 0; i--) {
      labels[i].life -= dt;
      labels[i].y -= dt * 28;
      if (labels[i].life <= 0) labels.splice(i, 1);
    }
    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
  }

  function drawArena(state, t) {
    ctx.drawImage(floor, 0, 0);
    ctx.drawImage(decals, 0, 0);

    // 火堆附近的暖色地面
    const flick = 0.86 + Math.sin(t * 7.3) * 0.05 + Math.sin(t * 13.1) * 0.03;
    const g = ctx.createRadialGradient(WORLD.cx, WORLD.cy, 10, WORLD.cx, WORLD.cy, 360 * flick);
    g.addColorStop(0, 'rgba(255,164,86,0.26)');
    g.addColorStop(0.4, 'rgba(214,112,60,0.11)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(WORLD.cx, WORLD.cy, 380, 0, TAU);
    ctx.fill();

    drawFog(t);

    // 场地边界
    ctx.save();
    ctx.setLineDash([10, 14]);
    ctx.lineDashOffset = -t * 12;
    ctx.strokeStyle = 'rgba(140,180,200,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(WORLD.cx, WORLD.cy, WORLD.radius, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // 飘浮尘埃
    for (const m of motes) {
      const x = ((m.x + Math.sin(t * 0.2 + m.ph) * 16 + t * m.sp * 0.2) % WORLD.w + WORLD.w) % WORLD.w;
      const y = ((m.y + Math.cos(t * 0.17 + m.ph) * 12 - t * m.sp) % WORLD.h + WORLD.h) % WORLD.h;
      ctx.fillStyle = `rgba(210,230,240,${m.a})`;
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, TAU);
      ctx.fill();
    }
  }

  function drawFog(t) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      const ph = t * 0.035 + i * 1.7;
      const x = WORLD.cx + Math.cos(ph) * (400 + i * 34);
      const y = WORLD.cy + Math.sin(ph * 1.3 + i) * (280 + i * 24);
      const r = 240 + i * 18;
      const g = ctx.createRadialGradient(x, y, 10, x, y, r);
      g.addColorStop(0, 'rgba(74,116,138,0.055)');
      g.addColorStop(0.6, 'rgba(48,80,98,0.03)');
      g.addColorStop(1, 'rgba(26,44,58,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFire(state, t) {
    const f = state.fire;
    const health = clamp(f.hp / f.maxHp, 0, 1);
    const flick = 0.9 + Math.sin(t * 9.1) * 0.06 + Math.sin(t * 15.7 + 1.3) * 0.04;

    // 光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const haloR = (178 + 82 * health) * flick;
    const g = ctx.createRadialGradient(f.x, f.y, 4, f.x, f.y, haloR);
    g.addColorStop(0, `rgba(255,214,150,${0.42 * (0.4 + health * 0.6)})`);
    g.addColorStop(0.35, `rgba(255,152,74,${0.17 * (0.4 + health * 0.6)})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, haloR, 0, TAU);
    ctx.fill();

    // 地面光圈
    ctx.strokeStyle = `rgba(255,170,90,${0.06 + health * 0.06})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.radius * 0.92, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // 石圈
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + 0.2;
      const rr = 30 + (i % 3) * 3;
      const x = f.x + Math.cos(a) * rr;
      const y = f.y + Math.sin(a) * rr * 0.62;
      ctx.fillStyle = i % 2 ? '#232a33' : '#1b2129';
      ctx.beginPath();
      ctx.ellipse(x, y, 8 + (i % 4), 5 + (i % 2), a, 0, TAU);
      ctx.fill();
    }

    // 柴
    ctx.strokeStyle = '#2a211b';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI + 0.4;
      ctx.beginPath();
      ctx.moveTo(f.x + Math.cos(a) * 18, f.y + Math.sin(a) * 10 + 6);
      ctx.lineTo(f.x - Math.cos(a) * 18, f.y - Math.sin(a) * 10 + 6);
      ctx.stroke();
    }

    // 火焰：三层正弦舌
    const flames = [
      { h: 96, w: 34, c1: 'rgba(255,120,40,0.5)', c2: 'rgba(255,80,20,0)', sp: 1.0 },
      { h: 70, w: 23, c1: 'rgba(255,190,90,0.85)', c2: 'rgba(255,120,30,0)', sp: 1.35 },
      { h: 44, w: 13, c1: 'rgba(255,246,214,0.95)', c2: 'rgba(255,190,80,0)', sp: 1.7 },
    ];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const fl of flames) {
      const hh = fl.h * (0.55 + health * 0.55) * (0.94 + Math.sin(t * 11 * fl.sp) * 0.06);
      const sway = Math.sin(t * 5.2 * fl.sp) * 5 + Math.sin(t * 9.7 * fl.sp + 1) * 3;
      const grad = ctx.createLinearGradient(f.x, f.y - hh, f.x, f.y + 10);
      grad.addColorStop(0, fl.c2);
      grad.addColorStop(0.35, fl.c1);
      grad.addColorStop(1, fl.c1);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(f.x - fl.w, f.y + 8);
      ctx.bezierCurveTo(
        f.x - fl.w * 1.1,
        f.y - hh * 0.35,
        f.x - fl.w * 0.2 + sway,
        f.y - hh * 0.7,
        f.x + sway * 0.6,
        f.y - hh
      );
      ctx.bezierCurveTo(
        f.x + fl.w * 0.4 + sway,
        f.y - hh * 0.6,
        f.x + fl.w * 1.15,
        f.y - hh * 0.3,
        f.x + fl.w,
        f.y + 8
      );
      ctx.closePath();
      ctx.fill();
    }
    // 侧焰，打散三角形的对称感
    for (const side of [-1, 1]) {
      const hh = 54 * (0.5 + health * 0.6) * (0.9 + Math.sin(t * 12 + side * 1.7) * 0.1);
      const w = 15;
      const bx = f.x + side * 9;
      const grad = ctx.createLinearGradient(bx, f.y - hh, bx, f.y + 8);
      grad.addColorStop(0, 'rgba(255,140,50,0)');
      grad.addColorStop(0.5, 'rgba(255,170,70,0.42)');
      grad.addColorStop(1, 'rgba(255,120,30,0.3)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bx - w, f.y + 8);
      ctx.quadraticCurveTo(bx - w * 0.4 + side * 6, f.y - hh * 0.5, bx + side * 5, f.y - hh);
      ctx.quadraticCurveTo(bx + w * 0.6, f.y - hh * 0.4, bx + w, f.y + 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    for (let i = 0; i < 5; i++) {
      const ph = t * (0.7 + i * 0.13) + i * 2.1;
      const yy = f.y - ((ph * 26) % 90);
      const xx = f.x + Math.sin(ph * 3.1 + i) * (6 + (i % 3) * 8);
      const a = 0.7 - ((ph * 26) % 90) / 110;
      ctx.fillStyle = `rgba(255,190,110,${Math.max(0, a) * 0.8})`;
      ctx.beginPath();
      ctx.arc(xx, yy, 1.6, 0, TAU);
      ctx.fill();
    }
  }

  function drawWarnings(state, t) {
    for (const w of state.warnings) {
      const boss = w.type === 'boss';
      const total = boss ? 1.4 : 0.7;
      const k = clamp(w.timer / total, 0, 1);
      const r = (boss ? 54 : 22) * (0.4 + k * 0.8);
      ctx.save();
      ctx.strokeStyle = boss ? 'rgba(255,120,150,0.8)' : 'rgba(170,200,225,0.55)';
      ctx.lineWidth = boss ? 3 : 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t * 30;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, r, r * 0.42, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 0.35 + Math.sin(t * 12) * 0.15;
      ctx.fillStyle = boss ? 'rgba(255,90,130,0.25)' : 'rgba(160,200,230,0.16)';
      ctx.fill();
      ctx.restore();
    }
  }

  function drawEmber(state, em, t) {
    const pulse = 0.75 + Math.sin(t * 8 + em.phase) * 0.25;
    const fade = clamp(1 - (em.age - em.life + 3) / 3, 0, 1);
    const a = 0.55 + pulse * 0.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(em.x, em.y, 0, em.x, em.y, 13 * pulse);
    g.addColorStop(0, `rgba(255,240,190,${a * fade})`);
    g.addColorStop(0.35, `rgba(255,190,100,${a * 0.6 * fade})`);
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(em.x, em.y, 13 * pulse, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,250,225,${fade})`;
    ctx.beginPath();
    ctx.arc(em.x, em.y, 2.1, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e, t, state) {
    const wob = 1 + Math.sin(t * (2 + e.wobble) + e.phase) * 0.06;
    const r = e.radius * (e.boss ? 1.28 : 1.07) * wob;

    if (e.boss) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const aura = ctx.createRadialGradient(e.x, e.y, r * 0.6, e.x, e.y, r * 2.4);
      aura.addColorStop(0, 'rgba(120,40,90,0)');
      aura.addColorStop(0.55, `rgba(150,50,110,${0.1 + Math.sin(t * 2) * 0.03})`);
      aura.addColorStop(1, 'rgba(90,20,70,0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 2.4, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + e.radius * 0.85, e.radius * 0.95, e.radius * 0.3, 0, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(0, Math.sin(t * 2.2 + e.phase) * 1.6);

    // 身体：晃动的墨团
    ctx.beginPath();
    const pts = e.boss ? 26 : 14;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * TAU;
      const jitterAmp = e.boss ? 0.13 : 0.08;
      const jitter =
        1 +
        Math.sin(a * 3 + t * 2.4 + e.phase) * jitterAmp +
        Math.sin(a * 5 - t * 3.1 + e.phase * 2) * jitterAmp * 0.6;
      const rr = r * jitter;
      const x = e.x + Math.cos(a) * rr;
      const y = e.y + Math.sin(a) * rr * 0.92;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const bg = ctx.createRadialGradient(e.x - r * 0.3, e.y - r * 0.4, r * 0.1, e.x, e.y, r * 1.15);
    bg.addColorStop(0, e.body);
    bg.addColorStop(1, e.boss ? '#06040a' : '#070a11');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = e.rim;
    ctx.globalAlpha = e.boss ? 0.55 : 0.4;
    ctx.lineWidth = e.boss ? 2 : 1.4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 拖在身后的墨尾
    if (!e.boss) {
      for (let i = 0; i < 3; i++) {
        const k = i / 3;
        ctx.fillStyle = `rgba(8,11,18,${0.5 - k * 0.14})`;
        ctx.beginPath();
        ctx.ellipse(
          e.x + Math.sin(t * 1.6 + e.phase + i) * (3 + i * 3),
          e.y + r * (0.85 + k * 0.5),
          r * (0.5 - k * 0.13),
          r * (0.3 - k * 0.07),
          0,
          0,
          TAU
        );
        ctx.fill();
      }
    }

    // 影王的尖冠
    if (e.boss) {
      ctx.fillStyle = '#150c1a';
      ctx.strokeStyle = 'rgba(150,80,130,0.4)';
      ctx.lineWidth = 1;
      for (let i = -4; i <= 4; i++) {
        const a = -Math.PI / 2 + i * 0.2;
        const bx = e.x + Math.cos(a) * r * 0.82;
        const by = e.y + Math.sin(a) * r * 0.82;
        const h = r * (0.5 + Math.cos(i * 0.8) * 0.18);
        const spread = 0.055 + Math.abs(i) * 0.006;
        ctx.beginPath();
        ctx.moveTo(bx + Math.cos(a + 1.57) * r * spread, by + Math.sin(a + 1.57) * r * spread);
        ctx.lineTo(bx + Math.cos(a - 1.57) * r * spread, by + Math.sin(a - 1.57) * r * spread);
        ctx.lineTo(bx + Math.cos(a + 0.18) * h, by + Math.sin(a + 0.18) * h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      // 触须
      for (let i = 0; i < 4; i++) {
        const bx = e.x + (i - 1.5) * r * 0.34;
        const sway = Math.sin(t * 1.4 + i * 1.3) * 6;
        ctx.strokeStyle = 'rgba(60,30,55,0.75)';
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(bx, e.y + r * 0.82);
        ctx.quadraticCurveTo(bx + sway, e.y + r * 1.15, bx + sway * 1.6, e.y + r * 1.42);
        ctx.stroke();
      }
    }

    // 朝向火堆一侧的暖色轮廓光：让影子从暗底里分离出来
    const toFire = Math.atan2(state.fire.y - e.y, state.fire.x - e.x);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,170,96,0.13)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(e.x, e.y, r * 0.98, toFire - 0.7, toFire + 0.7);
    ctx.stroke();
    ctx.restore();

    // 灼烧描边
    if (e.burnTimer > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,140,60,${0.25 + Math.sin(t * 14 + e.phase) * 0.12})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();
      ctx.restore();
    }

    // 眼睛：影王多眼，小影双眼
    const eyeR = Math.max(1.4, e.radius * 0.105);
    const lookX = Math.cos(t * 0.6 + e.phase) * eyeR * 0.5;
    const lookY = Math.sin(t * 0.5 + e.phase) * eyeR * 0.35;
    const eyes = e.boss
      ? [
          [0, -0.16, 1.8],
          [-0.44, -0.36, 0.9],
          [0.44, -0.36, 0.9],
          [-0.3, 0.2, 0.7],
          [0.3, 0.2, 0.7],
        ]
      : [
          [-0.34, -0.1, 1],
          [0.34, -0.1, 1],
        ];
    for (const [ex, ey, sc] of eyes) {
      const px = e.x + ex * r + lookX;
      const py = e.y + ey * r + lookY;
      const rr = eyeR * sc;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(px, py, 0, px, py, rr * 2.2);
      g.addColorStop(0, e.eye);
      g.addColorStop(0.3, e.eye);
      g.addColorStop(0.62, 'rgba(255,168,120,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(px, py, rr * 1.55, rr * 1.2, 0, 0, TAU);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = '#0d090c';
      ctx.beginPath();
      ctx.ellipse(px + lookX * 0.4, py + lookY * 0.4, rr * 0.52, rr * 0.72, 0, 0, TAU);
      ctx.fill();
    }

    // 受击白闪
    if (e.flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(e.flash * 4, 0, 0.5);
      ctx.fillStyle = '#fff3d8';
      ctx.beginPath();
      ctx.arc(e.x, e.y, r * 1.02, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // Boss 血条
    if (e.boss || (e.maxHp > 60 && e.showHp > 0)) {
      const w = e.boss ? 120 : 40;
      const h = e.boss ? 6 : 3;
      const x = e.x - w / 2;
      const y = e.y - e.radius - 18;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = e.boss ? '#ff8a6a' : 'rgba(255,200,140,0.8)';
      ctx.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), h);
    }

    ctx.restore();
  }

  function drawPlayer(state, t) {
    const p = state.player;
    const bob = Math.sin(p.step * 2) * 2.2;
    const y = p.y + bob;
    const aim = p.aim;

    // 影子
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 19, 19, 6, 0, 0, TAU);
    ctx.fill();

    // 火边的暖光池
    if (p.nearFire) {
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 62);
      g.addColorStop(0, 'rgba(255,170,90,0.10)');
      g.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 62, 0, TAU);
      ctx.fill();
    }

    ctx.save();
    if (p.invuln > 0 && p.dashTime <= 0) {
      ctx.globalAlpha = 0.6 + Math.sin(t * 26) * 0.22;
    }

    // 斗篷
    ctx.beginPath();
    ctx.moveTo(p.x - 16, y + 18);
    ctx.bezierCurveTo(p.x - 20, y - 2, p.x - 13, y - 16, p.x - 6, y - 23);
    ctx.quadraticCurveTo(p.x, y - 28, p.x + 6, y - 23);
    ctx.bezierCurveTo(p.x + 13, y - 16, p.x + 20, y - 2, p.x + 16, y + 18);
    ctx.quadraticCurveTo(p.x, y + 24, p.x - 16, y + 18);
    ctx.closePath();
    const cg = ctx.createLinearGradient(p.x - 6, y - 24, p.x + 8, y + 18);
    cg.addColorStop(0, '#46546d');
    cg.addColorStop(0.42, '#242d40');
    cg.addColorStop(1, '#0e141d');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160,195,225,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 衣褶
    ctx.beginPath();
    ctx.moveTo(p.x - 2, y - 6);
    ctx.quadraticCurveTo(p.x + 3, y + 6, p.x - 1, y + 16);
    ctx.strokeStyle = 'rgba(8,12,18,0.45)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 兜帽
    ctx.beginPath();
    ctx.arc(p.x, y - 16, 10.5, 0, TAU);
    ctx.fillStyle = '#1b2332';
    ctx.fill();
    ctx.strokeStyle = 'rgba(165,200,230,0.26)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 面部的暖光
    ctx.beginPath();
    ctx.arc(p.x + Math.cos(aim) * 3, y - 15 + Math.sin(aim) * 2, 4, 0, TAU);
    ctx.fillStyle = 'rgba(255,216,164,0.8)';
    ctx.fill();

    // 提灯手臂
    const lx = p.x + Math.cos(aim) * 23;
    const ly = y - 6 + Math.sin(aim) * 13;
    ctx.strokeStyle = '#2c3547';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(aim) * 7, y - 8 + Math.sin(aim) * 5);
    ctx.lineTo(lx, ly);
    ctx.stroke();

    // 灯光
    const pulse = 0.92 + Math.sin(t * 7.5) * 0.07 + (p.firing ? 0.14 : 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(lx, ly, 0, lx, ly, 66 * pulse);
    halo.addColorStop(0, `rgba(255,240,200,${p.firing ? 0.55 : 0.36})`);
    halo.addColorStop(0.3, `rgba(255,190,110,${p.firing ? 0.26 : 0.16})`);
    halo.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(lx, ly, 66 * pulse, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 灯身
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(aim);
    ctx.fillStyle = 'rgba(60,42,24,0.95)';
    ctx.beginPath();
    ctx.roundRect(-4.5, -6, 9, 12, 2.2);
    ctx.fill();
    ctx.fillStyle = '#ffdda0';
    ctx.beginPath();
    ctx.roundRect(-3, -4.6, 6, 8.6, 1.6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(45,32,18,0.9)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-4.5, -6.4);
    ctx.quadraticCurveTo(0, -10, 4.5, -6.4);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawBeam(state, t) {
    const p = state.player;
    if (!p.firing) return;
    const ox0 = p.x + Math.cos(p.aim) * 23;
    const oy0 = p.y - 6 + Math.sin(p.aim) * 13;
    const range = state.mods.beamRange;
    const half = state.mods.beamHalfAngle;
    const flick = 0.88 + Math.sin(t * 31) * 0.06 + Math.sin(t * 57) * 0.04;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // 外层光锥
    const g = ctx.createRadialGradient(ox0, oy0, 8, ox0, oy0, range);
    g.addColorStop(0, `rgba(255,244,210,${0.30 * flick})`);
    g.addColorStop(0.25, `rgba(255,214,150,${0.15 * flick})`);
    g.addColorStop(0.7, `rgba(255,180,110,${0.07 * flick})`);
    g.addColorStop(1, 'rgba(255,160,90,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox0, oy0);
    ctx.arc(ox0, oy0, range, p.aim - half, p.aim + half);
    ctx.closePath();
    ctx.fill();

    // 内层亮锥
    ctx.beginPath();
    ctx.moveTo(ox0, oy0);
    ctx.arc(ox0, oy0, range * 0.92, p.aim - half * 0.44, p.aim + half * 0.44);
    ctx.closePath();
    const g2 = ctx.createRadialGradient(ox0, oy0, 4, ox0, oy0, range * 0.92);
    g2.addColorStop(0, `rgba(255,252,235,${0.34 * flick})`);
    g2.addColorStop(0.5, `rgba(255,230,180,${0.1 * flick})`);
    g2.addColorStop(1, 'rgba(255,200,140,0)');
    ctx.fillStyle = g2;
    ctx.fill();

    // 光尘
    for (let i = 0; i < 9; i++) {
      const k = 0.18 + ((i * 0.117 + t * 0.09) % 0.78);
      const spread = (Math.sin(i * 2.7 + t * 3.1) * 0.5 + 0.5) * half * 0.7 - half * 0.35;
      const x = ox0 + Math.cos(p.aim + spread) * range * k;
      const y = oy0 + Math.sin(p.aim + spread) * range * k;
      ctx.fillStyle = `rgba(255,240,200,${0.35 * (1 - k)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, TAU);
      ctx.fill();
    }

    // 光束核心：一条更亮的芯，近处实、远处虚
    const dx = Math.cos(p.aim);
    const dy = Math.sin(p.aim);
    ctx.strokeStyle = 'rgba(255,251,236,0.5)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox0, oy0);
    ctx.lineTo(ox0 + dx * range * 0.34, oy0 + dy * range * 0.34);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,240,206,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ox0 + dx * range * 0.3, oy0 + dy * range * 0.3);
    ctx.lineTo(ox0 + dx * range * 0.94, oy0 + dy * range * 0.94);
    ctx.stroke();

    // 灯口
    const gl = ctx.createRadialGradient(ox0, oy0, 0, ox0, oy0, 18);
    gl.addColorStop(0, 'rgba(255,255,240,0.9)');
    gl.addColorStop(0.4, 'rgba(255,220,160,0.4)');
    gl.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = gl;
    ctx.beginPath();
    ctx.arc(ox0, oy0, 18, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const k = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'ring') {
        const r = lerp(p.r0, p.r1, 1 - k);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = k * 0.8;
        ctx.lineWidth = p.width * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, TAU);
        ctx.stroke();
        ctx.restore();
        continue;
      }
      if (p.kind === 'ink') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = k * 0.7;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.8), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = p.color;
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.8), 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    for (const a of afterimages) {
      const k = a.life / a.max;
      ctx.save();
      ctx.globalAlpha = k * 0.35;
      ctx.fillStyle = '#9fe8e2';
      ctx.beginPath();
      ctx.arc(a.x, a.y - 6, 10 * k, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawLabels() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '600 15px "Microsoft YaHei", "PingFang SC", sans-serif';
    for (const l of labels) {
      const k = clamp(l.life / l.max, 0, 1);
      ctx.globalAlpha = k;
      ctx.fillStyle = l.color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fillText(l.text, l.x, l.y);
    }
    ctx.restore();
  }

  function drawPost(state, t, opts) {
    const ui = state.ui;
    const lowFire = 1 - clamp(state.fire.hp / state.fire.maxHp, 0, 1);

    // 火堆濒危的红色呼吸
    if (lowFire > 0.45) {
      const a = (lowFire - 0.45) * 0.32 * (0.6 + Math.sin(t * 3.2) * 0.4);
      const g = ctx.createRadialGradient(WORLD.cx, WORLD.cy, WORLD.radius * 0.4, WORLD.cx, WORLD.cy, 760);
      g.addColorStop(0, 'rgba(120,10,10,0)');
      g.addColorStop(1, `rgba(140,20,16,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    }

    if (ui.fireFlash > 0) {
      ctx.fillStyle = `rgba(255,90,50,${ui.fireFlash * 0.06})`;
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    }
    if (ui.hurt > 0) {
      const g = ctx.createRadialGradient(WORLD.cx, WORLD.cy, 200, WORLD.cx, WORLD.cy, 720);
      g.addColorStop(0, 'rgba(150,20,20,0)');
      g.addColorStop(1, `rgba(190,30,30,${ui.hurt * 0.4})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    }

    // 暗角
    const v = ctx.createRadialGradient(WORLD.cx, WORLD.cy, WORLD.radius * 0.62, WORLD.cx, WORLD.cy, 840);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    v.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);

    if (!opts.reducedMotion) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.055;
      ctx.fillStyle = grain;
      ctx.translate((t * 3) % 180, (t * 5) % 180);
      ctx.fillRect(-180, -180, WORLD.w + 360, WORLD.h + 360);
      ctx.restore();
    }
  }

  function render(state, dt, opts = {}) {
    const t = state.time + (state.mode === 'menu' ? performance.now() / 1000 : 0);
    const reduced = !!opts.reducedMotion;
    updateParticles(dt, reduced);

    resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#04070b';
    ctx.fillRect(0, 0, cw, ch);

    // 背景铺满视口，避免竖屏/宽屏出现硬黑边
    const cover = Math.max(cw / WORLD.w, ch / WORLD.h);
    ctx.drawImage(bg, (cw - WORLD.w * cover) / 2, (ch - WORLD.h * cover) / 2, WORLD.w * cover, WORLD.h * cover);

    let shake = opts.shake === false || reduced ? 0 : state.ui.shake;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;

    ctx.save();
    ctx.translate(ox + sx, oy + sy);
    ctx.scale(scale, scale);

    drawArena(state, t);
    drawWarnings(state, t);

    for (const em of state.embers) drawEmber(state, em, t);

    for (const e of state.enemies) drawEnemy(e, t, state);

    drawFire(state, t);
    drawPlayer(state, t);
    drawBeam(state, t);
    drawParticles();
    drawLabels();
    drawPost(state, t, opts);

    ctx.restore();
  }

  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - ox) / scale;
    const y = (clientY - rect.top - oy) / scale;
    return { x, y };
  }

  return {
    render,
    onEvents,
    resize,
    toWorld,
    clearDecals,
    crop(wx, wy, ww, wh, zoom = 3) {
      const sx = (ox + wx * scale) * dpr;
      const sy = (oy + wy * scale) * dpr;
      const sw = ww * scale * dpr;
      const sh = wh * scale * dpr;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw * zoom));
      c.height = Math.max(1, Math.round(sh * zoom));
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(canvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return c.toDataURL('image/png');
    },
    get scale() {
      return scale;
    },
  };
}

function makeGrain(size) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 110 + Math.random() * 90;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 26 + Math.random() * 26;
  }
  g.putImageData(img, 0, 0);
  const pattern = g.createPattern(c, 'repeat');
  return pattern;
}
