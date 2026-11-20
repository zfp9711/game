// 所有可调数值集中在这里。改平衡只改这个文件，不动逻辑。

export const WORLD = {
  w: 1280,
  h: 800,
  cx: 640,
  cy: 400,
  radius: 306,
};

export const STEP = 1 / 60;

export const BASE_MODIFIERS = {
  beamDps: 64,
  beamRange: 318,
  beamHalfAngle: 0.285, // 约 16°
  beamSlow: 0.34,
  beamKnockback: 46,
  burnDps: 9,
  burnDuration: 1.8,

  moveSpeed: 268,
  dashCooldown: 1.5,
  dashTime: 0.15,
  dashSpeed: 1180,
  dashDamage: 26,
  dashRadius: 46,
  dashInvuln: 0.28,

  playerMaxHp: 100,
  playerRegenNearFire: 7,
  playerRegenRadius: 118,
  playerInvuln: 0.9,

  fireMaxHp: 100,
  fireRadius: 118,
  fireLightDps: 7,
  fireSlow: 0.4,
  fireResist: 0,

  oilMax: 110,
  oilRegen: 24,
  oilRegenDelay: 0.42,
  oilCost: 20,
  emberOil: 10,
  emberRadius: 100,
};

export const ENEMY_TYPES = {
  crawler: {
    name: '小影',
    hp: 26,
    speed: 50,
    radius: 15,
    fireDamage: 10,
    playerDamage: 10,
    score: 10,
    embers: 1,
    body: '#2b3752',
    rim: '#5b6d96',
    eye: '#cfe4ef',
    wobble: 1.6,
  },
  runner: {
    name: '疾影',
    hp: 17,
    speed: 98,
    radius: 12,
    fireDamage: 8,
    playerDamage: 9,
    score: 12,
    embers: 1,
    body: '#24405a',
    rim: '#4f7d8a',
    eye: '#a9f0e2',
    wobble: 3.4,
  },
  brute: {
    name: '重影',
    hp: 112,
    speed: 33,
    radius: 25,
    fireDamage: 26,
    playerDamage: 18,
    score: 26,
    embers: 3,
    body: '#33274d',
    rim: '#7a5c9c',
    eye: '#ffcf8a',
    wobble: 1.1,
  },
  boss: {
    name: '影王',
    hp: 1000,
    speed: 28,
    radius: 46,
    fireDamage: 15,
    playerDamage: 20,
    score: 500,
    embers: 12,
    body: '#2e1a34',
    rim: '#8a4f7e',
    eye: '#ff8f6b',
    wobble: 0.9,
    boss: true,
  },
};

// 每一夜：duration 为设计时长，groups 里的 from/to 是波内秒数。
export const WAVES = [
  {
    name: '第一夜',
    duration: 26,
    groups: [{ type: 'crawler', count: 9, from: 2, to: 22 }],
  },
  {
    name: '第二夜',
    duration: 27,
    groups: [
      { type: 'crawler', count: 11, from: 2, to: 22 },
      { type: 'runner', count: 3, from: 11, to: 24 },
    ],
  },
  {
    name: '第三夜',
    duration: 28,
    groups: [
      { type: 'crawler', count: 13, from: 2, to: 23 },
      { type: 'runner', count: 6, from: 9, to: 25 },
      { type: 'brute', count: 1, from: 17, to: 17 },
    ],
  },
  {
    name: '第四夜',
    duration: 29,
    groups: [
      { type: 'crawler', count: 15, from: 2, to: 24 },
      { type: 'runner', count: 8, from: 7, to: 26 },
      { type: 'brute', count: 2, from: 15, to: 23 },
    ],
  },
  {
    name: '第五夜',
    duration: 30,
    groups: [
      { type: 'crawler', count: 17, from: 2, to: 26 },
      { type: 'runner', count: 12, from: 6, to: 28 },
      { type: 'brute', count: 3, from: 13, to: 25 },
    ],
  },
  {
    name: '第六夜',
    duration: 31,
    groups: [
      { type: 'crawler', count: 19, from: 2, to: 27 },
      { type: 'runner', count: 13, from: 5, to: 28 },
      { type: 'brute', count: 4, from: 11, to: 26 },
    ],
  },
  {
    name: '第七夜',
    duration: 33,
    groups: [
      { type: 'crawler', count: 21, from: 2, to: 29 },
      { type: 'runner', count: 14, from: 5, to: 30 },
      { type: 'brute', count: 5, from: 11, to: 27 },
    ],
  },
  {
    name: '终夜',
    duration: 60,
    groups: [
      { type: 'boss', count: 1, from: 1, to: 1 },
      { type: 'crawler', count: 8, from: 9, to: 36 },
      { type: 'runner', count: 8, from: 16, to: 40 },
    ],
  },
];

