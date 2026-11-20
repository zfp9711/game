// 纯工具函数：不碰 DOM，可被模拟层和渲染层共用。

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function dist(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function len(x, y) {
  return Math.sqrt(x * x + y * y);
}

/** 把角度差收敛到 [-PI, PI] */
export function angleDelta(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** 平滑跟随：帧率无关的指数逼近 */
export function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** mulberry32：给定种子可复现的随机数发生器 */
export function makeRng(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 供模拟层使用的可序列化随机源：状态里只存一个 uint32 */
export function rand(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const randRange = (state, lo, hi) => lo + rand(state) * (hi - lo);
export const randInt = (state, n) => Math.floor(rand(state) * n);

export function pickOne(state, arr) {
  return arr[randInt(state, arr.length)];
}

/** 洗牌（返回新数组），使用模拟层随机源，保证可复现 */
export function shuffle(state, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(state, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}
