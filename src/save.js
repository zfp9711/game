// 存档：带版本号 + 迁移链。只存设置与最佳记录，不存局内状态。

const KEY = 'lanternwatch.save';
export const SAVE_VERSION = 2;

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    best: {
      score: 0,
      wave: 0,
      time: 0,
      kills: 0,
      win: false,
    },
    settings: {
      sound: true,
      reducedMotion: false,
      shake: true,
    },
  };
}

// 从旧版本升级到下一版本的函数：{ 1: (data) => data }
const MIGRATIONS = {
  1: (data) => {
    data.version = 2;
    data.settings = {
      sound: true,
      reducedMotion: false,
      shake: true,
      ...(data.settings || {}),
    };
    return data;
  },
};

export function migrate(data) {
  if (!data || typeof data !== 'object') return defaultSave();
  let out = data;
  let guard = 0;
  while (typeof out.version === 'number' && out.version < SAVE_VERSION && guard++ < 16) {
    const fn = MIGRATIONS[out.version];
    if (!fn) break;
    out = fn(out);
  }
  return out;
}

export function sanitize(data) {
  const def = defaultSave();
  const src = migrate(data);
  if (!src || typeof src !== 'object') return def;

  const best = src.best && typeof src.best === 'object' ? src.best : {};
  const settings = src.settings && typeof src.settings === 'object' ? src.settings : {};
  const num = (v, fallback) => (Number.isFinite(v) && v >= 0 ? v : fallback);

  return {
    version: SAVE_VERSION,
    best: {
      score: Math.floor(num(best.score, 0)),
      wave: Math.min(8, Math.floor(num(best.wave, 0))),
      time: num(best.time, 0),
      kills: Math.floor(num(best.kills, 0)),
      win: !!best.win,
    },
    settings: {
      sound: settings.sound !== false,
      reducedMotion: !!settings.reducedMotion,
      shake: settings.shake !== false,
    },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    return sanitize(JSON.parse(raw));
  } catch (_) {
    return defaultSave();
  }
}

export function writeSave(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (_) {
    return false;
  }
}

export function recordRun(save, summary) {
  const next = sanitize(save);
  const won = summary.mode === 'won';
  const isBetter =
    won ||
    (!next.best.win &&
      (summary.stats.score > next.best.score ||
        (summary.stats.score === next.best.score && summary.stats.wave > next.best.wave)));
  if (isBetter) {
    next.best = {
      score: summary.stats.score,
      wave: summary.stats.wave,
      time: Math.round(summary.stats.time * 10) / 10,
      kills: summary.stats.kills,
      win: won,
    };
  }
  return next;
}