// 升级卡：apply 直接改 modifiers / player / fire，纯数值。
export const UPGRADES = [
  {
    id: 'wick',
    name: '捻长灯芯',
    desc: '光焰伤害 +25%',
    apply: (m) => {
      m.beamDps *= 1.25;
    },
  },
  {
    id: 'wide',
    name: '宽焰',
    desc: '光锥张角 +35%',
    apply: (m) => {
      m.beamHalfAngle *= 1.35;
    },
  },
  {
    id: 'long',
    name: '远照',
    desc: '照射距离 +20%',
    apply: (m) => {
      m.beamRange *= 1.2;
    },
  },
  {
    id: 'oil',
    name: '大油壶',
    desc: '灯油上限 +50，立即加满',
    apply: (m, p) => {
      m.oilMax += 50;
      p.oil = m.oilMax;
    },
  },
  {
    id: 'regen',
    name: '回油',
    desc: '灯油恢复速度 +50%',
    apply: (m) => {
      m.oilRegen *= 1.5;
    },
  },
  {
    id: 'swift',
    name: '疾行',
    desc: '移动速度 +12%',
    apply: (m) => {
      m.moveSpeed *= 1.12;
    },
  },
  {
    id: 'light',
    name: '轻身',
    desc: '冲刺冷却 -28%',
    apply: (m) => {
      m.dashCooldown *= 0.72;
    },
  },
  {
    id: 'burning',
    name: '燃身',
    desc: '冲刺伤害翻倍，范围更大',
    apply: (m) => {
      m.dashDamage *= 2;
      m.dashRadius *= 1.3;
    },
  },
  {
    id: 'ember',
    name: '余烬',
    desc: '灼烧伤害 +80%',
    apply: (m) => {
      m.burnDps *= 1.8;
    },
  },
  {
    id: 'wood',
    name: '添柴',
    desc: '火堆上限 +40，并立即修复 40',
    apply: (m, p, f) => {
      m.fireMaxHp += 40;
      f.maxHp = m.fireMaxHp;
      f.hp = Math.min(f.maxHp, f.hp + 40);
    },
  },
  {
    id: 'guard',
    name: '护火',
    desc: '火堆受到的伤害 -25%',
    apply: (m) => {
      m.fireResist = Math.min(0.7, m.fireResist + 0.25);
    },
  },
  {
    id: 'coat',
    name: '厚衣',
    desc: '生命上限 +30，并回复 30',
    apply: (m, p) => {
      m.playerMaxHp += 30;
      p.maxHp = m.playerMaxHp;
      p.hp = Math.min(p.maxHp, p.hp + 30);
    },
  },
  {
    id: 'magnet',
    name: '拾光',
    desc: '余烬吸引范围 +60%，每枚回油 +4',
    apply: (m) => {
      m.emberRadius *= 1.6;
      m.emberOil += 4;
    },
  },
  {
    id: 'slow',
    name: '凝光',
    desc: '光焰减速效果 +20%',
    apply: (m) => {
      m.beamSlow = Math.min(0.8, m.beamSlow + 0.2);
    },
  },
];

export const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

export const BOSS_ADDS = [
  { type: 'crawler', count: 1 },
  { type: 'runner', count: 1 },
];
